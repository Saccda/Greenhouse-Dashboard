"""
/api/users — owner-only account management.

scripts/create_user.py remains the bootstrap tool for the very first
account (there's no way to be admin-authenticated before one exists);
every account after that is managed here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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


class UpdateUserRequest(BaseModel):
    role:     str | None = None
    password: str | None = Field(default=None, min_length=8)


def _validate_role(role: str, allowed: set[str]) -> None:
    if role not in allowed:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(allowed)}")


@router.get("")
def list_users(_admin: dict = Depends(auth_service.require_admin)) -> dict:
    return {"users": user_service.list_users()}


@router.post("")
def create_user(body: CreateUserRequest, _admin: dict = Depends(auth_service.require_admin)) -> dict:
    _validate_role(body.role, CREATE_ROLES)
    if user_service.get_user(body.username):
        raise HTTPException(status_code=409, detail=f"User '{body.username}' already exists")
    salt_hex, hash_hex = auth_service.hash_password(body.password)
    user_service.upsert_user(body.username, body.role, salt_hex, hash_hex)
    return {"username": body.username, "role": body.role}


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

    updated = user_service.get_user(username)
    return {"username": updated["username"], "role": updated["role"]}


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
