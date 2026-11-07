from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile

from app.core.config import settings
from app.core.deps import get_current_user, get_optional_user
from app.db.mongo import db
from app.db.utils import new_id, utcnow
from app.services.storage import get_storage

router = APIRouter(prefix="/files", tags=["files"])

IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
PURPOSES = {"listing_photo", "avatar", "org_logo", "org_proof"}
MAX_IMAGE = 5 * 1024 * 1024
MAX_DOC = 10 * 1024 * 1024


def _sniff(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:5] == b"%PDF-":
        return "application/pdf"
    return None


@router.post("", status_code=201)
async def upload(file: UploadFile = File(...), purpose: str = Form(...), user: dict = Depends(get_current_user)):
    if purpose not in PURPOSES:
        raise HTTPException(status_code=400, detail="Unknown upload purpose")
    data = await file.read()
    kind = _sniff(data)
    allowed = dict(IMAGE_TYPES, **({"application/pdf": "pdf"} if purpose == "org_proof" else {}))
    if kind not in allowed:
        raise HTTPException(status_code=415, detail="Use a JPEG, PNG or WebP image" +
                            (" or a PDF" if purpose == "org_proof" else ""))
    limit = MAX_DOC if kind == "application/pdf" else MAX_IMAGE
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"File must be under {limit // (1024 * 1024)} MB")
    file_id = new_id()
    path = f"{settings.storage_prefix}/{purpose}/{user['_id']}/{file_id}.{allowed[kind]}"
    stored = await get_storage().put(path, data, kind)
    await db.files.insert_one({
        "_id": file_id, "owner_id": user["_id"], "purpose": purpose, "storage_path": stored,
        "content_type": kind, "size": len(data), "original_name": (file.filename or "")[:120],
        "private": purpose == "org_proof", "is_deleted": False, "created_at": utcnow(),
    })
    return {"id": file_id, "content_type": kind, "size": len(data)}


@router.get("/{file_id}")
async def download(file_id: str, user: dict | None = Depends(get_optional_user)):
    rec = await db.files.find_one({"_id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    if rec["private"] and not (user and (user["_id"] == rec["owner_id"] or user.get("role") == "admin")):
        raise HTTPException(status_code=404, detail="File not found")
    data = await get_storage().get(rec["storage_path"])
    cache = "private, no-store" if rec["private"] else "public, max-age=86400"
    return Response(content=data, media_type=rec["content_type"], headers={"Cache-Control": cache})
