"""Regression tests for the issues found in the 11 Nov 2026 audit. Each one failed before the fix."""
import io
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import piexif
from PIL import Image

from app.db.mongo import db
from app.db.utils import utcnow
from tests.conftest import PNG, client, login, make_listing

ORG = {"name": "Probe Kitchen", "description": "Community kitchen for tests", "category": "community_kitchen",
       "contact_email": "k@test.dev", "contact_phone": "9999999999", "address": "1 Main Road", "locality": "Jayanagar",
       "location": {"lat": 12.925, "lng": 77.5938}}


def act(c, rid, action, note=""):
    return c.post(f"/api/v1/reservations/{rid}/actions", json={"action": action, "note": note})


def reserve_and_accept(giver, taker, **over):
    listing = make_listing(giver, **over)
    res = taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).json()
    assert act(giver, res["id"], "accept").json()["status"] == "accepted"
    return listing, res


def backdate_acceptance(anon, rid, hours=25):
    anon.portal.call(db.reservations.update_one, {"_id": rid}, {"$set": {"accepted_at": utcnow() - timedelta(hours=hours)}})


# ---------------- images ----------------
def test_uploaded_photo_has_no_gps_and_is_re_encoded(anon):
    giver = login("exif@test.dev")
    gps = {piexif.GPSIFD.GPSLatitudeRef: "N", piexif.GPSIFD.GPSLatitude: ((12, 1), (58, 1), (42, 1)),
           piexif.GPSIFD.GPSLongitudeRef: "E", piexif.GPSIFD.GPSLongitude: ((77, 1), (38, 1), (29, 1))}
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (10, 120, 60)).save(buf, "JPEG", exif=piexif.dump({"GPS": gps}))
    original = buf.getvalue()
    assert piexif.load(original)["GPS"], "test image must carry GPS"
    fid = giver.post("/api/v1/files", files={"file": ("p.jpg", original, "image/jpeg")}, data={"purpose": "listing_photo"}).json()["id"]
    anon.cookies.clear()
    pub = anon.get(f"/api/v1/files/{fid}")
    assert pub.status_code == 200 and pub.content != original
    assert piexif.load(pub.content)["GPS"] == {}
    assert pub.headers["x-content-type-options"] == "nosniff"


def test_fake_and_oversized_images_are_rejected(anon):
    giver = login("exif@test.dev")
    fake = giver.post("/api/v1/files", files={"file": ("x.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "image/png")},
                      data={"purpose": "listing_photo"})
    assert fake.status_code == 415
    huge = giver.post("/api/v1/files", files={"file": ("x.jpg", b"\xff\xd8\xff" + b"\x00" * (6 * 1024 * 1024), "image/jpeg")},
                      data={"purpose": "listing_photo"})
    assert huge.status_code == 413


def test_large_photo_is_resized(anon):
    giver = login("exif@test.dev")
    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), (50, 60, 70)).save(buf, "JPEG")
    fid = giver.post("/api/v1/files", files={"file": ("b.jpg", buf.getvalue(), "image/jpeg")}, data={"purpose": "listing_photo"}).json()["id"]
    anon.cookies.clear()
    assert max(Image.open(io.BytesIO(anon.get(f"/api/v1/files/{fid}").content)).size) == 1600


# ---------------- no-show rules ----------------
def test_no_show_is_blocked_right_after_acceptance(anon):
    giver, taker = login("ns_g1@test.dev"), login("ns_t1@test.dev")
    _, res = reserve_and_accept(giver, taker)
    r = act(giver, res["id"], "no_show")
    assert r.status_code == 409
    backdate_acceptance(anon, res["id"])
    assert act(giver, res["id"], "no_show").json()["status"] == "no_show"


def test_contesting_a_no_show_lifts_the_restriction(anon):
    giver, taker = login("ns_g2@test.dev"), login("ns_t2@test.dev")
    ids = []
    for _ in range(3):
        _, res = reserve_and_accept(giver, taker)
        backdate_acceptance(anon, res["id"])
        assert act(giver, res["id"], "no_show").status_code == 200
        ids.append(res["id"])
    assert taker.get("/api/v1/users/me").json()["restricted_until"]
    blocked = taker.post("/api/v1/reservations", json={"listing_id": make_listing(giver)["id"]})
    assert blocked.status_code == 403
    assert act(giver, ids[0], "contest_no_show").status_code == 403  # only the receiver can contest
    assert act(taker, ids[0], "contest_no_show", "I was there, the giver was out").status_code == 200
    assert act(taker, ids[0], "contest_no_show").status_code == 409  # only once
    assert taker.get("/api/v1/users/me").json()["restricted_until"] is None
    assert taker.post("/api/v1/reservations", json={"listing_id": make_listing(giver)["id"]}).status_code == 201
    admin = login("admin@test.dev")
    assert any(c["id"] == ids[0] for c in admin.get("/api/v1/admin/no-show-contests").json())


# ---------------- moderation takedown ----------------
def test_suspending_a_member_takes_down_their_listings_and_reservations(anon):
    giver, taker, admin = login("td_g@test.dev"), login("td_t@test.dev"), login("admin@test.dev")
    listing = make_listing(giver)
    res = taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).json()
    giver_id = giver.get("/api/v1/users/me").json()["id"]
    assert admin.post(f"/api/v1/admin/users/{giver_id}/suspend", json={"note": "test"}).status_code == 200
    assert anon.get(f"/api/v1/listings/{listing['id']}").json()["status"] == "closed"
    assert taker.get(f"/api/v1/reservations/{res['id']}").json()["status"] == "cancelled"
    assert taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).status_code == 409
    feed = anon.get("/api/v1/listings").json()["items"]
    assert not any(i["id"] == listing["id"] for i in feed)


def test_suspended_org_cannot_reopen_listings(anon):
    owner, admin, taker = login("so_o@test.dev"), login("admin@test.dev"), login("so_t@test.dev")
    proof = owner.post("/api/v1/files", files={"file": ("p.png", PNG, "image/png")}, data={"purpose": "org_proof"}).json()["id"]
    org = owner.post("/api/v1/organizations", json={**ORG, "proof_file_id": proof}).json()
    admin.post(f"/api/v1/admin/organizations/{org['id']}/review", json={"status": "verified", "note": ""})
    listing = make_listing(owner, as_organization=True)
    res = taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).json()
    assert res["status"] == "accepted"  # org listings auto-accept
    admin.post(f"/api/v1/admin/organizations/{org['id']}/review", json={"status": "suspended", "note": "fraud"})
    assert anon.get(f"/api/v1/listings/{listing['id']}").json()["status"] == "closed"
    assert taker.get(f"/api/v1/reservations/{res['id']}").json()["status"] == "cancelled"
    assert owner.post(f"/api/v1/listings/{listing['id']}/reopen").status_code == 403
    assert taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).status_code == 409


def test_warn_action_notifies_the_member(anon):
    giver, reporter, admin = login("wn_g@test.dev"), login("wn_r@test.dev"), login("admin@test.dev")
    listing = make_listing(giver)
    reporter.post("/api/v1/reports", json={"target_type": "listing", "target_id": listing["id"], "reason": "suspicious"})
    rid = next(r["id"] for r in admin.get("/api/v1/admin/reports").json() if r["target_id"] == listing["id"])
    before = len(giver.get("/api/v1/notifications").json()["items"])
    assert admin.post(f"/api/v1/admin/reports/{rid}/resolve", json={"action": "warn", "note": "be careful"}).status_code == 200
    items = giver.get("/api/v1/notifications").json()["items"]
    assert len(items) == before + 1 and any(i["kind"] == "moderation" for i in items)


def test_report_on_deleted_listing_returns_404_not_500(anon):
    giver, reporter, admin = login("dl_g@test.dev"), login("dl_r@test.dev"), login("admin@test.dev")
    listing = make_listing(giver)
    reporter.post("/api/v1/reports", json={"target_type": "listing", "target_id": listing["id"], "reason": "spam"})
    rid = next(r["id"] for r in admin.get("/api/v1/admin/reports").json() if r["target_id"] == listing["id"])
    anon.portal.call(db.listings.delete_one, {"_id": listing["id"]})
    assert admin.post(f"/api/v1/admin/reports/{rid}/resolve", json={"action": "suspend_user", "note": ""}).status_code == 404


# ---------------- atomicity ----------------
def test_otp_attempt_limit_holds_under_parallel_guesses(anon):
    email = "otp_race@test.dev"
    anon.post("/api/v1/auth/request-otp", json={"email": email})
    with ThreadPoolExecutor(max_workers=40) as pool:
        codes = list(pool.map(lambda i: client().post("/api/v1/auth/verify-otp", json={"email": email, "code": f"{i:06d}"}).status_code,
                              range(100000, 100080)))
    assert Counter(codes)[400] <= 5, Counter(codes)


def test_active_reservation_cap_holds_under_parallel_requests(anon):
    giver, taker = login("cap_g@test.dev"), login("cap_t@test.dev")
    listings = [make_listing(giver, title=f"Cap {i}") for i in range(8)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda l: taker.post("/api/v1/reservations", json={"listing_id": l["id"]}).status_code, listings))
    active = taker.get("/api/v1/reservations?status=active").json()["items"]
    assert len(active) <= 3
    # rolled-back claims were released: inventory still adds up and matches the reservations that survived
    held = Counter()
    for r in active:
        held[r["listing_id"]] += r["quantity"]
    for l in listings:
        doc = anon.portal.call(db.listings.find_one, {"_id": l["id"]})
        assert doc["available"] + doc["reserved"] + doc["collected"] == doc["quantity_total"]
        assert doc["reserved"] == held[l["id"]]


def test_per_person_limit_holds_under_parallel_requests(anon):
    giver, taker = login("pp_g@test.dev"), login("pp_t@test.dev")
    listing = make_listing(giver, quantity=10, per_person_limit=2)
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(lambda _: taker.post("/api/v1/reservations", json={"listing_id": listing["id"], "quantity": 1}).status_code, range(6)))
    held = sum(r["quantity"] for r in taker.get("/api/v1/reservations?status=active").json()["items"] if r["listing_id"] == listing["id"])
    assert held <= 2


def test_refresh_token_reuse_ends_all_sessions(anon):
    email = "rt@test.dev"
    code = anon.post("/api/v1/auth/request-otp", json={"email": email}).json()["dev_otp"]
    anon.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    old = anon.cookies.get("wn_refresh")
    assert anon.post("/api/v1/auth/refresh").status_code == 200
    new = anon.cookies.get("wn_refresh")

    def use(token):
        anon.cookies.clear()
        anon.cookies.set("wn_refresh", token, domain="testserver.local", path="/api/v1/auth")
        return anon.post("/api/v1/auth/refresh").status_code

    # an immediate replay (two tabs racing) is rejected but does not end the session
    assert use(old) == 401
    # a replay long after rotation looks like theft: everything is revoked, including the newer token
    anon.portal.call(db.sessions.update_many, {"revoked": True, "rotated_at": {"$ne": None}},
                     {"$set": {"rotated_at": utcnow() - timedelta(hours=1)}})
    assert use(old) == 401
    assert use(new) == 401
    anon.cookies.clear()


# ---------------- inputs ----------------
def test_timezone_less_datetimes_do_not_crash(anon):
    giver, taker = login("nv_g@test.dev"), login("nv_t@test.dev")
    listing = make_listing(giver)
    r = taker.post("/api/v1/reservations", json={"listing_id": listing["id"], "pickup_time": "2030-01-01T10:00:00"})
    assert r.status_code == 201
    assert make_listing(giver, pickup_window_end="2030-01-01T10:00:00")["status"] == "active"
