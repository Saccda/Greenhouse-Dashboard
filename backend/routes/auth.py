"""
/api/auth — login, self-registration, session check, logout.

The session token is carried in an httpOnly cookie (set_session_cookie /
clear_session_cookie in auth_service) — never returned in the JSON body, so
frontend JS never has direct access to it. /me is how the frontend learns
who's logged in; real enforcement always happens server-side via
auth_service.require_auth/require_write_access on every protected route.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username:     str = Field(min_length=3, max_length=64)
    password:     str = Field(min_length=8)
    email:        str = Field(min_length=3, max_length=254)
    display_name: str = Field(min_length=1, max_length=64)


@router.post("/login")
def login(body: LoginRequest, response: Response) -> dict:
    result = auth_service.login(body.username, body.password)
    if result is None:
        # Deliberately generic — don't reveal whether the username exists.
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token, role, farms, expires_at = result
    auth_service.set_session_cookie(response, token, expires_at)
    return {"username": body.username, "role": role, "farms": farms}


@router.post("/register")
def register(body: RegisterRequest, response: Response) -> dict:
    """Self-service signup — always lands in the 'pending' role awaiting owner approval."""
    result = auth_service.register(body.username, body.password, body.email, body.display_name)
    if isinstance(result, str):
        raise HTTPException(status_code=400, detail=result)
    token, role, farms, expires_at = result
    auth_service.set_session_cookie(response, token, expires_at)
    return {"username": body.username, "role": role, "farms": farms}


@router.get("/me")
def me(user: dict = Depends(auth_service.require_auth)) -> dict:
    """Who's logged in, per the session cookie — hydrates the frontend's auth state on load."""
    return {"username": user["username"], "role": user["role"], "farms": user.get("farms")}


@router.post("/logout")
def logout(response: Response, _user: dict = Depends(auth_service.require_auth)) -> dict:
    """Clear the session cookie. JS can't clear an httpOnly cookie itself, so this round-trip is required."""
    auth_service.clear_session_cookie(response)
    return {"ok": True}
