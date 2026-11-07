from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.catalog import REPORT_REASONS
from app.core.deps import get_current_user
from app.db.mongo import db
from app.db.utils import new_id, utcnow

router = APIRouter(prefix="/reports", tags=["reports"])
TARGETS = {"listing": "listings", "user": "users", "organization": "organizations", "request": "wanted_requests"}


class ReportCreate(BaseModel):
    target_type: Literal["listing", "user", "organization", "request"]
    target_id: str
    reason: str
    details: str = Field(default="", max_length=1000)


@router.post("", status_code=201)
async def create(body: ReportCreate, user: dict = Depends(get_current_user)):
    if body.reason not in REPORT_REASONS:
        raise HTTPException(status_code=422, detail="Choose a reason")
    if not await db[TARGETS[body.target_type]].find_one({"_id": body.target_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Nothing to report")
    if body.target_type == "user" and body.target_id == user["_id"]:
        raise HTTPException(status_code=400, detail="You can't report yourself")
    doc = {"_id": new_id(), "reporter_id": user["_id"], **body.model_dump(), "status": "open",
           "priority": "high" if body.reason in ("unsafe_food", "harassment") else "normal",
           "resolution": None, "created_at": utcnow()}
    await db.reports.insert_one(doc)
    return {"id": doc["_id"], "status": "open"}
