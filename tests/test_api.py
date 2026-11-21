import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


@pytest.fixture
def trip():
    return {
        "opponent": "Synthetic Opponent",
        "game_date": "2026-12-01",
        "players": 48,
        "coaches": 2,
        "staff": 1,
        "budget": "5000.00",
        "departure_constraint": "Leave after 3 PM Friday",
        "seats_per_bus": 50,
        "room_occupancy": 2,
        "meal_allowance": "20.00",
    }


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize("players,expected", [(47, 1), (48, 2)])
def test_bus_capacity_rounds_up(trip, players, expected):
    trip["players"] = players
    response = client.post("/api/trips/preview", json=trip)
    assert response.status_code == 200
    result = response.json()
    assert result["total_travelers"] == players + 3
    assert result["buses_needed"] == expected
    assert result["pricing_available"] is False
    assert result["trip"]["budget"] == "5000.00"


@pytest.mark.parametrize("field,value", [
    ("players", -1), ("players", 1.5), ("players", True),
    ("seats_per_bus", 0), ("room_occupancy", 0),
    ("opponent", "   "), ("game_date", "2026-02-30"),
    ("budget", "NaN"), ("budget", "0"), ("budget", "1.001"),
    ("meal_allowance", "-1"), ("departure_constraint", ""),
])
def test_invalid_inputs_are_rejected(trip, field, value):
    trip[field] = value
    assert client.post("/api/trips/preview", json=trip).status_code == 422


def test_empty_team_is_rejected(trip):
    trip.update(players=0, coaches=0, staff=0)
    assert client.post("/api/trips/preview", json=trip).status_code == 422


def test_missing_details_are_rejected():
    assert client.post("/api/trips/preview", json={}).status_code == 422
