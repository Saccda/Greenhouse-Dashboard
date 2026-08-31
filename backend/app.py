"""
Greenhouse Monitor — FastAPI backend

Auth model: every route below requires a logged-in session (httpOnly
`gh_session` cookie) except /api/health and /api/auth/* themselves — see
services/auth_service.py and each router's `dependencies=[...]`.

Endpoints:
  GET  /api/health                (public — liveness probe)
  POST /api/auth/login            (public)
  POST /api/auth/register         (public)
  GET  /api/auth/me
  POST /api/auth/logout
  GET  /api/farms/
  GET  /api/farms/{farm_id}
  GET  /api/sensors/latest?farm=kampot
  GET  /api/sensors/history?farm=kampot&range=-24h&agg=15m
  GET  /api/sensors/spray-stats?farm=kampot
  POST /api/campus/relay-command      (owner/developer — direct MQTT channel toggle)
  GET  /api/notifications/status
  GET  /api/notifications/history
  POST /api/notifications/test        (owner/developer)
  POST /api/notifications/check-now   (owner/developer)
  GET  /api/notifications/log
  GET  /api/notifications/log/export
  GET  /api/notifications/log/summary
  GET  /docs   (Swagger UI — local dev only, FLASK_ENV=development)

Run:
  cd backend
  python app.py
"""
from contextlib import asynccontextmanager
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from limits import RateLimitItemPerMinute
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter
from starlette.middleware.base import BaseHTTPMiddleware
import uvicorn

import config
from routes.sensors       import router as sensors_router
from routes.farms         import router as farms_router
from routes.notifications import router as notifications_router
from routes.settings_api  import router as settings_router
from routes.setpoint      import router as setpoint_router
from routes.campus        import router as campus_router
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

# Swagger/ReDoc/OpenAPI schema publicly document every endpoint, including
# ones that only differ from "open" by an auth check — don't hand that map
# out in production. Still available in local dev (FLASK_ENV=development).
_docs_enabled = config.FLASK_ENV == "development"

app = FastAPI(
    title="Greenhouse Monitor API",
    version="0.1.0",
    description="Real-time IoT monitoring dashboard for pepper farms",
    lifespan=lifespan,
    docs_url=  "/docs"        if _docs_enabled else None,
    redoc_url= "/redoc"       if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# General per-IP abuse protection on top of auth (which only stops
# *unauthenticated* access) — an authenticated account hammering the API,
# or scraping the CSV export, still gets throttled. Login has its own
# stricter per-username lockout in auth_service.py; this is the broad net.
#
# Hand-rolled rather than slowapi's ASGI middleware: slowapi identifies the
# matched route by walking app.routes and matching each one by hand, which
# breaks on this FastAPI version — routes added via include_router() show up
# as an internal `_IncludedRouter` wrapper slowapi doesn't recognize, so it
# silently treated everything except the one route declared directly on
# `app` as exempt (verified directly — every request passed, uncapped).
# This uses the same underlying `limits` library slowapi wraps, just without
# the route-matching step: one global per-IP counter, no per-route lookup to
# get wrong.
_rate_limit    = RateLimitItemPerMinute(120)
_rate_limiter  = FixedWindowRateLimiter(MemoryStorage())


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        if not _rate_limiter.hit(_rate_limit, client_ip):
            return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)

app.include_router(sensors_router)
app.include_router(farms_router)
app.include_router(notifications_router)
app.include_router(settings_router)
app.include_router(setpoint_router)
app.include_router(campus_router)
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
