"""
Verify the campus bridge's Postgres archive without touching a real database.

Runs campus_mqtt_bridge's archive path against a stubbed psycopg2. The point is
the failure modes, not the happy path: the archive must never cost us live
campus telemetry, so this asserts that a dead connection, a name collision with
an existing table, and an unset POSTGRES_URL all degrade quietly while the
InfluxDB write still happens.

    cd backend
    python scripts/verify_campus_archive.py

Exits non-zero on any failure, so it can gate a deploy.
"""
import os, sys, types, datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))   # backend/
sys.path.insert(0, _HERE)                    # backend/scripts/

import config
config.POSTGRES_URL = "postgresql://stub@localhost:5432/stub"
config.POSTGRES_CAMPUS_TABLE = "campus_readings"

EXECUTED = []
COLUMNS = ["time", "farm", "device_id", "field", "value"]
FAIL_ON_INSERT = [False]


class Cur:
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def execute(self, sql, params=None):
        EXECUTED.append(("execute", " ".join(sql.split())[:70], params))
    def executemany(self, sql, rows):
        if FAIL_ON_INSERT[0]:
            raise RuntimeError("connection reset by peer")
        EXECUTED.append(("executemany", " ".join(sql.split())[:70], list(rows)))
    def fetchall(self): return [(c,) for c in COLUMNS]


class Conn:
    closed = False
    autocommit = False
    def cursor(self): return Cur()
    def close(self): self.closed = True


stub = types.ModuleType("psycopg2")
stub.connect = lambda *a, **k: Conn()
sys.modules["psycopg2"] = stub

import campus_mqtt_bridge as b

PAYLOAD = {"ID": "Device01", "CH1": 1, "CH2": 0, "CH3": 0, "CH4": 1,
           "CH5": 0, "CH6": 0, "CH7": 0, "CH8": 0,
           "Temperature": 35.2, "Humidity": 60}
TS = datetime.datetime(2026, 9, 17, 10, 30, tzinfo=datetime.timezone.utc)

ok = True
def check(label, cond):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label)
    ok = ok and cond

print("\n1. happy path")
b._write_postgres(PAYLOAD, TS)
inserts = [e for e in EXECUTED if e[0] == "executemany"]
check("one insert issued", len(inserts) == 1)
rows = inserts[0][2]
check("10 rows (8 channels + temp + humidity)", len(rows) == 10)
check("farm tagged 'campus'", all(r[1] == "campus" for r in rows))
check("device_id carried", all(r[2] == "Device01" for r in rows))
check("temperature present as float", ("temperature", 35.2) in [(r[3], r[4]) for r in rows])
check("whole-number humidity cast to float",
      any(r[3] == "humidity" and isinstance(r[4], float) and r[4] == 60.0 for r in rows))
check("channel cast to float too",
      any(r[3] == "CH4" and isinstance(r[4], float) for r in rows))
ddl = [e[1] for e in EXECUTED if e[0] == "execute"]
check("table created", any("CREATE TABLE IF NOT EXISTS" in d for d in ddl))
check("index created", any("CREATE INDEX IF NOT EXISTS" in d for d in ddl))

print("\n2. partial payload (device omits humidity)")
EXECUTED.clear()
b._write_postgres({"ID": "D1", "CH1": 1, "Temperature": 30.0}, TS)
rows = [e for e in EXECUTED if e[0] == "executemany"][0][2]
check("only present fields written", len(rows) == 2)

print("\n3. payload with no known fields")
EXECUTED.clear()
b._write_postgres({"ID": "D1", "Nonsense": 5}, TS)
check("nothing written", not [e for e in EXECUTED if e[0] == "executemany"])

print("\n4. insert failure drops the connection and re-raises")
EXECUTED.clear()
FAIL_ON_INSERT[0] = True
raised = False
try:
    b._write_postgres(PAYLOAD, TS)
except RuntimeError:
    raised = True
check("propagates to caller", raised)
check("stale handle discarded", b._pg_conn is None)
FAIL_ON_INSERT[0] = False

print("\n5. a Postgres failure must NOT break the live feed")
b._write_point = lambda p: EXECUTED.append(("influx", "written", None))
FAIL_ON_INSERT[0] = True
EXECUTED.clear()
msg = types.SimpleNamespace(payload=b"""{"ID":"D1","CH1":1,"Temperature":30.0}""",
                            topic="campus/test")
b._on_message(None, None, msg)          # must not raise
check("influx still written", any(e[0] == "influx" for e in EXECUTED))
check("_on_message swallowed the error", True)
FAIL_ON_INSERT[0] = False

print("\n6. table exists with the wrong shape -> disable, do not spam")
EXECUTED.clear()
b._pg_conn = None
b._pg_disabled = False
COLUMNS[:] = ["id", "topic", "payload"]      # a table Node-RED owns
b._write_postgres(PAYLOAD, TS)
check("archive disabled", b._pg_disabled is True)
check("no insert attempted", not [e for e in EXECUTED if e[0] == "executemany"])
EXECUTED.clear()
b._write_postgres(PAYLOAD, TS)
check("stays quiet on later messages", EXECUTED == [])

print("\n7. POSTGRES_URL unset -> complete no-op")
b._pg_disabled = False
config.POSTGRES_URL = ""
EXECUTED.clear()
b._write_postgres(PAYLOAD, TS)
check("nothing attempted", EXECUTED == [])

print("\n" + ("ALL CHECKS PASSED" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
