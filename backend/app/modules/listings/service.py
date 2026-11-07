import re
from datetime import timedelta

from fastapi import HTTPException

from app.core.catalog import CATEGORY_KEYS
from app.core.config import settings
from app.db.mongo import db
from app.db.utils import utcnow
from app.modules.listings.schemas import FoodInfo, ListingCreate
from app.modules.users.service import user_summaries

MAX_COOKED_SHELF = timedelta(hours=12)
PUBLIC_FIELDS_EXCLUDED = ("private_location",)


def approximate(lat: float, lng: float) -> list[float]:
    """Round to ~1 km grid so public data never reveals an exact address."""
    return [round(lng, 2), round(lat, 2)]


def validate_food(food: FoodInfo | None, start, end) -> None:
    if not settings.food_sharing_enabled:
        raise HTTPException(status_code=403, detail="Food sharing is not available right now")
    if food is None:
        raise HTTPException(status_code=422, detail="Food listings need full food-safety details")
    now = utcnow()
    if not all(food.declaration.model_dump().values()):
        raise HTTPException(status_code=422, detail="All donor declarations must be confirmed")
    if food.safe_until <= now:
        raise HTTPException(status_code=422, detail="Safe-until time must be in the future")
    if food.food_type == "cooked":
        if not food.prepared_at or food.prepared_at > now:
            raise HTTPException(status_code=422, detail="Preparation time is required and cannot be in the future")
        if food.safe_until - food.prepared_at > MAX_COOKED_SHELF:
            raise HTTPException(status_code=422, detail="Cooked food can be shared for at most 12 hours after preparation")
    else:
        if not food.sealed:
            raise HTTPException(status_code=422, detail="Only sealed, unopened packaged food can be shared")
        if not food.best_before or food.best_before < now.date():
            raise HTTPException(status_code=422, detail="Packaged food must be within its expiry date")
    if food.allergen_status == "known" and not food.allergens:
        raise HTTPException(status_code=422, detail="List the known allergens")
    if not start or not end:
        raise HTTPException(status_code=422, detail="A collection window is required for food")
    if end > food.safe_until:
        raise HTTPException(status_code=422, detail="Collection must end before the safe-until time")


def validate_window(start, end) -> None:
    if start and end and start >= end:
        raise HTTPException(status_code=422, detail="Pickup window must end after it starts")
    if end and end <= utcnow():
        raise HTTPException(status_code=422, detail="Pickup window must end in the future")


async def build_listing_doc(body: ListingCreate, user: dict) -> dict:
    if body.category not in CATEGORY_KEYS:
        raise HTTPException(status_code=422, detail="Unknown category")
    if (body.category == "food") != (body.mode == "food"):
        raise HTTPException(status_code=422, detail="Food items must use the food-sharing mode")
    validate_window(body.pickup_window_start, body.pickup_window_end)
    photos = await db.files.count_documents({"_id": {"$in": body.photo_ids}, "owner_id": user["_id"],
                                             "purpose": "listing_photo"})
    if photos != len(set(body.photo_ids)):
        raise HTTPException(status_code=422, detail="One or more photos are invalid")
    org = None
    if body.as_organization:
        org = await db.organizations.find_one({"owner_id": user["_id"]})
        if not org or org["status"] != "verified":
            raise HTTPException(status_code=403, detail="Only verified organizations can publish as an organization")
    now = utcnow()
    if body.mode == "food":
        validate_food(body.food, body.pickup_window_start, body.pickup_window_end)
        expires_at = body.food.safe_until
    else:
        if not body.condition:
            raise HTTPException(status_code=422, detail="Condition is required")
        expires_at = body.expires_at or now + timedelta(days=14)
        if expires_at <= now or expires_at > now + timedelta(days=60):
            raise HTTPException(status_code=422, detail="Expiry must be within the next 60 days")
    loc = body.location
    if org:
        public_point = {"type": "Point", "coordinates": [org["location"]["lng"], org["location"]["lat"]]}
    else:
        public_point = {"type": "Point", "coordinates": approximate(loc.lat, loc.lng)}
    return {
        "owner_id": user["_id"], "org_id": org["_id"] if org else None,
        "title": body.title, "description": body.description, "category": body.category, "mode": body.mode,
        "quantity_total": body.quantity, "available": body.quantity, "reserved": 0, "collected": 0,
        "per_person_limit": body.per_person_limit, "condition": body.condition, "photo_ids": body.photo_ids,
        "locality": org["locality"] if org else loc.locality, "public_point": public_point,
        "public_pickup_point": loc.public_pickup_point,
        "private_location": {"lat": loc.lat, "lng": loc.lng, "address": loc.private_address,
                             "instructions": loc.pickup_instructions},
        "pickup_window_start": body.pickup_window_start, "pickup_window_end": body.pickup_window_end,
        "expires_at": expires_at, "food": body.food.model_dump() if body.food else None,
        "auto_accept": bool(org), "status": "active", "created_at": now, "updated_at": now,
    }


def search_filter(q: str | None, category: str | None, mode: str | None) -> dict:
    f: dict = {"status": "active", "available": {"$gt": 0}, "expires_at": {"$gt": utcnow()}}
    if category:
        f["category"] = category
    if mode:
        f["mode"] = mode
    if not settings.food_sharing_enabled:
        f["mode"] = "giveaway"
    if q:
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        f["$or"] = [{"title": rx}, {"description": rx}, {"locality": rx}]
    return f


async def present_listings(docs: list[dict], viewer: dict | None = None) -> list[dict]:
    owners = await user_summaries({d["owner_id"] for d in docs})
    org_ids = {d["org_id"] for d in docs if d.get("org_id")}
    orgs = {o["_id"]: o for o in await db.organizations.find({"_id": {"$in": list(org_ids)}}).to_list(None)}
    saved = set(viewer.get("saved_listing_ids", [])) if viewer else set()
    result = []
    for d in docs:
        item = {k: v for k, v in d.items() if k not in ("_id", *PUBLIC_FIELDS_EXCLUDED, "distance_m")}
        item["id"] = d["_id"]
        item["owner"] = owners.get(d["owner_id"])
        item["is_saved"] = d["_id"] in saved
        item["is_owner"] = bool(viewer and viewer["_id"] == d["owner_id"])
        if "distance_m" in d:
            item["distance_km"] = round(d["distance_m"] / 1000, 1)
        org = orgs.get(d.get("org_id"))
        if org:
            item["organization"] = {"id": org["_id"], "name": org["name"], "verified": org["status"] == "verified",
                                    "address": org["address"] if org["status"] == "verified" else None,
                                    "logo_file_id": org.get("logo_file_id")}
            if org["status"] != "verified":
                item["public_point"] = None
        if item["is_owner"]:
            item["private_location"] = d.get("private_location")
        result.append(item)
    return result
