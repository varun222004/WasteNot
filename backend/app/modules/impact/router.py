from fastapi import APIRouter

from app.db.mongo import db
from app.db.utils import utcnow

router = APIRouter(prefix="/impact", tags=["impact"])


@router.get("")
async def community_impact():
    """Factual counts only: every figure is derived from completed exchanges or live records."""
    pipeline = [{"$group": {"_id": None, "exchanges": {"$sum": 1}, "items": {"$sum": "$quantity"},
                            "org_meals": {"$sum": {"$cond": [{"$and": [{"$ne": ["$org_id", None]},
                                                                        {"$eq": ["$mode", "food"]}]}, "$quantity", 0]}}}}]
    agg = await (await db.exchange_events.aggregate(pipeline)).to_list(1)
    totals = agg[0] if agg else {"exchanges": 0, "items": 0, "org_meals": 0}
    by_cat = await (await db.exchange_events.aggregate(
        [{"$group": {"_id": "$category", "items": {"$sum": "$quantity"}}}])).to_list(None)
    return {
        "completed_exchanges": totals["exchanges"], "items_shared": totals["items"],
        "organization_meals_shared": totals["org_meals"],
        "items_by_category": {r["_id"]: r["items"] for r in by_cat},
        "active_listings": await db.listings.count_documents({"status": "active", "expires_at": {"$gt": utcnow()}}),
        "open_requests": await db.wanted_requests.count_documents({"status": "open"}),
        "members": await db.users.count_documents({"status": "active"}),
        "verified_organizations": await db.organizations.count_documents({"status": "verified"}),
    }
