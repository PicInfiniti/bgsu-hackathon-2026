# picInfiniti static demo data

**All data is fictional, created by picInfiniti for the demo. This is not the organizers' supplied data pack.** No prices, inventory, routes, travel times, names, or distances describe real services or people. Business and destination names are invented; any resemblance is incidental. Every cost must be displayed as an estimate. No reservations are created.

The JSON files are static and ready to read using Python's `json` module. Each list record has a stable `id`. References use IDs, not display names. Times use the `America/New_York` zone; the scheduled winter dates have explicit `-05:00` offsets. No coordinates, external services, or database are needed.

## Contents

| File | Contents |
| --- | --- |
| `manifest.json` | Provenance, version, counts, and SHA-256 hashes |
| `team.json` | Fictional team and home campus |
| `roster.json` | 25 players, 3 coaches, and 2 staff; role-based fictional labels |
| `destinations.json` | 8 destinations with fictional one-way miles and driving minutes |
| `games.json` | 8 games, arrival buffers, trip dates, hotel nights, bus days, and paid meal counts |
| `hotels.json` | 24 hotels: economy, standard, and comfort at each destination |
| `restaurants.json` | 24 restaurants with group meal prices, capacity, pickup windows, and dietary labels |
| `bus_rates.json` | 40-, 50-, and 56-passenger coaches, each with a daily quote |
| `availability.json` | Date-specific room inventory, accepted meal orders, and bus inventory |
| `package_templates.json` | 3 package definitions connecting hotel/meal tiers and a bus rate ID |
| `rules.json` | Explicit formulas, defaults, units, allocations, and unsupported-input behavior |
| `scenarios.json` | 19 requests with expected outcomes, including invalid requests |

## Pricing and allocation contract

Amounts ending in `_cents` are integer USD cents. Convert user-entered dollar strings with `Decimal`, require at most two decimal places, and convert to cents exactly. Tax and all specified fees are already included. Do not add tax again.

- Travelers = players + coaches + staff. Drivers are included in the bus quote and do not consume passenger seats or add meals/rooms.
- Effective bus seats = smaller of the user's seat setting and the selected coach's physical passenger capacity. Buses = travelers divided by effective seats, rounded upward.
- Bus total = buses × billable calendar days × daily bus rate. The quote includes fuel, driver expenses, tolls, and parking; there is no mileage surcharge.
- Room counts are rounded up **separately for players, coaches, and staff**, then added together. Do not mix roles to fill partially occupied rooms. The user's occupancy cannot exceed the hotel's maximum. Same-day trips require no hotel or rooms.
- Lodging total = rooms × nights × nightly room rate. Inventory must fit on every occupied night. Checkout day is not an occupied night.
- Meal total = travelers × scheduled paid meals per person × restaurant meal rate. The allowance is a **maximum price per person per paid meal**, not an additional charge. A restaurant over the cap is excluded. All travelers get the same meal count; no hotel breakfast is included.
- A restaurant must fit the whole group in one order and accept orders on every trip day. Its service windows are useful for a future itinerary; the fixture does not claim to solve meal timing.
- A package total is the sum of bus, lodging, and meal totals. Compare that exact amount to the budget, including equality. An otherwise available package can be over budget; do not erase it or silently change the budget.
- Missing inventory is unsupported, never unlimited. Explicitly unavailable services are excluded. Do not extrapolate to an unlisted game, date, destination, or price.

The templates use a standard 50-seat coach for economy/standard and a 56-seat comfort coach for comfort. The default seat setting of 50 caps both at 50 until edited. There is also a 40-seat compact quote available for future alternate bus selection.

Defaults are 50 seats per bus, two people per room, and a $20 meal cap. The baseline scenario explicitly raises the meal cap to $30 so all three packages can be compared. These are chosen demo assumptions, not organizer policies.

## Baseline example

Select **Maplebridge Owls**, December 4, 2026, with 25 players, 3 coaches, and 2 staff. The scheduled trip is December 3–4: one hotel night, two billable bus days, and four paid meals per traveler. At two people per room the total is 13 player rooms + 2 coach rooms + 1 staff room = **16 rooms**, for **30 travelers** and **one bus**.

| Package | Bus | Lodging | Meals | Total estimate |
| --- | ---: | ---: | ---: | ---: |
| Economy | $1,800 | $1,520 | $1,440 | **$4,760** |
| Standard | $1,800 | $2,224 | $2,160 | **$6,184** |
| Comfort | $2,500 | $3,184 | $3,120 | **$8,804** |

With the baseline $6,500 budget and $30 meal cap, economy and standard fit the budget. Comfort remains an over-budget option. The app has not yet been connected to this dataset; these are fixture reference totals, not live API results.

## Demo scenarios

`scenarios.json` covers a normal trip, insufficient budget, exactly full/overflowing buses, rounding rooms separately by role, same-day travel, two hotel nights, limited hotel inventory, unavailable restaurant service, restrictive meal caps, insufficient bus inventory, an empty team, negative counts, unknown opponents/dates, impossible departure timing, excessive room occupancy, and a missing date.

Each scenario has a `trip` shaped like the starter's request and an `expected` object. Amounts in the trip request are dollar strings; expected package totals are integer cents. The intentionally invalid/missing scenarios are not valid API requests. Expected status values describe the future complete planner; the current preview API does not implement those statuses or pricing.

Capacity stress scenarios use aggregate fictional traveler counts beyond the sample roster. Use the 30-person roster only for individual assignments; do not invent extra roster members from aggregate counts.

## Regenerate and verify

From the repository root, using Python 3.10+ and no third-party packages:

```bash
python3 scripts/generate_demo_data.py
python3 -m unittest discover -s tests -p test_demo_data.py -v
```

Generation is deterministic: it uses authored constants, no randomness, no external records, and no current-clock values. Regenerating overwrites the generated JSON files, so edit the generator when changing the dataset. The manifest checksums cover JSON files other than the manifest itself. This README is maintained separately.

The checks verify IDs and references, units, dates, inventory coverage, provenance/hashes, and all scenario expectations with an independent reference calculation. They do not implement or test Aivana or the application's future package engine. No heuristic text parser in these checks should be copied into the production request parser.
