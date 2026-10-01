"""
Verify the dry-run pump guard without touching Node-RED or a real pump.

    cd backend
    python scripts/verify_pump_guard.py

This code commands physical equipment. The condition it fires on happens on a
farm somebody depends on, at a moment nobody is watching, and the failure modes
are asymmetric: not acting costs a pump, acting wrongly costs a crop its
cooling. So the decision table is asserted rather than reasoned about.

Node-RED and Telegram are stubbed; the latch file is redirected to a temporary
path. Everything between the alert checker's call and the outbound setpoint is
the real code.

Exits non-zero on any failure, so it can gate a deploy.
"""
import os
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))

import config
from services import pump_guard

# ── Stubs ───────────────────────────────────────────────────────────────────
SENT: list[dict] = []
MESSAGES: list[str] = []
LOGGED: list[dict] = []
FAIL_SEND = [False]


def fake_send(farm_id, relay, low, high):
    if FAIL_SEND[0]:
        raise RuntimeError("Node-RED unreachable")
    SENT.append({"farm": farm_id, "relay": relay, "low": low, "high": high})


pump_guard._send_setpoint = fake_send
pump_guard.telegram_service.send_message = lambda text: MESSAGES.append(text) or True
pump_guard.alert_log.log_alert = lambda **kw: LOGGED.append(kw)

_tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
_tmp.write(b"{}")
_tmp.close()
pump_guard._PATH = _tmp.name

# A known previous setpoint, so a release has something real to restore.
pump_guard.setpoint_service.get = lambda farm: {"3": {"low": 35.76, "high": 35.86}}

CFG = config.DRY_RUN_PROTECTION["kampot"]
AFTER = CFG["after_minutes"]

ok = True


def check(label, cond):
    global ok
    print(f"  {'PASS' if cond else 'FAIL'}  {label}")
    ok = ok and cond


def reset():
    SENT.clear(); MESSAGES.clear(); LOGGED.clear()
    FAIL_SEND[0] = False
    pump_guard._write({})


# ── 1. It only fires on a genuine dry run ───────────────────────────────────
print("\n=== 1. What it refuses to act on ===")
reset()
pump_guard.consider("kampot", "long_spray", AFTER + 20, 36.0)
check("a long spray that IS cooling is left alone", not SENT)

reset()
# The grace period is zero by design: nobody is watching Telegram minute by
# minute, so waiting only added dry running. Assert it acts on the very first
# cycle, since that is now the promise -- and that a farm configured WITH a
# grace period still honours it, so the knob has not quietly stopped working.
pump_guard.consider("kampot", "empty_tank", 0.0, 36.0)
check("no grace period: acts on the first cycle that sees it", len(SENT) == 1)

reset()
_saved = CFG["after_minutes"]
CFG["after_minutes"] = 5.0
pump_guard.consider("kampot", "empty_tank", 4.0, 36.0)
check("a configured grace period is still honoured", not SENT)
CFG["after_minutes"] = _saved

reset()
pump_guard.consider("kep", "empty_tank", AFTER + 20, 36.0)
check("a farm with protection disabled is left alone", not SENT)

reset()
pump_guard.consider("campus", "empty_tank", AFTER + 20, 36.0)
check("a farm with no protection config is left alone", not SENT)

# ── 2. It fires when it should, once ────────────────────────────────────────
print("\n=== 2. The dry run ===")
reset()
pump_guard.consider("kampot", "empty_tank", AFTER + 5, 35.9)
check("locks out on the first cycle", len(SENT) == 1)
check(f"raises relay 3 to {CFG['lockout_low']}–{CFG['lockout_high']} °C",
      SENT and SENT[0]["relay"] == 3
      and SENT[0]["low"] == CFG["lockout_low"] and SENT[0]["high"] == CFG["lockout_high"])
check("records the setpoint it replaced",
      (pump_guard.state("kampot") or {}).get("previous") == {"low": 35.76, "high": 35.86})
check("tells somebody", any("PUMP STOPPED AUTOMATICALLY" in m for m in MESSAGES))
check("says the first lockout will restore itself once",
      any("will restore itself" in m for m in MESSAGES))
check("writes an audit row", any(r.get("alert_type") == "pump_lockout" for r in LOGGED))

before = len(SENT)
for _ in range(5):
    pump_guard.consider("kampot", "empty_tank", AFTER + 30, 36.5)
check("does not re-send on later cycles while latched", len(SENT) == before)

# ── 3. The latch survives a restart ─────────────────────────────────────────
print("\n=== 3. Restart ===")
check("the lockout is on disk, not in memory", pump_guard.state("kampot") is not None)
pump_guard._load.__globals__["_cache"] = None     # nothing cached to clear; read again
check("still latched when read fresh", pump_guard.state("kampot") is not None)

# ── 4. Verification that the pump actually stopped ──────────────────────────
print("\n=== 4. Did it work? ===")
MESSAGES.clear()
# Too early to judge — must not claim success or failure yet.
pump_guard.verify("kampot", pump_running=True)
check("too early to judge: stays silent", not MESSAGES)

# Backdate the lockout so the verification window has passed.
data = pump_guard._load()
from datetime import timedelta, datetime
locked = datetime.fromisoformat(data["kampot"]["lockout"]["locked_at"]) - timedelta(minutes=10)
data["kampot"]["lockout"]["locked_at"] = locked.isoformat()
pump_guard._write(data)

MESSAGES.clear(); LOGGED.clear()
pump_guard.verify("kampot", pump_running=True)
check("escalates when the pump did NOT stop",
      any("STILL RUNNING AFTER LOCKOUT" in m for m in MESSAGES))
check("logs the escalation",
      any(r.get("alert_type") == "pump_guard_failed" for r in LOGGED))

# ── 5. Release restores exactly what was there ──────────────────────────────
print("\n=== 5. Release ===")
MESSAGES.clear(); SENT.clear(); LOGGED.clear()
result = pump_guard.release("kampot", "Putsaccada")
check("restores the recorded setpoint, not a default",
      len(SENT) == 1 and SENT[0]["low"] == 35.76 and SENT[0]["high"] == 35.86)
check("clears the latch", pump_guard.state("kampot") is None)
check("names who released it", "Putsaccada" in str(result) and
      any("Putsaccada" in m for m in MESSAGES))

try:
    pump_guard.release("kampot", "Putsaccada")
    check("releasing twice is refused", False)
except ValueError:
    check("releasing twice is refused", True)

# ── 6. When it cannot act, it says so loudly and retries ────────────────────
print("\n=== 6. Node-RED down ===")
reset()
FAIL_SEND[0] = True
pump_guard.consider("kampot", "empty_tank", AFTER + 5, 36.0)
check("does NOT latch when the command failed", pump_guard.state("kampot") is None)
check("raises a louder alarm than the lockout itself",
      any("PUMP PROTECTION FAILED" in m for m in MESSAGES))
check("tells the reader to stop it by hand",
      any("Stop the pump by hand" in m for m in MESSAGES))

FAIL_SEND[0] = False
pump_guard.consider("kampot", "empty_tank", AFTER + 10, 36.0)
check("retries on the next cycle once Node-RED is back", len(SENT) == 1)

# ── 7. The quiet path: it worked ────────────────────────────────────────────
# Asserted because this is the branch that runs on a normal recovery, and a
# protection system that cried wolf after every successful stop would be muted
# within a week.
print("\n=== 7. The pump did stop ===")
reset()
pump_guard.consider("kampot", "empty_tank", AFTER + 5, 36.0)
data = pump_guard._load()
locked = datetime.fromisoformat(data["kampot"]["lockout"]["locked_at"]) - timedelta(minutes=10)
data["kampot"]["lockout"]["locked_at"] = locked.isoformat()
pump_guard._write(data)

MESSAGES.clear()
pump_guard.verify("kampot", pump_running=False)
check("says nothing when the pump stopped as commanded", not MESSAGES)
check("records the lockout as verified",
      (pump_guard.state("kampot") or {}).get("verified") is True)
check("stays latched — a stopped pump is not a refilled tank",
      pump_guard.state("kampot") is not None)

MESSAGES.clear()
pump_guard.verify("kampot", pump_running=False)
pump_guard.verify("kampot", pump_running=True)
check("does not re-judge once verified", not MESSAGES)

# ── 8. The one automatic release, and the escalation behind it ──────────────
# This is the part of the design that makes an automatic release defensible, so
# it is the part asserted hardest. The claim being tested is narrow: ONE
# release, only on sustained cooling below the pump's own off-point, and the
# dry run after it is final.
print("\n=== 8. Auto-release, once ===")
OFF   = 35.76                        # previous low setpoint = pump off-point
COOL  = CFG["auto_release_cool_minutes"]


def backdate_cool(farm, minutes):
    """Pretend the greenhouse has been cool for `minutes`."""
    d = pump_guard._load()
    lk = d[farm]["lockout"]
    lk["cool_since"] = (datetime.fromisoformat(lk["cool_since"])
                        - timedelta(minutes=minutes)).isoformat()
    pump_guard._write(d)


def lock_and_confirm(active=AFTER + 5, temp=36.0):
    """Drive a farm into a verified lockout, the normal starting point."""
    pump_guard.consider("kampot", "empty_tank", active, temp)
    d = pump_guard._load()
    lk = d["kampot"]["lockout"]
    lk["locked_at"] = (datetime.fromisoformat(lk["locked_at"])
                       - timedelta(minutes=10)).isoformat()
    pump_guard._write(d)
    pump_guard.verify("kampot", pump_running=False)


reset()
lock_and_confirm()
check("first lockout arms the automatic release",
      pump_guard.state("kampot")["may_auto_release"] is True)

SENT.clear()
pump_guard.maybe_auto_release("kampot", 38.0)
check("still hot: does not release", pump_guard.state("kampot") is not None and not SENT)

pump_guard.maybe_auto_release("kampot", OFF - 1)
check("cool but not yet sustained: starts the clock, does not release",
      pump_guard.state("kampot")["cool_since"] is not None and not SENT)

pump_guard.maybe_auto_release("kampot", 38.0)
check("warming back up resets the clock",
      pump_guard.state("kampot")["cool_since"] is None)

pump_guard.maybe_auto_release("kampot", OFF - 1)
backdate_cool("kampot", COOL + 1)
pump_guard.maybe_auto_release("kampot", None)
check("an offline sensor does not release the pump",
      pump_guard.state("kampot") is not None and not SENT)

pump_guard.maybe_auto_release("kampot", OFF - 1)
backdate_cool("kampot", COOL + 1)
MESSAGES.clear()
pump_guard.maybe_auto_release("kampot", OFF - 1)
check("sustained cooling below the off-point releases it",
      len(SENT) == 1 and SENT[0]["low"] == OFF and SENT[0]["high"] == 35.86)
check("the lockout is cleared", pump_guard.state("kampot") is None)
check("but the strike is kept", pump_guard.strikes("kampot") == 1)
check("says it was a guess", any("guess" in m for m in MESSAGES))

print("\n=== 9. The second dry run is final ===")
SENT.clear(); MESSAGES.clear()
pump_guard.consider("kampot", "empty_tank", 0.0, 36.0)
check("second strike locks out with NO grace period", len(SENT) == 1)
check("and does not arm the automatic release",
      pump_guard.state("kampot")["may_auto_release"] is False)
check("tells the reader it will not release itself",
      any("will NOT release itself" in m for m in MESSAGES))

SENT.clear()
d = pump_guard._load()
d["kampot"]["lockout"]["verified"] = True
pump_guard._write(d)
for _ in range(4):
    pump_guard.maybe_auto_release("kampot", OFF - 5)
    dd = pump_guard._load()
    if dd["kampot"]["lockout"].get("cool_since"):
        backdate_cool("kampot", COOL + 1)
check("stays locked however cool and however long it waits",
      pump_guard.state("kampot") is not None and not SENT)

MESSAGES.clear()
pump_guard.release("kampot", "Putsaccada")
check("a manual release clears the strike too", pump_guard.strikes("kampot") == 0)

print("\n=== 10. Forgiving a strike ===")
reset()
lock_and_confirm()
pump_guard.maybe_auto_release("kampot", OFF - 1)
backdate_cool("kampot", COOL + 1)
pump_guard.maybe_auto_release("kampot", OFF - 1)
check("strike spent after the auto-release", pump_guard.strikes("kampot") == 1)

pump_guard.maybe_auto_release("kampot", 30.0)
check("not forgiven yet", pump_guard.strikes("kampot") == 1)

d = pump_guard._load()
d["kampot"]["auto_released_at"] = (
    datetime.fromisoformat(d["kampot"]["auto_released_at"])
    - timedelta(hours=CFG["strike_forgive_hours"] + 1)).isoformat()
pump_guard._write(d)
pump_guard.maybe_auto_release("kampot", 30.0)
check("forgiven after a day with no further dry run",
      pump_guard.strikes("kampot") == 0)

os.unlink(_tmp.name)
print("\nALL PASS" if ok else "\nSOMETHING FAILED")
sys.exit(0 if ok else 1)
