from datetime import timedelta

from app.db.mongo import db
from app.db.utils import utcnow
from tests.conftest import login


def test_health(anon):
    assert anon.get("/api/v1/health").json()["status"] == "ok"


def test_otp_login_and_logout(anon):
    code = anon.post("/api/v1/auth/request-otp", json={"email": "auth1@test.dev"}).json()["dev_otp"]
    assert anon.post("/api/v1/auth/verify-otp", json={"email": "auth1@test.dev", "code": code}).status_code == 200
    assert anon.get("/api/v1/users/me").json()["email"] == "auth1@test.dev"  # cookie session
    anon.post("/api/v1/auth/logout")
    anon.cookies.clear()
    assert anon.get("/api/v1/users/me").status_code == 401


def test_code_cannot_be_reused(anon):
    code = anon.post("/api/v1/auth/request-otp", json={"email": "reuse@test.dev"}).json()["dev_otp"]
    assert anon.post("/api/v1/auth/verify-otp", json={"email": "reuse@test.dev", "code": code}).status_code == 200
    assert anon.post("/api/v1/auth/verify-otp", json={"email": "reuse@test.dev", "code": code}).status_code == 400
    anon.cookies.clear()


def test_invalid_otp_rejected_and_attempts_limited(anon):
    anon.post("/api/v1/auth/request-otp", json={"email": "auth2@test.dev"})
    codes = [anon.post("/api/v1/auth/verify-otp", json={"email": "auth2@test.dev", "code": "000000"}).status_code for _ in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429


def test_expired_otp_rejected(anon):
    code = anon.post("/api/v1/auth/request-otp", json={"email": "auth3@test.dev"}).json()["dev_otp"]
    anon.portal.call(db.otp_records.update_one, {"email": "auth3@test.dev"},
                     {"$set": {"expires_at": utcnow() - timedelta(minutes=1)}})
    r = anon.post("/api/v1/auth/verify-otp", json={"email": "auth3@test.dev", "code": code})
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_protected_actions_need_auth(anon):
    anon.cookies.clear()
    assert anon.post("/api/v1/reservations", json={"listing_id": "x"}).status_code == 401
    assert anon.get("/api/v1/notifications").status_code == 401
    login("auth4@test.dev")
