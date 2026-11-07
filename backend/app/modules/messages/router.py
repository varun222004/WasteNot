from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user
from app.db.mongo import db
from app.db.utils import new_id, utcnow
from app.modules.users.service import user_summaries
from app.services.notifications import notify
from app.services.safety import is_blocked_between

router = APIRouter(prefix="/messages", tags=["messages"])


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


async def _conversation(conv_id: str, user: dict) -> dict:
    conv = await db.conversations.find_one({"_id": conv_id})
    if not conv or user["_id"] not in conv["participants"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


async def _present(conv: dict, user: dict, people: dict) -> dict:
    other_id = next(p for p in conv["participants"] if p != user["_id"])
    listing = await db.listings.find_one({"_id": conv["listing_id"]}, {"title": 1, "photo_ids": 1})
    blocked = await is_blocked_between(user["_id"], other_id)
    return {"id": conv["_id"], "reservation_id": conv["context_id"], "other": people.get(other_id),
            "listing": {"id": conv["listing_id"], "title": listing["title"] if listing else "",
                        "photo_id": (listing.get("photo_ids") or [None])[0] if listing else None},
            "read_only": conv["read_only"] or blocked, "blocked": blocked, "last_message": conv.get("last_message"),
            "last_message_at": conv["last_message_at"], "unread": conv.get("unread", {}).get(user["_id"], 0)}


@router.get("/conversations")
async def conversations(user: dict = Depends(get_current_user)):
    convs = await db.conversations.find({"participants": user["_id"]}).sort("last_message_at", -1).to_list(100)
    people = await user_summaries({p for c in convs for p in c["participants"]})
    return [await _present(c, user, people) for c in convs]


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    convs = await db.conversations.find({"participants": user["_id"]}, {"unread": 1}).to_list(200)
    return {"count": sum(c.get("unread", {}).get(user["_id"], 0) for c in convs)}


@router.get("/conversations/{conv_id}")
async def thread(conv_id: str, after: str | None = None, user: dict = Depends(get_current_user)):
    conv = await _conversation(conv_id, user)
    msgs = await db.messages.find({"conversation_id": conv_id}).sort("created_at", 1).to_list(500)
    await db.conversations.update_one({"_id": conv_id}, {"$set": {f"unread.{user['_id']}": 0}})
    people = await user_summaries(set(conv["participants"]))
    return {"conversation": await _present(conv, user, people),
            "messages": [{"id": m["_id"], "sender_id": m["sender_id"], "body": m["body"],
                          "created_at": m["created_at"], "mine": m["sender_id"] == user["_id"]} for m in msgs]}


@router.post("/conversations/{conv_id}", status_code=201)
async def send(conv_id: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    conv = await _conversation(conv_id, user)
    other_id = next(p for p in conv["participants"] if p != user["_id"])
    if conv["read_only"]:
        raise HTTPException(status_code=409, detail="This conversation is closed")
    if await is_blocked_between(user["_id"], other_id):
        raise HTTPException(status_code=403, detail="You can't message this member")
    now = utcnow()
    msg = {"_id": new_id(), "conversation_id": conv_id, "sender_id": user["_id"], "body": body.body.strip(), "created_at": now}
    await db.messages.insert_one(msg)
    await db.conversations.update_one({"_id": conv_id}, {"$set": {"last_message": msg["body"][:120], "last_message_at": now},
                                                         "$inc": {f"unread.{other_id}": 1}})
    if (conv.get("unread", {}).get(other_id, 0)) == 0:
        await notify(other_id, "new_message", f"New message from {user.get('display_name')}", msg["body"][:80],
                     f"/messages/{conv_id}")
    return {"id": msg["_id"], "sender_id": user["_id"], "body": msg["body"], "created_at": now, "mine": True}
