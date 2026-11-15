from fastapi import HTTPException

from app.db.mongo import db
from app.db.utils import utcnow


async def is_blocked_between(a: str, b: str) -> bool:
    return await db.blocks.find_one({"$or": [
        {"blocker_id": a, "blocked_id": b}, {"blocker_id": b, "blocked_id": a}]}) is not None


async def ensure_not_blocked(a: str, b: str) -> None:
    if await is_blocked_between(a, b):
        raise HTTPException(status_code=403, detail="You can't interact with this member")


def ensure_not_restricted(user: dict) -> None:
    until = user.get("restricted_until")
    if until and until > utcnow():
        raise HTTPException(status_code=403,
                            detail=f"Reservations paused until {until:%d %b %Y} after repeated no-shows")


def account_usable(user: dict | None) -> bool:
    """True for active accounts, and for timed suspensions that have already ended."""
    if not user:
        return False
    if user.get("status", "active") == "active":
        return True
    until = user.get("suspended_until")
    return user.get("status") == "suspended" and until is not None and until <= utcnow()
