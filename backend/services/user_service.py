"""
User store — backend/data/users.json.

Four roles. "owner" and "developer" have full write access. "viewer" and
"pending" are read-only, and the distinction between them is deliberate:

  pending  self-registered, awaiting a decision. An owner is expected to
           promote or delete it.
  viewer   permanently read-only, by design. This is what a wall-mounted
           display account uses. It is NOT a lesser "pending": nobody should
           ever approve it, because there is nothing to approve.

They are separate roles rather than one because a display account parked in
"pending" would sit in an owner's approval queue forever, and one stray click
would silently grant a screen in a public corridor the ability to actuate
relays. A role that is never in a queue cannot be approved by accident.

scripts/create_user.py remains the bootstrap tool
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
        # Bumped on logout and on password change; the session token carries a
        # copy and is rejected when the two disagree. Preserved across an
        # upsert so an admin password reset does not silently un-revoke
        # sessions that a logout already killed.
        "token_version": existing.get("token_version", 1),
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


def bump_token_version(username: str) -> int | None:
    """
    Invalidate every session token already issued for this account.

    The session token is stateless — a signed {username, expiry} — so deleting
    the cookie only removes the browser's copy. Anyone holding the token string
    keeps access until it expires regardless. Incrementing the stored version
    is what actually revokes it, because require_auth compares the two.

    Returns the new version, or None if the user does not exist.
    """
    data = _load()
    if username not in data:
        return None
    version = data[username].get("token_version", 1) + 1
    data[username]["token_version"] = version
    _write(data)
    return version


def get_token_version(username: str) -> int:
    """Current token version, defaulting to 1 for records written before this existed."""
    return (_load().get(username) or {}).get("token_version", 1)


def set_password(username: str, salt_hex: str, hash_hex: str) -> bool:
    data = _load()
    if username not in data:
        return False
    # A password change revokes existing sessions: the usual reason to
    # change one is that the old password may be known to someone else.
    data[username]["token_version"] = data[username].get("token_version", 1) + 1
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
