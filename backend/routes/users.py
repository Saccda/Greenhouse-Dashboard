"""
/api/users — owner-only account management.

scripts/create_user.py remains the bootstrap tool for the very first
account (there's no way to be admin-authenticated before one exists);
every account after that is managed here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import config
from services import auth_service, user_service

router = APIRouter(prefix="/api/users", tags=["users"])

# An admin creating an account directly grants real access — "pending" only
# happens via self-registration. PATCH allows "pending" too, so an owner can
# revoke someone back to read-only without deleting their account outright.
CREATE_ROLES = {"owner", "developer"}
ALL_ROLES    = CREATE_ROLES | {"pending"}


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8)
    role:     str
    farms:    list[str] | None = None   # None = unrestricted (sees every farm)


class UpdateUserRequest(BaseModel):
    role:     str | None = None
    password: str | None = Field(default=None, min_length=8)
    farms:    list[str] | None = None


def _validate_role(role: str, allowed: set[str]) -> None:
    if role not in allowed:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(allowed)}")


def _validate_farms(farms: list[str] | None) -> None:
    if farms is None:
        return
    unknown = [f for f in farms if f not in config.FARMS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown farm id(s): {sorted(unknown)}")


@router.get("")
def list_users(_admin: dict = Depends(auth_service.require_admin)) -> dict:
    return {"users": user_service.list_users()}


@router.post("")
def create_user(body: CreateUserRequest, _admin: dict = Depends(auth_service.require_admin)) -> dict:
    _validate_role(body.role, CREATE_ROLES)
    _validate_farms(body.farms)
    if user_service.get_user(body.username):
        raise HTTPException(status_code=409, detail=f"User '{body.username}' already exists")
    salt_hex, hash_hex = auth_service.hash_password(body.password)
    user_service.upsert_user(body.username, body.role, salt_hex, hash_hex, farms=body.farms)
    return {"username": body.username, "role": body.role, "farms": body.farms}


@router.patch("/{username}")
def update_user(
    username: str,
    body: UpdateUserRequest,
    admin: dict = Depends(auth_service.require_admin),
) -> dict:
    target = user_service.get_user(username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None:
        _validate_role(body.role, ALL_ROLES)
        if target["role"] == "owner" and body.role != "owner" and user_service.count_by_role("owner") <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last remaining owner")
        user_service.set_role(username, body.role)

    if body.password is not None:
        salt_hex, hash_hex = auth_service.hash_password(body.password)
        user_service.set_password(username, salt_hex, hash_hex)

    # "farms" explicitly present in the request (even as null, meaning
    # "unrestricted") is different from omitted (leave untouched) — a plain
    # `is not None` check can't tell those apart, so check what was actually sent.
    if "farms" in body.model_fields_set:
        _validate_farms(body.farms)
        user_service.set_farms(username, body.farms)

    updated = user_service.get_user(username)
    return {"username": updated["username"], "role": updated["role"], "farms": updated.get("farms")}


@router.delete("/{username}")
def delete_user(username: str, admin: dict = Depends(auth_service.require_admin)) -> dict:
    if username == admin["username"]:
        raise HTTPException(status_code=400, detail="You can't delete your own account while logged in as it")
    target = user_service.get_user(username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "owner" and user_service.count_by_role("owner") <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining owner")
    user_service.delete_user(username)
    return {"deleted": username}
