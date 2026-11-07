from pymongo import ASCENDING, DESCENDING, AsyncMongoClient

from app.core.config import settings

client: AsyncMongoClient = AsyncMongoClient(settings.mongodb_uri, tz_aware=True)
db = client[settings.database_name]


async def ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.otp_records.create_index("email", unique=True)
    await db.otp_records.create_index("purge_at", expireAfterSeconds=0)
    await db.sessions.create_index("jti", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.listings.create_index([("status", ASCENDING), ("category", ASCENDING), ("created_at", DESCENDING)])
    await db.listings.create_index([("public_point", "2dsphere")])
    await db.listings.create_index("owner_id")
    await db.listings.create_index("expires_at")
    await db.reservations.create_index([("requester_id", ASCENDING), ("status", ASCENDING)])
    await db.reservations.create_index([("listing_id", ASCENDING), ("status", ASCENDING)])
    await db.reservations.create_index([("owner_id", ASCENDING), ("status", ASCENDING)])
    await db.reservations.create_index([("status", ASCENDING), ("respond_by", ASCENDING)])
    await db.wanted_requests.create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    await db.request_offers.create_index([("request_id", ASCENDING), ("status", ASCENDING)])
    await db.conversations.create_index("participants")
    await db.messages.create_index([("conversation_id", ASCENDING), ("created_at", ASCENDING)])
    await db.notifications.create_index([("user_id", ASCENDING), ("read", ASCENDING), ("created_at", DESCENDING)])
    await db.reports.create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    await db.blocks.create_index([("blocker_id", ASCENDING), ("blocked_id", ASCENDING)], unique=True)
    await db.organizations.create_index("owner_id", unique=True)
    await db.organizations.create_index("status")
    await db.exchange_events.create_index("created_at")
    await db.files.create_index("owner_id")
