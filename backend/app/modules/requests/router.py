import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.catalog import CATEGORY_KEYS
from app.core.deps import get_current_user, get_optional_user, get_verified_user
from app.db.mongo import db
from app.db.utils import new_id, page_response, paginate_params, utcnow
from app.modules.listings.service import present_listings
from app.modules.reservations.service import create_reservation
from app.modules.users.service import user_summaries
from app.services.notifications import notify
from app.services.safety import ensure_not_blocked

router = APIRouter(prefix="/requests", tags=["wanted requests"])
DEFAULT_TTL = timedelta(days=30)


class RequestCreate(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=10, max_length=1000)
    category: str
    locality: str = Field(min_length=2, max_length=60)
    quantity_note: str = Field(default="", max_length=60)
    expires_in_days: int = Field(default=30, ge=1, le=30)


class RequestUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=80)
    description: str | None = Field(default=None, min_length=10, max_length=1000)
    locality: str | None = Field(default=None, min_length=2, max_length=60)
    quantity_note: str | None = Field(default=None, max_length=60)


class OfferCreate(BaseModel):
    listing_id: str
    message: str = Field(default="", max_length=300)


async def _present(docs: list[dict]) -> list[dict]:
    people = await user_summaries({d["owner_id"] for d in docs})
    counts = {}
    for d in docs:
        counts[d["_id"]] = await db.request_offers.count_documents({"request_id": d["_id"], "status": "pending"})
    return [{**{k: v for k, v in d.items() if k != "_id"}, "id": d["_id"], "owner": people.get(d["owner_id"]),
             "pending_offers": counts[d["_id"]]} for d in docs]


async def _owned(req_id: str, user: dict) -> dict:
    doc = await db.wanted_requests.find_one({"_id": req_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Request not found")
    if doc["owner_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Only the requester can do that")
    return doc


@router.get("")
async def browse(q: str | None = None, category: str | None = None, page: int = 1, limit: int = 12):
    skip, limit = paginate_params(page, limit)
    flt: dict = {"status": "open", "expires_at": {"$gt": utcnow()}}
    if category:
        flt["category"] = category
    if q:
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        flt["$or"] = [{"title": rx}, {"description": rx}, {"locality": rx}]
    docs = await db.wanted_requests.find(flt).sort("created_at", -1).skip(skip).limit(limit + 1).to_list(None)
    return page_response(await _present(docs), page, limit)


@router.get("/mine")
async def mine(user: dict = Depends(get_current_user)):
    docs = await db.wanted_requests.find({"owner_id": user["_id"]}).sort("created_at", -1).to_list(100)
    return await _present(docs)


@router.post("", status_code=201)
async def create(body: RequestCreate, user: dict = Depends(get_verified_user)):
    if body.category not in CATEGORY_KEYS:
        raise HTTPException(status_code=422, detail="Unknown category")
    now = utcnow()
    doc = {"_id": new_id(), "owner_id": user["_id"], **body.model_dump(exclude={"expires_in_days"}),
           "status": "open", "expires_at": now + timedelta(days=body.expires_in_days),
           "created_at": now, "updated_at": now}
    await db.wanted_requests.insert_one(doc)
    return (await _present([doc]))[0]


@router.get("/{req_id}")
async def detail(req_id: str, viewer: dict | None = Depends(get_optional_user)):
    doc = await db.wanted_requests.find_one({"_id": req_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Request not found")
    item = (await _present([doc]))[0]
    is_owner = bool(viewer and viewer["_id"] == doc["owner_id"])
    flt = {"request_id": req_id} if is_owner else {"request_id": req_id, "offerer_id": viewer["_id"] if viewer else "-"}
    offers = await db.request_offers.find(flt).sort("created_at", -1).to_list(50)
    listings = {d["_id"]: d for d in await db.listings.find({"_id": {"$in": [o["listing_id"] for o in offers]}}).to_list(None)}
    presented = {p["id"]: p for p in await present_listings(list(listings.values()), viewer)}
    people = await user_summaries({o["offerer_id"] for o in offers})
    item["is_owner"] = is_owner
    item["offers"] = [{**{k: v for k, v in o.items() if k != "_id"}, "id": o["_id"],
                       "listing": presented.get(o["listing_id"]), "offerer": people.get(o["offerer_id"])} for o in offers]
    return item


@router.patch("/{req_id}")
async def update(req_id: str, body: RequestUpdate, user: dict = Depends(get_current_user)):
    doc = await _owned(req_id, user)
    if doc["status"] != "open":
        raise HTTPException(status_code=409, detail="Only open requests can be edited")
    await db.wanted_requests.update_one({"_id": req_id}, {"$set": {**body.model_dump(exclude_unset=True), "updated_at": utcnow()}})
    return (await _present([await db.wanted_requests.find_one({"_id": req_id})]))[0]


@router.post("/{req_id}/close")
async def close(req_id: str, user: dict = Depends(get_current_user)):
    await _owned(req_id, user)
    await db.wanted_requests.update_one({"_id": req_id, "status": "open"}, {"$set": {"status": "closed", "updated_at": utcnow()}})
    await db.request_offers.update_many({"request_id": req_id, "status": "pending"}, {"$set": {"status": "declined"}})
    return {"status": "closed"}


@router.post("/{req_id}/cancel")
async def cancel(req_id: str, user: dict = Depends(get_current_user)):
    await _owned(req_id, user)
    await db.wanted_requests.update_one({"_id": req_id, "status": "open"}, {"$set": {"status": "cancelled", "updated_at": utcnow()}})
    await db.request_offers.update_many({"request_id": req_id, "status": "pending"}, {"$set": {"status": "declined"}})
    return {"status": "cancelled"}


@router.post("/{req_id}/offers", status_code=201)
async def offer(req_id: str, body: OfferCreate, user: dict = Depends(get_verified_user)):
    req = await db.wanted_requests.find_one({"_id": req_id})
    if not req or req["status"] != "open" or req["expires_at"] <= utcnow():
        raise HTTPException(status_code=409, detail="This request is no longer open")
    if req["owner_id"] == user["_id"]:
        raise HTTPException(status_code=400, detail="You can't offer on your own request")
    await ensure_not_blocked(user["_id"], req["owner_id"])
    listing = await db.listings.find_one({"_id": body.listing_id, "owner_id": user["_id"], "status": "active"})
    if not listing or listing["available"] < 1:
        raise HTTPException(status_code=422, detail="Choose one of your active listings with items available")
    if await db.request_offers.find_one({"request_id": req_id, "listing_id": body.listing_id, "status": "pending"}):
        raise HTTPException(status_code=409, detail="You already offered this listing")
    doc = {"_id": new_id(), "request_id": req_id, "listing_id": body.listing_id, "offerer_id": user["_id"],
           "message": body.message, "status": "pending", "reservation_id": None, "created_at": utcnow()}
    await db.request_offers.insert_one(doc)
    await notify(req["owner_id"], "request_offer", "Someone offered an item", req["title"], f"/wanted/{req_id}")
    return {**{k: v for k, v in doc.items() if k != "_id"}, "id": doc["_id"]}


@router.post("/{req_id}/offers/{offer_id}/accept")
async def accept_offer(req_id: str, offer_id: str, user: dict = Depends(get_verified_user)):
    req = await _owned(req_id, user)
    if req["status"] != "open":
        raise HTTPException(status_code=409, detail="This request is no longer open")
    off = await db.request_offers.find_one({"_id": offer_id, "request_id": req_id, "status": "pending"})
    if not off:
        raise HTTPException(status_code=404, detail="Offer not found")
    # The giver offered, so the resulting reservation is accepted immediately and opens a conversation.
    res = await create_reservation(user, off["listing_id"], 1, None, f"Offer on request: {req['title']}",
                                   force_accept=True, source="offer")
    await db.request_offers.update_one({"_id": offer_id}, {"$set": {"status": "accepted", "reservation_id": res["_id"]}})
    await db.request_offers.update_many({"request_id": req_id, "status": "pending"}, {"$set": {"status": "declined"}})
    await db.wanted_requests.update_one({"_id": req_id}, {"$set": {"status": "fulfilled", "updated_at": utcnow()}})
    await notify(off["offerer_id"], "offer_accepted", "Your offer was accepted", req["title"], f"/reservations/{res['_id']}")
    return {"reservation_id": res["_id"]}


@router.post("/{req_id}/offers/{offer_id}/decline")
async def decline_offer(req_id: str, offer_id: str, user: dict = Depends(get_current_user)):
    await _owned(req_id, user)
    r = await db.request_offers.update_one({"_id": offer_id, "request_id": req_id, "status": "pending"},
                                           {"$set": {"status": "declined"}})
    if not r.modified_count:
        raise HTTPException(status_code=404, detail="Offer not found")
    return {"status": "declined"}


async def sweep_requests() -> None:
    await db.wanted_requests.update_many({"status": "open", "expires_at": {"$lte": utcnow()}},
                                         {"$set": {"status": "expired"}})
