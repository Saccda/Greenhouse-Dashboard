"""
Greenhouse Monitor — FastAPI backend

Endpoints:
  GET  /api/health
  GET  /api/farms/
  GET  /api/farms/{farm_id}
  GET  /api/sensors/latest?farm=kampot
  GET  /api/sensors/history?farm=kampot&range=-24h&agg=15m
  GET  /api/sensors/spray-stats?farm=kampot
  GET  /api/notifications/status
  GET  /api/notifications/history
  POST /api/notifications/test
  POST /api/notifications/check-now
  GET  /api/notifications/log
  GET  /api/notifications/log/export
  GET  /api/notifications/log/summary
  GET  /docs   (Swagger UI)

Run:
  cd backend
  python app.py
"""
from contextlib import asynccontextmanager
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import config
from routes.sensors       import router as sensors_router
from routes.farms         import router as farms_router
from routes.notifications import router as notifications_router
from routes.settings_api  import router as settings_router
from routes.setpoint      import router as setpoint_router
from routes.auth          import router as auth_router
from routes.users         import router as users_router
from schemas              import HealthResponse
from services             import influxdb_service as db
from services             import alert_checker
from services             import alert_log_service as alert_log

# ── Background scheduler ──────────────────────────────────────────────────

_scheduler = BackgroundScheduler(timezone=str(config.TIMEZONE))
_scheduler.add_job(
    alert_checker.run_all_checks,
    trigger="interval",
    minutes=config.ALERT_CHECK_INTERVAL_MINUTES,
    id="alert_checker",
    replace_existing=True,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    alert_log.init_db()
    _scheduler.start()
    print(
        f"[Scheduler] Alert checker started — "
        f"running every {config.ALERT_CHECK_INTERVAL_MINUTES} min"
    )
    yield
    _scheduler.shutdown(wait=False)
    print("[Scheduler] Alert checker stopped")


# ── FastAPI app ───────────────────────────────────────────────────────────

app = FastAPI(
    title="Greenhouse Monitor API",
    version="0.1.0",
    description="Real-time IoT monitoring dashboard for pepper farms",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sensors_router)
app.include_router(farms_router)
app.include_router(notifications_router)
app.include_router(settings_router)
app.include_router(setpoint_router)
app.include_router(auth_router)
app.include_router(users_router)

# ── Root health — quick liveness probe used by the frontend ──────────────

@app.get("/api/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    ok = db.health_check()
    return HealthResponse(
        status="healthy" if ok else "degraded",
        influxdb="connected" if ok else "unreachable",
        timestamp=datetime.now(config.TIMEZONE).isoformat(),
    )

# ── Entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=5000,
        reload=True,
        reload_dirs=["./"],
    )
