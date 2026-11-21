from fastapi import APIRouter

from backend.models.trip import TripPreview, TripRequest

router = APIRouter(prefix="/trips", tags=["trips"])


@router.post("/preview", response_model=TripPreview)
def preview_trip(trip: TripRequest) -> TripPreview:
    travelers = trip.players + trip.coaches + trip.staff
    return TripPreview(
        trip=trip,
        total_travelers=travelers,
        buses_needed=(travelers + trip.seats_per_bus - 1) // trip.seats_per_bus,
        message=(
            "Bus count uses your entered seat capacity. "
            "Pricing and room allocation await the organizers' data pack. "
            "No Aivana call has been made."
        ),
    )
