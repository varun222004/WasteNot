from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.catalog import CATEGORIES, LOCALITIES
from app.core.config import settings
from app.core.deps import get_current_user, get_optional_user, get_verified_user
from app.db.mongo import db
from app.db.utils import new_id, page_response, paginate_params, utcnow
from app.modules.listings.schemas import ListingCreate, ListingUpdate
from app.modules.listings.service import (approximate, build_listing_doc, present_listings, search_filter,
                                          validate_window)
from app.modules.reservations.service import release_pending_for_listing
from app.services.safety import is_blocked_between

router = APIRouter(prefix="/listings", tags=["listings"])


@router.get("/meta")
async def meta():
    return {"categories": CATEGORIES, "localities": LOCALITIES, "food_sharing_enabled": settings.food_sharing_enabled}


@router.get("")
async def search(q: str | None = None, category: str | None = None, mode: str | None = None,
                 lat: float | None = Query(None, ge=-90, le=90), lng: float | None = Query(None, ge=-180, le=180),
                 radius_km: float = Query(10, gt=0, le=50), sort: str = "nearest",
                 page: int = 1, limit: int = 12, viewer: dict | None = Depends(get_optional_user)):
    skip, limit = paginate_params(page, limit)
    flt = search_filter(q, category, mode)
    if lat is not None and lng is not None:
        # Distance measured from the approximate search point to each listing's approximate point.
        near = {"type": "Point", "coordinates": approximate(lat, lng)}
        pipeline = [{"$geoNear": {"near": near, "distanceField": "distance_m", "spherical": True,
                                  "maxDistance": radius_km * 1000, "query": flt, "key": "public_point"}}]
        if sort == "recent":
            pipeline.append({"$sort": {"created_at": -1}})
        pipeline += [{"$skip": skip}, {"$limit": limit + 1}]
        docs = await (await db.listings.aggregate(pipeline)).to_list(None)
    else:
        docs = await db.listings.find(flt).sort("created_at", -1).skip(skip).limit(limit + 1).to_list(None)
    return page_response(await present_listings(docs, viewer), page, limit)


@router.post("", status_code=201)
async def create(body: ListingCreate, user: dict = Depends(get_verified_user)):
    doc = await build_listing_doc(body, user)
    doc["_id"] = new_id()
    await db.listings.insert_one(doc)
    return (await present_listings([doc], user))[0]


async def _owned(listing_id: str, user: dict) -> dict:
    doc = await db.listings.find_one({"_id": listing_id})
    if not doc or doc["status"] == "removed":
        raise HTTPException(status_code=404, detail="Listing not found")
    if doc["owner_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Only the owner can do that")
    return doc


@router.get("/{listing_id}")
async def detail(listing_id: str, viewer: dict | None = Depends(get_optional_user)):
    doc = await db.listings.find_one({"_id": listing_id})
    if not doc or (doc["status"] == "removed" and not (viewer and viewer.get("role") == "admin")):
        raise HTTPException(status_code=404, detail="Listing not found")
    item = (await present_listings([doc], viewer))[0]
    if viewer:
        mine = await db.reservations.find({"listing_id": listing_id, "requester_id": viewer["_id"],
                                           "status": {"$in": ["requested", "accepted", "disputed"]}}).to_list(10)
        item["my_reservations"] = [{"id": r["_id"], "status": r["status"], "quantity": r["quantity"]} for r in mine]
        item["blocked"] = viewer["_id"] != doc["owner_id"] and await is_blocked_between(viewer["_id"], doc["owner_id"])
    return item


@router.patch("/{listing_id}")
async def update(listing_id: str, body: ListingUpdate, user: dict = Depends(get_current_user)):
    doc = await _owned(listing_id, user)
    if doc["status"] not in ("active", "closed"):
        raise HTTPException(status_code=409, detail="This listing can no longer be edited")
    data = body.model_dump(exclude_unset=True)
    sets: dict = {"updated_at": utcnow()}
    inc: dict = {}
    for key in ("title", "description", "per_person_limit", "condition"):
        if key in data:
            sets[key] = data[key]
    if "photo_ids" in data:
        n = await db.files.count_documents({"_id": {"$in": data["photo_ids"]}, "owner_id": user["_id"]})
        if n != len(set(data["photo_ids"])):
            raise HTTPException(status_code=422, detail="One or more photos are invalid")
        sets["photo_ids"] = data["photo_ids"]
    if body.location and not doc.get("org_id"):
        loc = body.location
        sets.update({"locality": loc.locality, "public_pickup_point": loc.public_pickup_point,
                     "public_point": {"type": "Point", "coordinates": approximate(loc.lat, loc.lng)},
                     "private_location": {"lat": loc.lat, "lng": loc.lng, "address": loc.private_address,
                                          "instructions": loc.pickup_instructions}})
    start = data.get("pickup_window_start", doc.get("pickup_window_start"))
    end = data.get("pickup_window_end", doc.get("pickup_window_end"))
    if "pickup_window_start" in data or "pickup_window_end" in data:
        validate_window(start, end)
        if doc["mode"] == "food" and (not end or end > doc["food"]["safe_until"]):
            raise HTTPException(status_code=422, detail="Collection must end before the safe-until time")
        sets.update({"pickup_window_start": start, "pickup_window_end": end})
    if "expires_at" in data and doc["mode"] != "food":
        sets["expires_at"] = data["expires_at"]
    flt = {"_id": listing_id}
    if "quantity" in data:
        delta = data["quantity"] - doc["quantity_total"]
        flt["available"] = {"$gte": -delta} if delta < 0 else {"$gte": 0}
        inc = {"quantity_total": delta, "available": delta}
    res = await db.listings.update_one(flt, {"$set": sets, **({"$inc": inc} if inc else {})})
    if res.matched_count == 0:
        raise HTTPException(status_code=409, detail="Quantity can't go below what is already reserved or collected")
    return (await present_listings([await db.listings.find_one({"_id": listing_id})], user))[0]


@router.post("/{listing_id}/close")
async def close(listing_id: str, user: dict = Depends(get_current_user)):
    doc = await _owned(listing_id, user)
    if doc["status"] != "active":
        raise HTTPException(status_code=409, detail="Only active listings can be closed")
    # Accepted reservations stay valid; only new reservations are blocked.
    await db.listings.update_one({"_id": listing_id}, {"$set": {"status": "closed", "updated_at": utcnow()}})
    return {"status": "closed"}


@router.post("/{listing_id}/reopen")
async def reopen(listing_id: str, user: dict = Depends(get_current_user)):
    doc = await _owned(listing_id, user)
    if doc["status"] != "closed" or doc["expires_at"] <= utcnow():
        raise HTTPException(status_code=409, detail="This listing can't be reopened")
    await db.listings.update_one({"_id": listing_id}, {"$set": {"status": "active", "updated_at": utcnow()}})
    return {"status": "active"}


@router.post("/{listing_id}/complete")
async def complete(listing_id: str, user: dict = Depends(get_current_user)):
    await _owned(listing_id, user)
    open_res = await db.reservations.count_documents({"listing_id": listing_id,
                                                      "status": {"$in": ["requested", "accepted", "disputed"]}})
    if open_res:
        raise HTTPException(status_code=409, detail="Resolve open reservations before marking this complete")
    await db.listings.update_one({"_id": listing_id}, {"$set": {"status": "completed", "updated_at": utcnow()}})
    return {"status": "completed"}


@router.delete("/{listing_id}")
async def remove(listing_id: str, user: dict = Depends(get_current_user)):
    await _owned(listing_id, user)
    accepted = await db.reservations.count_documents({"listing_id": listing_id, "status": {"$in": ["accepted", "disputed"]}})
    if accepted:
        raise HTTPException(status_code=409, detail="This listing has accepted reservations. Close it instead")
    await release_pending_for_listing(listing_id, "declined", "The listing was removed by the giver")
    await db.listings.update_one({"_id": listing_id}, {"$set": {"status": "removed", "updated_at": utcnow()}})
    return {"status": "removed"}


@router.post("/{listing_id}/save")
async def save(listing_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$addToSet": {"saved_listing_ids": listing_id}})
    return {"saved": True}


@router.delete("/{listing_id}/save")
async def unsave(listing_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$pull": {"saved_listing_ids": listing_id}})
    return {"saved": False}
