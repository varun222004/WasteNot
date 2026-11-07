"""Periodic lifecycle sweep: expires listings, requests and stale reservations."""
import asyncio
import logging

from app.core.config import settings
from app.db.mongo import db
from app.db.utils import utcnow
from app.modules.requests.router import sweep_requests
from app.modules.reservations.service import sweep_reservations

logger = logging.getLogger("wastenot.sweep")


async def sweep_once() -> None:
    await db.listings.update_many({"status": {"$in": ["active", "closed"]}, "expires_at": {"$lte": utcnow()}},
                                  {"$set": {"status": "expired"}})
    await sweep_reservations()
    await sweep_requests()


async def sweep_forever() -> None:
    while True:
        try:
            await sweep_once()
        except Exception:  # keep the loop alive; errors are logged
            logger.exception("Sweep failed")
        await asyncio.sleep(settings.sweep_interval_seconds)
