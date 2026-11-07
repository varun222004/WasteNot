from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.core.catalog import ORG_CATEGORIES
from app.core.deps import get_current_user, get_verified_user
from app.db.mongo import db
from app.db.utils import new_id, utcnow
from app.modules.listings.service import present_listings
from app.modules.users.service import user_summaries
from app.services.notifications import notify

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrgLocation(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class OrgCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=10, max_length=1000)
    category: str
    contact_email: EmailStr
    contact_phone: str = Field(min_length=6, max_length=20)
    address: str = Field(min_length=5, max_length=200)
    locality: str = Field(min_length=2, max_length=60)
    location: OrgLocation
    logo_file_id: str | None = None
    proof_file_id: str


class OrgUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=10, max_length=1000)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, min_length=6, max_length=20)
    logo_file_id: str | None = None


def public_org(org: dict) -> dict:
    keep = ("name", "description", "category", "address", "locality", "location", "logo_file_id", "status", "created_at")
    return {"id": org["_id"], **{k: org.get(k) for k in keep}}


def private_org(org: dict) -> dict:
    return {**public_org(org), "contact_email": org["contact_email"], "contact_phone": org["contact_phone"],
            "review_note": org.get("review_note"), "has_proof": bool(org.get("proof_file_id"))}


@router.post("", status_code=201)
async def register(body: OrgCreate, user: dict = Depends(get_verified_user)):
    if body.category not in ORG_CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown organization category")
    if await db.organizations.find_one({"owner_id": user["_id"]}):
        raise HTTPException(status_code=409, detail="You already registered an organization")
    proof = await db.files.find_one({"_id": body.proof_file_id, "owner_id": user["_id"], "purpose": "org_proof"})
    if not proof:
        raise HTTPException(status_code=422, detail="Upload a proof document")
    now = utcnow()
    doc = {"_id": new_id(), "owner_id": user["_id"], **body.model_dump(), "status": "pending",
           "review_note": None, "created_at": now, "updated_at": now}
    doc["location"] = body.location.model_dump()
    await db.organizations.insert_one(doc)
    for admin in await db.users.find({"role": "admin"}, {"_id": 1}).to_list(20):
        await notify(admin["_id"], "org_pending", "New organization to review", body.name, "/admin?tab=organizations")
    return private_org(doc)


async def _mine(user: dict) -> dict:
    org = await db.organizations.find_one({"owner_id": user["_id"]})
    if not org:
        raise HTTPException(status_code=404, detail="No organization registered")
    return org


@router.get("/mine")
async def mine(user: dict = Depends(get_current_user)):
    return private_org(await _mine(user))


@router.patch("/mine")
async def update_mine(body: OrgUpdate, user: dict = Depends(get_current_user)):
    org = await _mine(user)
    await db.organizations.update_one({"_id": org["_id"]}, {"$set": {**body.model_dump(exclude_unset=True), "updated_at": utcnow()}})
    return private_org(await db.organizations.find_one({"_id": org["_id"]}))


@router.get("/mine/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    org = await _mine(user)
    listings = await db.listings.find({"org_id": org["_id"], "status": {"$ne": "removed"}}).sort("created_at", -1).to_list(50)
    reservations = await db.reservations.find({"org_id": org["_id"], "status": {"$in": ["accepted", "requested", "disputed"]}}) \
        .sort("created_at", -1).to_list(100)
    people = await user_summaries({r["requester_id"] for r in reservations})
    titles = {l["_id"]: l["title"] for l in listings}
    events = await db.exchange_events.find({"org_id": org["_id"]}).to_list(None)
    return {
        "organization": private_org(org),
        "stats": {"active_listings": sum(1 for l in listings if l["status"] == "active"),
                  "open_reservations": len(reservations), "completed_collections": len(events),
                  "items_distributed": sum(e["quantity"] for e in events),
                  "meals_shared": sum(e["quantity"] for e in events if e["mode"] == "food")},
        "listings": await present_listings(listings, user),
        "reservations": [{"id": r["_id"], "status": r["status"], "quantity": r["quantity"], "pickup_time": r.get("pickup_time"),
                          "listing_title": titles.get(r["listing_id"], ""), "requester": people.get(r["requester_id"]),
                          "created_at": r["created_at"]} for r in reservations],
    }


@router.get("/{org_id}")
async def public(org_id: str):
    org = await db.organizations.find_one({"_id": org_id, "status": "verified"})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    listings = await db.listings.find({"org_id": org_id, "status": "active"}).sort("created_at", -1).to_list(30)
    return {**public_org(org), "listings": await present_listings(listings)}
