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
C:\nssm\win64\nssm.exe install GreenhouseBackend "D:\GreenhouseDashboard\backend\.venv\Scripts\python.exe" "-m uvicorn app:app --host 0.0.0.0 --port 8000"

C:\nssm\win64\nssm.exe set GreenhouseBackend AppDirectory "D:\GreenhouseDashboard\backend"
C:\nssm\win64\nssm.exe set GreenhouseBackend AppStdout "D:\GreenhouseDashboard\backend\data\service-out.log"
C:\nssm\win64\nssm.exe set GreenhouseBackend AppStderr "D:\GreenhouseDashboard\backend\data\service-err.log"
C:\nssm\win64\nssm.exe set GreenhouseBackend AppRotateFiles 1
C:\nssm\win64\nssm.exe set GreenhouseBackend AppRotateBytes 1048576
C:\nssm\win64\nssm.exe set GreenhouseBackend Start SERVICE_AUTO_START
C:\nssm\win64\nssm.exe set GreenhouseBackend AppRestartDelay 5000

C:\nssm\win64\nssm.exe start GreenhouseBackend
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
C:\nssm\win64\nssm.exe status GreenhouseBackend      # check state
C:\nssm\win64\nssm.exe restart GreenhouseBackend     # after pulling code changes / editing .env
C:\nssm\win64\nssm.exe stop GreenhouseBackend
C:\nssm\win64\nssm.exe remove GreenhouseBackend confirm   # uninstall entirely
```

Or use the GUI: `services.msc` → find "GreenhouseBackend" → right-click for Start/Stop/Restart.

## 5. Point Cloudflare Tunnel at it

In your tunnel's ingress config, add a route for the backend alongside the existing
Node-RED one, pointing at `http://localhost:8000` (the port set above).

Whatever public hostname Cloudflare gives that route (e.g. `https://api.yourdomain.com`)
is what you'll set as `NEXT_PUBLIC_API_URL` in Vercel, and what you'll add to `CORS_ORIGIN`
in `backend/.env` alongside the Vercel URL — then `nssm restart GreenhouseBackend` to pick
up the `.env` change.
