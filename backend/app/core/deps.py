from fastapi import Depends, HTTPException, Request

from app.core.security import decode_token
from app.db.mongo import db
from app.db.utils import utcnow

ACCESS_COOKIE = "wn_access"
REFRESH_COOKIE = "wn_refresh"


def _token_from(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(ACCESS_COOKIE)


async def get_optional_user(request: Request) -> dict | None:
    token = _token_from(request)
    if not token:
        return None
    try:
        payload = decode_token(token, "access")
    except HTTPException:
        return None
    return await db.users.find_one({"_id": payload["sub"]})


async def get_current_user(request: Request) -> dict:
    token = _token_from(request)
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in to continue")
    payload = decode_token(token, "access")
    user = await db.users.find_one({"_id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="Account not found")
    if user.get("status") == "suspended":
        until = user.get("suspended_until")
        if until is None or until > utcnow():
            raise HTTPException(status_code=403, detail="Your account is suspended")
    return user


async def get_verified_user(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("email_verified"):
        raise HTTPException(status_code=403, detail="Verify your email to continue")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return user
