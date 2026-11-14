from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.types import AwareDatetime
from app.core.deps import get_current_user, get_verified_user
from app.db.mongo import db
from app.db.utils import page_response, paginate_params
from app.modules.listings.service import present_listings
from app.modules.reservations import service
from app.modules.users.service import user_summaries

router = APIRouter(prefix="/reservations", tags=["reservations"])


class ReservationCreate(BaseModel):
    listing_id: str
    quantity: int = Field(default=1, ge=1, le=50)
    pickup_time: AwareDatetime | None = None
    note: str = Field(default="", max_length=300)


class ActionBody(BaseModel):
    action: Literal["accept", "decline", "cancel", "confirm", "no_show", "dispute", "contest_no_show"]
    note: str = Field(default="", max_length=500)


async def _present(res: dict, viewer: dict) -> dict:
    listing = await db.listings.find_one({"_id": res["listing_id"]})
    people = await user_summaries({res["owner_id"], res["requester_id"]})
    item = {k: v for k, v in res.items() if k != "_id"}
    item["id"] = res["_id"]
    item["listing"] = (await present_listings([listing], viewer))[0] if listing else None
    item["owner"], item["requester"] = people.get(res["owner_id"]), people.get(res["requester_id"])
    item["role"] = "owner" if viewer["_id"] == res["owner_id"] else "requester"
    # Exact pickup location is only revealed to participants after acceptance.
    if listing and res["status"] in ("accepted", "disputed") and item["role"] == "requester":
        item["pickup_location"] = listing.get("private_location")
    conv = await db.conversations.find_one({"context_id": res["_id"]}, {"_id": 1})
    item["conversation_id"] = conv["_id"] if conv else None
    return item


async def _load(res_id: str, user: dict) -> dict:
    res = await db.reservations.find_one({"_id": res_id})
    if not res or (user["_id"] not in (res["owner_id"], res["requester_id"]) and user.get("role") != "admin"):
        raise HTTPException(status_code=404, detail="Reservation not found")
    return res


@router.post("", status_code=201)
async def create(body: ReservationCreate, user: dict = Depends(get_verified_user)):
    res = await service.create_reservation(user, body.listing_id, body.quantity, body.pickup_time, body.note)
    return await _present(res, user)


@router.get("")
async def mine(role: Literal["requester", "owner"] = "requester", status: str | None = None,
               page: int = 1, limit: int = 20, user: dict = Depends(get_current_user)):
    skip, limit = paginate_params(page, limit)
    flt: dict = {f"{role}_id": user["_id"]}
    if status == "active":
        flt["status"] = {"$in": service.ACTIVE}
    elif status:
        flt["status"] = status
    rows = await db.reservations.find(flt).sort("created_at", -1).skip(skip).limit(limit + 1).to_list(None)
    return page_response([await _present(r, user) for r in rows], page, limit)


@router.get("/{res_id}")
async def detail(res_id: str, user: dict = Depends(get_current_user)):
    return await _present(await _load(res_id, user), user)


@router.post("/{res_id}/actions")
async def act(res_id: str, body: ActionBody, user: dict = Depends(get_current_user)):
    res = await _load(res_id, user)
    handlers = {
        "accept": lambda: service.accept(res, user),
        "decline": lambda: service.decline(res, user, body.note),
        "cancel": lambda: service.cancel(res, user, body.note),
        "confirm": lambda: service.confirm_collection(res, user),
        "no_show": lambda: service.report_no_show(res, user),
        "dispute": lambda: service.open_dispute(res, user, body.note or "No reason given"),
        "contest_no_show": lambda: service.contest_no_show(res, user, body.note or "No reason given"),
    }
    updated = await handlers[body.action]()
    return await _present(updated, user)
