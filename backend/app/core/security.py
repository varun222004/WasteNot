import hashlib
import hmac
import secrets
from datetime import timedelta

import jwt
from fastapi import HTTPException

from app.core.config import settings
from app.db.utils import utcnow


def digest(value: str) -> str:
    return hmac.new(settings.otp_pepper.encode(), value.encode(), hashlib.sha256).hexdigest()


def safe_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def create_access_token(user_id: str) -> str:
    now = utcnow()
    payload = {"sub": user_id, "typ": "access", "iat": now,
               "exp": now + timedelta(minutes=settings.access_token_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_refresh_token(user_id: str, jti: str) -> str:
    now = utcnow()
    payload = {"sub": user_id, "typ": "refresh", "jti": jti, "iat": now,
               "exp": now + timedelta(days=settings.refresh_token_days)}
    return jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")


def decode_token(token: str, kind: str) -> dict:
    secret = settings.jwt_secret if kind == "access" else settings.jwt_refresh_secret
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"],
                             options={"require": ["exp", "iat", "sub", "typ"]})
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session") from exc
    if payload.get("typ") != kind:
        raise HTTPException(status_code=401, detail="Invalid session")
    return payload
