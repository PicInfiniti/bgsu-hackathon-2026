from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TripRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    opponent: str = Field(min_length=1, max_length=120)
    game_date: date
    players: int = Field(ge=0, le=500, strict=True)
    coaches: int = Field(ge=0, le=500, strict=True)
    staff: int = Field(ge=0, le=500, strict=True)
    budget: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    departure_constraint: str = Field(min_length=1, max_length=500)
    seats_per_bus: int = Field(ge=1, le=100, strict=True)
    room_occupancy: int = Field(ge=1, le=8, strict=True)
    meal_allowance: Decimal = Field(ge=0, max_digits=8, decimal_places=2)

    @model_validator(mode="after")
    def require_travelers(self):
        if self.players + self.coaches + self.staff == 0:
            raise ValueError("At least one traveler is required")
        return self


class TripPreview(BaseModel):
    trip: TripRequest
    total_travelers: int
    buses_needed: int
    pricing_available: bool = False
    message: str
