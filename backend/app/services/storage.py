"""Pluggable file storage. UPLOAD_STORAGE_PROVIDER = local | emergent.

`local` writes to UPLOAD_DIR (swap for a persistent disk or replace with an S3 provider).
`emergent` is an optional object-storage adapter used only in the original preview environment.
Add a new provider by implementing put/get and registering it in get_storage().
"""
import asyncio
import os
from pathlib import Path

import requests

from app.core.config import settings


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


class EmergentObjectStorage:
    def __init__(self):
        base = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or os.environ.get(
            "UPLOAD_STORAGE_URL", "https://integrations.emergentagent.com")
        self.url = base.rstrip("/") + "/objstore/api/v1/storage"
        self.api_key = os.environ.get("UPLOAD_STORAGE_KEY") or os.environ.get("EMERGENT_LLM_KEY")
        self._key: str | None = None

    def _init(self, force: bool = False) -> str:
        if self._key and not force:
            return self._key
        r = requests.post(f"{self.url}/init", json={"emergent_key": self.api_key}, timeout=30)
        r.raise_for_status()
        self._key = r.json()["storage_key"]
        return self._key

    def _put(self, path: str, data: bytes, content_type: str) -> str:
        for attempt in range(2):
            r = requests.put(f"{self.url}/objects/{path}", data=data, timeout=120,
                             headers={"X-Storage-Key": self._init(force=attempt > 0), "Content-Type": content_type})
            if r.status_code == 404 and attempt == 0:
                continue
            r.raise_for_status()
            return r.json()["path"]
        raise RuntimeError("upload failed")

    def _get(self, path: str) -> bytes:
        for attempt in range(2):
            r = requests.get(f"{self.url}/objects/{path}", timeout=60,
                             headers={"X-Storage-Key": self._init(force=attempt > 0)})
            if r.status_code == 404 and attempt == 0:
                continue
            r.raise_for_status()
            return r.content
        raise FileNotFoundError(path)

    async def put(self, path: str, data: bytes, content_type: str) -> str:
        return await asyncio.to_thread(self._put, path, data, content_type)

    async def get(self, path: str) -> bytes:
        return await asyncio.to_thread(self._get, path)


_storage = None


def get_storage():
    global _storage
    if _storage is None:
        _storage = EmergentObjectStorage() if settings.storage_provider == "emergent" else LocalStorage(settings.upload_dir)
    return _storage
