"""Static data integrity and known demo outcomes; no installed packages required.

Run: python3 -m unittest discover -s tests -p test_demo_data.py -v
This reference check does not connect the fixtures to the application's API.
"""

import hashlib
import json
import unittest
from collections import Counter
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "demo"


class DemoDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = {path.name: json.loads(path.read_text()) for path in ROOT.glob("*.json")}
        cls.indexes = {
            name: {row["id"]: row for row in cls.files[name]}
            for name in ["roster.json", "destinations.json", "games.json", "hotels.json", "restaurants.json", "bus_rates.json", "package_templates.json", "scenarios.json"]
        }

    def test_manifest_and_checksums(self):
        manifest = self.files["manifest.json"]
        self.assertTrue(manifest["synthetic"])
        self.assertIn("NOT the organizers", manifest["source"])
        self.assertEqual(set(manifest["file_sha256"]), set(self.files) - {"manifest.json"})
        for name, checksum in manifest["file_sha256"].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), checksum)
        for name, count in manifest["record_counts"].items():
            self.assertEqual(len(self.files[name]), count)

    def test_unique_ids_and_references(self):
        for name, index in self.indexes.items():
            self.assertEqual(len(index), len(self.files[name]), name)
        for name in ["games.json", "hotels.json", "restaurants.json"]:
            for row in self.files[name]:
                self.assertIn(row["destination_id"], self.indexes["destinations.json"])
        for person in self.files["roster.json"]:
            self.assertEqual(person["team_id"], self.files["team.json"]["id"])
        self.assertEqual(Counter(row["role"] for row in self.files["roster.json"]), {"player": 25, "coach": 3, "staff": 2})
        for package in self.files["package_templates.json"]:
            self.assertIn(package["bus_rate_id"], self.indexes["bus_rates.json"])
            for game in self.files["games.json"]:
                for name, key in [("hotels.json", "hotel_tier"), ("restaurants.json", "restaurant_tier")]:
                    self.assertEqual(sum(row["destination_id"] == game["destination_id"] and row["tier"] == package[key] for row in self.files[name]), 1)

    def test_money_and_distances_are_nonnegative_integers(self):
        def inspect(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key.endswith(("_cents", "_miles", "_minutes")) and not isinstance(item, dict):
                        self.assertIs(type(item), int, key)
                        self.assertGreaterEqual(item, 0, key)
                    inspect(item)
            elif isinstance(value, list):
                for item in value:
                    inspect(item)
        for name, value in self.files.items():
            if name not in {"manifest.json", "rules.json"}:
                inspect(value)
        inspect(self.files["rules.json"]["defaults"])

    def test_availability_has_valid_ids_dates_and_no_duplicates(self):
        for category, filename, id_key, date_key in [
            ("hotels", "hotels.json", "hotel_id", "night"),
            ("restaurants", "restaurants.json", "restaurant_id", "date"),
            ("buses", "bus_rates.json", "bus_rate_id", "date"),
        ]:
            seen = set()
            for row in self.files["availability.json"][category]:
                self.assertIn(row[id_key], self.indexes[filename])
                date.fromisoformat(row[date_key])
                key = row[id_key], row[date_key]
                self.assertNotIn(key, seen)
                seen.add(key)
                for count_key in ["available_rooms", "available_buses"]:
                    if count_key in row:
                        self.assertIs(type(row[count_key]), int)
                        self.assertGreaterEqual(row[count_key], 0)

    def test_trip_dates_durations_and_availability_coverage(self):
        available = self.files["availability.json"]
        hotel_keys = {(row["hotel_id"], row["night"]) for row in available["hotels"]}
        restaurant_keys = {(row["restaurant_id"], row["date"]) for row in available["restaurants"]}
        bus_keys = {(row["bus_rate_id"], row["date"]) for row in available["buses"]}
        for game in self.files["games.json"]:
            depart = datetime.fromisoformat(game["suggested_departure_at"])
            kickoff = datetime.fromisoformat(game["kickoff_at"])
            returned = datetime.fromisoformat(game["suggested_return_at"])
            destination = self.indexes["destinations.json"][game["destination_id"]]
            self.assertEqual(kickoff.date().isoformat(), game["game_date"])
            self.assertLessEqual(depart + timedelta(minutes=destination["one_way_drive_minutes"]), kickoff - timedelta(minutes=game["arrive_before_kickoff_minutes"]))
            self.assertGreaterEqual(returned, kickoff + timedelta(minutes=game["game_duration_minutes"] + destination["one_way_drive_minutes"]))
            self.assertEqual((returned.date() - depart.date()).days + 1, game["billable_bus_days"])
            if game["hotel_nights"]:
                check_in = date.fromisoformat(game["hotel_check_in"])
                check_out = date.fromisoformat(game["hotel_check_out"])
                self.assertEqual((check_out - check_in).days, game["hotel_nights"])
                self.assertEqual(check_in, depart.date())
                for hotel in self.files["hotels.json"]:
                    if hotel["destination_id"] == game["destination_id"]:
                        for offset in range(game["hotel_nights"]):
                            self.assertIn((hotel["id"], (check_in + timedelta(days=offset)).isoformat()), hotel_keys)
            else:
                self.assertIsNone(game["hotel_check_in"])
                self.assertIsNone(game["hotel_check_out"])
            for offset in range(game["billable_bus_days"]):
                day = (depart.date() + timedelta(days=offset)).isoformat()
                for bus in self.files["bus_rates.json"]:
                    self.assertIn((bus["id"], day), bus_keys)
                for restaurant in self.files["restaurants.json"]:
                    if restaurant["destination_id"] == game["destination_id"]:
                        self.assertIn((restaurant["id"], day), restaurant_keys)

    def evaluate_scenario(self, scenario):
        """Small independent reference calculator for fixture assertions only."""
        trip = scenario["trip"]
        if "game_date" not in trip:
            return {"status": "missing_information"}
        counts = [trip[role] for role in ["players", "coaches", "staff"]]
        if any(count < 0 for count in counts) or sum(counts) == 0:
            return {"status": "invalid_input"}
        game = next((row for row in self.files["games.json"] if row["opponent"] == trip["opponent"] and row["game_date"] == trip["game_date"]), None)
        if not game:
            return {"status": "unsupported_game"}
        # This exact phrase fixture stands in for a future structured departure parser.
        # It is not natural-language parsing and is not used by the application.
        if trip["departure_constraint"].startswith("Cannot leave before 18:00"):
            kickoff = datetime.fromisoformat(game["kickoff_at"])
            earliest_departure = kickoff.replace(hour=18, minute=0)
            route = self.indexes["destinations.json"][game["destination_id"]]
            self.assertGreater(earliest_departure + timedelta(minutes=route["one_way_drive_minutes"]), kickoff - timedelta(minutes=game["arrive_before_kickoff_minutes"]))
            return {"status": "conflicting_constraints"}
        travelers = sum(counts)
        rooms = sum((n + trip["room_occupancy"] - 1) // trip["room_occupancy"] for n in counts) if game["hotel_nights"] else 0
        available = self.files["availability.json"]
        departure_day = date.fromisoformat(game["suggested_departure_at"][:10])
        trip_dates = {(departure_day + timedelta(days=i)).isoformat() for i in range(game["billable_bus_days"])}
        packages = {}
        bus_counts = {}
        for template in self.files["package_templates.json"]:
            bus = self.indexes["bus_rates.json"][template["bus_rate_id"]]
            capacity = min(bus["passenger_seats"], trip["seats_per_bus"])
            bus_count = (travelers + capacity - 1) // capacity
            bus_inventory = [r for r in available["buses"] if r["bus_rate_id"] == bus["id"] and r["date"] in trip_dates]
            if len(bus_inventory) != len(trip_dates) or any(r["available_buses"] < bus_count for r in bus_inventory):
                continue
            restaurant = next(r for r in self.files["restaurants.json"] if r["destination_id"] == game["destination_id"] and r["tier"] == template["restaurant_tier"])
            meals_inventory = [r for r in available["restaurants"] if r["restaurant_id"] == restaurant["id"] and r["date"] in trip_dates]
            if restaurant["meal_rate_cents"] > Decimal(trip["meal_allowance"]) * 100 or travelers > restaurant["max_people_per_order"]:
                continue
            if len(meals_inventory) != len(trip_dates) or not all(r["group_orders_accepted"] for r in meals_inventory):
                continue
            lodging = 0
            if rooms:
                hotel = next(h for h in self.files["hotels.json"] if h["destination_id"] == game["destination_id"] and h["tier"] == template["hotel_tier"])
                nights = {(departure_day + timedelta(days=i)).isoformat() for i in range(game["hotel_nights"])}
                hotel_inventory = [r for r in available["hotels"] if r["hotel_id"] == hotel["id"] and r["night"] in nights]
                if trip["room_occupancy"] > hotel["max_people_per_room"] or len(hotel_inventory) != len(nights) or any(r["available_rooms"] < rooms for r in hotel_inventory):
                    continue
                lodging = rooms * game["hotel_nights"] * hotel["room_rate_cents"]
            packages[template["id"]] = bus_count * game["billable_bus_days"] * bus["daily_rate_cents"] + lodging + travelers * game["paid_meals_per_person"] * restaurant["meal_rate_cents"]
            bus_counts[template["id"]] = bus_count
        within_budget = [key for key, cost in packages.items() if cost <= Decimal(trip["budget"]) * 100]
        return {
            "status": "no_feasible_package" if not packages else "priced" if within_budget else "no_package_within_budget",
            "travelers": travelers, "rooms": rooms, "hotel_nights": game["hotel_nights"],
            "billable_bus_days": game["billable_bus_days"], "package_totals_cents": packages,
            "within_budget": within_budget, "available_packages": list(packages),
            "buses_per_package": next(iter(bus_counts.values()), None),
        }

    def test_scenario_expected_outcomes(self):
        for scenario in self.files["scenarios.json"]:
            with self.subTest(scenario=scenario["id"]):
                actual = self.evaluate_scenario(scenario)
                for key, value in scenario["expected"].items():
                    self.assertEqual(actual[key], value, key)


if __name__ == "__main__":
    unittest.main()
