# Football Coach Meeting Tracker

> **2026 BGSU Hackathon (ACM & ACM-W), Project A: Coach Meeting Tracker**
> Turns a coach's meeting notes into structured, coach-approved records for each player, then helps the coach follow up.
> Built on the **Aivana MMI API**. All players and records are **synthetic**.

---

**Current practice pack:** `data/synthetic/` is now football version 2: 25 fictional players with football positions/groups and nicknames, 14 scenarios, and 57 reference records. Regenerate app fixtures with `.venv/bin/python scripts/build_demo_data.py`, restart the backend, and refresh the frontend. Versioned football seeds are added once; existing saved notes and completion states remain unchanged as history. Login/signup and the workspace retain the BGSU notebook style with football positions, film-review copy, and play-diagram artwork. This is our original practice data, not the missing organizer pack. Earlier live AI evidence applies to the basketball version; football extraction has not yet been live-benchmarked.

**Players view (implemented):** a compact football roster table with search, unit/group/position filters, actual meeting/open-action counts, and a player snapshot. Selecting a row updates the summary; **View timeline** opens full records, source notes, completion controls, and preparation. **Back to players** restores the directory and filters. Counts include saved historical meetings; source details remain attached.

## Table of contents

1. [Overview](#1-overview)
2. [Features by hackathon level](#2-features-by-hackathon-level)
3. [Tech stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Setup and running the app](#5-setup-and-running-the-app)
6. [Aivana features used](#6-aivana-features-used)
7. [AI classification and extraction spec](#7-ai-classification-and-extraction-spec)
8. [Extraction JSON Schema](#8-extraction-json-schema)
9. [Backend validation and post-processing](#9-backend-validation-and-post-processing)
10. [Data model](#10-data-model)
11. [API endpoints](#11-api-endpoints)
12. [Error handling and token management](#12-error-handling-and-token-management)
13. [Privacy, safety, and synthetic data](#13-privacy-safety-and-synthetic-data)
14. [Testing and accuracy measurement](#14-testing-and-accuracy-measurement)
15. [Demo script (3 to 5 minutes)](#15-demo-script-3-to-5-minutes)
16. [Known limits](#16-known-limits)
17. [Roadmap](#17-roadmap)
18. [Judging rubric map](#18-judging-rubric-map)
19. [Project structure](#19-project-structure)

---

## 1. Overview

Coaches meet with players one-on-one, in position groups, and as a full team. It is easy to lose track of who was asked to do what, who needs to improve what, and who earned praise.

The Football Coach Meeting Tracker lets a coach paste (or photograph) meeting notes. The Aivana API extracts structured records: the player, meeting topic, skill area, feedback, action items, and deadlines. **The coach reviews and edits every AI-generated record next to the original note before anything is saved.** Approved records feed player timelines, an open and overdue action-item list, and follow-up tools.

**What this app is:** a meeting-notes and follow-up tracker.
**What this app is not:** a video conferencing tool, a travel planning or booking tool, a medical or injury management system, an insurance tool, or a full football analytics platform.

### Design principles

| Principle | How the app applies it |
|---|---|
| Human in the loop | Nothing the AI produces is saved until the coach approves it. |
| Grounded in the note | Every record carries the exact source text that supports it. |
| Code does the math | Dates, counts, sorting, overdue status, and trends are computed in Python, never by the model. |
| No invented facts | Missing values stay `null`. Ambiguous players stay unmatched for the coach to pick. |
| Records what the coach said | The AI never judges a player's character, attitude, health, or insurance coverage. |

---

## 2. Features by hackathon level

### Level 1: Core (required)

- Create a meeting: type (individual, group, or team), date, and attendees chosen from the roster.
- Enter or paste meeting notes.
- **Structured Aivana extraction** (JSON Schema) of per-player records: topic, skill area, feedback type, feedback, action item, deadline, and source text.
- **Review screen:** extracted records shown side by side with the original note, with the supporting text highlighted. The coach edits, deletes, adds, or approves records.
- Only approved records are saved to SQLite.
- **Player timeline:** every approved record for a player, newest first.
- **Action items list:** open and overdue items, computed in code from the deadline and today's date. Items can be marked done.

### Level 2: Standard

- **Question box** ("What did I tell Jay about positioning?"). The backend first filters saved records by player, skill, topic, and date range, then sends only those entries to Aivana. The answer must cite meeting dates and record IDs.
- **Streamed prep brief** for the next one-on-one. Summarizes past feedback, open action items, and suggests follow-up questions based only on documented feedback.
- **Players needing attention**, computed in code: not met with in N days, overdue action items, or repeated "Improvement" feedback in the same skill.

### Level 3: Advanced

- **Handwritten notes** as photo input (Aivana image attachment), with the transcription shown for the coach to correct before extraction.
- **Follow-up reminders exported as an `.ics` file** for open action items with deadlines.
- **Team themes over time:** counts of praise and improvement by skill and topic per week, computed in code and charted; Aivana writes a short narrative from those counts only.
- **Extraction accuracy test** against synthetic notes with known answers, plus a live "AI field accuracy" stat from coach edits.
- **Action-item timing:** average days open and days to completion per player and per skill, computed in code.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.10+, **FastAPI**, Uvicorn | Fast to build, automatic API docs at `/docs`, Pydantic validation. |
| AI | **Aivana MMI API** (`aivana` Python SDK or HTTPS) | Required by the hackathon. Called only from the backend. |
| Database | **SQLite** (via `sqlite3` or SQLModel) | Zero setup, single file, easy to reset for demos. |
| Validation | Pydantic + `jsonschema` | Validates Aivana output against the roster and allowed categories. |
| Date handling | `python-dateutil` / `dateparser` | Resolves "by Friday" against the meeting date in code. |
| Frontend | Plain HTML, CSS, and JavaScript (served by FastAPI) | No build step; works on any laptop for the demo. |
| Charts | Chart.js | Simple team-theme and trend charts. |
| Calendar export | `ics` Python package | Level 3 reminders. |
| Tests | `pytest` | Unit tests for validation and dates, plus the accuracy test. |

---

## 4. Architecture

```
┌──────────────────────────────┐
│  Browser (HTML/JS)           │   No API key here, ever.
│  - Meeting form + notes      │
│  - Review & approve screen   │
│  - Timelines, action items   │
│  - Question box, prep brief  │
└──────────────┬───────────────┘
               │  JSON over HTTP (same origin)
┌──────────────▼───────────────┐
│  FastAPI backend             │
│  - Builds prompts + schema   │──────► Aivana API (api.aivana.ai)
│  - Validates AI output       │◄────── structured JSON / SSE stream
│  - Resolves dates, fan-out   │
│  - Overdue/attention logic   │        AIVANA_API_KEY lives only in
│  - Edit tracking             │        the backend environment.
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  SQLite (data/tracker.db)    │
│  players, meetings, records, │
│  action items, edit log      │
└──────────────────────────────┘
```

### Processing workflow

1. The coach creates a meeting (type, date, attendees) and enters or pastes notes.
2. The frontend sends the note and meeting details to the backend.
3. The backend builds a compact prompt (roster subset for attendees, allowed categories, rules) and calls Aivana with the extraction JSON Schema in `response_format`.
4. Aivana returns topic classifications, skill categories, feedback, action items, and deadline phrases in `structured`.
5. The backend validates the response against the roster and allowed categories, resolves relative deadlines from the meeting date, expands group records to individual players, and flags low-confidence or unmatched records.
6. The coach reviews and edits the records next to the original note. Changes are logged.
7. Only coach-approved records are saved.
8. The app updates player timelines and the open and overdue action items.

---

## 5. Setup and running the app

### Prerequisites

- Python 3.10 or newer
- An Aivana **live** API key (starts with `ai_live_`) from [developers.aivana.ai](https://developers.aivana.ai) → API Keys. Keys starting with `ai_test_` return 401 on the production API.

### Install

```bash
git clone <your-team-repo-url>
cd coach-meeting-tracker
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Environment variables

Copy the example file and add your key. **`.env` is listed in `.gitignore` and must never be committed.**

```bash
cp .env.example .env
```

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `AIVANA_API_KEY` | Yes | `ai_live_xxx` | Aivana key. Read by the backend only. |
| `DATABASE_PATH` | No | `data/tracker.db` | SQLite file location. |
| `AIVANA_MAX_TOKENS` | No | `2000` | Cap on extraction answer length. |
| `ATTENTION_DAYS` | No | `14` | Days without a meeting before a player is flagged. |
| `APP_TIMEZONE` | No | `America/New_York` | Used for "today" when computing overdue items. |

`.env.example` (committed, no real values):

```
AIVANA_API_KEY=
DATABASE_PATH=data/tracker.db
AIVANA_MAX_TOKENS=2000
ATTENTION_DAYS=14
APP_TIMEZONE=America/New_York
```

### Load the synthetic data pack and run

```bash
python scripts/seed.py --roster data/roster.csv --notes data/sample_notes/   # loads the organizers' synthetic data pack
uvicorn app.main:app --reload
```

Open <http://localhost:8000>. Interactive API docs are at <http://localhost:8000/docs>.

### Reset the demo database

```bash
python scripts/seed.py --reset
```

### Run tests

```bash
pytest                          # unit tests (no API calls, Aivana is mocked)
python scripts/accuracy_test.py # live accuracy test against labeled notes (uses tokens)
```

---

## 6. Aivana features used

| Aivana feature | Where it is used | Level |
|---|---|---|
| **Structured JSON output** (`response_format` with JSON Schema) | Note extraction; question box answers with citations | 1, 2 |
| **`system` instructions** | Extraction rules and guardrails | 1 |
| **Streaming** (`/v1/generate:stream`) | One-on-one prep brief appears as it is written | 2 |
| **Image input** (`attachments`, PNG/JPEG) | Photographed handwritten notes | 3 |
| **`max_tokens`, `effort`** | Token control; `effort: "low"` for short transcription | 1 to 3 |
| **`intelligence_trace`** (optional) | Shown in a debug panel during the demo | 3 |

What the model does **not** do: compute dates, count records, sort, decide overdue status, or calculate trends. Those are all done in Python.

Example extraction request body (simplified):

```json
{
  "system": "You extract structured records from football coach meeting notes. Follow the rules exactly...",
  "prompt": "MEETING: type=group, date=2026-11-17\nATTENDEES: [P07 Jay Carter #12 WR \"JC\"], [P09 ...]\nNOTE:\n...",
  "response_format": { "type": "json_schema", "schema": { "...": "see section 8" } },
  "max_tokens": 2000
}
```

---

## 7. AI classification and extraction spec

### 7.1 Football skill categories

The AI classifies football-related feedback into these categories:

| Skill | Description |
|---|---|
| Passing | Throwing accuracy, mechanics, and passing technique |
| Receiving | Catching passes and receiving technique |
| Route Running | Route execution, timing, and separation |
| Blocking | Pass protection, run blocking, and blocking technique |
| Tackling | Tackling technique and execution |
| Coverage & Positioning | Defensive coverage, assignments, and positioning |
| Decision-Making | Reading plays, recognizing formations, and choosing actions |
| Ball Security | Protecting the football and preventing fumbles |
| Footwork & Agility | Balance, movement, and directional changes |
| Kicking & Punting | Kicking and punting accuracy and technique |

Additional values:

- **Other:** a football skill not covered by the predefined categories.
- **Not Specified:** the note does not identify a particular skill.
- **Not Applicable:** the record concerns something other than a football skill.

The AI classifies skills from the coach's words, **not** from a player's position. A note saying "Jay needs to work on blocking" is Blocking even though Jay is a receiver.

### 7.2 Meeting topic categories

| Topic | Description |
|---|---|
| Football Skills | Player techniques and performance feedback |
| Game Strategy & Field Positioning | Plays, formations, field diagrams, and tactics |
| Training & Conditioning | Practice plans, strength, and conditioning |
| Health & Injury Follow-up | Injury-related discussions and medical appointments |
| Nutrition & Hydration | Nutrition discussions and dietitian appointments |
| Player Availability & Roster | Lineups, substitutes, and availability |
| Schedule & Attendance | Meetings, practices, and attendance |
| Travel & Away Games | Trip details the coach discusses: departure and return times, travel roster, packing lists, hotel or bus reminders, and travel paperwork |
| Academic & Personal Development | Academic support and development goals |
| Insurance & Administration | Administrative questions, paperwork, and coverage discussions |
| Team Communication | Team coordination and communication |
| Other | Topics outside these categories |

`Health & Injury Follow-up` and `Insurance & Administration` records are tagged **sensitive** (see section 13).

**Travel & Away Games** records capture only what the coach said about a trip ("bus leaves 6 AM Friday, bring travel polos", "Marcus not on the travel roster"). Travel action items such as "turn in travel forms by Wednesday" become normal action items with deadlines. The app does not plan trips, compare hotels, or calculate travel costs; that is a separate tool (Project B). A player being left off a travel roster is recorded as stated, without the AI adding reasons.

### 7.3 Feedback type values

| Value | When used |
|---|---|
| `Praise` | The coach explicitly praised something. |
| `Improvement` | The coach explicitly asked for improvement or named a weakness. |
| `Neutral/Observation` | The coach noted something without praise or criticism ("Jay ran mostly slants today"). |
| `null` | No feedback is stated (for example, a pure scheduling item). |

### 7.4 Information extracted per record

For each relevant player or group, the AI extracts:

1. **Player reference:** the player ID from the synthetic roster when identifiable, the exact mention used in the note, and how it was matched.
2. **Meeting topic:** the general subject of the discussion.
3. **Skill category:** a football skill, when applicable.
4. **Feedback type:** see 7.3.
5. **Feedback description:** what the coach said about performance, close to the coach's wording.
6. **Action item:** a specific assigned task, if present.
7. **Deadline:** the deadline phrase exactly as written ("by Friday"), plus an ISO date only if the note states an exact date. Relative phrases are resolved by the backend.
8. **Source text:** the original note excerpt supporting the record.
9. **Confidence:** `high`, `medium`, or `low`.

Meeting type, meeting date, and attendees are entered by the coach, not extracted.

A single meeting can produce many records for different players, topics, or actions.

### 7.5 Player name matching rules

Notes say "Jay", "#12", "JC", or "the QBs". The AI returns a `match_method` for every record:

| `match_method` | Meaning |
|---|---|
| `full_name` | Matched a roster full name. |
| `first_or_last_name` | Matched a unique first or last name among attendees. |
| `nickname` | Matched a nickname listed in the roster. |
| `jersey_number` | Matched a jersey number ("#12"). |
| `position_group` | The note refers to a group ("all receivers", "the QBs"). |
| `team` | The note refers to the whole team. |
| `unmatched` | The mention is ambiguous or not on the roster. `player_id` is `null`. |

**The AI never guesses.** If two attendees could match "Chris", the record comes back `unmatched` and the review screen asks the coach to pick from a dropdown.

### 7.6 Group fan-out

When a note says "All receivers run extra routes by Thursday", the AI returns **one** group record with `scope: "group"` and `group_label: "WR"`. The **backend** then expands it into one record per attending player in that position group, so each player's timeline and overdue tracking work. Each expanded record keeps a shared `group_record_id` so the coach can approve or edit the group as one unit.

Team records (`scope: "team"`) are stored once at the meeting level and shown on every attendee's timeline, without creating per-player action items unless the note assigns a task to everyone.

### 7.7 Extraction rules (sent as `system` instructions)

- Extract information only when it is supported by the original note.
- Do not invent player feedback, tasks, deadlines, or facts.
- Do not infer skills solely from player positions.
- Keep separate actions and feedback attached to the correct player.
- Use `null` for missing feedback, action items, or deadlines.
- Copy source text verbatim for every record.
- Return the deadline phrase as written. Do not calculate dates from relative phrases.
- If a player reference is ambiguous, return `unmatched`. Never guess.
- Do not independently assess a player's character, personality, or attitude. Only record what the coach explicitly said.
- Do not diagnose injuries, recommend treatment, determine medical clearance, or decide insurance coverage. Record only what the coach wrote.
- Use `low` confidence when the wording is vague, the player match is uncertain, or the category is a close call.

---

## 8. Extraction JSON Schema

Sent in `response_format.schema`. It follows Aivana's limits: root is an object, under 32 KiB, and fewer than 10 levels deep.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["records", "warnings"],
  "properties": {
    "records": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "target", "topic", "skill", "feedback_type", "feedback",
          "action_item", "source_text", "confidence"
        ],
        "properties": {
          "target": {
            "type": "object",
            "additionalProperties": false,
            "required": ["scope", "player_id", "mention", "match_method", "group_label"],
            "properties": {
              "scope":        { "type": "string", "enum": ["player", "group", "team"] },
              "player_id":    { "type": ["string", "null"] },
              "mention":      { "type": "string" },
              "match_method": {
                "type": "string",
                "enum": ["full_name", "first_or_last_name", "nickname", "jersey_number",
                         "position_group", "team", "unmatched"]
              },
              "group_label":  { "type": ["string", "null"] }
            }
          },
          "topic": {
            "type": "string",
            "enum": [
              "Football Skills", "Game Strategy & Field Positioning", "Training & Conditioning",
              "Health & Injury Follow-up", "Nutrition & Hydration", "Player Availability & Roster",
              "Schedule & Attendance", "Travel & Away Games", "Academic & Personal Development",
              "Insurance & Administration", "Team Communication", "Other"
            ]
          },
          "skill": {
            "type": "string",
            "enum": [
              "Passing", "Receiving", "Route Running", "Blocking", "Tackling",
              "Coverage & Positioning", "Decision-Making", "Ball Security",
              "Footwork & Agility", "Kicking & Punting",
              "Other", "Not Specified", "Not Applicable"
            ]
          },
          "feedback_type": {
            "type": ["string", "null"],
            "enum": ["Praise", "Improvement", "Neutral/Observation", null]
          },
          "feedback": { "type": ["string", "null"] },
          "action_item": {
            "type": ["object", "null"],
            "additionalProperties": false,
            "required": ["task", "deadline_text", "deadline_date"],
            "properties": {
              "task":          { "type": "string" },
              "deadline_text": { "type": ["string", "null"] },
              "deadline_date": {
                "type": ["string", "null"],
                "description": "YYYY-MM-DD only if the note states an exact calendar date; otherwise null."
              }
            }
          },
          "source_text": { "type": "string" },
          "confidence":  { "type": "string", "enum": ["high", "medium", "low"] }
        }
      }
    },
    "warnings": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Anything the coach should know, such as unclear handwriting or an unknown name."
    }
  }
}
```

### Example

Meeting: group, 2026-11-17 (Tuesday), attendees P07 Jay Carter (#12, WR, nickname "JC") and P09 Marcus Lee (#4, WR).

Note:
> Great hands from JC today. #4 keeps drifting on his slants, needs to stay on his landmark. Both WRs: extra route work before Friday. Marcus also mentioned his ankle is sore, trainer appt Thursday.

Extracted (abridged):

```json
{
  "records": [
    { "target": { "scope": "player", "player_id": "P07", "mention": "JC", "match_method": "nickname", "group_label": null },
      "topic": "Football Skills", "skill": "Receiving", "feedback_type": "Praise",
      "feedback": "Great hands today.", "action_item": null,
      "source_text": "Great hands from JC today.", "confidence": "high" },
    { "target": { "scope": "player", "player_id": "P09", "mention": "#4", "match_method": "jersey_number", "group_label": null },
      "topic": "Football Skills", "skill": "Route Running", "feedback_type": "Improvement",
      "feedback": "Drifting on slants; needs to stay on his landmark.", "action_item": null,
      "source_text": "#4 keeps drifting on his slants, needs to stay on his landmark.", "confidence": "high" },
    { "target": { "scope": "group", "player_id": null, "mention": "Both WRs", "match_method": "position_group", "group_label": "WR" },
      "topic": "Training & Conditioning", "skill": "Route Running", "feedback_type": null, "feedback": null,
      "action_item": { "task": "Extra route work", "deadline_text": "before Friday", "deadline_date": null },
      "source_text": "Both WRs: extra route work before Friday.", "confidence": "medium" },
    { "target": { "scope": "player", "player_id": "P09", "mention": "Marcus", "match_method": "first_or_last_name", "group_label": null },
      "topic": "Health & Injury Follow-up", "skill": "Not Applicable", "feedback_type": null,
      "feedback": null,
      "action_item": { "task": "Trainer appointment", "deadline_text": "Thursday", "deadline_date": null },
      "source_text": "Marcus also mentioned his ankle is sore, trainer appt Thursday.", "confidence": "high" }
  ],
  "warnings": []
}
```

The backend then resolves "before Friday" to 2026-11-20 and "Thursday" to 2026-11-19, expands the WR group record into one action item each for P07 and P09, and tags the ankle record as sensitive.

---

## 9. Backend validation and post-processing

Aivana checks the response's **shape and types**, not whether the facts are correct. The backend adds these checks in code:

| Check | What happens on failure |
|---|---|
| `player_id` exists in the roster and is a meeting attendee | Record set to `unmatched` and flagged for the coach. |
| `topic`, `skill`, `feedback_type` are allowed values | Enforced by the schema; double-checked in Pydantic. |
| `source_text` actually appears in the note (normalized whitespace, fuzzy match ≥ 0.9) | Record flagged `low` confidence with a "source not found" warning. |
| `deadline_date` is a valid date and not before the meeting date | Cleared to `null` and flagged. |
| Group label maps to a roster position group | Kept as one group record for the coach to assign. |

### Relative deadlines (done in code)

`deadline_text` such as "by Friday", "next week", or "in 3 days" is resolved with the meeting date as the base date. The resolved date is shown next to the original phrase ("before Friday → Fri, Nov 20"). If the phrase cannot be resolved, the deadline stays empty and the review screen highlights it.

### Validation loop

1. Call Aivana with the schema.
2. If the backend checks above find hard errors (for example, an unknown `player_id`), retry **once**, appending a short list of the errors to the prompt.
3. If the retry still fails, show the **partial results** with the problem records highlighted. The extraction never silently fails, and the coach can always add records by hand.

### Confidence and review priority

The review screen sorts and colors records: `unmatched` and `low` first (red), then `medium` (amber), then `high` (green). Coaches know where to look first.

### Edit tracking

Before approval, the backend stores the AI's original record and the coach's final record. A field-level diff is logged in `record_edits`. This powers the "AI field accuracy" stat (section 14).

---

## 10. Data model

SQLite tables (simplified):

```
players
  id TEXT PK            -- e.g. "P07" (synthetic)
  full_name TEXT
  nickname TEXT NULL
  jersey_number INTEGER
  position TEXT         -- QB, WR, RB, OL, DL, LB, DB, K/P ...
  position_group TEXT

meetings
  id INTEGER PK
  meeting_type TEXT     -- individual | group | team
  meeting_date DATE
  raw_note TEXT         -- original note text (or transcription)
  note_source TEXT      -- typed | pasted | photo
  created_at TIMESTAMP

meeting_attendees
  meeting_id INTEGER FK -> meetings.id
  player_id TEXT FK -> players.id

extraction_runs
  id INTEGER PK
  meeting_id INTEGER FK
  ai_output_json TEXT   -- raw structured response, for audit and accuracy
  request_id TEXT       -- Aivana request_id for debugging
  input_tokens INTEGER
  output_tokens INTEGER
  credits REAL
  retried BOOLEAN
  created_at TIMESTAMP

records                  -- only coach-approved records
  id INTEGER PK
  meeting_id INTEGER FK
  player_id TEXT FK NULL -- NULL for team-level records
  scope TEXT             -- player | group | team
  group_record_id TEXT NULL
  topic TEXT
  skill TEXT
  feedback_type TEXT NULL
  feedback TEXT NULL
  source_text TEXT
  confidence TEXT
  sensitive BOOLEAN
  approved_at TIMESTAMP

action_items
  id INTEGER PK
  record_id INTEGER FK -> records.id
  player_id TEXT FK
  task TEXT
  deadline_text TEXT NULL
  due_date DATE NULL
  status TEXT            -- open | done
  completed_at TIMESTAMP NULL
  -- "overdue" is computed in code: status = open AND due_date < today

record_edits
  id INTEGER PK
  extraction_run_id INTEGER FK
  record_index INTEGER
  field TEXT             -- e.g. "skill", "player_id", "due_date"
  ai_value TEXT
  coach_value TEXT
  action TEXT            -- edited | deleted | added | unchanged
```

---

## 11. API endpoints

All endpoints are served by FastAPI under `/api`. The browser never calls Aivana directly.

### Roster and meetings

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/players` | List roster (filter by `position_group`). |
| `GET` | `/api/players/{id}/timeline` | Approved records for one player, newest first. Sensitive records shown only on this individual view. |
| `POST` | `/api/meetings` | Create a meeting: type, date, attendee IDs, note text. |
| `GET` | `/api/meetings/{id}` | Meeting details, note, and approved records. |

### Extraction and review

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/meetings/{id}/extract` | Run Aivana extraction. Returns draft records with confidence, warnings, and resolved deadlines. Nothing is saved as approved. |
| `POST` | `/api/meetings/{id}/transcribe` | (Level 3) Upload a photo of handwritten notes. Returns a transcription for the coach to correct. |
| `POST` | `/api/meetings/{id}/approve` | Save the coach-approved records. Logs edits against the AI draft. |

### Follow-up

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/action-items?status=open\|overdue\|done&player_id=` | Action items; overdue computed in code. |
| `PATCH` | `/api/action-items/{id}` | Mark done or change the due date. |
| `GET` | `/api/attention` | (Level 2) Players not met with in `ATTENTION_DAYS`, with overdue items, or repeated improvement feedback in one skill. |
| `POST` | `/api/ask` | (Level 2) Question box. Body: `{ "question": "...", "player_id": "P07" }`. Backend filters records first, then asks Aivana. Answer cites meeting dates and record IDs. |
| `GET` | `/api/players/{id}/prep-brief` | (Level 2) **Streamed** (server-sent events) prep brief for the next one-on-one. |
| `GET` | `/api/action-items/export.ics` | (Level 3) Calendar file of open action items with due dates. |
| `GET` | `/api/insights/themes?from=&to=` | (Level 3) Weekly counts by skill, topic, and feedback type (computed in code) plus a short Aivana narrative. |
| `GET` | `/api/insights/accuracy` | (Level 3) AI field accuracy from coach edits. |

### Example: question box answer schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["answer", "citations", "insufficient_data"],
  "properties": {
    "answer": { "type": "string" },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["record_id", "meeting_date"],
        "properties": {
          "record_id":    { "type": "integer" },
          "meeting_date": { "type": "string" }
        }
      }
    },
    "insufficient_data": { "type": "boolean" }
  }
}
```

The backend checks that every cited `record_id` was in the filtered set it sent. Unknown citations are removed and the answer is marked as needing review.

---

## 12. Error handling and token management

### Aivana errors

| Status | Meaning | App behavior |
|---|---|---|
| 400 / 422 | Invalid request or schema | Logged with `details`; not retried. Coach sees "Extraction failed, you can add records manually." |
| 401 / 403 | Key missing, invalid, or revoked | Clear admin message: check `AIVANA_API_KEY`. Not retried. |
| 402 | Token balance empty | Friendly banner: "AI is unavailable (token balance)". Manual entry still works. |
| 413 | Request too large | Ask the coach to split the note or use a smaller photo. |
| 429 | Rate limit | Wait for `Retry-After`, then retry. |
| 502 / 504 | Aivana could not finish / timed out | Retry with backoff 1, 2, 4, 8 s plus jitter; stop after 3 attempts. 502 is not charged. |
| Network error | Connection failed | Same backoff as 502. |

Every call logs `request_id`, `usage.input_tokens`, `usage.output_tokens`, and `usage.credits` in `extraction_runs`. If `finish_reason` is `length`, the app warns that the extraction may be incomplete.

### Bad input

- Empty or very short notes are rejected before any API call.
- Notes longer than a set limit (for example 8,000 characters) are rejected with a request to split them.
- Unknown attendees or dates in the future beyond a set range are rejected by Pydantic.

### Token management

- Send only the **attendees'** roster rows, not all 25 players, in a compact one-line format.
- Set `max_tokens` on every call.
- The question box sends only **filtered** records (by player, skill, topic, date), capped at about 30 entries.
- Prep briefs use only the player's last N records and open action items.
- No PDFs. Photos are resized before upload. Text is extracted in the app wherever possible.
- No AI calls inside render loops; results are cached per meeting.
- Token use per call is shown in a small admin panel.

---

## 13. Privacy, safety, and synthetic data

> **All players, notes, and records in this project are synthetic.** No real names, records, or personal information about players, students, or staff are used anywhere in the app, the repository, or the demo.

### API key safety

- The Aivana key is read from `AIVANA_API_KEY` on the backend only.
- `.env` is in `.gitignore`. Only `.env.example` with empty values is committed.
- The key never appears in browser code, logs, error messages, or the repository.

### AI guardrails

- The AI records what the coach said. It does **not** describe a player's character or attitude on its own.
- The AI does **not** diagnose injuries, recommend treatment, determine medical clearance, or decide insurance coverage.
- The AI does **not** invent feedback, tasks, deadlines, or facts. Missing values stay `null`.
- Every record shows its source text, and nothing is saved without coach approval.

### Sensitive-topic handling

- Records with topic `Health & Injury Follow-up` or `Insurance & Administration` are tagged `sensitive`.
- Sensitive records store only what the coach wrote, with no AI-added detail.
- Sensitive records are hidden from group and team views, team summaries, and the themes dashboard. They appear only on the individual player's timeline, behind a "show sensitive" toggle.
- Sensitive records are excluded from question-box context unless the coach asks about that specific player and topic.

---

## 14. Testing and accuracy measurement

### Unit tests (`pytest`, no API calls)

- Roster matching and `unmatched` handling
- Relative deadline resolution ("by Friday" from a Tuesday meeting date)
- Group fan-out into per-player action items
- Overdue computation and "players needing attention"
- Validation loop: unknown `player_id`, missing source text, bad dates
- Error handling for mocked 402, 429, and 502 responses

### Extraction accuracy test (Level 3)

`tests/labeled_notes/` holds 8 to 10 synthetic notes with hand-labeled expected records. `scripts/accuracy_test.py` runs the extraction and reports field-level precision and recall:

| Field | Metric |
|---|---|
| Player match | exact match on `player_id` |
| Topic, skill, feedback type | exact match |
| Action item present | precision and recall |
| Due date (after resolution) | exact match |
| Invented records | count of records with no matching label (should be 0) |

### Live accuracy from coach edits

The `record_edits` log gives a real-world stat: "AI was right on X% of fields across Y approved records." The percentage is computed from actual edits during testing and the demo, not estimated.

### Tricky synthetic test notes

1. **Multiple players in one note**, with separate feedback for each.
2. **Vague deadline** ("sometime next week", "before the Michigan game").
3. **Injury mention** that must be recorded without diagnosis and tagged sensitive.
4. **Nickname and jersey number** references ("JC", "#4").
5. **Ambiguous name** (two attendees named Chris) that must come back `unmatched`.
6. **Group instruction** ("all DBs") that fans out to each attendee.
7. **Away-game trip note** ("Team meeting: bus leaves 6 AM Friday for the away game, travel forms due Wednesday") that is classified as Travel & Away Games and creates a team-wide action item.

---

## 15. Demo script (3 to 5 minutes)

| Time | What to show |
|---|---|
| 0:00 to 0:30 | **Problem.** Coaches lose track of who was told what. Show the dashboard with open and overdue items. |
| 0:30 to 1:45 | **Core flow.** Create a group meeting with two receivers. Paste the tricky note (nickname, jersey number, group task, ankle mention). Click Extract. |
| 1:45 to 2:30 | **Review.** Point out source text next to each record, the confidence colors, "before Friday → Fri, Nov 20" resolved in code, the WR task fanned out to both players, and the sensitive tag on the ankle record. Fix one field, then approve. |
| 2:30 to 3:15 | **Follow-up.** Open Jay's timeline and the overdue list. Show "players needing attention". |
| 3:15 to 4:00 | **Level 2.** Ask "What did I tell Marcus about route running?" and show the answer with meeting-date citations. Start a streamed prep brief. |
| 4:00 to 4:45 | **Level 3 and rigor.** Show the accuracy test results and the live "AI field accuracy" stat from edits. Optionally upload a handwritten note photo or export the `.ics` file. |
| 4:45 to 5:00 | **Close.** Guardrails: code does the math, coach approves everything, no invented facts, synthetic data only. |

Backup plan: if the network or Aivana is down, show a saved extraction from a previous run (clearly labeled as recorded) and the manual entry path.

---

## 16. Known limits

- Extraction quality depends on how clearly the note is written. Very short or shorthand notes produce more `low` confidence and `unmatched` records.
- Aivana validates the JSON shape, not the facts. The coach review step is the final check.
- Relative deadline phrases tied to events ("before the Michigan game") cannot be resolved without a schedule and are left for the coach to set.
- Handwriting recognition may misread messy notes. The coach must correct the transcription before extraction.
- Name matching depends on the nicknames and jersey numbers in the synthetic roster.
- Single-user app: no login, roles, or multi-coach permissions.
- SQLite is fine for a demo but is not set up for concurrent multi-user use.
- Free-tier token budget (1M tokens per student) limits how many extractions and accuracy tests can run.
- Not a travel planner: trip notes are recorded, but the app does not book or price travel.
- Not a medical, insurance, or analytics system. Sensitive topics are recorded only as the coach wrote them.
- All data is synthetic. The app has not been tested with real coaching staff.

---

## 17. Roadmap

| Status | Item | Level |
|---|---|---|
| Planned | Meeting form, note entry, structured extraction, review and approve, timelines, open and overdue items | 1 |
| Planned | Confidence flags, name-matching rules, relative deadlines, group fan-out, validation loop, edit tracking | 1 |
| Planned | Question box with filtered records and citations | 2 |
| Planned | Streamed one-on-one prep brief with follow-up questions | 2 |
| Planned | Players needing attention (computed in code) | 2 |
| Stretch | Handwritten note photos | 3 |
| Stretch | `.ics` follow-up reminders | 3 |
| Stretch | Team themes dashboard and action-item timing analysis | 3 |
| Stretch | Extraction accuracy test on labeled notes | 3 |
| Future | Player progress stages per skill (for example, Introduced → Practicing → Consistent) set by the coach | Beyond |
| Future | Voice dictation of notes | Beyond |
| Future | Multi-coach accounts with role-based access to sensitive records | Beyond |

---

## 18. Judging rubric map

| Criterion (points) | Where this project addresses it |
|---|---|
| Core functionality (30) | Section 2, Level 1: full note → extraction → review → save → timeline → action items flow on the data pack. |
| Use of Aivana (20) | Sections 6 and 8: strict JSON Schema, streaming prep brief, image input, `max_tokens`, no calculations left to the model. |
| Depth (15) | Level 2 question box, prep brief, attention list; Level 3 handwriting, `.ics`, themes, accuracy test. |
| Reliability and data handling (15) | Sections 9 and 12: validation loop, roster checks, error handling for 401/402/429/502, coach approval, no invented facts. |
| Usability (10) | Side-by-side review with highlighted source text, confidence colors, dropdowns for unmatched players. |
| Demo and documentation (10) | Section 15 demo script; this README covers running the app, Aivana features, and known limits; key kept out of the repo. |

---

## 19. Project structure

```
coach-meeting-tracker/
├── app/
│   ├── main.py              # FastAPI app and routes
│   ├── aivana_client.py     # All Aivana calls, retries, usage logging
│   ├── prompts.py           # System instructions and prompt builders
│   ├── schemas/
│   │   ├── extraction.json  # Section 8 schema
│   │   └── ask.json         # Question box schema
│   ├── validation.py        # Roster checks, source-text check, validation loop
│   ├── dates.py             # Relative deadline resolution
│   ├── fanout.py            # Group → per-player records
│   ├── insights.py          # Overdue, attention, themes, timing (all in code)
│   ├── ics_export.py
│   ├── db.py                # SQLite setup and queries
│   └── models.py            # Pydantic models
├── static/                  # index.html, review.html, app.js, styles.css
├── data/
│   ├── roster.csv           # Synthetic roster from the organizers' data pack
│   └── sample_notes/        # Synthetic meeting notes
├── scripts/
│   ├── seed.py
│   └── accuracy_test.py
├── tests/
│   ├── labeled_notes/       # Synthetic notes with expected records
│   └── test_*.py
├── .env.example
├── .gitignore               # includes .env and data/*.db
├── requirements.txt
└── README.md
```

---

*Built for the 2026 BGSU Hackathon presented by ACM & ACM-W. All data is synthetic.*
