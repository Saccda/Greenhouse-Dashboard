"""
User store — backend/data/users.json.

Three roles: "owner" and "developer" (full write access), and "pending"
(self-registered, logged in, but no write access until an owner promotes
them via /api/users). scripts/create_user.py remains the bootstrap tool
for the very first account; every account after that comes either from
an owner using /api/users directly, or from self-registration landing in
"pending" for an owner to approve.

`farms` is orthogonal to role: a list of farm IDs (config.FARMS keys) the
account may view/act on, or None for unrestricted (sees every farm — the
default, so existing accounts are unaffected). Lets a real farm owner be
scoped to just their own farm while devs/admins keep seeing everything.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "users.json")


def _load() -> dict:
    try:
        with open(_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write(data: dict) -> None:
    os.makedirs(os.path.dirname(_PATH), exist_ok=True)
    with open(_PATH, "w") as f:
        json.dump(data, f, indent=2)


def get_user(username: str) -> dict | None:
    """Return {username, role, farms, salt_hex, hash_hex, created_at, email, display_name} or None."""
    return _load().get(username)


def upsert_user(
    username:     str,
    role:         str,
    salt_hex:     str,
    hash_hex:     str,
    email:        str | None = None,
    display_name: str | None = None,
    farms:        list[str] | None = None,
) -> None:
    """
    Create a new user, or reset an existing one's password/role.
    Preserves created_at, and preserves email/display_name/farms when not
    explicitly provided (e.g. an admin-triggered password reset via
    create_user.py shouldn't blank out a self-registered profile or an
    already-configured farm scope).
    """
    data = _load()
    existing = data.get(username, {})
    data[username] = {
        "username":     username,
        "role":         role,
        "farms":        farms if farms is not None else existing.get("farms"),
        "salt_hex":     salt_hex,
        "hash_hex":     hash_hex,
        "created_at":   existing.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "email":        email if email is not None else existing.get("email"),
        "display_name": display_name if display_name is not None else existing.get("display_name"),
    }
    _write(data)


def set_role(username: str, role: str) -> bool:
    """Return True if the user existed and was updated."""
    data = _load()
    if username not in data:
        return False
    data[username]["role"] = role
    _write(data)
    return True


def set_farms(username: str, farms: list[str] | None) -> bool:
    """Return True if the user existed and was updated. farms=None means unrestricted."""
    data = _load()
    if username not in data:
        return False
    data[username]["farms"] = farms
    _write(data)
    return True


def set_password(username: str, salt_hex: str, hash_hex: str) -> bool:
    data = _load()
    if username not in data:
        return False
    data[username]["salt_hex"] = salt_hex
    data[username]["hash_hex"] = hash_hex
    _write(data)
    return True


def delete_user(username: str) -> bool:
    data = _load()
    if username not in data:
        return False
    del data[username]
    _write(data)
    return True


def list_users() -> list[dict]:
    """Public fields only — never exposes hashes."""
    return [
        {
            "username":     u["username"],
            "role":         u["role"],
            "farms":        u.get("farms"),
            "created_at":   u.get("created_at"),
            "email":        u.get("email"),
            "display_name": u.get("display_name"),
        }
        for u in _load().values()
    ]


def count_by_role(role: str) -> int:
    return sum(1 for u in _load().values() if u["role"] == role)
