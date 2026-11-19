"""Batch 2: guest-safe session endpoint, India-time messages, finished listings close themselves."""
import pytest

from app.db.mongo import db
from tests.conftest import login, make_listing
from tests.test_regressions import act, reserve_and_accept


def test_session_endpoint_is_200_for_guests_and_users(anon):
    anon.cookies.clear()
    r = anon.get("/api/v1/auth/session")
    assert r.status_code == 200 and r.json() == {"user": None}
    user = login("sess@test.dev")
    assert user.get("/api/v1/auth/session").json()["user"]["email"] == "sess@test.dev"


def test_session_renews_from_the_refresh_cookie_alone(anon):
    email = "sess2@test.dev"
    code = anon.post("/api/v1/auth/request-otp", json={"email": email}).json()["dev_otp"]
    anon.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    refresh = anon.cookies.get("wn_refresh")
    anon.cookies.clear()
    anon.cookies.set("wn_refresh", refresh, domain="testserver.local", path="/api/v1/auth")
    r = anon.get("/api/v1/auth/session")
    assert r.status_code == 200 and r.json()["user"]["email"] == email
    assert anon.cookies.get("wn_access")  # a fresh access cookie came back with the answer
    anon.cookies.clear()


def test_session_with_a_garbage_refresh_cookie_is_null_not_an_error(anon):
    anon.cookies.clear()
    anon.cookies.set("wn_refresh", "not-a-token", domain="testserver.local", path="/api/v1/auth")
    r = anon.get("/api/v1/auth/session")
    assert r.status_code == 200 and r.json() == {"user": None}
    anon.cookies.clear()


def test_no_show_message_is_in_india_time(anon):
    giver, taker = login("ist_g@test.dev"), login("ist_t@test.dev")
    _, res = reserve_and_accept(giver, taker)
    r = act(giver, res["id"], "no_show")
    assert r.status_code == 409 and r.json()["detail"].endswith(" IST")


def test_fully_collected_listing_closes_itself(anon):
    giver, taker = login("fc_g@test.dev"), login("fc_t@test.dev")
    listing = make_listing(giver, quantity=2)
    res = taker.post("/api/v1/reservations", json={"listing_id": listing["id"], "quantity": 2}).json()
    assert act(giver, res["id"], "accept").status_code == 200
    assert act(taker, res["id"], "confirm").json()["status"] == "accepted"
    assert act(giver, res["id"], "confirm").json()["status"] == "completed"
    assert anon.get(f"/api/v1/listings/{listing['id']}").json()["status"] == "completed"
    assert not any(i["id"] == listing["id"] for i in anon.get("/api/v1/listings").json()["items"])


def _set_cookie_headers(response):
    return [h for h in response.headers.get_list("set-cookie")]


def _clears(headers, name):
    return any(h.startswith(f"{name}=") and ("Max-Age=0" in h or "expires=" in h.lower()) for h in headers)


def test_session_clears_stale_cookies_when_nobody_is_signed_in(anon):
    anon.cookies.clear()
    anon.cookies.set("wn_refresh", "not-a-token", domain="testserver.local", path="/api/v1/auth")
    r = anon.get("/api/v1/auth/session")
    assert r.json() == {"user": None}
    assert _clears(_set_cookie_headers(r), "wn_refresh") and _clears(_set_cookie_headers(r), "wn_access")
    anon.cookies.clear()


def test_session_for_a_suspended_account_is_null_and_clears_cookies(anon):
    # Sign in the way a browser does (cookies), then have an admin suspend the account.
    email = "sess_susp@test.dev"
    code = anon.post("/api/v1/auth/request-otp", json={"email": email}).json()["dev_otp"]
    anon.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    member_id = anon.get("/api/v1/auth/session").json()["user"]["id"]
    # Suspend straight in the database: the shared test client drops its cookie jar whenever the admin helper is used.
    anon.portal.call(db.users.update_one, {"_id": member_id}, {"$set": {"status": "suspended", "suspended_until": None}})
    r = anon.get("/api/v1/auth/session")
    assert r.status_code == 200 and r.json() == {"user": None}
    headers = _set_cookie_headers(r)
    assert _clears(headers, "wn_access") and _clears(headers, "wn_refresh")
    anon.cookies.clear()


def test_session_does_not_hide_unexpected_server_errors(anon, monkeypatch):
    member = login("sess_boom@test.dev")

    async def boom(_user):
        raise RuntimeError("database exploded")

    monkeypatch.setattr("app.modules.auth.router.serialize_me", boom)
    with pytest.raises(RuntimeError):  # surfaces as a real server error (and is logged), not a fake guest answer
        member.get("/api/v1/auth/session")


def test_home_category_keys_exist_in_the_catalog(anon):
    keys = {c["key"] for c in anon.get("/api/v1/listings/meta").json()["categories"]}
    assert {"food", "books", "clothes", "household"} <= keys  # the landing cards link to these
    assert anon.get("/api/v1/listings?category=clothes").status_code == 200
    assert anon.get("/api/v1/listings?category=household").status_code == 200
