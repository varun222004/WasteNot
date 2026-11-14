"""Shared pydantic types."""
from datetime import datetime, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from pydantic import AfterValidator

IST = ZoneInfo("Asia/Kolkata")


def _aware(value: datetime | None) -> datetime | None:
    """Timezone-less input is read as India time (the pilot market); everything is stored as UTC."""
    if value is None:
        return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=IST)
    return value.astimezone(timezone.utc)


AwareDatetime = Annotated[datetime, AfterValidator(_aware)]
