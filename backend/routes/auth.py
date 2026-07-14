"""
/api/auth — login and self-registration. No /me endpoint: the token
payload is base64 (not encrypted), so the frontend can decode it locally
for display; real enforcement always happens server-side via
auth_service.require_auth/require_write_access on the write endpoints.
"""
from fastapi import APIRouter, HTTPException
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
def login(body: LoginRequest) -> dict:
    result = auth_service.login(body.username, body.password)
    if result is None:
        # Deliberately generic — don't reveal whether the username exists.
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token, role, expires_at = result
    return {"token": token, "username": body.username, "role": role, "expires_at": expires_at}


@router.post("/register")
def register(body: RegisterRequest) -> dict:
    """Self-service signup — always lands in the 'pending' role awaiting owner approval."""
    result = auth_service.register(body.username, body.password, body.email, body.display_name)
    if isinstance(result, str):
        raise HTTPException(status_code=400, detail=result)
    token, role, expires_at = result
    return {"token": token, "username": body.username, "role": role, "expires_at": expires_at}
