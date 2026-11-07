import uuid
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


def out(doc: dict | None, exclude: tuple[str, ...] = ()) -> dict | None:
    """Convert a Mongo document into an API-safe dict (_id -> id)."""
    if doc is None:
        return None
    data = {k: v for k, v in doc.items() if k != "_id" and k not in exclude}
    data["id"] = doc["_id"]
    return data


def paginate_params(page: int, limit: int) -> tuple[int, int]:
    page = max(page, 1)
    limit = min(max(limit, 1), 50)
    return (page - 1) * limit, limit


def page_response(items: list, page: int, limit: int) -> dict:
    has_more = len(items) > limit
    return {"items": items[:limit], "page": page, "has_more": has_more}
