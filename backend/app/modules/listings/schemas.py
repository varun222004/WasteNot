from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class FoodDeclaration(BaseModel):
    not_expired: bool
    not_opened: bool
    no_raw_meat_or_fish: bool
    no_alcohol: bool
    information_accurate: bool


class FoodInfo(BaseModel):
    food_type: Literal["cooked", "packaged"]
    prepared_at: datetime | None = None
    best_before: date | None = None
    safe_until: datetime
    diet: Literal["veg", "non_veg", "egg"]
    allergen_status: Literal["known", "none_declared", "unknown"]
    allergens: list[str] = Field(default_factory=list, max_length=14)
    storage_instructions: str = Field(min_length=3, max_length=300)
    sealed: bool = False
    declaration: FoodDeclaration


class LocationIn(BaseModel):
    locality: str = Field(min_length=2, max_length=60)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    public_pickup_point: str | None = Field(default=None, max_length=120)
    private_address: str | None = Field(default=None, max_length=200)
    pickup_instructions: str | None = Field(default=None, max_length=300)


class ListingCreate(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=10, max_length=1500)
    category: str
    mode: Literal["giveaway", "food"]
    quantity: int = Field(ge=1, le=500)
    per_person_limit: int | None = Field(default=None, ge=1, le=50)
    condition: Literal["new", "like_new", "good", "fair"] | None = None
    photo_ids: list[str] = Field(min_length=1, max_length=5)
    location: LocationIn
    pickup_window_start: datetime | None = None
    pickup_window_end: datetime | None = None
    expires_at: datetime | None = None
    food: FoodInfo | None = None
    as_organization: bool = False

    @field_validator("title", "description")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class ListingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=80)
    description: str | None = Field(default=None, min_length=10, max_length=1500)
    quantity: int | None = Field(default=None, ge=1, le=500)
    per_person_limit: int | None = Field(default=None, ge=1, le=50)
    condition: Literal["new", "like_new", "good", "fair"] | None = None
    photo_ids: list[str] | None = Field(default=None, min_length=1, max_length=5)
    location: LocationIn | None = None
    pickup_window_start: datetime | None = None
    pickup_window_end: datetime | None = None
    expires_at: datetime | None = None
