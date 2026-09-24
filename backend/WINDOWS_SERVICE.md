# Running the backend as a Windows Service (NSSM)

This makes `uvicorn app:app` start on boot and auto-restart if it crashes —
same job Node-RED's restart-on-boot setup already does, just for the FastAPI backend.

## 1. Prerequisites (on the lab desktop)

```powershell
# From the project root, after copying the project over
cd D:\GreenhouseDashboard\backend        # adjust path to wherever you copied it
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
notepad .env      # fill in real INFLUXDB_TOKEN, TELEGRAM_*, CORS_ORIGIN, etc.
```

Do **not** copy the `.venv/` folder from your laptop — recreate it fresh on the
desktop (paths inside a venv are absolute and won't work on another machine).
`.env` is gitignored, so it also won't come across via git — copy/recreate it
by hand.

Test it runs manually first:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Visit `http://localhost:8000/api/health` — confirm `"status": "healthy"`. Ctrl+C to stop, then proceed to the service setup.

## 2. Install NSSM

Download from the official site: **https://nssm.cc/download** (get the latest stable, e.g. 2.24).
Extract it somewhere permanent, e.g. `C:\nssm\`. Use the `win64\nssm.exe` binary.

(If you have Chocolatey: `choco install nssm` does the same thing.)

## 3. Register the service

Open an **elevated** (Run as Administrator) PowerShell or Command Prompt:

```powershell
C:\nssm\nssm-2.24\win64\nssm.exe install GreenhouseBackend "D:\GreenhouseDashboard\backend\.venv\Scripts\python.exe" "-m uvicorn app:app --host 0.0.0.0 --port 8000"

C:\nssm\nssm-2.24\win64\nssm.exe set GreenhouseBackend AppDirectory "D:\GreenhouseDashboard\backend"
C:\nssm\nssm-2.24\win64\nssm.exe set GreenhouseBackend AppStdout "D:\GreenhouseDashboard\backend\data\service-out.log"
C:\nssm\nssm-2.24\win64\nssm.exe set GreenhouseBackend AppStderr "D:\GreenhouseDashboard\backend\data\service-err.log"
C:\nssm\nssm-2.24\win64\nssm.exe set GreenhouseBackend AppRotateFiles 1
C:\nssm\nssm-2.24\win64\nssm.exe set GreenhouseBackend AppRotateBytes 1048576
C:\nssm\nssm-2.24\win64\nssm.exe set GreenhouseBackend Start SERVICE_AUTO_START
C:\nssm\nssm-2.24\win64\nssm.exe set GreenhouseBackend AppRestartDelay 5000

C:\nssm\nssm-2.24\win64\nssm.exe start GreenhouseBackend
```

Notes on why each setting matters:

- **`AppDirectory`** — sets the service's working directory to `backend/`. `config.py` calls
  `load_dotenv()` with no path argument, which looks for `.env` in the current working directory.
  Without this, the service would start from `C:\Windows\System32` and never find your `.env`.
- **No `reload=True`** — the service invokes `uvicorn` directly with the production-appropriate
  flags. The `reload=True` dev convenience in `app.py`'s `if __name__ == "__main__":` block is only
  for `python app.py` during local development; the service bypasses it entirely.
- **`AppRestartDelay 5000`** — NSSM restarts the process automatically whenever it exits
  unexpectedly; this just adds a 5s buffer before each restart attempt to avoid a crash-loop
  hammering the machine.
- **`AppRotateFiles`/`AppRotateBytes`** — keeps the log files from growing forever.

## 4. Manage the service

```powershell
C:\nssm\nssm-2.24\win64\nssm.exe status GreenhouseBackend      # check state
C:\nssm\nssm-2.24\win64\nssm.exe restart GreenhouseBackend     # after pulling code changes / editing .env
C:\nssm\nssm-2.24\win64\nssm.exe stop GreenhouseBackend
C:\nssm\nssm-2.24\win64\nssm.exe remove GreenhouseBackend confirm   # uninstall entirely
```

Or use the GUI: `services.msc` → find "GreenhouseBackend" → right-click for Start/Stop/Restart.

## 5. The campus MQTT bridge

`scripts/campus_mqtt_bridge.py` is a **second, separate always-on process**. It subscribes to the
PP Campus controller's MQTT topics and writes to InfluxDB and Postgres. It is deliberately not part
of `GreenhouseBackend`: a crash or restart here must never affect the API serving live Kampot and
Kep dashboards.

It was set up before this section existed, so **the service name on the lab desktop may differ from
the one below**. Find it with:

```powershell
Get-Service | Where-Object { $_.Name -match "campus|bridge|mqtt" }
```

If nothing comes back it is not installed as a service, and is either running in a console window or
not running at all. Install it the same way as the backend:

```powershell
C:
ssm
ssm-2.24\win64
ssm.exe install CampusMqttBridge "D:\GreenhouseDashboardackend\.venv\Scripts\python.exe" "scripts\campus_mqtt_bridge.py"
C:
ssm
ssm-2.24\win64
ssm.exe set CampusMqttBridge AppDirectory "D:\GreenhouseDashboardackend"
C:
ssm
ssm-2.24\win64
ssm.exe set CampusMqttBridge AppStdout "D:\GreenhouseDashboardackend\data\campus-bridge.log"
C:
ssm
ssm-2.24\win64
ssm.exe set CampusMqttBridge AppStderr "D:\GreenhouseDashboardackend\data\campus-bridge.log"
C:
ssm
ssm-2.24\win64
ssm.exe set CampusMqttBridge AppRotateFiles 1
C:
ssm
ssm-2.24\win64
ssm.exe set CampusMqttBridge AppRotateBytes 1048576
C:
ssm
ssm-2.24\win64
ssm.exe set CampusMqttBridge Start SERVICE_AUTO_START
C:
ssm
ssm-2.24\win64
ssm.exe start CampusMqttBridge
```

### It must be restarted after a topic change

**An MQTT subscription is not retroactive.** The bridge subscribes on connect, so a process that
started before a topic was added to the code is not listening to that topic at all, however long it
stays up. Restarting is not optional housekeeping after a change like that — it is the change taking
effect.

```powershell
git pull
C:
ssm
ssm-2.24\win64
ssm.exe restart CampusMqttBridge
```

The log should then show both topics on the subscribe line:

```
[campus-mqtt-bridge] connected ... subscribing to RUPP_CAMPUS_1/phnom_penh/infor/status and RUPP_CAMPUS_1/phnom_penh/water_data
```

If only one topic appears, the running code is older than the pull.

### Checking the water feed

```powershell
cd D:\GreenhouseDashboardackend
.venv\Scripts\python.exe scripts\check_water_feed.py --wait 60
```

It reports the broker, InfluxDB and Postgres in the order a message travels, so data landing in one
store and not the other points at a single write path rather than "the water thing is broken". Run
it on THIS machine rather than a laptop — Postgres is loopback-only, so the archive half can only be
checked from here.

Note that the meter publishes roughly once a day. An empty result is the normal state most of the
time and only means trouble if it persists for a day or two after a confirmed restart.

## 6. Cloudflare Tunnel

Already wired up — `api.farmos-mechanicalengineering.com` is in `config.yml`'s ingress rules
pointing at `http://localhost:8000` (see [CLOUDFLARE_TUNNEL.md](../CLOUDFLARE_TUNNEL.md)), and the
`CloudflaredTunnel` NSSM service is already running. Once `GreenhouseBackend` is up and listening
on port 8000, `https://api.farmos-mechanicalengineering.com/api/health` should work immediately —
no extra tunnel changes needed.
