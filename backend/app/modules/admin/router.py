import re
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import require_admin
from app.db.mongo import db
from app.db.utils import out, utcnow
from app.modules.listings.service import present_listings
from app.modules.organizations.router import private_org
from app.modules.reservations.service import release_pending_for_listing, resolve_dispute
from app.modules.users.service import user_summaries
from app.services.notifications import log_moderation, notify

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class Note(BaseModel):
    note: str = Field(default="", max_length=500)


class ReportResolve(Note):
    action: Literal["dismiss", "remove_listing", "suspend_user", "warn"]


class OrgReview(Note):
    status: Literal["verified", "rejected", "suspended", "pending"]


class Suspend(Note):
    days: int | None = Field(default=None, ge=1, le=365)


class DisputeResolve(Note):
    outcome: Literal["completed", "cancelled"]


@router.get("/overview")
async def overview():
    return {
        "open_reports": await db.reports.count_documents({"status": "open"}),
        "pending_organizations": await db.organizations.count_documents({"status": "pending"}),
        "open_disputes": await db.reservations.count_documents({"status": "disputed"}),
        "active_listings": await db.listings.count_documents({"status": "active"}),
        "members": await db.users.count_documents({}),
        "suspended_members": await db.users.count_documents({"status": "suspended"}),
    }


@router.get("/reports")
async def reports(status: str = "open"):
    rows = await db.reports.find({"status": status}).sort([("priority", 1), ("created_at", -1)]).to_list(200)
    people = await user_summaries({r["reporter_id"] for r in rows})
    return [{**out(r), "reporter": people.get(r["reporter_id"])} for r in rows]


async def _suspend(user_id: str, admin: dict, days: int | None, note: str) -> None:
    until = utcnow() + timedelta(days=days) if days else None
    await db.users.update_one({"_id": user_id}, {"$set": {"status": "suspended", "suspended_until": until}})
    await db.sessions.update_many({"user_id": user_id}, {"$set": {"revoked": True}})
    await log_moderation(admin["_id"], "suspend_user", "user", user_id, note)


async def _remove_listing(listing_id: str, admin: dict, note: str) -> None:
    listing = await db.listings.find_one({"_id": listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    await release_pending_for_listing(listing_id, "declined", "The listing was removed by moderators")
    await db.listings.update_one({"_id": listing_id}, {"$set": {"status": "removed", "removed_reason": note}})
    await log_moderation(admin["_id"], "remove_listing", "listing", listing_id, note)
    await notify(listing["owner_id"], "moderation", "A listing was removed", note or listing["title"])


@router.post("/reports/{report_id}/resolve")
async def resolve_report(report_id: str, body: ReportResolve, admin: dict = Depends(require_admin)):
    rep = await db.reports.find_one({"_id": report_id})
    if not rep:
        raise HTTPException(status_code=404, detail="Report not found")
    if body.action == "remove_listing":
        if rep["target_type"] != "listing":
            raise HTTPException(status_code=422, detail="This report is not about a listing")
        await _remove_listing(rep["target_id"], admin, body.note)
    elif body.action == "suspend_user":
        target = rep["target_id"]
        if rep["target_type"] == "listing":
            target = (await db.listings.find_one({"_id": target}))["owner_id"]
        elif rep["target_type"] != "user":
            raise HTTPException(status_code=422, detail="Suspend from the member or listing report")
        await _suspend(target, admin, None, body.note)
    await db.reports.update_one({"_id": report_id}, {"$set": {"status": "resolved", "resolution": {
        "action": body.action, "note": body.note, "by": admin["_id"], "at": utcnow()}}})
    await log_moderation(admin["_id"], f"report_{body.action}", "report", report_id, body.note)
    return {"status": "resolved"}


@router.get("/organizations")
async def organizations(status: str = "pending"):
    rows = await db.organizations.find({} if status == "all" else {"status": status}).sort("created_at", -1).to_list(200)
    people = await user_summaries({r["owner_id"] for r in rows})
    return [{**private_org(r), "proof_file_id": r.get("proof_file_id"), "owner": people.get(r["owner_id"])} for r in rows]


@router.post("/organizations/{org_id}/review")
async def review_org(org_id: str, body: OrgReview, admin: dict = Depends(require_admin)):
    org = await db.organizations.find_one({"_id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    await db.organizations.update_one({"_id": org_id}, {"$set": {"status": body.status, "review_note": body.note,
                                                                  "reviewed_by": admin["_id"], "reviewed_at": utcnow()}})
    if body.status in ("suspended", "rejected"):
        for l in await db.listings.find({"org_id": org_id, "status": "active"}, {"_id": 1}).to_list(None):
            await db.listings.update_one({"_id": l["_id"]}, {"$set": {"status": "closed"}})
    await log_moderation(admin["_id"], f"org_{body.status}", "organization", org_id, body.note)
    await notify(org["owner_id"], "org_verification", f"Organization {body.status}", body.note or org["name"], "/org")
    return {"status": body.status}


@router.get("/listings")
async def listings(q: str | None = None, status: str | None = None):
    flt: dict = {}
    if status:
        flt["status"] = status
    if q:
        flt["title"] = {"$regex": re.escape(q[:60]), "$options": "i"}
    docs = await db.listings.find(flt).sort("created_at", -1).to_list(100)
    return await present_listings(docs)


@router.post("/listings/{listing_id}/remove")
async def remove_listing(listing_id: str, body: Note, admin: dict = Depends(require_admin)):
    await _remove_listing(listing_id, admin, body.note)
    return {"status": "removed"}


@router.get("/users")
async def users(q: str | None = None):
    flt = {}
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        flt = {"$or": [{"email": rx}, {"display_name": rx}]}
    rows = await db.users.find(flt).sort("created_at", -1).to_list(100)
    return [{"id": u["_id"], "email": u["email"], "display_name": u.get("display_name"), "role": u.get("role"),
             "status": u.get("status"), "suspended_until": u.get("suspended_until"), "stats": u.get("stats"),
             "restricted_until": u.get("restricted_until"), "created_at": u["created_at"]} for u in rows]


@router.post("/users/{user_id}/suspend")
async def suspend(user_id: str, body: Suspend, admin: dict = Depends(require_admin)):
    if user_id == admin["_id"]:
        raise HTTPException(status_code=400, detail="You can't suspend yourself")
    await _suspend(user_id, admin, body.days, body.note)
    return {"status": "suspended"}


@router.post("/users/{user_id}/unsuspend")
async def unsuspend(user_id: str, body: Note, admin: dict = Depends(require_admin)):
    await db.users.update_one({"_id": user_id}, {"$set": {"status": "active", "suspended_until": None}})
    await log_moderation(admin["_id"], "unsuspend_user", "user", user_id, body.note)
    return {"status": "active"}


@router.get("/disputes")
async def disputes():
    rows = await db.reservations.find({"status": "disputed"}).sort("updated_at", -1).to_list(100)
    people = await user_summaries({p for r in rows for p in (r["owner_id"], r["requester_id"])})
    titles = {l["_id"]: l["title"] for l in await db.listings.find({"_id": {"$in": [r["listing_id"] for r in rows]}}).to_list(None)}
    return [{"id": r["_id"], "listing_title": titles.get(r["listing_id"]), "quantity": r["quantity"], "dispute": r["dispute"],
             "owner": people.get(r["owner_id"]), "requester": people.get(r["requester_id"])} for r in rows]


@router.post("/reservations/{res_id}/resolve")
async def resolve(res_id: str, body: DisputeResolve, admin: dict = Depends(require_admin)):
    res = await db.reservations.find_one({"_id": res_id})
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found")
    await resolve_dispute(res, admin, body.outcome, body.note)
    await log_moderation(admin["_id"], f"dispute_{body.outcome}", "reservation", res_id, body.note)
    return {"status": body.outcome}


@router.get("/moderation-actions")
async def moderation_actions():
    return [out(r) for r in await db.moderation_actions.find().sort("created_at", -1).to_list(100)]
