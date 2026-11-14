"""Pluggable file storage. UPLOAD_STORAGE_PROVIDER = local.

`local` writes to UPLOAD_DIR. On hosts with an ephemeral disk (Render, Fly without a volume) files are lost on
redeploy, so production needs an object-storage provider (S3-compatible, e.g. Cloudflare R2). Add one by
implementing put/get and registering it in get_storage().
"""
import asyncio
import logging
from pathlib import Path

from app.core.config import settings

log = logging.getLogger(__name__)


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    async def put(self, path: str, data: bytes, content_type: str) -> str:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(target.write_bytes, data)
        return path

    async def get(self, path: str) -> bytes:
        return await asyncio.to_thread((self.root / path).read_bytes)


_storage = None


def get_storage():
    global _storage
    if _storage is None:
        if settings.storage_provider != "local":
            raise RuntimeError(f"Unknown UPLOAD_STORAGE_PROVIDER {settings.storage_provider!r} (supported: local)")
        if settings.is_production:
            log.warning("Using local disk storage in production: uploaded files are lost on redeploy. "
                        "Configure object storage.")
        _storage = LocalStorage(settings.upload_dir)
    return _storage
