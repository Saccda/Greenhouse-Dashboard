"""
Password hashing + bearer-token sessions — stdlib only (hashlib/hmac/secrets).

Token shape:  base64url(json payload) + "." + hex HMAC-SHA256 signature
Payload:      {"u": username, "r": role, "exp": unix_timestamp}

No server-side revocation list — "logout" only clears client storage.
Acceptable for a 2-3 person internal tool; rotating SECRET_KEY invalidates
every outstanding token at once if a compromise is ever suspected.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time

from fastapi import Depends, Header, HTTPException

import config
from services import user_service

_PBKDF2_ITERATIONS = 550_000

# Public registration input — usernames are no longer admin-typed only,
# so they need actual validation now that the trust boundary has moved.
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,64}$")

# username -> (fail_count, locked_until_unix_ts)
_login_attempts: dict[str, tuple[int, float]] = {}
_MAX_ATTEMPTS  = 5
_LOCKOUT_SECS  = 60


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    """Return (salt_hex, hash_hex)."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return salt.hex(), digest.hex()


def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    _, candidate_hex = hash_password(password, bytes.fromhex(salt_hex))
    return hmac.compare_digest(candidate_hex, hash_hex)


def _sign(payload_b64: str) -> str:
    return hmac.new(config.SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()


def issue_token(username: str, role: str) -> tuple[str, int]:
    """Return (token, expires_at_unix_ts)."""
    expires_at = int(time.time()) + config.AUTH_TOKEN_TTL_DAYS * 86400
    payload = json.dumps({"u": username, "r": role, "exp": expires_at}, separators=(",", ":"))
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode()
    return f"{payload_b64}.{_sign(payload_b64)}", expires_at


def verify_token(token: str) -> dict | None:
    """Return {"username", "role"} if valid and unexpired, else None."""
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError:
        return None
    if not hmac.compare_digest(_sign(payload_b64), signature):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode()))
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return {"username": payload["u"], "role": payload["r"]}


def login(username: str, password: str) -> tuple[str, str, int] | None:
    """Return (token, role, expires_at) on success, None on any failure."""
    now = time.time()
    fail_count, locked_until = _login_attempts.get(username, (0, 0.0))
    if now < locked_until:
        return None

    user = user_service.get_user(username)
    if not user or not verify_password(password, user["salt_hex"], user["hash_hex"]):
        fail_count += 1
        locked_until = now + _LOCKOUT_SECS if fail_count >= _MAX_ATTEMPTS else 0.0
        _login_attempts[username] = (fail_count, locked_until)
        return None

    _login_attempts.pop(username, None)
    token, expires_at = issue_token(user["username"], user["role"])
    return token, user["role"], expires_at


def register(username: str, password: str, email: str, display_name: str) -> tuple[str, str, int] | str:
    """
    Self-service registration — always lands in the 'pending' role, with
    no write access until an owner promotes the account via /api/users.
    Returns (token, role, expires_at) on success, or an error string on failure.
    """
    if not _USERNAME_RE.match(username):
        return "Username must be 3-64 characters: letters, numbers, dots, underscores, or hyphens only"
    if user_service.get_user(username):
        return "That username is already taken"
    if len(password) < 8:
        return "Password must be at least 8 characters"

    salt_hex, hash_hex = hash_password(password)
    user_service.upsert_user(username, "pending", salt_hex, hash_hex, email=email, display_name=display_name)
    token, expires_at = issue_token(username, "pending")
    return token, "pending", expires_at


async def require_auth(authorization: str | None = Header(default=None)) -> dict:
    """
    FastAPI dependency — any valid, unexpired token is sufficient to be
    "logged in," including a 'pending' (unapproved) account. Use
    require_write_access for setpoints/thresholds, or require_admin for
    anything that manages other user accounts.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    claims = verify_token(authorization.removeprefix("Bearer "))
    if claims is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return claims


async def require_write_access(user: dict = Depends(require_auth)) -> dict:
    """FastAPI dependency — 'owner' and 'developer' only; 'pending' accounts are logged in but read-only."""
    if user["role"] not in ("owner", "developer"):
        raise HTTPException(status_code=403, detail="Your account is awaiting approval from a farm owner")
    return user


async def require_admin(user: dict = Depends(require_auth)) -> dict:
    """FastAPI dependency — only 'owner' accounts may manage other users."""
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only farm owners can manage user accounts")
    return user
