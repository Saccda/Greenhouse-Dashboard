"""
Dry-run pump protection — stop a spray pump that is running with no water.

A pump running dry destroys itself. There is no water carrying heat away from
the seals and impeller, and the damage is cumulative and permanent. The alert
checker already recognises the condition: the pump has run past
MAX_SPRAY_MINUTES *and* the temperature has not fallen, which together mean it
is moving no water. Until now the only response was a Telegram message, which
helps exactly as much as somebody is holding their phone.

This acts.

HOW IT STOPS THE PUMP
    Kampot and Kep have no direct relay command — the only lever is the
    setpoint band proxied to Node-RED. Relay 3 is the spray pump, and it
    engages above its high setpoint (P6) and releases below its low (P5).
    Raising that band above any temperature the greenhouse reaches means the
    controller never calls for spray. That is the lockout.

    This is an INDIRECT stop, and the code treats it as one: it does not
    assume the command worked. After acting it watches the relay, and if the
    pump is still running it escalates rather than going quiet.

WHY IT DOES NOT SIMPLY RELEASE WHEN THE GREENHOUSE COOLS
    Because a locked-out greenhouse cools every evening regardless of whether
    anybody refilled the tank — the pump is not spraying, so cooling is not
    the reason it cooled. The sun setting is. Releasing on temperature alone
    would restore the band each night and hand the pump a fresh dry run every
    morning, indefinitely, while looking like a system that was working.

    So the release is rationed by a strike count:

      strike 0 → first lockout. May release itself ONCE, after the greenhouse
                 has sat below the pump's own off-point for
                 auto_release_cool_minutes. The bet is that somebody topped the
                 tank up without touching the dashboard, which is what happens
                 on a real farm.

      strike 1 → the bet was wrong; the pump ran dry again. Locks out with no
                 grace period and will not release itself for any reason. Only
                 a person who has looked in the tank can clear it.

    Worst case is two dry-run cycles, not a nightly one. A strike is forgiven
    after strike_forgive_hours without a further dry run, since by then the
    tank demonstrably had water, and a manual release clears it immediately.

WHAT IT WILL NOT DO
    It acts on "empty_tank" only — pump running long AND no cooling. A long
    spray that IS cooling is moving water, so the pump is not in danger and
    stopping it would just leave the crop hot. Narrow triggers are the point:
    an interlock that fires on the wrong thing gets switched off, and then it
    is not protecting anything.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Any

import httpx

import config
from services import alert_log_service as alert_log
from services import setpoint_service, telegram_service

_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "pump_guard.json")

#: How long after acting we expect the pump to have stopped. One alert-checker
#: cycle plus a margin — the controller polls, so it is not instant.
_VERIFY_AFTER_MINUTES = 2.0


# ── Latch state, on disk ────────────────────────────────────────────────────
#
# On disk rather than in memory because the backend restarts — for a deploy, a
# crash, a Windows update — and a lockout that forgets itself on restart is
# worse than none: the setpoint stays locked out with nothing recording why,
# and the next person sees a farm that will not spray and no explanation.
#
# Each farm holds a record, not a bare lockout, because the strike count has to
# outlive the lockout it came from. That is the whole mechanism: forgetting the
# strike on release is what would turn this back into a nightly dry run.
#
#   { "kampot": { "strikes": 1,
#                 "auto_released_at": "...",   # when, if ever
#                 "lockout": { ... } | None } }

def _load() -> dict[str, Any]:
    try:
        with open(_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write(data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(_PATH), exist_ok=True)
    with open(_PATH, "w") as f:
        json.dump(data, f, indent=2)


def _record(data: dict[str, Any], farm_id: str) -> dict[str, Any]:
    """This farm's record, with defaults, without writing anything."""
    rec = data.get(farm_id) or {}
    rec.setdefault("strikes", 0)
    rec.setdefault("auto_released_at", None)
    rec.setdefault("lockout", None)
    return rec


def state(farm_id: str) -> dict[str, Any] | None:
    """The active lockout for a farm, or None."""
    return _record(_load(), farm_id)["lockout"]


def strikes(farm_id: str) -> int:
    """
    How many times this farm's lockout has released itself without a person
    confirming the tank. 1 or more means the next lockout is manual-only.
    """
    return _record(_load(), farm_id)["strikes"]


def all_states() -> dict[str, Any]:
    return _load()


def _now() -> datetime:
    return datetime.now(config.TIMEZONE)


def _farm_name(farm_id: str) -> str:
    return config.FARMS.get(farm_id, {}).get("display_name", farm_id)


# ── Acting ──────────────────────────────────────────────────────────────────

def _send_setpoint(farm_id: str, relay: int, low: float, high: float) -> None:
    """
    Push a setpoint through Node-RED. Raises on any failure.

    Synchronous on purpose. The alert checker runs on a background scheduler
    thread, not an event loop, and this is also reached from a FastAPI route —
    where a plain def is run in a threadpool rather than blocking the loop. One
    implementation correct from both beats two that can drift apart.
    """
    url = f"{config.NODE_RED_URL}/api/setpoint"
    with httpx.Client(timeout=10.0) as client:
        r = client.post(url, json={"farm": farm_id, "relay": relay, "low": low, "high": high})
        r.raise_for_status()
    setpoint_service.save(farm_id, relay, low, high)


def consider(farm_id: str, alert_type: str, active_minutes: float,
             temp: float | None) -> None:
    """
    Decide whether to lock the pump out, and do it.

    Called from the alert checker on every cycle while a spray alert is active.
    Safe to call repeatedly: it is a no-op once latched.
    """
    cfg = config.DRY_RUN_PROTECTION.get(farm_id)
    if not cfg or not cfg.get("enabled"):
        return

    # Only a dry run. A long spray that is cooling is moving water.
    if alert_type != "empty_tank":
        return

    data = _load()
    rec  = _record(data, farm_id)
    if rec["lockout"]:
        return                      # already locked out; nothing more to do

    # A farm that has already spent its one automatic release gets no grace
    # period and no second release. It has had both.
    repeat = rec["strikes"] > 0
    grace  = cfg["after_minutes_repeat"] if repeat else cfg["after_minutes"]
    if active_minutes < grace:
        return

    relay = cfg["relay"]
    # Record the setpoint we are replacing BEFORE replacing it, so release
    # restores what was actually there rather than the UI's defaults.
    previous = (setpoint_service.get(farm_id) or {}).get(str(relay))

    when = _now()
    # Only the first lockout may let itself go, and only if we know the band it
    # has to come back to — without that there is no off-point to measure a
    # safe re-arm against, so it waits for a person.
    may_auto_release = bool(cfg.get("auto_release")) and not repeat and bool(previous)

    try:
        _send_setpoint(farm_id, relay, cfg["lockout_low"], cfg["lockout_high"])
    except Exception as exc:
        # Could not act. This is the dangerous case — the pump is running dry
        # and we have failed to stop it — so it is louder than the lockout
        # itself, and it does NOT latch, so the next cycle tries again.
        telegram_service.send_message(
            f"\U0001F6D1 *PUMP PROTECTION FAILED*\n"
            f"Farm: {_farm_name(farm_id)}\n"
            f"The pump has been running dry for *{active_minutes:.0f} min* and the "
            f"automatic stop could not be sent.\n"
            f"Reason: {exc}\n"
            f"\U0001F449 *Stop the pump by hand.*\n"
            f"Time: {when:%Y-%m-%d %H:%M:%S}"
        )
        alert_log.log_alert(
            farm_id=farm_id, alert_type="pump_guard_failed", event="alert",
            sensor_value=active_minutes, threshold=grace,
            message=f"Automatic pump lockout failed: {exc}",
        )
        print(f"[PumpGuard] {farm_id}: lockout FAILED: {exc}")
        return

    rec["lockout"] = {
        "locked_at":        when.isoformat(),
        "relay":            relay,
        "reason":           "empty_tank",
        "ran_minutes":      round(active_minutes, 1),
        "temp_at_lock":     temp,
        "lockout_low":      cfg["lockout_low"],
        "lockout_high":     cfg["lockout_high"],
        "previous":         previous,   # None when nothing had been sent before
        "verified":         None,       # set by verify() on a later cycle
        "strike":           rec["strikes"] + 1,
        "may_auto_release": may_auto_release,
        "cool_since":       None,       # set by maybe_auto_release()
    }
    data[farm_id] = rec
    _write(data)

    prev_txt = (f"{previous['low']}–{previous['high']} °C"
                if previous else "no previous setpoint recorded")
    if may_auto_release:
        tail = (f"\U0001F449 *Refill the tank.* If the greenhouse cools below "
                f"{previous['low']} °C for {cfg['auto_release_cool_minutes']:.0f} min "
                f"the setpoint will restore itself once, in case the tank was already "
                f"topped up. If it runs dry again after that, it locks out for good "
                f"until you release it on the Control page.")
    elif repeat:
        tail = (f"\U0001F449 *This is the second time — it will NOT release itself.*\n"
                f"Refill the tank, then release the lockout on the Control page.")
    else:
        tail = (f"\U0001F449 *Refill the tank, then release the lockout* on the "
                f"Control page. It will not release on its own.")

    telegram_service.send_message(
        f"\U0001F512 *PUMP STOPPED AUTOMATICALLY*\n"
        f"Farm: {_farm_name(farm_id)}\n"
        f"The pump ran *{active_minutes:.0f} min* with no cooling, which means an "
        f"empty tank. It has been locked out to stop it running dry.\n"
        f"Spray setpoint raised to *{cfg['lockout_low']}–{cfg['lockout_high']} °C* "
        f"(was {prev_txt}).\n"
        f"{tail}\n"
        f"Time: {when:%Y-%m-%d %H:%M:%S}"
    )
    alert_log.log_alert(
        farm_id=farm_id, alert_type="pump_lockout", event="alert",
        sensor_value=active_minutes, threshold=grace,
        duration_min=active_minutes,
        message=(f"Pump locked out automatically after {active_minutes:.0f} min "
                 f"running dry (strike {rec['strikes'] + 1}); relay {relay} setpoint "
                 f"raised to {cfg['lockout_low']}–{cfg['lockout_high']}"),
    )
    print(f"[PumpGuard] {farm_id}: pump locked out after {active_minutes:.0f} min "
          f"dry running (strike {rec['strikes'] + 1}, "
          f"auto-release {'armed' if may_auto_release else 'OFF'})")


def verify(farm_id: str, pump_running: bool) -> None:
    """
    Confirm the pump actually stopped, and shout if it did not.

    The lockout is indirect — it changes a setpoint and trusts a controller to
    honour it. Assuming that worked is how a protection system ends up
    reporting success over a pump that is still destroying itself. If the relay
    is still closed a couple of minutes after acting, that is now its own
    alarm.
    """
    data = _load()
    rec  = _record(data, farm_id)
    entry = rec["lockout"]
    if not entry or entry.get("verified") is not None:
        return

    locked_at = datetime.fromisoformat(entry["locked_at"])
    elapsed = (_now() - locked_at).total_seconds() / 60
    if elapsed < _VERIFY_AFTER_MINUTES:
        return                      # too early to judge

    entry["verified"] = not pump_running
    rec["lockout"] = entry
    data[farm_id] = rec
    _write(data)

    if pump_running:
        telegram_service.send_message(
            f"\U0001F6D1 *PUMP STILL RUNNING AFTER LOCKOUT*\n"
            f"Farm: {_farm_name(farm_id)}\n"
            f"The setpoint was raised {elapsed:.0f} min ago and the pump has not "
            f"stopped. The controller may not have taken the change.\n"
            f"\U0001F449 *Stop it by hand.*\n"
            f"Time: {_now():%Y-%m-%d %H:%M:%S}"
        )
        alert_log.log_alert(
            farm_id=farm_id, alert_type="pump_guard_failed", event="alert",
            message="Pump still running after automatic lockout — controller did not honour it",
        )
        print(f"[PumpGuard] {farm_id}: STILL RUNNING {elapsed:.0f} min after lockout")
    else:
        print(f"[PumpGuard] {farm_id}: lockout confirmed, pump stopped")


# ── The one automatic release ───────────────────────────────────────────────

def maybe_auto_release(farm_id: str, temp: float | None) -> None:
    """
    Release the FIRST lockout once the greenhouse has genuinely cooled, and
    forgive an old strike once the farm has proved it has water.

    Called every cycle. The cooling requirement is doing real work here, and it
    is not "the temperature fell":

      * It must be below the pump's own off-point (the previous low setpoint).
        Restoring the band at a higher temperature would re-engage the pump the
        instant the command landed, which is a dry run, not a test.
      * It must stay there for auto_release_cool_minutes. One cool reading is a
        cloud passing over the sensor.
      * The lockout must have been verified as having actually stopped the
        pump. Releasing a lockout that never took effect is meaningless.

    Even then this is a bet, not a measurement — nothing here can see water.
    What makes the bet acceptable is that losing it costs one more dry run and
    then stops forever, because the next lockout carries a strike.
    """
    cfg = config.DRY_RUN_PROTECTION.get(farm_id)
    if not cfg or not cfg.get("enabled"):
        return

    data  = _load()
    rec   = _record(data, farm_id)
    entry = rec["lockout"]

    # No lockout: the only thing left to do is forgive an old strike, once the
    # farm has run long enough without another dry run that the tank must have
    # been refilled. Without this, a farm that recovered correctly would carry
    # its strike forever and be denied grace on some unrelated fault months
    # later.
    if not entry:
        if rec["strikes"] > 0 and rec["auto_released_at"]:
            since = _now() - datetime.fromisoformat(rec["auto_released_at"])
            if since >= timedelta(hours=cfg["strike_forgive_hours"]):
                rec["strikes"] = 0
                rec["auto_released_at"] = None
                data[farm_id] = rec
                _write(data)
                print(f"[PumpGuard] {farm_id}: strike forgiven after "
                      f"{since.total_seconds() / 3600:.0f} h with no further dry run")
        return

    if not entry.get("may_auto_release"):
        return
    if entry.get("verified") is not True:
        return                      # never stopped the pump, or not judged yet

    previous = entry.get("previous")
    if not previous:
        return                      # no off-point to measure against

    off_point = previous["low"]
    if temp is None or temp > off_point:
        # Not cool, or no reading. Either way the clock restarts — an offline
        # sensor must not accumulate credit towards releasing a pump.
        if entry.get("cool_since") is not None:
            entry["cool_since"] = None
            rec["lockout"] = entry
            data[farm_id] = rec
            _write(data)
        return

    if entry.get("cool_since") is None:
        entry["cool_since"] = _now().isoformat()
        rec["lockout"] = entry
        data[farm_id] = rec
        _write(data)
        return

    cool_for = (_now() - datetime.fromisoformat(entry["cool_since"])).total_seconds() / 60
    if cool_for < cfg["auto_release_cool_minutes"]:
        return

    relay = entry["relay"]
    try:
        _send_setpoint(farm_id, relay, previous["low"], previous["high"])
    except Exception as exc:
        # Stay locked out. A failed restore that cleared the latch would leave
        # the band raised with nothing recording why.
        print(f"[PumpGuard] {farm_id}: auto-release FAILED, staying locked: {exc}")
        return

    rec["lockout"] = None
    rec["strikes"] = entry.get("strike", 1)     # spend the strike
    rec["auto_released_at"] = _now().isoformat()
    data[farm_id] = rec
    _write(data)

    telegram_service.send_message(
        f"\U0001F513 *Pump lockout released automatically*\n"
        f"Farm: {_farm_name(farm_id)}\n"
        f"The greenhouse has been below {off_point} °C for {cool_for:.0f} min, so the "
        f"spray setpoint has been restored to *{previous['low']}–{previous['high']} °C* "
        f"in case the tank was refilled.\n"
        f"⚠️ *This was a guess — nothing here can see the water level.* If the "
        f"pump runs dry again it will lock out immediately and stay locked until you "
        f"release it on the Control page.\n"
        f"Time: {_now():%Y-%m-%d %H:%M:%S}"
    )
    alert_log.log_alert(
        farm_id=farm_id, alert_type="pump_lockout", event="resolved",
        message=(f"Pump lockout auto-released after {cool_for:.0f} min below "
                 f"{off_point} °C; setpoint restored to "
                 f"{previous['low']}–{previous['high']}. Next dry run is manual-only."),
    )
    print(f"[PumpGuard] {farm_id}: auto-released after {cool_for:.0f} min below {off_point} °C")


# ── Releasing by hand ───────────────────────────────────────────────────────

def release(farm_id: str, username: str) -> dict[str, Any]:
    """
    Restore the setpoint that was in force before the lockout, and clear the
    strike count.

    Takes the username because this is a person deciding the tank is full
    again, and an automated action reversed by hand should say who reversed
    it. Clearing the strikes is the point of requiring a person: their eyes on
    the tank are the only evidence this system ever gets that there is water in
    it, so that is what re-arms the automatic release.

    Raises if there is no lockout or the restore fails — a release that
    silently did nothing would leave somebody believing the farm can spray.
    """
    data  = _load()
    rec   = _record(data, farm_id)
    entry = rec["lockout"]
    if not entry:
        raise ValueError(f"No active pump lockout for '{farm_id}'")

    previous = entry.get("previous")
    relay = entry["relay"]
    if previous:
        _send_setpoint(farm_id, relay, previous["low"], previous["high"])
        restored = f"{previous['low']}–{previous['high']} °C"
    else:
        # Nothing was recorded, so there is nothing safe to restore. Say so
        # rather than invent a band: guessing here would hand the pump a
        # threshold nobody chose.
        restored = "nothing — no previous setpoint was recorded, set one by hand"

    rec["lockout"] = None
    rec["strikes"] = 0
    rec["auto_released_at"] = None
    data[farm_id] = rec
    _write(data)

    telegram_service.send_message(
        f"\U0001F513 *Pump lockout released*\n"
        f"Farm: {_farm_name(farm_id)}\n"
        f"Released by *{username}*. Setpoint restored to {restored}.\n"
        f"Time: {_now():%Y-%m-%d %H:%M:%S}"
    )
    alert_log.log_alert(
        farm_id=farm_id, alert_type="pump_lockout", event="resolved",
        message=f"Pump lockout released by {username}; setpoint restored to {restored}",
    )
    return {"farm": farm_id, "restored": restored, "released_by": username}
