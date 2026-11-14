import asyncio
import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from PIL import Image, ImageOps

from app.core.config import settings
from app.core.deps import get_current_user, get_optional_user
from app.db.mongo import db
from app.db.utils import new_id, utcnow
from app.services.storage import get_storage

router = APIRouter(prefix="/files", tags=["files"])

IMAGE_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
PURPOSES = {"listing_photo", "avatar", "org_logo", "org_proof"}
MAX_IMAGE = 5 * 1024 * 1024
MAX_DOC = 10 * 1024 * 1024
MAX_SIDE = {"listing_photo": 1600, "avatar": 800, "org_logo": 800, "org_proof": 2000}
CHUNK = 64 * 1024

# Refuse decompression bombs (a tiny file that expands to a huge bitmap).
Image.MAX_IMAGE_PIXELS = 40_000_000


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


async def _read_capped(file: UploadFile, limit: int) -> bytes:
    """Read the upload in chunks and stop as soon as it is too big (never buffer an unbounded body)."""
    buf = bytearray()
    while True:
        chunk = await file.read(CHUNK)
        if not chunk:
            return bytes(buf)
        buf += chunk
        if len(buf) > limit:
            raise HTTPException(status_code=413, detail=f"File must be under {limit // (1024 * 1024)} MB")


def clean_image(data: bytes, max_side: int) -> tuple[bytes, str]:
    """Decode and re-encode so no metadata (EXIF/GPS, ICC, comments) survives and the bytes are a real image."""
    try:
        with Image.open(io.BytesIO(data)) as original:
            original.load()
            image = ImageOps.exif_transpose(original)  # apply the rotation, then drop the tag with the metadata
        has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
        image.thumbnail((max_side, max_side), Image.LANCZOS)
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.info = {}
        out = io.BytesIO()
        if has_alpha:
            image.save(out, "PNG", optimize=True)
            return out.getvalue(), "image/png"
        image.save(out, "JPEG", quality=85, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg"
    except Exception as exc:  # noqa: BLE001 - any decode failure means "not a usable image"
        raise ValueError("unreadable image") from exc


@router.post("", status_code=201)
async def upload(file: UploadFile = File(...), purpose: str = Form(...), user: dict = Depends(get_current_user)):
    if purpose not in PURPOSES:
        raise HTTPException(status_code=400, detail="Unknown upload purpose")
    data = await _read_capped(file, MAX_DOC)
    kind = _sniff(data)
    allow_pdf = purpose == "org_proof"
    if kind not in IMAGE_EXT and not (allow_pdf and kind == "application/pdf"):
        raise HTTPException(status_code=415, detail="Use a JPEG, PNG or WebP image" + (" or a PDF" if allow_pdf else ""))
    if kind == "application/pdf":
        ext = "pdf"
    else:
        if len(data) > MAX_IMAGE:
            raise HTTPException(status_code=413, detail=f"Image must be under {MAX_IMAGE // (1024 * 1024)} MB")
        try:
            data, kind = await asyncio.to_thread(clean_image, data, MAX_SIDE[purpose])
        except ValueError:
            raise HTTPException(status_code=415, detail="That image couldn't be read. Try a different photo")
        ext = IMAGE_EXT[kind]
    file_id = new_id()
    path = f"{settings.storage_prefix}/{purpose}/{user['_id']}/{file_id}.{ext}"
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
    return Response(content=data, media_type=rec["content_type"],
                    headers={"Cache-Control": cache, "X-Content-Type-Options": "nosniff"})
