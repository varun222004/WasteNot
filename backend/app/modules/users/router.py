from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.db.mongo import db
from app.db.utils import new_id, out, utcnow
from app.modules.users.service import org_for, public_user, serialize_me, user_summaries

router = APIRouter(prefix="/users", tags=["users"])


class SavedLocation(BaseModel):
    label: str = Field(max_length=80)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=40)
    bio: str | None = Field(default=None, max_length=300)
    locality: str | None = Field(default=None, max_length=60)
    avatar_file_id: str | None = None
    saved_location: SavedLocation | None = None


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return await serialize_me(user)


@router.patch("/me")
async def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    if "saved_location" in updates and updates["saved_location"] is not None:
        updates["saved_location"] = body.saved_location.model_dump()
    if updates.get("avatar_file_id"):
        f = await db.files.find_one({"_id": updates["avatar_file_id"], "owner_id": user["_id"]})
        if not f:
            raise HTTPException(status_code=400, detail="Invalid avatar")
    updates["onboarded"] = True
    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    return await serialize_me(await db.users.find_one({"_id": user["_id"]}))


@router.get("/me/listings")
async def my_listings(user: dict = Depends(get_current_user)):
    from app.modules.listings.service import present_listings
    docs = await db.listings.find({"owner_id": user["_id"], "status": {"$ne": "removed"}}).sort("created_at", -1).to_list(200)
    return await present_listings(docs, user)


@router.get("/me/blocks")
async def my_blocks(user: dict = Depends(get_current_user)):
    rows = await db.blocks.find({"blocker_id": user["_id"]}).to_list(200)
    people = await user_summaries({r["blocked_id"] for r in rows})
    return [people[r["blocked_id"]] for r in rows if r["blocked_id"] in people]


@router.get("/{user_id}")
async def public_profile(user_id: str):
    user = await db.users.find_one({"_id": user_id, "status": {"$ne": "suspended"}})
    if not user:
        raise HTTPException(status_code=404, detail="Member not found")
    return public_user(user, await org_for(user_id))


@router.post("/{user_id}/block", status_code=201)
async def block(user_id: str, user: dict = Depends(get_current_user)):
    if user_id == user["_id"]:
        raise HTTPException(status_code=400, detail="You can't block yourself")
    if not await db.users.find_one({"_id": user_id}):
        raise HTTPException(status_code=404, detail="Member not found")
    await db.blocks.update_one({"blocker_id": user["_id"], "blocked_id": user_id},
                               {"$setOnInsert": {"_id": new_id(), "created_at": utcnow()}}, upsert=True)
    return {"blocked": True}


@router.delete("/{user_id}/block")
async def unblock(user_id: str, user: dict = Depends(get_current_user)):
    await db.blocks.delete_one({"blocker_id": user["_id"], "blocked_id": user_id})
    return {"blocked": False}


@router.get("/{user_id}/is-blocked")
async def is_blocked(user_id: str, user: dict = Depends(get_current_user)):
    row = await db.blocks.find_one({"blocker_id": user["_id"], "blocked_id": user_id})
    return {"blocked": row is not None, "record": out(row)}
