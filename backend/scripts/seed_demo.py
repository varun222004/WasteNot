"""Optional demo data for local development and previews. Never run against production.

Usage (from backend/):  python -m scripts.seed_demo          # create
                        python -m scripts.seed_demo --purge  # remove everything tagged is_demo
"""
import asyncio
import sys
from datetime import timedelta
from pathlib import Path

from app.core.config import settings
from app.db.mongo import db, ensure_indexes
from app.db.utils import new_id, utcnow
from app.services.storage import get_storage

ASSETS = Path(__file__).resolve().parents[1] / "seed_assets"
USERS = [("demo.ananya@wastenot.dev", "Ananya R.", "Indiranagar"), ("demo.karthik@wastenot.dev", "Karthik S.", "Koramangala"),
         ("demo.meera@wastenot.dev", "Meera P.", "Jayanagar")]
LISTINGS = [
    (0, "Children's story books, set of 10", "Well-loved picture books for ages 4–8. A few have names written inside, otherwise in good shape.", "books", "good", 1, "books.jpg", "Indiranagar", 12.9784, 77.6408),
    (1, "Winter jackets and sweaters", "Three jackets and four sweaters, sizes M and L. Washed and folded, ready to wear.", "clothes", "like_new", 7, "clothes.jpg", "Koramangala", 12.9352, 77.6245),
    (2, "Handmade ceramic bowls", "Six small ceramic bowls and two serving plates. Moving house and can't take them.", "household", "good", 8, "ceramics.jpg", "Jayanagar", 12.9250, 77.5938),
    (0, "Denim jeans, waist 30–32", "Four pairs of jeans in good condition. Happy for one person to take all or split.", "clothes", "good", 4, "denim.jpg", "Indiranagar", 12.9790, 77.6390),
    (1, "Engineering reference books", "Second-year mechanical engineering textbooks and a few novels. Free to students.", "books", "fair", 6, "books2.jpg", "HSR Layout", 12.9116, 77.6474),
]


async def purge():
    for coll in ("listings", "users", "files"):
        r = await db[coll].delete_many({"is_demo": True})
        print(f"removed {r.deleted_count} demo {coll}")


async def seed():
    if settings.is_production:
        raise SystemExit("Refusing to seed demo data in production")
    await ensure_indexes()
    now = utcnow()
    ids = []
    for email, name, loc in USERS:
        u = await db.users.find_one({"email": email})
        if not u:
            u = {"_id": new_id(), "email": email, "display_name": name, "bio": "Demo neighbour", "locality": loc,
                 "avatar_file_id": None, "role": "user", "status": "active", "email_verified": True, "saved_location": None,
                 "saved_listing_ids": [], "stats": {"given": 0, "received": 0, "completed": 0}, "onboarded": True,
                 "created_at": now, "last_login_at": now, "is_demo": True}
            await db.users.insert_one(u)
        ids.append(u["_id"])
    storage = get_storage()
    for owner, title, desc, cat, cond, qty, img, loc, lat, lng in LISTINGS:
        if await db.listings.find_one({"title": title, "is_demo": True}):
            continue
        fid = new_id()
        path = await storage.put(f"{settings.storage_prefix}/listing_photo/{ids[owner]}/{fid}.jpg", (ASSETS / img).read_bytes(), "image/jpeg")
        await db.files.insert_one({"_id": fid, "owner_id": ids[owner], "purpose": "listing_photo", "storage_path": path,
                                   "content_type": "image/jpeg", "size": 0, "original_name": img, "private": False,
                                   "is_deleted": False, "created_at": now, "is_demo": True})
        await db.listings.insert_one({
            "_id": new_id(), "owner_id": ids[owner], "org_id": None, "title": title, "description": desc, "category": cat,
            "mode": "giveaway", "quantity_total": qty, "available": qty, "reserved": 0, "collected": 0, "per_person_limit": None,
            "condition": cond, "photo_ids": [fid], "locality": loc,
            "public_point": {"type": "Point", "coordinates": [round(lng, 2), round(lat, 2)]}, "public_pickup_point": None,
            "private_location": {"lat": lat, "lng": lng, "address": None, "instructions": "Message me to fix a time."},
            "pickup_window_start": None, "pickup_window_end": None, "expires_at": now + timedelta(days=30), "food": None,
            "auto_accept": False, "status": "active", "created_at": now, "updated_at": now, "is_demo": True})
        print("created", title)


if __name__ == "__main__":
    asyncio.run(purge() if "--purge" in sys.argv else seed())
