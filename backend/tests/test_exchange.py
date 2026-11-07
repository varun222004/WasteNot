from concurrent.futures import ThreadPoolExecutor

from tests.conftest import login, make_listing


def test_public_listing_hides_exact_location(anon):
    giver = login("giver1@test.dev")
    listing = make_listing(giver)
    public = anon.get(f"/api/v1/listings/{listing['id']}").json()
    assert "private_location" not in public
    assert public["public_point"]["coordinates"] == [77.64, 12.98]
    found = anon.get("/api/v1/listings", params={"lat": 12.97, "lng": 77.64}).json()["items"]
    assert any(i["id"] == listing["id"] for i in found)
    assert all("private_location" not in i for i in found)


def test_reservation_lifecycle_and_inventory(anon):
    giver, taker = login("giver2@test.dev"), login("taker2@test.dev")
    listing = make_listing(giver)
    assert giver.post("/api/v1/reservations", json={"listing_id": listing["id"]}).status_code == 400  # self-reservation
    r = taker.post("/api/v1/reservations", json={"listing_id": listing["id"], "quantity": 2}).json()
    assert r["status"] == "requested" and "pickup_location" not in r
    l = anon.get(f"/api/v1/listings/{listing['id']}").json()
    assert (l["available"], l["reserved"], l["collected"]) == (1, 2, 0)

    act = lambda c, a: c.post(f"/api/v1/reservations/{r['id']}/actions", json={"action": a})
    assert act(giver, "accept").json()["status"] == "accepted"
    detail = taker.get(f"/api/v1/reservations/{r['id']}").json()
    assert detail["pickup_location"]["address"] == "12 Secret Lane"
    conv = detail["conversation_id"]
    assert taker.post(f"/api/v1/messages/conversations/{conv}", json={"body": "On my way"}).status_code == 201
    outsider = login("outsider2@test.dev")
    assert outsider.get(f"/api/v1/messages/conversations/{conv}").status_code == 404

    assert act(taker, "confirm").json()["status"] == "accepted"
    assert act(giver, "confirm").json()["status"] == "completed"
    l = anon.get(f"/api/v1/listings/{listing['id']}").json()
    assert (l["available"], l["reserved"], l["collected"]) == (1, 0, 2)
    assert l["status"] == "active"  # never auto-completed
    assert giver.get("/api/v1/users/me").json()["stats"]["given"] == 2


def test_decline_and_cancel_release_inventory(anon):
    giver, taker = login("giver3@test.dev"), login("taker3@test.dev")
    listing = make_listing(giver, quantity=1)
    r = taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).json()
    giver.post(f"/api/v1/reservations/{r['id']}/actions", json={"action": "decline"})
    assert anon.get(f"/api/v1/listings/{listing['id']}").json()["available"] == 1
    r2 = taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).json()
    taker.post(f"/api/v1/reservations/{r2['id']}/actions", json={"action": "cancel"})
    assert anon.get(f"/api/v1/listings/{listing['id']}").json()["available"] == 1


def test_concurrent_reservations_never_oversell(anon):
    giver = login("giver4@test.dev")
    listing = make_listing(giver, quantity=2)
    takers = [login(f"rush{i}@test.dev") for i in range(6)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        codes = list(pool.map(lambda c: c.post("/api/v1/reservations", json={"listing_id": listing["id"]}).status_code, takers))
    assert codes.count(201) == 2
    l = anon.get(f"/api/v1/listings/{listing['id']}").json()
    assert l["available"] == 0 and l["reserved"] == 2


def test_blocked_users_cannot_reserve(anon):
    giver, taker = login("giver5@test.dev"), login("taker5@test.dev")
    listing = make_listing(giver)
    taker_id = taker.get("/api/v1/users/me").json()["id"]
    giver.post(f"/api/v1/users/{taker_id}/block")
    assert taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).status_code == 403


def test_wanted_request_offer_flow(anon):
    asker, giver = login("asker6@test.dev"), login("giver6@test.dev")
    req = asker.post("/api/v1/requests", json={"title": "Need a kettle", "description": "Electric kettle please",
                                               "category": "household", "locality": "Jayanagar"}).json()
    listing = make_listing(giver, category="household", title="Kettle")
    offer = giver.post(f"/api/v1/requests/{req['id']}/offers", json={"listing_id": listing["id"]}).json()
    res = asker.post(f"/api/v1/requests/{req['id']}/offers/{offer['id']}/accept").json()
    assert asker.get(f"/api/v1/reservations/{res['reservation_id']}").json()["status"] == "accepted"
    assert anon.get(f"/api/v1/requests/{req['id']}").json()["status"] == "fulfilled"


def test_report_and_admin_moderation(anon):
    user, admin = login("reporter7@test.dev"), login("admin@test.dev")
    listing = make_listing(login("giver7@test.dev"))
    assert user.post("/api/v1/reports", json={"target_type": "listing", "target_id": listing["id"], "reason": "misleading"}).status_code == 201
    assert user.get("/api/v1/admin/reports").status_code == 403
    reports = admin.get("/api/v1/admin/reports").json()
    rid = next(r["id"] for r in reports if r["target_id"] == listing["id"])
    assert admin.post(f"/api/v1/admin/reports/{rid}/resolve", json={"action": "suspend_user", "note": "test"}).status_code == 200
    assert anon.get(f"/api/v1/users/{listing['owner_id']}").status_code == 404


def test_food_rules_enforced(anon):
    giver = login("cook8@test.dev")
    bad = {"category": "food", "mode": "food", "title": "Rice", "description": "Leftover rice from lunch",
           "pickup_window_start": "2020-01-01T10:00:00Z", "pickup_window_end": "2020-01-01T11:00:00Z",
           "food": {"food_type": "cooked", "prepared_at": "2020-01-01T08:00:00Z", "safe_until": "2020-01-01T12:00:00Z",
                    "diet": "veg", "allergen_status": "unknown", "storage_instructions": "Keep cool",
                    "declaration": {"not_expired": True, "not_opened": True, "no_raw_meat_or_fish": True,
                                    "no_alcohol": True, "information_accurate": True}}}
    photo = make_listing(giver)["photo_ids"][0]
    r = giver.post("/api/v1/listings", json={**bad, "quantity": 2, "photo_ids": [photo],
                                             "location": {"locality": "Indiranagar", "lat": 12.97, "lng": 77.64}})
    assert r.status_code == 422


def test_organization_verification_and_completion(anon):
    owner, admin, taker = login("org9@test.dev"), login("admin@test.dev"), login("taker9@test.dev")
    from tests.conftest import PNG
    proof = owner.post("/api/v1/files", files={"file": ("p.png", PNG, "image/png")}, data={"purpose": "org_proof"}).json()["id"]
    assert anon.get(f"/api/v1/files/{proof}").status_code == 404  # proof is private
    org = owner.post("/api/v1/organizations", json={"name": "Test Kitchen", "description": "Community kitchen in test",
                                                     "category": "community_kitchen", "contact_email": "k@test.dev",
                                                     "contact_phone": "9999999999", "address": "1 Main Road", "locality": "Jayanagar",
                                                     "location": {"lat": 12.925, "lng": 77.5938}, "proof_file_id": proof}).json()
    assert org["status"] == "pending"
    admin.post(f"/api/v1/admin/organizations/{org['id']}/review", json={"status": "verified", "note": ""})
    listing = make_listing(owner, as_organization=True, title="Org books")
    r = taker.post("/api/v1/reservations", json={"listing_id": listing["id"]}).json()
    assert r["status"] == "accepted"  # auto-accepted for organizations
    done = owner.post(f"/api/v1/reservations/{r['id']}/actions", json={"action": "confirm"}).json()
    assert done["status"] == "completed"
