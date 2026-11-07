from app.db.mongo import db
from app.db.utils import new_id, utcnow


async def notify(user_id: str, kind: str, title: str, body: str = "", link: str = "") -> None:
    await db.notifications.insert_one({
        "_id": new_id(), "user_id": user_id, "kind": kind, "title": title,
        "body": body, "link": link, "read": False, "created_at": utcnow(),
    })


async def log_moderation(admin_id: str, action: str, target_type: str, target_id: str, note: str = "") -> None:
    await db.moderation_actions.insert_one({
        "_id": new_id(), "admin_id": admin_id, "action": action, "target_type": target_type,
        "target_id": target_id, "note": note, "created_at": utcnow(),
    })
