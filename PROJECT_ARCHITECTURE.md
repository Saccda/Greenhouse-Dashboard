# Greenhouse Dashboard — Project Architecture

## What this project is

A real-time IoT monitoring and control dashboard for pepper farms in Kampot and Kep, Cambodia, plus a third "PP Campus" site used as a teaching/testing rig at RUPP in Phnom Penh. Each site has ESP32-based sensors (temperature, humidity) and relay-controlled equipment (cooling, misting/spraying pumps). The dashboard lets farm owners view live and historical sensor data, control equipment remotely, and receive alerts — scoped per user so each account only sees the farm(s) it's been granted access to.

**Full data path (hardware → browser):**

```
ESP32 (sensors + relays)
   |  MQTT (HiveMQ Cloud)
   v
Node-RED  (flow orchestration: parses MQTT, writes to InfluxDB, exposes an
           HTTP endpoint the backend calls to push setpoint changes back down)
   |  writes readings                    ^  receives setpoint commands
   v                                     |
InfluxDB Cloud (time-series store)  <----+
   |  queried by
   v
FastAPI backend  (this repo, backend/)
   |  REST API, JSON, httpOnly cookie auth
   v
Next.js frontend  (this repo, frontend/)
   |  rendered in
   v
Browser (farm owners / developers / pending accounts)
```

Two data stores back the backend itself:
- **InfluxDB Cloud** — sensor time-series (one InfluxDB "measurement" per farm).
- **Flat JSON/SQLite files under `backend/data/`** — `users.json` (accounts, password hashes, roles, farm access), `settings.json` (app-level settings), `setpoints.json` (last setpoint sent per farm/relay), `alerts.db` (SQLite alert/notification log), `pump_guard.json` (active dry-run lockout and strike count per farm).
- **PostgreSQL**, on the lab desktop only, as the long-term archive the ML work trains against — `services/forecast_features.py` reads it via `load_postgres()`, and `scripts/campus_mqtt_bridge.py` writes to it. It is **not** on the request path: no API endpoint queries it, so the web app runs fine without it, which is why Vercel and the hosted backend never see it. Two roles on purpose — `POSTGRES_URL` is `SELECT`-only so analysis code cannot corrupt the archive, and `POSTGRES_WRITE_URL` is the separate write account used by the bridge. Loopback only; never exposed to the internet.

---

## Backend (`backend/`) — FastAPI, Python

**Entry point:** `app.py` — creates the FastAPI app, registers all routers, CORS, a hand-rolled per-IP rate limiter (120 req/min), and a background APScheduler job that runs alert checks every 5 minutes. Runs on port 5000 via `python app.py` (uvicorn with `--reload` in dev). Swagger UI (`/docs`) is only enabled when `FLASK_ENV=development` — disabled in production so the API surface isn't publicly documented.

### Routers (`backend/routes/`)

| Router | Purpose |
|---|---|
| `auth.py` | `/api/auth/login`, `/register`, `/me`, `/logout`. Login/register are the only public (unauthenticated) endpoints besides `/api/health`. |
| `users.py` | Admin-only (`owner` role) user management: create/update accounts, set role, set per-user farm access. |
| `farms.py` | `GET /api/farms/` and `/api/farms/{id}` — lists farms the *calling user* is allowed to see (filtered server-side, not just hidden in the UI). |
| `sensors.py` | `GET /api/sensors/latest`, `/history`, `/spray-stats` — reads from InfluxDB, scoped to `?farm=`. |
| `setpoint.py` | `GET/POST /api/setpoint` — proxies control commands (relay thresholds) to Node-RED, which relays them to the ESP32 over MQTT. Persists the last-sent value locally so a second browser tab can see "someone already changed this." |
| `notifications.py` | Alert/notification log: status, history, CSV export, manual test-trigger. |
| `settings_api.py` | App-level settings (thresholds, etc.) not tied to a single user. |

### Services (`backend/services/`)

| Service | Responsibility |
|---|---|
| `auth_service.py` | Password hashing (PBKDF2), httpOnly-cookie session issuing/verification, and the core FastAPI auth dependencies: `require_auth` (any logged-in account), `require_write_access` (owner/developer only — blocks `pending`), `require_admin` (owner only), `require_farm_access` (per-farm scoping check). **Key design point:** the session cookie only encodes identity (username) — role and farm access are looked up fresh from `user_service` on *every* request, so an admin editing someone's access takes effect on their very next request, not their next login. |
| `user_service.py` | CRUD over `data/users.json` — accounts, roles, per-user `farms` allowlist (`None` = unrestricted, `[]` = no farms, explicit list = scoped). |
| `influxdb_service.py` | All InfluxDB Flux queries — latest readings, historical ranges with aggregation, health check. |
| `setpoint_service.py` | Persists last-sent setpoint per farm/relay to `data/setpoints.json`. |
| `spray_analysis.py` | Derives spray/irrigation event stats (count, duration, estimated water use) from raw relay-state history. |
| `alert_checker.py` | Scheduled job (every 5 min) — checks latest readings against thresholds and connectivity, fires Telegram alerts on breach, respects a cooldown and a maintenance window so expected overnight shutdowns don't spam alerts. |
| `alert_log_service.py` | SQLite-backed (`data/alerts.db`) history of every alert fired, for the Alert Log page and CSV export. |
| `pump_guard.py` | The only service that **commands hardware on its own**, rather than reporting on it. When `alert_checker` classifies a spray as `empty_tank` (running long *and* not cooling, so the pump is moving no water) it raises relay 3's setpoint band out of reach — 40.5–41.0 °C against a 37.6 °C record — because Kampot and Kep have no direct relay command. That makes the stop indirect, so it verifies two minutes later that the relay actually opened and alarms louder if it did not. Latches to `data/pump_guard.json`, so a restart cannot forget a lockout and leave a farm silently un-sprayable. The first lockout may restore itself once after 30 unbroken minutes below the pump's own off-point; the next dry run locks out for good, because a greenhouse cools every evening whether or not anyone refilled the tank. Released by hand from the Control page via `POST /api/pump-lockout/release`, which also clears the strike. Its decision table is asserted by `scripts/verify_pump_guard.py` against a stubbed Node-RED and Telegram. |
| `telegram_service.py` | Sends alert messages via the Telegram Bot API. |
| `settings_service.py` | Reads/writes `data/settings.json`. |

### Auth & authorization model

- **Session:** `gh_session` httpOnly cookie, signed (HMAC-SHA256) payload `{username, expiry}` — no server-side revocation list; rotating `SECRET_KEY` invalidates all sessions at once if ever needed.
- **Roles** (gate *write* access): `pending` (read-only, awaiting approval) → `developer` → `owner` (can manage other accounts). Applied deny-by-default at the router level via `dependencies=[Depends(auth_service.require_auth)]`, so a new route is protected automatically unless deliberately made public.
- **Farm access** (gates *which farm(s) an account can see at all*, orthogonal to role): a `farms: list[str] | None` field per user. `None` = unrestricted (legacy/admin accounts), `[]` = no access, explicit list = scoped to those farm IDs. New self-registrations default to `farms=[]` (see nothing until an owner grants access) and role `pending`. Enforced server-side (`require_farm_access`) on every farm-scoped endpoint, not just hidden in the frontend.
- **Rate limiting:** global per-IP limiter (120 req/min) as a defense-in-depth backstop on top of auth; login additionally has its own per-username lockout (5 failed attempts → 60s lockout).

### Configuration (`backend/config.py`)

Central config, all from environment variables (`.env`). Notably `FARMS` — a dict of farm ID → `{display_name, measurement (InfluxDB measurement name), location, fogger_spec}`; adding a farm here is what makes it selectable everywhere (frontend picks it up automatically via `/api/farms/`). `fogger_spec` (lines × foggers/line × flow rate) drives the estimated-water-use calculation; `None` until a farm's hardware layout is confirmed. Currently three farms: `kampot` (fully wired, fogger spec known), `kep` (wired, fogger spec unknown), `campus` (config placeholder only — no live data pipeline yet, so it shows offline/no-data by design).

---

## Frontend (`frontend/`) — Next.js 14 (App Router), TypeScript, Tailwind

**Runs on port 3000/3010 (dev), deployed to Vercel (production).** Talks to the backend exclusively over `fetch(..., { credentials: "include" })` so the httpOnly session cookie is sent automatically — no token handling in JS.

### Pages (`frontend/src/app/*/page.tsx`)

| Page | Purpose |
|---|---|
| `/` (landing) | Card-grid entry point linking to each section, plus a live weather widget/map for context. |
| `/login`, `/register` | Auth forms. |
| `/dashboard` | Main live-monitoring view: current temp/humidity, relay status, spray stats today, trend chart, active alerts. |
| `/control` | Manual control: relay panel, low/high setpoint sliders, "send to controller" (proxied to Node-RED/MQTT), alert threshold config. Read-only for `pending` accounts with an explicit "awaiting approval" banner. |
| `/analytics` | Trends & statistics over a selected time range. |
| `/historical` | Date-range browser over raw sensor history, incl. estimated water use. |
| `/alert-log` | Event/alert history with CSV export. |
| `/scada` | Control-first HMI for the PP Campus rig specifically — live relay status, the same setpoint panel as `/control`, and an alarm/threshold table. Deliberately not styled like Kampot/Kep's monitoring pages (this is the site being actively developed/tested, so control comes first, not passive charts). Only shown in navigation when the account's selected farm is `campus`. |
| `/settings` | Account/user administration (owner-only): create users, edit roles, edit per-user farm access. |
| `/overview` | Static explainer of how the system works, incl. farm footage videos — used as teaching/onboarding material. |
| `/roadmap` | Project roadmap/changelog view. |

### Shared building blocks

- **`hooks/useAuth.tsx`** — current user (`username`, `role`, `farms`), login/logout/register calls, wraps the app to gate routes.
- **`hooks/useFarmSelection.ts`** — shared "which farm is currently selected" state, incl. auto-redirect to `/scada` when the campus farm is selected (since campus doesn't have the standard monitoring pages).
- **`hooks/useDashboard.ts`** — SWR-based polling (15s interval) of sensor/relay/alert data for the Dashboard page.
- **`hooks/useSettings.ts`**, **`useLocalStorage.ts`** — persisted local UI preferences (default farm, theme), with a `CustomEvent` pub/sub layer so same-tab updates propagate immediately (the browser's native `storage` event only fires cross-tab).
- **`components/layout/Sidebar.tsx` / `Header.tsx`** — nav (conditionally includes SCADA only for campus-scoped views) and the per-page farm selector dropdown (populated from the server-filtered `/api/farms/` response, so a scoped user only ever sees their own farm(s) as options).
- **`components/hmi/`** — `SetpointPanel` (relay threshold sliders + send-to-controller, shared by `/control` and `/scada`), `RelayIndicator`, `EquipmentMimic`.
- **`components/charts/`** — `SensorChart` (Recharts-based trend chart), `Sparkline`.
- **`middleware.ts`** — Next.js edge middleware that redirects unauthenticated requests to `/login`. This is a UX convenience only — the real enforcement is the backend rejecting unauthorized API calls regardless of what page loaded.
- **`lib/api.ts`** — typed fetch wrapper for all backend calls.

### Key libraries

Next.js 14 / React 18, SWR (data fetching + polling), Recharts (charts), Leaflet (weather map), lucide-react (icons), Tailwind CSS.

---

## Notes for generating teaching material from this doc

- The clean three-tier story to teach is **Sensor/Hardware → Backend (FastAPI + InfluxDB) → Frontend (Next.js)**, with MQTT/Node-RED as the hardware-facing middle step already covered in a separate module (ESP32/MQTT/Node-RED), so this project's dashboard portion picks up from "data already arrives in InfluxDB."
- Good simplification targets for a short course: drop auth/roles/farm-scoping complexity entirely, use one hardcoded farm, and focus students on (a) backend: one FastAPI route that queries InfluxDB and returns JSON, (b) frontend: one page that fetches that JSON and renders it live. This mirrors the existing separate teaching module already built from this project (see `01_Session_Plan.md` etc., outside this repo).
- The full production system's interesting real-world details (deny-by-default auth, per-user farm scoping, rate limiting, alert cooldown/maintenance windows) are good "here's what a real system adds on top" talking points, but not core to a 2-session intro.
