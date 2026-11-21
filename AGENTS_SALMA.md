# AGENTS.md: Football Coach Meeting Tracker

Instructions for an AI coding agent implementing this project. Read this file first, then `README.md`, which is the **source of truth** for features, the extraction spec, the JSON Schema, the data model, and the API endpoints. If this file and the README disagree, follow the README and point out the conflict.

Context: 2026 BGSU Hackathon, Project A. **Hard deadline: Saturday, November 21, 2026, 5:00 PM.** A working Level 1 app beats a half-built Level 3 app. Always keep `main` runnable.

---

## 1. Non-negotiable rules

Breaking any of these loses points or disqualifies the project. Never trade them for speed.

1. **The Aivana API key lives only in the backend.** Read it from `os.environ["AIVANA_API_KEY"]`. Never put it in frontend code, logs, error messages, test fixtures, or any committed file. `.env` must be in `.gitignore`; commit only `.env.example` with empty values.
2. **The browser never calls Aivana.** All AI calls go through FastAPI.
3. **Code does the math, not the model.** Dates, relative deadline resolution, counting, sorting, overdue status, "players needing attention", trends, and accuracy stats are computed in Python. Never ask the model to compute or state a date, count, or total.
4. **Nothing AI-generated is saved without coach approval.** `/extract` returns drafts only. Only `/approve` writes to `records` and `action_items`.
5. **Every record keeps its verbatim `source_text`**, and the UI shows it next to the record.
6. **No invented facts.** Missing values stay `null`. Ambiguous players stay `unmatched`. Never guess a `player_id`.
7. **No character or attitude judgments, no medical or insurance decisions.** Prompts must say this, and the app records only what the coach wrote.
8. **Synthetic data only.** Use the organizers' data pack or invented names. Never add real people.
9. **At least one structured-output call (JSON Schema) and at least one more Aivana feature** (this project uses streaming for the prep brief; image input is a stretch goal).
10. **Do not build trip planning, pricing, or booking.** Travel notes are recorded under the `Travel & Away Games` topic only (that is Project B's scope).

---

## 2. Tech stack (do not swap without asking)

- Python 3.10+, FastAPI, Uvicorn, Pydantic v2
- SQLite via the standard `sqlite3` module (or SQLModel if already set up). One file at `DATABASE_PATH`.
- `httpx` for Aivana HTTP calls (the official `aivana` SDK is fine too, but keep all calls inside `app/aivana_client.py`)
- `python-dotenv`, `python-dateutil` and/or `dateparser`, `jsonschema`, `ics`, `pytest`
- Frontend: plain HTML, CSS, and vanilla JavaScript in `static/`, served by FastAPI. No build step, no framework. Chart.js from a CDN for charts.

Follow the folder layout in README section 19.

---

## 3. Aivana API reference (from the hackathon guide)

- Endpoint: `POST https://api.aivana.ai/v1/generate`
- Streaming: `POST https://api.aivana.ai/v1/generate:stream` (server-sent events: `delta` → append `data.text`, `done` → final usage, `error` → handle; ignore other events. HTTP stays 200 after the stream starts, so check for `error` events.)
- Headers: `X-API-Key: <AIVANA_API_KEY>`, `Content-Type: application/json`
- Live keys start with `ai_live_`. `ai_test_` keys return 401.
- Body fields used: `prompt` or `messages` (not both), `system`, `response_format`, `max_tokens` (1 to 32,000), `effort` (`auto`, `low`, `medium`, `high`), `attachments` (base64 + `mime_type`, PNG/JPEG/WebP/GIF up to 8 MiB each, max 5 files), `intelligence_trace`.
- Structured output:
  ```json
  "response_format": { "type": "json_schema", "schema": { ... } }
  ```
  Result comes back in `structured`. Limits: root must be an object, schema ≤ 32 KiB, ≤ 10 levels deep. Cannot be streamed. Cannot be combined with `stop_sequences`. A rejected schema returns 422; an answer that cannot satisfy a valid schema returns 502 (not charged).
- Response fields: `answer`, `structured`, `usage` (`input_tokens`, `output_tokens`, `cached_tokens`, `credits`), `finish_reason` (`stop` or `length`), `notices`, `request_id`.
- Do not send PDFs (about 2,300 tokens per page). Do not turn on `web_search`.

### Error handling (implement in `aivana_client.py`)

| Status | Action |
|---|---|
| 400, 422 | Do not retry. Log `details`. Raise a typed error the API turns into a clear message. |
| 401, 403 | Do not retry. Message: "AI key problem, check AIVANA_API_KEY." |
| 402 | Do not retry. Message: "AI token balance is empty." Manual entry must still work. |
| 413 | Do not retry. Ask the user to shorten the note or shrink the image. |
| 429 | Wait `Retry-After` seconds, then retry. |
| 502, 504, network errors | Retry with backoff 1, 2, 4 s plus jitter, max 3 attempts. |

Log `request_id`, token usage, and `credits` for every call into `extraction_runs` (or a log for non-extraction calls). If `finish_reason == "length"`, add a warning to the response.

Tests must **mock** Aivana. Never call the real API from `pytest`.

---

## 4. Build order and definition of done

Work through these milestones in order. Commit after each one. Do not start a milestone until the previous one runs end to end.

### M0. Skeleton (target: 30 min)
- Folder layout, `requirements.txt`, `.env.example`, `.gitignore` (`.env`, `data/*.db`, `.venv/`, `__pycache__/`).
- FastAPI app serving `static/index.html` and `GET /api/health`.
- **Done when:** `uvicorn app.main:app --reload` starts and `/docs` loads.

### M1. Database and seed (target: 45 min)
- Create all tables from README section 10.
- `scripts/seed.py` loads `data/roster.csv` and optional sample notes. `--reset` drops and recreates.
- If the organizers' data pack is not present yet, create a placeholder synthetic roster of about 25 players with id, full name, nickname, jersey number, position, and position group, and mark it clearly as placeholder.
- **Done when:** seeding works and `GET /api/players` returns the roster.

### M2. Meetings (target: 30 min)
- `POST /api/meetings`, `GET /api/meetings/{id}`. Pydantic validation: meeting type in `individual | group | team`, attendees exist, note not empty, note length ≤ 8,000 characters.
- **Done when:** a meeting can be created from the UI form.

### M3. Extraction (target: 2 h) — the core
- `app/schemas/extraction.json`: copy the schema from README section 8 exactly (including the `Travel & Away Games` topic).
- `app/prompts.py`: system instructions = the rules in README section 7.7 + matching rules from 7.5 + feedback types from 7.3. User prompt = meeting type, meeting date, compact attendee lines (`P07 | Jay Carter | "JC" | #12 | WR`), then the note. Send attendees only, not the whole roster (team meetings: all players).
- `POST /api/meetings/{id}/extract` calls Aivana with `response_format` and `max_tokens` from env.
- `app/validation.py` (README section 9):
  - `player_id` must exist and be an attendee, otherwise set `unmatched` and flag.
  - `source_text` must appear in the note (normalize whitespace and case; fuzzy ratio ≥ 0.9), otherwise set confidence `low` and add a warning.
  - `deadline_date` must parse and not be before the meeting date, otherwise clear and flag.
  - On hard errors, retry **once** with the error list appended to the prompt. If it still fails, return partial results with flags. Never return a 500 for a bad AI answer.
- `app/dates.py`: resolve `deadline_text` relative to the meeting date ("by Friday" on Tue 2026-11-17 → 2026-11-20; "next week" → Monday of next week; unresolvable → `null` + flag). Weekday names mean the next occurrence after the meeting date.
- `app/fanout.py`: `scope: "group"` records expand into one draft per attendee in that position group, sharing a `group_record_id`. `scope: "team"` stays one meeting-level record.
- Tag topics `Health & Injury Follow-up` and `Insurance & Administration` as `sensitive = true`.
- Store the raw AI output in `extraction_runs.ai_output_json`.
- **Done when:** the sample note in README section 8 produces the expected records, with both dates resolved in code and the WR task fanned out.

### M4. Review and approve (target: 1.5 h)
- `static/review.html`: original note on the left with the selected record's `source_text` highlighted; editable record cards on the right.
- Sort by priority: `unmatched` → `low` → `medium` → `high`, colored red, amber, green.
- Unmatched records show a player dropdown (attendees first).
- Coach can edit any field, delete a record, add a record by hand, then approve.
- `POST /api/meetings/{id}/approve` saves approved records and action items, and writes a field-level diff to `record_edits` (edited, deleted, added, unchanged).
- **Done when:** a coach can fix a wrong field and approve, and the change appears in `record_edits`.

### M5. Timelines and action items (target: 1 h)
- `GET /api/players/{id}/timeline`: approved records newest first; sensitive records hidden unless `?show_sensitive=true`.
- `GET /api/action-items?status=open|overdue|done`: overdue = `status == "open" and due_date < today` in `APP_TIMEZONE`, computed in Python.
- `PATCH /api/action-items/{id}` to mark done or change the due date.
- Dashboard: counts of open and overdue items, list of overdue items.
- **Done when:** Level 1 works end to end. **Stop and make sure the demo path is solid before Level 2.**

### M6. Level 2 (pick in this order)
1. **Streamed prep brief** `GET /api/players/{id}/prep-brief`: backend gathers the player's last 10 non-sensitive records and open action items, calls `/v1/generate:stream`, and relays SSE to the browser. Prompt: summarize only the given records; suggest 3 follow-up questions based only on documented feedback; cite meeting dates. This satisfies the "second Aivana feature" rule, so do it first.
2. **Players needing attention** `GET /api/attention`: pure Python. Flags: no meeting in `ATTENTION_DAYS`, any overdue item, or 2+ `Improvement` records in the same skill in the last 30 days.
3. **Question box** `POST /api/ask`: filter records in SQL first (player, skill, topic, date range; keyword match on feedback), cap at 30, exclude sensitive unless the question names that player and topic. Use the answer schema in README section 11. Drop any citation whose `record_id` was not in the filtered set. If no records match, answer "No matching records" without calling Aivana.

### M7. Level 3 (only if M0 to M6 are solid)
1. **Accuracy test**: `tests/labeled_notes/*.json` (note + expected records) and `scripts/accuracy_test.py` reporting per-field accuracy and invented-record count. `GET /api/insights/accuracy` computes the live stat from `record_edits`.
2. **`.ics` export** of open action items with due dates.
3. **Themes**: weekly counts by skill, topic, and feedback type in Python, charted with Chart.js; optional short Aivana narrative given only those counts.
4. **Handwritten notes**: `POST /api/meetings/{id}/transcribe` with an image attachment and `effort: "low"`; return text for the coach to correct before extraction. Resize images to ≤ 1600 px before sending.

---

## 5. Coding conventions

- Keep all Aivana calls in `app/aivana_client.py`, all prompts in `app/prompts.py`, all schemas in `app/schemas/`.
- Categories are open (Salma, November 21, 2026): topic, skill and tags are free text. Never force them into a fixed list; starter suggestions only (`data/categories.json`, `backend/vocabulary.py`). Only review metadata (confidence, match method) and the record type stay fixed.
- Use type hints and small pure functions for dates, fan-out, validation, and insights so they are easy to unit test.
- Return JSON errors as `{ "error": "<code>", "message": "<friendly text>" }` with a sensible HTTP status.
- Frontend: show a loading state during extraction, show friendly errors from the backend, never show raw stack traces.
- Keep prompts short. Do not include the full roster or full history when a subset works.
- No secrets, real personal data, or `.db` files in commits.

---

## 6. Tests to write

Put tests in `tests/`. All of them run offline with Aivana mocked.

- `test_dates.py`: "by Friday", "Thursday", "next week", "in 3 days", an exact date, and an unresolvable phrase ("before the Michigan game").
- `test_validation.py`: unknown `player_id`, non-attendee `player_id`, missing source text, deadline before meeting date, retry-once behavior, partial results.
- `test_fanout.py`: group of WRs expands to each attending WR; team record stays single.
- `test_insights.py`: overdue computation and attention flags.
- `test_aivana_client.py`: 402, 429 with `Retry-After`, 502 retry then success, 401 no retry.
- `test_api.py`: extract returns drafts and saves nothing; approve saves and logs edits.

Synthetic test notes must cover: multiple players in one note, a vague deadline, an injury mention, a nickname and jersey number, an ambiguous name (two attendees named Chris), a group instruction, and an away-game trip note.

---

## 7. When you finish a milestone

1. Run `pytest` and fix failures.
2. Start the app and click through the flow you just built.
3. Update the README only if behavior changed (setup commands, endpoints, known limits). Change the roadmap "Planned" entries to "Done".
4. Commit with a clear message, for example `M3: structured extraction with validation and date resolution`.

## 8. When unsure

- If a requirement is unclear, choose the option that keeps the coach in control and the model from inventing facts, then note the choice in the README's known limits.
- If time is short, cut Level 3 first, then the question box. Never cut coach approval, source text, or error handling.
- Ask the human before changing the stack or anything in section 1. Do not add fixed category lists.
