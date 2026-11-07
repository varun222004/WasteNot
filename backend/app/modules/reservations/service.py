"""Reservation lifecycle and inventory accounting.

Invariant per listing: available + reserved + collected == quantity_total.
Every quantity movement is a single atomic $inc guarded by a filter, so concurrent
requests can never oversell.
"""
from datetime import datetime, timedelta

from fastapi import HTTPException

from app.db.mongo import db
from app.db.utils import new_id, utcnow
from app.services.notifications import notify
from app.services.safety import ensure_not_blocked, ensure_not_restricted

ACTIVE = ["requested", "accepted", "disputed"]
MAX_ACTIVE_PER_USER = 3
FOOD_RESPONSE = timedelta(hours=2)
ITEM_RESPONSE = timedelta(hours=24)
FREE_CANCEL_BEFORE = timedelta(hours=1)
UNCONFIRMED_AFTER = timedelta(hours=48)
NO_SHOW_LIMIT, NO_SHOW_WINDOW, RESTRICTION = 3, timedelta(days=30), timedelta(days=7)


def _event(res: dict, kind: str, by: str | None, note: str = "") -> dict:
    return {"kind": kind, "by": by, "note": note, "at": utcnow()}


async def _release(res: dict) -> None:
    await db.listings.update_one({"_id": res["listing_id"], "reserved": {"$gte": res["quantity"]}},
                                 {"$inc": {"available": res["quantity"], "reserved": -res["quantity"]}})


async def _transition(res: dict, frm: list[str], to: str, by: str | None, note: str = "", extra: dict | None = None) -> dict:
    """Move a reservation between states only if it is still in an expected state (race-safe)."""
    sets = {"status": to, "updated_at": utcnow(), **(extra or {})}
    updated = await db.reservations.find_one_and_update(
        {"_id": res["_id"], "status": {"$in": frm}},
        {"$set": sets, "$push": {"history": _event(res, to, by, note)}}, return_document=True)
    if not updated:
        raise HTTPException(status_code=409, detail="This reservation was already updated")
    return updated


async def _set_conversation_read_only(res_id: str) -> None:
    await db.conversations.update_one({"context_id": res_id}, {"$set": {"read_only": True}})


async def open_conversation(res: dict) -> None:
    await db.conversations.update_one({"context_id": res["_id"]}, {"$setOnInsert": {
        "_id": new_id(), "context_type": "reservation", "context_id": res["_id"],
        "listing_id": res["listing_id"], "participants": [res["owner_id"], res["requester_id"]],
        "read_only": False, "last_message": None, "last_message_at": utcnow(),
        "unread": {res["owner_id"]: 0, res["requester_id"]: 0}, "created_at": utcnow()}}, upsert=True)


async def create_reservation(user: dict, listing_id: str, quantity: int, pickup_time: datetime | None,
                             note: str = "", force_accept: bool = False, source: str = "direct") -> dict:
    ensure_not_restricted(user)
    listing = await db.listings.find_one({"_id": listing_id})
    now = utcnow()
    if not listing or listing["status"] != "active" or listing["expires_at"] <= now:
        raise HTTPException(status_code=409, detail="This listing is no longer available")
    if listing["owner_id"] == user["_id"]:
        raise HTTPException(status_code=400, detail="You can't reserve your own listing")
    await ensure_not_blocked(user["_id"], listing["owner_id"])
    start, end = listing.get("pickup_window_start"), listing.get("pickup_window_end")
    if listing["mode"] == "food":
        if listing["food"]["safe_until"] <= now or (end and end <= now):
            raise HTTPException(status_code=409, detail="The collection window for this food has passed")
    if pickup_time:
        if pickup_time <= now:
            raise HTTPException(status_code=422, detail="Pickup time must be in the future")
        if (start and pickup_time < start) or (end and pickup_time > end):
            raise HTTPException(status_code=422, detail="Pick a time inside the collection window")
    elif listing["mode"] == "food":
        pickup_time = max(start, now) if start else None
    active = await db.reservations.count_documents({"requester_id": user["_id"], "status": {"$in": ACTIVE}})
    if active >= MAX_ACTIVE_PER_USER and user.get("role") != "org":
        raise HTTPException(status_code=409, detail="You can hold up to 3 active reservations at a time")
    limit = listing.get("per_person_limit") or listing["quantity_total"]
    held = sum(r["quantity"] for r in await db.reservations.find(
        {"listing_id": listing_id, "requester_id": user["_id"], "status": {"$in": ACTIVE}}).to_list(None))
    if held + quantity > limit:
        raise HTTPException(status_code=409, detail=f"You can reserve up to {limit} of this item")

    claimed = await db.listings.find_one_and_update(
        {"_id": listing_id, "status": "active", "available": {"$gte": quantity}},
        {"$inc": {"available": -quantity, "reserved": quantity}})
    if not claimed:
        raise HTTPException(status_code=409, detail="Not enough left to reserve that quantity")

    accept = force_accept or listing.get("auto_accept", False)
    respond_by = now + (FOOD_RESPONSE if listing["mode"] == "food" else ITEM_RESPONSE)
    if listing["mode"] == "food":
        respond_by = min(respond_by, listing["food"]["safe_until"], end or respond_by)
    res = {
        "_id": new_id(), "listing_id": listing_id, "owner_id": listing["owner_id"], "org_id": listing.get("org_id"),
        "requester_id": user["_id"], "quantity": quantity, "pickup_time": pickup_time, "note": note[:300],
        "status": "accepted" if accept else "requested", "respond_by": respond_by, "source": source,
        "is_food": listing["mode"] == "food", "owner_confirmed_at": None, "requester_confirmed_at": None,
        "late_cancellation": False, "dispute": None, "created_at": now, "updated_at": now,
        "accepted_at": now if accept else None,
        "history": [{"kind": "requested", "by": user["_id"], "note": "", "at": now}] +
                   ([{"kind": "accepted", "by": None, "note": "automatic", "at": now}] if accept else []),
    }
    await db.reservations.insert_one(res)
    title = listing["title"]
    if accept:
        await open_conversation(res)
        await notify(user["_id"], "reservation_accepted", "Reservation confirmed", title, f"/reservations/{res['_id']}")
        await notify(listing["owner_id"], "reservation_requested", "New reservation (auto-accepted)", title,
                     f"/reservations/{res['_id']}")
    else:
        await notify(listing["owner_id"], "reservation_requested", "New reservation request", title,
                     f"/reservations/{res['_id']}")
    return res


async def accept(res: dict, user: dict) -> dict:
    _owner_only(res, user)
    if res["respond_by"] <= utcnow():
        raise HTTPException(status_code=409, detail="This request has expired")
    res = await _transition(res, ["requested"], "accepted", user["_id"], extra={"accepted_at": utcnow()})
    await open_conversation(res)
    await notify(res["requester_id"], "reservation_accepted", "Your reservation was accepted",
                 "Pickup details are now visible.", f"/reservations/{res['_id']}")
    return res


async def decline(res: dict, user: dict, note: str = "") -> dict:
    _owner_only(res, user)
    res = await _transition(res, ["requested"], "declined", user["_id"], note)
    await _release(res)
    await notify(res["requester_id"], "reservation_declined", "Reservation declined", note, f"/reservations/{res['_id']}")
    return res


async def cancel(res: dict, user: dict, note: str = "") -> dict:
    if user["_id"] not in (res["owner_id"], res["requester_id"]):
        raise HTTPException(status_code=403, detail="Not your reservation")
    late = bool(res["status"] == "accepted" and res.get("pickup_time")
                and res["pickup_time"] - utcnow() < FREE_CANCEL_BEFORE)
    res = await _transition(res, ["requested", "accepted"], "cancelled", user["_id"], note,
                            {"late_cancellation": late, "cancelled_by": user["_id"]})
    await _release(res)
    await _set_conversation_read_only(res["_id"])
    other = res["owner_id"] if user["_id"] == res["requester_id"] else res["requester_id"]
    await notify(other, "reservation_cancelled", "Reservation cancelled", note, f"/reservations/{res['_id']}")
    return res


async def _complete(res: dict, by: str | None, note: str = "") -> dict:
    res = await _transition(res, ["accepted", "disputed"], "completed", by, note, {"completed_at": utcnow()})
    q = res["quantity"]
    await db.listings.update_one({"_id": res["listing_id"]}, {"$inc": {"reserved": -q, "collected": q}})
    await db.users.update_one({"_id": res["owner_id"]}, {"$inc": {"stats.given": q, "stats.completed": 1}})
    await db.users.update_one({"_id": res["requester_id"]}, {"$inc": {"stats.received": q, "stats.completed": 1}})
    listing = await db.listings.find_one({"_id": res["listing_id"]}, {"category": 1, "mode": 1, "title": 1})
    await db.exchange_events.insert_one({
        "_id": new_id(), "kind": "completed", "reservation_id": res["_id"], "listing_id": res["listing_id"],
        "category": listing["category"], "mode": listing["mode"], "org_id": res.get("org_id"), "quantity": q,
        "giver_id": res["owner_id"], "receiver_id": res["requester_id"], "created_at": utcnow()})
    await _set_conversation_read_only(res["_id"])
    for uid in (res["owner_id"], res["requester_id"]):
        await notify(uid, "exchange_completed", "Exchange completed", listing["title"], f"/reservations/{res['_id']}")
    return res


async def confirm_collection(res: dict, user: dict) -> dict:
    if res["status"] != "accepted":
        raise HTTPException(status_code=409, detail="Only accepted reservations can be confirmed")
    now = utcnow()
    if user["_id"] == res["owner_id"]:
        field = "owner_confirmed_at"
    elif user["_id"] == res["requester_id"]:
        field = "requester_confirmed_at"
    else:
        raise HTTPException(status_code=403, detail="Not your reservation")
    if res.get(field):
        raise HTTPException(status_code=409, detail="You already confirmed this collection")
    # Organization exchanges complete on the organization's confirmation alone.
    if res.get("org_id") and field == "owner_confirmed_at":
        await db.reservations.update_one({"_id": res["_id"]}, {"$set": {field: now}})
        return await _complete(await db.reservations.find_one({"_id": res["_id"]}), user["_id"], "organization confirmed")
    updated = await db.reservations.find_one_and_update(
        {"_id": res["_id"], "status": "accepted", field: None},
        {"$set": {field: now, "first_confirmed_at": res.get("first_confirmed_at") or now},
         "$push": {"history": {"kind": "confirmed", "by": user["_id"], "note": field, "at": now}}},
        return_document=True)
    if not updated:
        raise HTTPException(status_code=409, detail="This reservation was already updated")
    if updated["owner_confirmed_at"] and updated["requester_confirmed_at"]:
        return await _complete(updated, None, "both parties confirmed")
    other = res["requester_id"] if field == "owner_confirmed_at" else res["owner_id"]
    await notify(other, "collection_reminder", "Please confirm the collection",
                 "The other person marked this exchange as collected.", f"/reservations/{res['_id']}")
    return updated


async def report_no_show(res: dict, user: dict) -> dict:
    _owner_only(res, user)
    if res.get("pickup_time") and res["pickup_time"] > utcnow():
        raise HTTPException(status_code=409, detail="You can report a no-show after the pickup time")
    res = await _transition(res, ["accepted"], "no_show", user["_id"])
    await _release(res)
    await _set_conversation_read_only(res["_id"])
    since = utcnow() - NO_SHOW_WINDOW
    count = await db.reservations.count_documents({"requester_id": res["requester_id"], "status": "no_show",
                                                   "updated_at": {"$gte": since}})
    if count >= NO_SHOW_LIMIT:
        await db.users.update_one({"_id": res["requester_id"]}, {"$set": {"restricted_until": utcnow() + RESTRICTION}})
        await notify(res["requester_id"], "restriction", "Reservations paused for 7 days",
                     "Three confirmed no-shows were recorded in the last 30 days.")
    await notify(res["requester_id"], "no_show", "A no-show was recorded", "", f"/reservations/{res['_id']}")
    return res


async def open_dispute(res: dict, user: dict, reason: str) -> dict:
    if user["_id"] not in (res["owner_id"], res["requester_id"]):
        raise HTTPException(status_code=403, detail="Not your reservation")
    # Inventory stays in `reserved` (frozen) until an admin resolves the dispute.
    return await _transition(res, ["accepted"], "disputed", user["_id"], reason,
                             {"dispute": {"opened_by": user["_id"], "reason": reason[:500], "opened_at": utcnow()}})


async def resolve_dispute(res: dict, admin: dict, outcome: str, note: str) -> dict:
    if res["status"] != "disputed":
        raise HTTPException(status_code=409, detail="No open dispute")
    if outcome == "completed":
        return await _complete(res, admin["_id"], f"dispute resolved: {note}")
    res = await _transition(res, ["disputed"], "cancelled", admin["_id"], f"dispute resolved: {note}")
    await _release(res)
    await _set_conversation_read_only(res["_id"])
    return res


async def release_pending_for_listing(listing_id: str, to: str, note: str) -> None:
    for res in await db.reservations.find({"listing_id": listing_id, "status": "requested"}).to_list(None):
        try:
            res = await _transition(res, ["requested"], to, None, note)
        except HTTPException:
            continue
        await _release(res)
        await notify(res["requester_id"], f"reservation_{to}", f"Reservation {to}", note, f"/reservations/{res['_id']}")


async def sweep_reservations() -> None:
    now = utcnow()
    for res in await db.reservations.find({"status": "requested", "respond_by": {"$lte": now}}).to_list(500):
        try:
            res = await _transition(res, ["requested"], "expired", None, "no response in time")
        except HTTPException:
            continue
        await _release(res)
        await notify(res["requester_id"], "reservation_expired", "Reservation request expired",
                     "The giver didn't respond in time.", f"/reservations/{res['_id']}")
    # One-sided confirmation older than 48h becomes "unconfirmed": item left, impact not counted.
    for res in await db.reservations.find({"status": "accepted", "first_confirmed_at": {"$lte": now - UNCONFIRMED_AFTER}}).to_list(500):
        try:
            res = await _transition(res, ["accepted"], "unconfirmed", None, "only one party confirmed")
        except HTTPException:
            continue
        await db.listings.update_one({"_id": res["listing_id"]}, {"$inc": {"reserved": -res["quantity"], "collected": res["quantity"]}})
        await _set_conversation_read_only(res["_id"])
    # Food that was never collected within its window is released (listing itself is already expired).
    expired_food = await db.listings.find({"mode": "food", "food.safe_until": {"$lte": now}}, {"_id": 1}).to_list(1000)
    ids = [d["_id"] for d in expired_food]
    for res in await db.reservations.find({"status": "accepted", "listing_id": {"$in": ids},
                                           "first_confirmed_at": None}).to_list(500):
        try:
            res = await _transition(res, ["accepted"], "expired", None, "food collection window passed")
        except HTTPException:
            continue
        await _release(res)
        await _set_conversation_read_only(res["_id"])


def _owner_only(res: dict, user: dict) -> None:
    if res["owner_id"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Only the giver can do that")
