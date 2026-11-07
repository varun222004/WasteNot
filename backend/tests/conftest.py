import os
import uuid

# Isolated database per test run; never touches development or production data.
os.environ["DATABASE_NAME"] = f"wastenot_test_{uuid.uuid4().hex[:8]}"
os.environ.setdefault("MONGODB_URI", os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
os.environ.setdefault("JWT_SECRET", "test-access-secret")
os.environ.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret")
os.environ.setdefault("OTP_PEPPER", "test-pepper")
os.environ["ENVIRONMENT"] = "test"
os.environ["DEV_OTP_ENABLED"] = "true"
os.environ["UPLOAD_STORAGE_PROVIDER"] = "local"
os.environ["UPLOAD_DIR"] = "/tmp/wastenot-test-uploads"
os.environ["COOKIE_SECURE"] = "false"
os.environ["ADMIN_EMAILS"] = "admin@test.dev"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
_client: TestClient | None = None


def client() -> TestClient:
    """One shared client (one event loop) for the whole session; users are separated by bearer tokens."""
    global _client
    if _client is None:
        _client = TestClient(app)
        _client.__enter__()
    return _client


class User:
    def __init__(self, token: str):
        self.headers = {"Authorization": f"Bearer {token}"}

    def get(self, path, **kw):
        client().cookies.clear()
        return client().get(path, headers=self.headers, **kw)

    def post(self, path, **kw):
        client().cookies.clear()
        return client().post(path, headers=self.headers, **kw)


_users: dict[str, "User"] = {}


def login(email: str) -> User:
    if email in _users:
        return _users[email]
    c = client()
    code = c.post("/api/v1/auth/request-otp", json={"email": email}).json()["dev_otp"]
    r = c.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    assert r.status_code == 200, r.text
    c.cookies.clear()
    _users[email] = User(r.json()["access_token"])
    return _users[email]


@pytest.fixture(scope="session")
def anon():
    c = client()
    yield c
    from pymongo import MongoClient
    MongoClient(os.environ["MONGODB_URI"]).drop_database(os.environ["DATABASE_NAME"])


def make_listing(u: User, **over) -> dict:
    photo = u.post("/api/v1/files", files={"file": ("a.png", PNG, "image/png")}, data={"purpose": "listing_photo"}).json()["id"]
    body = {"title": "Test books", "description": "A pile of test books", "category": "books", "mode": "giveaway",
            "quantity": 3, "condition": "good", "photo_ids": [photo],
            "location": {"locality": "Indiranagar", "lat": 12.97841, "lng": 77.64082, "private_address": "12 Secret Lane"}}
    body.update(over)
    r = u.post("/api/v1/listings", json=body)
    assert r.status_code == 201, r.text
    return r.json()
