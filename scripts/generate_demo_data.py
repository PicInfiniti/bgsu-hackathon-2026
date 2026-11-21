"""Generate the committed fictional demo pack using only Python's standard library."""

import hashlib
import json
from datetime import date, timedelta
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "data" / "demo"


def build_dataset():
    destinations = []
    games = []
    hotels = []
    restaurants = []
    availability = {"hotels": [], "restaurants": [], "buses": []}
    places = [
        ("Maplebridge", "Maplebridge Owls", "Maple Field", 145, 170, "2026-12-04", 1, 2, 4),
        ("Cedarvale", "Cedarvale Foxes", "Cedar Stadium", 82, 100, "2026-12-11", 0, 1, 2),
        ("Pinehaven", "Pinehaven Bears", "Pine Arena", 230, 255, "2026-12-18", 1, 2, 4),
        ("Silverbrook", "Silverbrook Falcons", "Silver Park", 310, 340, "2027-01-08", 2, 3, 7),
        ("Willowcrest", "Willowcrest Lynx", "Willow Field", 190, 215, "2027-01-15", 1, 2, 4),
        ("Ashford Glen", "Ashford Glen Badgers", "Glen Stadium", 165, 185, "2027-01-22", 1, 2, 4),
        ("Elmshore", "Elmshore Herons", "Elmshore Arena", 275, 300, "2027-01-29", 1, 2, 4),
        ("Birch Hollow", "Birch Hollow Wolves", "Birch Park", 120, 145, "2027-02-05", 1, 2, 4),
    ]
    tiers = [("economy", 9500, 1200, 8), ("standard", 13900, 1800, 4), ("comfort", 19900, 2600, 1)]
    for index, (city, opponent, stadium, miles, minutes, day, nights, trip_days, meals) in enumerate(places, 1):
        dest_id, game_id = f"destination-{index:02}", f"game-{index:02}"
        game_day = date.fromisoformat(day)
        departure = game_day - timedelta(days=nights)
        destinations.append({
            "id": dest_id, "name": city, "stadium_name": stadium,
            "timezone": "America/New_York", "origin_id": "home-campus",
            "one_way_distance_miles": miles, "one_way_drive_minutes": minutes,
            "route_note": "Invented direct route; not measured from a map. Breaks are not included.",
        })
        games.append({
            "id": game_id, "destination_id": dest_id, "opponent": opponent,
            "game_date": day, "kickoff_at": f"{day}T14:00:00-05:00",
            "game_duration_minutes": 120,
            "arrive_before_kickoff_minutes": 90,
            "suggested_departure_at": f"{departure}T09:00:00-05:00",
            "suggested_return_at": f"{day}T23:00:00-05:00",
            "hotel_check_in": departure.isoformat() if nights else None,
            "hotel_check_out": day if nights else None,
            "hotel_nights": nights, "billable_bus_days": trip_days,
            "paid_meals_per_person": meals,
            "notes": "Same-day trip; skip lodging costs and availability." if not nights else "Overnight demo trip; all paid meals are explicitly counted.",
        })
        for tier, room_price, meal_price, distance in tiers:
            hotel_id = f"hotel-{index:02}-{tier}"
            restaurant_id = f"restaurant-{index:02}-{tier}"
            hotels.append({
                "id": hotel_id, "destination_id": dest_id,
                "name": f"{city} {dict(economy='Trail Lodge', standard='Team Inn', comfort='Stadium Suites')[tier]}",
                "tier": tier, "room_rate_cents": room_price + (index - 1) * 500,
                "rate_unit": "USD cents per room per night; tax and fees included",
                "distance_to_stadium_miles": distance,
                "drive_to_stadium_minutes": distance * 3 + 2,
                "max_people_per_room": 4, "breakfast_included": False,
                "check_in_local": "15:00", "check_out_local": "11:00",
                "amenities": ["bus_parking", "wifi"] + (["meeting_room"] if tier != "economy" else []),
                "accessibility": "Step-free entry and accessible rooms in this fictional fixture; accessible-room inventory is not modeled.",
            })
            restaurants.append({
                "id": restaurant_id, "destination_id": dest_id,
                "name": f"{city} {dict(economy='Team Kitchen', standard='Harvest Table', comfort='Victory Dining')[tier]}",
                "tier": tier, "meal_rate_cents": meal_price + (index - 1) * 50,
                "rate_unit": "USD cents per person per paid meal; tax, tip, and drinks included",
                "distance_to_stadium_miles": distance + 1,
                "drive_to_stadium_minutes": (distance + 1) * 3 + 2,
                "service_type": "preordered_group_meals", "service_duration_minutes": 45,
                "pickup_window_local": {"opens": "06:00", "closes": "22:00"},
                "max_people_per_order": 120,
                "dietary_options": ["standard", "vegetarian", "vegan", "gluten_free"],
                "dietary_note": "Options are fictional labels; no medical or allergen guarantees.",
            })
            for offset in range(nights):
                availability["hotels"].append({
                    "hotel_id": hotel_id,
                    "night": (departure + timedelta(days=offset)).isoformat(),
                    "available_rooms": (12 if tier == "economy" else 14 if tier == "standard" else 40) if index == 6 else 40,
                })
            for offset in range(trip_days):
                availability["restaurants"].append({
                    "restaurant_id": restaurant_id,
                    "date": (departure + timedelta(days=offset)).isoformat(),
                    "group_orders_accepted": not (index == 7 and tier == "economy"),
                })
    bus_rates = [
        {"id": "bus-compact", "name": "Demo Compact Coach", "passenger_seats": 40, "daily_rate_cents": 72000, "amenities": ["air_conditioning"]},
        {"id": "bus-standard", "name": "Demo Standard Coach", "passenger_seats": 50, "daily_rate_cents": 90000, "amenities": ["air_conditioning", "restroom"]},
        {"id": "bus-comfort", "name": "Demo Comfort Coach", "passenger_seats": 56, "daily_rate_cents": 125000, "amenities": ["air_conditioning", "restroom", "wifi", "power_outlets"]},
    ]
    for bus in bus_rates:
        bus.update({
            "rate_unit": "USD cents per bus per billable calendar day; tax, fuel, driver, driver lodging/meals, parking, and tolls included",
            "distance_surcharge_cents": 0,
            "notes": "Flat fictional daily quote, independent of mileage; no extra driver or overtime charge.",
        })
        for game in games:
            first_day = date.fromisoformat(game["suggested_departure_at"][:10])
            for offset in range(game["billable_bus_days"]):
                availability["buses"].append({
                    "bus_rate_id": bus["id"], "date": (first_day + timedelta(days=offset)).isoformat(),
                    "available_buses": 3,
                })
    roster = []
    for role, count in [("player", 25), ("coach", 3), ("staff", 2)]:
        for index in range(1, count + 1):
            roster.append({
                "id": f"{role}-{index:02}", "display_name": f"Demo {role.title()} {index:02}",
                "role": role, "team_id": "demo-team", "active": True,
            })
    templates = [{
        "id": f"package-{tier}", "label": tier.title(), "hotel_tier": tier,
        "restaurant_tier": tier, "bus_rate_id": "bus-comfort" if tier == "comfort" else "bus-standard",
        "description": description,
    } for tier, description in [
        ("economy", "Lower room and meal rates, with longer stadium transfers."),
        ("standard", "Moderate room and meal rates, closer to the stadium."),
        ("comfort", "Closest lodging and meals, with a comfort coach at a higher rate."),
    ]]
    baseline = {
        "opponent": games[0]["opponent"], "game_date": games[0]["game_date"],
        "players": 25, "coaches": 3, "staff": 2, "budget": "6500.00",
        "departure_constraint": "Leave no earlier than 09:00 on 2026-12-03 (America/New_York)",
        "seats_per_bus": 50, "room_occupancy": 2, "meal_allowance": "30.00",
    }

    def scenario(identifier, title, overrides, expected, game_index=0):
        game = games[game_index]
        trip = baseline | {
            "opponent": game["opponent"], "game_date": game["game_date"],
            "departure_constraint": f"Leave no earlier than 09:00 on {game['suggested_departure_at'][:10]} (America/New_York)",
        } | overrides
        return {"id": identifier, "title": title, "trip": trip, "expected": expected}

    scenarios = [
        scenario("scenario-baseline", "Standard overnight trip", {}, {
            "status": "priced", "travelers": 30, "rooms": 16,
            "package_totals_cents": {"package-economy": 476000, "package-standard": 618400, "package-comfort": 880400},
            "within_budget": ["package-economy", "package-standard"],
        }),
        scenario("scenario-budget-too-low", "No package fits the budget", {"budget": "1000.00"}, {"status": "no_package_within_budget"}),
        scenario("scenario-exact-bus", "Exactly 50 travelers", {"players": 45, "budget": "20000.00"}, {"status": "priced", "travelers": 50, "rooms": 26, "buses_per_package": 1}),
        scenario("scenario-extra-bus", "51 travelers need another bus", {"players": 46, "budget": "20000.00"}, {"status": "priced", "travelers": 51, "rooms": 26, "buses_per_package": 2}),
        scenario("scenario-room-rounding", "Round each role's rooms separately", {"players": 25, "coaches": 1, "staff": 1}, {"status": "priced", "travelers": 27, "rooms": 15}),
        scenario("scenario-same-day", "Same-day trip has no lodging", {}, {"status": "priced", "hotel_nights": 0, "rooms": 0}, 1),
        scenario("scenario-two-nights", "Two hotel nights and three bus days", {"budget": "20000.00"}, {"status": "priced", "hotel_nights": 2, "billable_bus_days": 3}, 3),
        scenario("scenario-hotel-shortage", "Only comfort has enough rooms", {"budget": "20000.00"}, {"status": "priced", "available_packages": ["package-comfort"]}, 5),
        scenario("scenario-meal-unavailable", "Economy meal orders unavailable", {"budget": "20000.00"}, {"status": "priced", "available_packages": ["package-standard", "package-comfort"]}, 6),
        scenario("scenario-meal-cap", "Meal allowance excludes higher prices", {"meal_allowance": "15.00"}, {"status": "priced", "available_packages": ["package-economy"]}),
        scenario("scenario-no-meal-options", "Meal allowance excludes all options", {"meal_allowance": "5.00"}, {"status": "no_feasible_package"}),
        scenario("scenario-bus-shortage", "More buses required than available", {"players": 160, "coaches": 0, "staff": 0, "room_occupancy": 4, "budget": "50000.00"}, {"status": "no_feasible_package"}),
        scenario("scenario-zero-team", "Reject an empty team", {"players": 0, "coaches": 0, "staff": 0}, {"status": "invalid_input"}),
        scenario("scenario-negative-count", "Reject a negative traveler count", {"players": -1}, {"status": "invalid_input"}),
        scenario("scenario-unknown-opponent", "Reject an unsupported opponent", {"opponent": "Unknown Demo Team"}, {"status": "unsupported_game"}),
        scenario("scenario-wrong-date", "Known opponent on an unsupported date", {"game_date": "2026-12-05"}, {"status": "unsupported_game"}),
        scenario("scenario-late-departure", "Departure constraint makes arrival impossible", {"departure_constraint": "Cannot leave before 18:00 on 2026-12-04 (America/New_York)"}, {"status": "conflicting_constraints"}),
        scenario("scenario-occupancy-too-high", "Room setting exceeds hotel occupancy", {"room_occupancy": 5}, {"status": "no_feasible_package"}),
        scenario("scenario-missing-date", "Ask for a missing required date", {}, {"status": "missing_information"}),
    ]
    del scenarios[-1]["trip"]["game_date"]
    return {
        "team.json": {"id": "demo-team", "name": "picInfiniti Demo Falcons", "origin": {"id": "home-campus", "name": "Demo Home Campus", "timezone": "America/New_York"}},
        "roster.json": roster, "destinations.json": destinations, "games.json": games,
        "hotels.json": hotels, "restaurants.json": restaurants, "bus_rates.json": bus_rates,
        "availability.json": availability, "package_templates.json": templates,
        "scenarios.json": scenarios,
        "rules.json": {
            "currency": "USD", "money_storage": "integer_cents", "tax_and_fees_included": True,
            "timezone": "America/New_York", "all_prices_are_estimates": True,
            "defaults": {"seats_per_bus": 50, "room_occupancy": 2, "meal_allowance_cents": 2000},
            "traveler_count": "players + coaches + staff; include every traveler in buses, lodging, and paid meals",
            "bus_capacity": "min(request.seats_per_bus, selected_bus.passenger_seats); driver has a separate seat",
            "bus_count": "ceil(total_travelers / effective_bus_capacity)",
            "bus_cost_cents": "bus_count * billable_bus_days * daily_rate_cents",
            "bus_days": "Use scheduled billable calendar days, not elapsed 24-hour periods. Reject custom durations without supported data.",
            "room_groups": ["players", "coaches", "staff"],
            "room_count": "Sum ceil(role_count / room_occupancy) for each role separately; zero-count roles use zero rooms. Same-day trips use zero rooms.",
            "room_restrictions": "No cross-role room sharing. All hotels must support the requested occupancy; reject that hotel if it exceeds max_people_per_room. No room-level accessibility or gender assignments are modeled.",
            "lodging_cost_cents": "room_count * hotel_nights * room_rate_cents",
            "meal_cost_cents": "total_travelers * paid_meals_per_person * meal_rate_cents",
            "meal_allowance": "Maximum allowed price per person per paid meal; compare inclusive meal_rate_cents with the user allowance. It is a cap, not an extra cost.",
            "meals": "Use the explicit scheduled paid meal count. Every traveler receives the same number. No free breakfasts or extra allowances are added.",
            "availability": "Require enough rooms on every occupied night, buses on every billable day, and accepted restaurant orders on every trip day. Missing availability means unsupported, not unlimited. No reservations are created.",
            "restaurant_capacity": "All travelers must fit in a single group order; no split orders or extra fees are modeled.",
            "package_selection": "For each template, match hotel and restaurant tiers at the selected game's destination, plus its bus_rate_id. Same-day trips skip hotel selection and checks.",
            "trip_dates": "Use the game schedule's suggested departure/return and durations only. Departure is on the hotel check-in day when lodging is required. Check-in is after 15:00; checkout is by 11:00 on game day. Meals/itinerary times still need application scheduling.",
            "total_cost_cents": "bus_cost_cents + lodging_cost_cents + meal_cost_cents",
            "budget_check": "total_cost_cents <= request budget converted exactly to cents",
            "rounding": "Round capacities upward with integer arithmetic; sum prices in cents. Reject monetary inputs with more than two decimal places.",
            "count_only_requests": "Aggregate requests may exceed the 30-person sample roster for capacity stress demos. Individual room assignments require actual roster IDs and cannot invent additional people.",
            "unsupported": "Do not extrapolate prices, dates, routes, hotel inventory, or service availability. Explain missing information or infeasible constraints.",
        },
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    files = build_dataset()
    checksums = {}
    counts = {}
    for name, value in sorted(files.items()):
        content = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()
        (OUTPUT / name).write_bytes(content)
        checksums[name] = hashlib.sha256(content).hexdigest()
        if isinstance(value, list):
            counts[name] = len(value)
    manifest = {
        "dataset_id": "picinfiniti-demo-v1", "schema_version": 1,
        "title": "picInfiniti fictional away-game demo data", "created_on": "2026-11-20",
        "source": "Created by picInfiniti for this demo; NOT the organizers' supplied pack",
        "synthetic": True,
        "disclaimer": "All people, opponents, businesses, routes, prices, distances, travel times, and inventory are invented. No real availability or booking is represented.",
        "generation": "Deterministic authored fixtures; no randomness, network calls, external records, or clock-dependent values.",
        "record_counts": counts, "file_sha256": checksums,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {len(files) + 1} JSON files to {OUTPUT}")
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
