"""Moderation takedowns: what must stop when a member or organization is suspended."""
from app.db.mongo import db
from app.db.utils import utcnow
from app.modules.reservations.service import cancel_open_reservations


async def _close_listings(flt: dict, reason: str) -> int:
    ids = [d["_id"] for d in await db.listings.find({**flt, "status": "active"}, {"_id": 1}).to_list(None)]
    if ids:
        await db.listings.update_many({"_id": {"$in": ids}},
                                      {"$set": {"status": "closed", "closed_reason": reason, "updated_at": utcnow()}})
    return len(ids)


async def takedown_user(user_id: str, note: str = "This member was suspended by moderators") -> None:
    """Close their listings, cancel reservations on them, and cancel reservations they were holding."""
    await _close_listings({"owner_id": user_id}, "owner_suspended")
    await cancel_open_reservations({"owner_id": user_id}, note)
    await cancel_open_reservations({"requester_id": user_id}, note, notify_giver=True)


async def takedown_org(org_id: str, note: str = "This organization is no longer verified") -> None:
    await _close_listings({"org_id": org_id}, "org_not_verified")
    await cancel_open_reservations({"org_id": org_id}, note)
