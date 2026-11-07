from app.db.mongo import db


async def org_for(user_id: str) -> dict | None:
    return await db.organizations.find_one({"owner_id": user_id}, {"proof_file_id": 0})


def badges(user: dict, org: dict | None) -> list[str]:
    result = ["email_verified"] if user.get("email_verified") else []
    if org and org.get("status") == "verified":
        result.append("verified_organization")
    if user.get("role") == "admin":
        result.append("team")
    return result


def public_user(user: dict, org: dict | None = None) -> dict:
    return {
        "id": user["_id"], "display_name": user.get("display_name"), "avatar_file_id": user.get("avatar_file_id"),
        "bio": user.get("bio", ""), "locality": user.get("locality", ""), "member_since": user.get("created_at"),
        "stats": user.get("stats", {}), "badges": badges(user, org),
        "organization": {"id": org["_id"], "name": org["name"], "status": org["status"]}
        if org and org.get("status") == "verified" else None,
    }


async def serialize_me(user: dict) -> dict:
    org = await org_for(user["_id"])
    data = public_user(user, org)
    data.update({
        "email": user["email"], "role": user.get("role", "user"), "status": user.get("status", "active"),
        "saved_location": user.get("saved_location"), "saved_listing_ids": user.get("saved_listing_ids", []),
        "restricted_until": user.get("restricted_until"), "onboarded": user.get("onboarded", False),
        "organization": {"id": org["_id"], "name": org["name"], "status": org["status"]} if org else None,
    })
    return data


async def user_summaries(ids: set[str]) -> dict[str, dict]:
    users = await db.users.find({"_id": {"$in": list(ids)}}).to_list(None)
    return {u["_id"]: {"id": u["_id"], "display_name": u.get("display_name"),
                       "avatar_file_id": u.get("avatar_file_id"), "locality": u.get("locality", "")} for u in users}
