from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.deps import ACCESS_COOKIE, REFRESH_COOKIE, get_current_user
from app.core.security import (create_access_token, create_refresh_token, decode_token, digest,
                               generate_otp, safe_equals)
from app.db.mongo import db
from app.db.utils import new_id, utcnow
from app.modules.users.service import serialize_me
from app.services.email import send_email

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
MAX_SENDS_PER_HOUR = 5
RESEND_COOLDOWN = timedelta(seconds=30)


class OtpRequest(BaseModel):
    email: EmailStr


class OtpVerify(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


def _norm(email: str) -> str:
    return email.strip().lower()


def _set_cookies(response: Response, access: str, refresh: str) -> None:
    common = {"httponly": True, "secure": settings.cookie_secure, "samesite": settings.cookie_samesite}
    response.set_cookie(ACCESS_COOKIE, access, max_age=settings.access_token_minutes * 60, path="/", **common)
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=settings.refresh_token_days * 86400,
                        path="/api/v1/auth", **common)


def _clear_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")


async def _issue_session(user_id: str, request: Request, response: Response) -> str:
    jti = new_id()
    refresh = create_refresh_token(user_id, jti)
    await db.sessions.insert_one({
        "_id": new_id(), "jti": jti, "user_id": user_id, "token_hash": digest(refresh), "revoked": False,
        "user_agent": request.headers.get("user-agent", "")[:200], "created_at": utcnow(),
        "expires_at": utcnow() + timedelta(days=settings.refresh_token_days),
    })
    access = create_access_token(user_id)
    _set_cookies(response, access, refresh)
    return access


@router.post("/request-otp")
async def request_otp(body: OtpRequest):
    email = _norm(body.email)
    now = utcnow()
    record = await db.otp_records.find_one({"email": email}) or {}
    sends = [t for t in record.get("sends", []) if t > now - timedelta(hours=1)]
    if sends and now - sends[-1] < RESEND_COOLDOWN:
        raise HTTPException(status_code=429, detail="Please wait a few seconds before requesting another code")
    if len(sends) >= MAX_SENDS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many codes requested. Try again in an hour")
    code = generate_otp()
    await db.otp_records.update_one({"email": email}, {"$set": {
        "code_hash": digest(f"{email}:{code}"), "attempts": 0, "expires_at": now + OTP_TTL,
        "sends": sends + [now], "purge_at": now + timedelta(hours=2)}, "$setOnInsert": {"_id": new_id()}},
        upsert=True)
    await send_email(email, "Your WasteNot sign-in code",
                     f"Your WasteNot code is {code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.")
    result = {"message": "If the address is valid, a code has been sent", "expires_in_seconds": 600}
    if settings.dev_otp_enabled and not settings.is_production:
        result["dev_otp"] = code
    return result


@router.post("/verify-otp")
async def verify_otp(body: OtpVerify, request: Request, response: Response):
    email = _norm(body.email)
    now = utcnow()
    rec = await db.otp_records.find_one({"email": email})
    if not rec or not rec.get("code_hash"):
        raise HTTPException(status_code=400, detail="Request a new code")
    if rec["expires_at"] <= now:
        raise HTTPException(status_code=400, detail="This code has expired. Request a new one")
    if rec["attempts"] >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code")
    await db.otp_records.update_one({"_id": rec["_id"]}, {"$inc": {"attempts": 1}})
    if not safe_equals(rec["code_hash"], digest(f"{email}:{body.code}")):
        left = MAX_ATTEMPTS - rec["attempts"] - 1
        raise HTTPException(status_code=400, detail=f"Incorrect code. {max(left, 0)} attempts left")
    # Consume atomically so a code can only be used once.
    consumed = await db.otp_records.update_one({"_id": rec["_id"], "code_hash": rec["code_hash"]},
                                               {"$set": {"code_hash": None}})
    if consumed.modified_count != 1:
        raise HTTPException(status_code=400, detail="Request a new code")

    role = "admin" if email in settings.admin_emails else "user"
    user = await db.users.find_one({"email": email})
    is_new = user is None
    if is_new:
        user = {"_id": new_id(), "email": email, "display_name": email.split("@")[0][:40], "bio": "",
                "locality": "", "avatar_file_id": None, "role": role, "status": "active",
                "email_verified": True, "saved_location": None, "saved_listing_ids": [],
                "stats": {"given": 0, "received": 0, "completed": 0},
                "onboarded": False, "created_at": now, "last_login_at": now}
        await db.users.insert_one(user)
    else:
        updates = {"email_verified": True, "last_login_at": now}
        if role == "admin":
            updates["role"] = "admin"
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
        user.update(updates)
    if user.get("status") == "suspended" and (user.get("suspended_until") is None or user["suspended_until"] > now):
        raise HTTPException(status_code=403, detail="Your account is suspended")
    access = await _issue_session(user["_id"], request, response)
    return {"user": await serialize_me(user), "is_new": is_new, "access_token": access}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="No session")
    payload = decode_token(token, "refresh")
    session = await db.sessions.find_one({"jti": payload["jti"], "revoked": False})
    if not session or not safe_equals(session["token_hash"], digest(token)):
        _clear_cookies(response)
        raise HTTPException(status_code=401, detail="Session expired")
    await db.sessions.update_one({"_id": session["_id"]}, {"$set": {"revoked": True}})
    await _issue_session(payload["sub"], request, response)
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        try:
            payload = decode_token(token, "refresh")
            await db.sessions.update_one({"jti": payload["jti"]}, {"$set": {"revoked": True}})
        except HTTPException:
            pass
    _clear_cookies(response)
    return {"ok": True}


@router.post("/logout-all")
async def logout_all(response: Response, user: dict = Depends(get_current_user)):
    await db.sessions.update_many({"user_id": user["_id"]}, {"$set": {"revoked": True}})
    _clear_cookies(response)
    return {"ok": True}
