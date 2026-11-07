# Live regression tests against the public preview URL (REACT_APP_BACKEND_URL + /api/v1).
# Run: cd /app/backend && /root/.venv/bin/python -m pytest -q tests/live -n 0 -p no:cacheprovider
import io
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from PIL import Image


def _base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                url = line.split("=", 1)[1].strip()
    return url.rstrip("/") + "/api/v1"


API = _base()
RUN = uuid.uuid4().hex[:6]
ADMIN_EMAIL = "varshini.v2204@gmail.com"
_tokens: dict = {}
CREATED_LISTINGS: list = []  # (token, id)


def png_bytes():
    b = io.BytesIO()
    Image.new("RGB", (64, 64), (30, 160, 90)).save(b, "PNG")
    return b.getvalue()


def login(email):
    if email in _tokens:
        return _tokens[email]
    r = requests.post(f"{API}/auth/request-otp", json={"email": email})
    assert r.status_code == 200, r.text
    code = r.json()["dev_otp"]
    v = requests.post(f"{API}/auth/verify-otp", json={"email": email, "code": code})
    assert v.status_code == 200, v.text
    _tokens[email] = {"Authorization": f"Bearer {v.json()['access_token']}"}
    return _tokens[email]


def em(tag):
    return f"test_{tag}_{RUN}@example.com"


def make_listing(h, **over):
    f = requests.post(f"{API}/files", headers=h, files={"file": ("a.png", png_bytes(), "image/png")},
                      data={"purpose": "listing_photo"})
    assert f.status_code == 201, f.text
    body = {"title": f"TEST_ books {RUN}", "description": "A pile of test books for testing", "category": "books",
            "mode": "giveaway", "quantity": 3, "condition": "good", "photo_ids": [f.json()["id"]],
            "location": {"locality": "Indiranagar", "lat": 12.97841, "lng": 77.64082,
                         "private_address": "12 Secret Lane"}}
    body.update(over)
    r = requests.post(f"{API}/listings", headers=h, json=body)
    assert r.status_code == 201, r.text
    CREATED_LISTINGS.append((h, r.json()["id"]))
    return r.json()


@pytest.fixture(scope="session", autouse=True)
def cleanup():
    yield
    for h, lid in CREATED_LISTINGS:
        requests.post(f"{API}/listings/{lid}/close", headers=h)
        requests.delete(f"{API}/listings/{lid}", headers=h)


# --- Auth ---
def test_health():
    assert requests.get(f"{API}/health").json()["status"] == "ok"


def test_auth_cookie_flow_and_logout():
    s = requests.Session()
    e = em("auth")
    code = s.post(f"{API}/auth/request-otp", json={"email": e}).json()["dev_otp"]
    assert len(code) == 6
    v = s.post(f"{API}/auth/verify-otp", json={"email": e, "code": code})
    assert v.status_code == 200
    assert "wn_access" in s.cookies.get_dict()
    me = s.get(f"{API}/users/me")
    assert me.status_code == 200 and me.json()["email"] == e
    s.post(f"{API}/auth/logout")
    assert s.get(f"{API}/users/me").status_code == 401


def test_invalid_otp_and_attempt_limit():
    e = em("badotp")
    requests.post(f"{API}/auth/request-otp", json={"email": e})
    codes = [requests.post(f"{API}/auth/verify-otp", json={"email": e, "code": "000000"}).status_code for _ in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429, codes


def test_otp_cooldown():
    e = em("cool")
    assert requests.post(f"{API}/auth/request-otp", json={"email": e}).status_code == 200
    assert requests.post(f"{API}/auth/request-otp", json={"email": e}).status_code == 429


# --- Listings / privacy ---
def test_public_listing_hides_private_location():
    giver = login(em("giver"))
    l = make_listing(giver)
    other = login(em("taker"))
    for h in (None, other):
        d = requests.get(f"{API}/listings/{l['id']}", headers=h or {}).json()
        assert "private_location" not in d
    items = requests.get(f"{API}/listings", params={"lat": 12.97, "lng": 77.64, "radius_km": 10}).json()["items"]
    assert all("private_location" not in i for i in items)
    assert any(i["id"] == l["id"] for i in items)
    owner_view = requests.get(f"{API}/listings/{l['id']}", headers=giver).json()
    assert owner_view.get("private_location", {}).get("address") == "12 Secret Lane"


def test_food_validation():
    giver = login(em("giver"))
    now = datetime.now(timezone.utc)
    food = {"food_type": "cooked", "prepared_at": now.isoformat(), "safe_until": (now + timedelta(hours=4)).isoformat(),
            "diet": "veg", "allergen_status": "none_declared", "storage_instructions": "Keep covered",
            "declaration": {"not_expired": True, "not_opened": True, "no_raw_meat_or_fish": True,
                            "no_alcohol": True, "information_accurate": True}}
    win = {"pickup_window_start": (now + timedelta(minutes=10)).isoformat(),
           "pickup_window_end": (now + timedelta(hours=3)).isoformat()}
    base = dict(category="food", mode="food", title=f"TEST_ rice {RUN}", description="Fresh veg pulao cooked today",
                condition=None, **win)
    ok = make_listing(giver, food=food, **base)
    assert ok["mode"] == "food" and ok["food"]["diet"] == "veg"
    photo = ok["photo_ids"][0]
    loc = {"locality": "Indiranagar", "lat": 12.97, "lng": 77.64}
    bad_decl = dict(food, declaration={**food["declaration"], "no_alcohol": False})
    r = requests.post(f"{API}/listings", headers=giver, json={**base, "quantity": 2, "photo_ids": [photo], "location": loc, "food": bad_decl})
    assert r.status_code == 422
    past = dict(food, safe_until=(now - timedelta(hours=1)).isoformat())
    r = requests.post(f"{API}/listings", headers=giver, json={**base, "quantity": 2, "photo_ids": [photo], "location": loc, "food": past})
    assert r.status_code == 422


# --- Reservations / messaging / blocking ---
def test_reservation_lifecycle():
    giver, taker, outsider = login(em("giver")), login(em("taker")), login(em("outsider"))
    l = make_listing(giver)
    assert requests.post(f"{API}/reservations", headers=giver, json={"listing_id": l["id"]}).status_code == 400
    r = requests.post(f"{API}/reservations", headers=taker, json={"listing_id": l["id"], "quantity": 2})
    assert r.status_code == 201 and r.json()["status"] == "requested" and "pickup_location" not in r.json()
    rid = r.json()["id"]
    d = requests.get(f"{API}/listings/{l['id']}").json()
    assert (d["available"], d["reserved"], d["collected"]) == (1, 2, 0)
    act = lambda h, a: requests.post(f"{API}/reservations/{rid}/actions", headers=h, json={"action": a})
    assert act(giver, "accept").json()["status"] == "accepted"
    det = requests.get(f"{API}/reservations/{rid}", headers=taker).json()
    assert det["pickup_location"]["address"] == "12 Secret Lane"
    conv = det["conversation_id"]
    assert requests.post(f"{API}/messages/conversations/{conv}", headers=taker, json={"body": "TEST_ on my way"}).status_code == 201
    assert requests.get(f"{API}/messages/unread-count", headers=giver).json()
    assert requests.get(f"{API}/messages/conversations/{conv}", headers=outsider).status_code == 404
    assert requests.get(f"{API}/reservations/{rid}", headers=outsider).status_code == 404
    given_before = requests.get(f"{API}/users/me", headers=giver).json()["stats"]["given"]
    assert act(taker, "confirm").json()["status"] == "accepted"
    assert act(giver, "confirm").json()["status"] == "completed"
    d = requests.get(f"{API}/listings/{l['id']}").json()
    assert (d["available"], d["reserved"], d["collected"]) == (1, 0, 2) and d["status"] == "active"
    assert requests.get(f"{API}/users/me", headers=giver).json()["stats"]["given"] == given_before + 2


def test_decline_cancel_release():
    giver, taker = login(em("giver")), login(em("taker"))
    l = make_listing(giver, quantity=1)
    r = requests.post(f"{API}/reservations", headers=taker, json={"listing_id": l["id"]}).json()
    assert requests.get(f"{API}/listings/{l['id']}").json()["available"] == 0
    requests.post(f"{API}/reservations/{r['id']}/actions", headers=giver, json={"action": "decline"})
    assert requests.get(f"{API}/listings/{l['id']}").json()["available"] == 1
    r2 = requests.post(f"{API}/reservations", headers=taker, json={"listing_id": l["id"]}).json()
    c = requests.post(f"{API}/reservations/{r2['id']}/actions", headers=taker, json={"action": "cancel"})
    assert c.json()["status"] == "cancelled"
    assert requests.get(f"{API}/listings/{l['id']}").json()["available"] == 1


def test_block_prevents_reservation():
    giver, blocked = login(em("blocker")), login(em("blocked"))
    l = make_listing(giver)
    bid = requests.get(f"{API}/users/me", headers=blocked).json()["id"]
    assert requests.post(f"{API}/users/{bid}/block", headers=giver).status_code == 201
    assert requests.post(f"{API}/reservations", headers=blocked, json={"listing_id": l["id"]}).status_code == 403
    requests.delete(f"{API}/users/{bid}/block", headers=giver)


def test_wanted_offer_flow():
    asker, giver = login(em("asker")), login(em("giver"))
    req = requests.post(f"{API}/requests", headers=asker, json={"title": f"TEST_ need kettle {RUN}", "description": "Electric kettle please",
                                                               "category": "household", "locality": "Jayanagar"})
    assert req.status_code == 201, req.text
    req = req.json()
    l = make_listing(giver, category="household", title=f"TEST_ kettle {RUN}")
    off = requests.post(f"{API}/requests/{req['id']}/offers", headers=giver, json={"listing_id": l["id"]})
    assert off.status_code == 201, off.text
    acc = requests.post(f"{API}/requests/{req['id']}/offers/{off.json()['id']}/accept", headers=asker).json()
    assert requests.get(f"{API}/reservations/{acc['reservation_id']}", headers=asker).json()["status"] == "accepted"
    assert requests.get(f"{API}/requests/{req['id']}").json()["status"] == "fulfilled"


def test_notifications_read_all():
    giver = login(em("giver"))
    n = requests.get(f"{API}/notifications", headers=giver)
    assert n.status_code == 200
    assert requests.post(f"{API}/notifications/read-all", headers=giver).status_code == 200
    assert requests.get(f"{API}/notifications/unread-count", headers=giver).json().get("count", 0) == 0


def test_report_and_admin_dismiss():
    reporter, admin = login(em("reporter")), login(ADMIN_EMAIL)
    l = make_listing(login(em("giver")))
    assert requests.post(f"{API}/reports", headers=reporter, json={"target_type": "listing", "target_id": l["id"], "reason": "misleading"}).status_code == 201
    assert requests.get(f"{API}/admin/reports", headers=reporter).status_code == 403
    reps = requests.get(f"{API}/admin/reports", headers=admin).json()
    reps = reps["items"] if isinstance(reps, dict) else reps
    rid = next(r["id"] for r in reps if r["target_id"] == l["id"])
    assert requests.post(f"{API}/admin/reports/{rid}/resolve", headers=admin, json={"action": "remove_listing", "note": "TEST_"}).status_code == 200
    assert requests.get(f"{API}/listings/{l['id']}").status_code == 404


def test_org_verification_auto_accept():
    owner, admin, taker = login(em("org")), login(ADMIN_EMAIL), login(em("taker"))
    proof = requests.post(f"{API}/files", headers=owner, files={"file": ("p.png", png_bytes(), "image/png")}, data={"purpose": "org_proof"}).json()["id"]
    assert requests.get(f"{API}/files/{proof}").status_code == 404
    org = requests.post(f"{API}/organizations", headers=owner, json={"name": f"TEST_ Kitchen {RUN}", "description": "Community kitchen in test",
                                                                   "category": "community_kitchen", "contact_email": "k@example.com",
                                                                   "contact_phone": "9999999999", "address": "1 Main Road", "locality": "Jayanagar",
                                                                   "location": {"lat": 12.925, "lng": 77.5938}, "proof_file_id": proof})
    assert org.status_code == 201, org.text
    assert org.json()["status"] == "pending"
    rv = requests.post(f"{API}/admin/organizations/{org.json()['id']}/review", headers=admin, json={"status": "verified", "note": ""})
    assert rv.status_code == 200, rv.text
    l = make_listing(owner, as_organization=True, title=f"TEST_ org books {RUN}")
    r = requests.post(f"{API}/reservations", headers=taker, json={"listing_id": l["id"]}).json()
    assert r["status"] == "accepted"
    assert requests.post(f"{API}/reservations/{r['id']}/actions", headers=owner, json={"action": "confirm"}).json()["status"] == "completed"
