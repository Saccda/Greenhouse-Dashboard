# Tech Stack

## Backend

- **Language:** Python
- **Framework:** FastAPI
- **Server:** Uvicorn
- **Database (time-series):** InfluxDB Cloud
- **Database (accounts/settings/alerts):** flat JSON files + SQLite (no relational DB currently in use)
- **Data validation:** Pydantic
- **Scheduled jobs:** APScheduler (periodic alert checks)
- **HTTP client:** httpx (calls out to Node-RED)
- **Rate limiting:** limits
- **Notifications:** Telegram Bot API
- **Hardware integration:** MQTT (via Node-RED) — not part of this repo, but what the backend talks to

## Frontend

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **UI library:** React 18
- **Styling:** Tailwind CSS
- **Data fetching:** SWR
- **Charts:** Recharts
- **Maps:** Leaflet
- **Icons:** lucide-react

## Deployment

- **Frontend:** Vercel
- **Backend:** self-hosted (Windows machine, run via NSSM as a service)
