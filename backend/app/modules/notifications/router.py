from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.db.mongo import db
from app.db.utils import out, page_response, paginate_params

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(page: int = 1, limit: int = 20, user: dict = Depends(get_current_user)):
    skip, limit = paginate_params(page, limit)
    rows = await db.notifications.find({"user_id": user["_id"]}).sort("created_at", -1).skip(skip).limit(limit + 1).to_list(None)
    return page_response([out(r) for r in rows], page, limit)


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    return {"count": await db.notifications.count_documents({"user_id": user["_id"], "read": False})}


@router.post("/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/{notification_id}/read")
async def read_one(notification_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"_id": notification_id, "user_id": user["_id"]}, {"$set": {"read": True}})
    return {"ok": True}
