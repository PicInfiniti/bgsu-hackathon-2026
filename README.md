# picInfiniti — Away-Game Travel Planner

Project B for the November 20–21, 2026 BGSU Hackathon, built by Siavash and Salma ([FlowerSalma](https://github.com/FlowerSalma)).

## Stack

- Frontend: vanilla JavaScript, Sass (SCSS), and Vite. No frontend framework.
- Backend: Python and FastAPI, with Pydantic input validation.
- Demo data: a comprehensive static JSON pack created by picInfiniti in [`data/demo/`](data/demo/README.md). It is fictional and separate from the organizers' pack, which is not yet available in this checkout.

## Run locally

Requirements: Python 3.10+ and Node.js 20.19+ or 22.12+ (Node.js 24 recommended).
Run the following from the repository root in two terminals.

### Terminal 1 — backend

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

On Windows, activate with `.venv\Scripts\activate` instead. For running without tests, install `backend/requirements.txt`.

Backend: http://127.0.0.1:8000/api/health

Interactive API docs: http://127.0.0.1:8000/api/docs

### Terminal 2 — frontend

```bash
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` requests to FastAPI on port 8000; keep both servers running. The starter requires no API key.

## What works

- Responsive trip form with opponent, game date, traveler counts, budget, and departure constraint.
- Editable seats per bus, room occupancy, and meal allowance. Initial values are example assumptions, not organizer data.
- Backend input validation, traveler totals, and bus count rounded up to fit the travelers.
- Loading, validation, and backend connection error states. Submissions are not saved.

## Environment variables and Aivana

No environment variables are required for this starter. `backend/.env.example` reserves the server-only `AIVANA_API_KEY` variable for upcoming integration, with a placeholder value only. To prepare it locally:

```bash
cp backend/.env.example backend/.env
```

Set the key in that ignored file, never in frontend files, a `VITE_` variable, logs, or Git. Once integration exists, load it with `python -m uvicorn backend.main:app --reload --env-file backend/.env`.

**Aivana features implemented: none yet.** Planned: JSON Schema structured trip parsing and package recommendations, plus at least one additional capability (multi-turn what-if chat or a separate streamed memo). Python will calculate all costs; the model will select valid option IDs and explain tradeoffs.

## Checks and build

```bash
# Repository root, with .venv activated
python -m pytest tests -q

cd frontend
npm run build
```

Vite writes `frontend/dist/`. `npm run preview` previews that static build only; it does not proxy the backend. Deployment is not configured. A production host will need to serve frontend assets and route `/api` to FastAPI.

## Layout

```text
frontend/             Vite application
  src/main.js         Form and preview behavior
  src/styles/         Sass styles
  src/services/       Backend HTTP client
backend/
  main.py             FastAPI entry point and health route
  models/trip.py      Request and response models
  routes/trips.py     Trip preview endpoint
  services/           Reserved for Aivana and package calculations
data/demo/            Fictional static demo pack, rules, and scenarios
scripts/              Deterministic demo data generator
tests/                Backend validation and capacity checks
```

## Next steps and limits

This is a starter, not the completed Level 1 application. The demo dataset is ready but not connected to the API or frontend. Its pricing units and room/meal allocation rules are documented in `data/demo/README.md` and `rules.json`. Implement two or three itemized estimated packages using that contract. Then connect Aivana structured output and the additional capability, including bounded retries and API error handling. Keep the organizers' pack separate when it becomes available.

Demo prices, inventory, names, distances, and travel times are explicitly fictional; no real availability or bookings are represented. The current UI displays no priced packages or AI recommendations. There is currently no database, authentication, trip persistence, itinerary, hosting, or external API integration. Use synthetic details only; do not add real player or staff records. Keep organizer documents and the workspace handoff local.

Verify the static demo pack without installing dependencies:

```bash
python3 -m unittest discover -s tests -p test_demo_data.py -v
```
