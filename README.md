# Football Coach Meeting Tracker

> **2026 BGSU Hackathon (ACM & ACM-W), Project A: Coach Meeting Tracker**
> Turns a coach's meeting notes into structured, coach-approved records for each player, then helps the coach follow up.
> Built on the **Aivana MMI API**. All players and records are **synthetic**.

---

**Current status:** Level 1 core and all three Level 2 feature options are implemented. The user reports completing browser checks for the existing workspace and has accepted our team-authored synthetic pack for this project. The newly added recent-check-in list has automated verification; those prior browser checks do not cover this new control. Level 3 calendar export is implemented; other advanced features remain stretch work.

**Current practice pack:** `data/synthetic/` is now football version 2, revision 4: 25 fictional players with football positions/groups and nicknames, 19 scenarios, and 86 reference records. Regenerate app fixtures with `.venv/bin/python scripts/build_demo_data.py`, restart the backend, and refresh the frontend. Versioned football seeds are added once; existing saved notes and completion states remain unchanged as history. Login/signup and the workspace retain the BGSU notebook style with football positions, film-review copy, and play-diagram artwork. This is our team-authored synthetic pack, accepted by the user as the project dataset; it is not organizer-provided data. Football schema-v2 live spot checks are recorded in [the November 21 QA report](docs/qa-2026-11-21.md); these are not a general accuracy benchmark.

**Players view (implemented):** a compact football roster table with search, unit/group/position filters, actual meeting/open-action counts, and a player snapshot. Selecting a row updates the summary; **View timeline** opens full records, source notes, completion controls, and preparation. **Back to players** restores the directory and filters. Counts include saved historical meetings; source details remain attached.

**Action board (implemented):** compact meeting cards under Follow-ups, with Open/Overdue/Completed/All buttons, search and player selection, and category/sort controls under More filters. Each card shows the meeting type, title, date, assignment previews, and next deadline. Expand View assignments for source notes, player timeline links, and Complete/Reopen; shared assignments expose per-player controls. Expanded state is retained through updates. Cards use two columns on wide screens and one on smaller screens. Sensitive actions remain hidden by default. The user reports the existing browser checks complete.

**Current workspace:** Overview is a summary dashboard with Upcoming on the left and Recent conversations on the right inside one main panel; the calendar stays in its own right sidebar. **Meetings** is the sidebar library; Create meeting opens the note editor and approval review side by side on wide screens. Selecting more than one attendee changes an Individual meeting to Group; selecting one restores Individual. Explicit Full team is retained while all players are selected. Clicking a calendar date shows that day’s saved meetings and due actions, including completed actions. Mode-change confirmations use a nonblocking top-right alert that disappears after three seconds; ordinary success notices use the same three-second alert and errors/review warnings remain visible.

**Extraction upgrade:** typed football topics/skills, confidence and unmatched-player flags, deterministic Python deadlines, group fan-out, shared team feedback, manual additions, highlighted evidence, sensitive-topic filtering, and field-level approval audit logs are implemented. Old SQLite records remain readable. The live individual browser flow passed extraction, edit/remove/manual-add, approval, save/reload, timeline/source, complete/reopen, and streamed preparation checks on a disposable database. The user has subsequently reported browser checks complete and selected our synthetic pack as the project dataset. See [verification and limitations](docs/qa-2026-11-21.md).

**AI Assistant (implemented):** sidebar chat view with Individual, Group and Team scopes, position-group shortcuts, skill/topic/meeting-type/date filters, action status/search filters, suggested prompts, and clickable dated sources leading to timeline records. Timeline and Action-board buttons carry context into the assistant. Live uses one bounded structured Aivana call; Demo lists saved excerpts. Sensitive records are excluded and questions are independent. One real HTTP answer passed on disposable data; the user subsequently reported browser checks complete. Earlier agent-run browser limitations remain documented in the dated QA report.

**Shared meeting records (implemented):** Group/team review combines identical source-backed records into one shared card listing the affected players. Expand to review warnings or edit each player's version; **Update shared cards** separates changed versions before approval. Individual assignments remain separate. The Action board combines matching shared assignments into expandable rows, shows completed/total players, and keeps each player's Complete/Reopen controls independent. Player/status/search filters still apply to individual actions; the group states how many members match. Every action and timeline record shows the meeting type/title. The backend derives `display_group` metadata for new extractions and saved history without rewriting stored records or statuses. Similar wording alone never causes a merge: meeting, content, exact quote, categories, deadline, and sensitivity must match. The user subsequently reported browser checks complete.

**Selected-attendee references:** Live extraction explicitly sends selected attendee IDs, names/jerseys, and their count alongside the attendee roster. In group/team notes, supported phrases such as “these three players”, “this 3 player”, “these players”, and “both attendees” may refer to all selected attendees. A stated count must match; subsets, exclusions, and evidence containing separately named player assignments stay unresolved. The backend fans one collective record out to selected attendees and marks the interpretation for coach confirmation in the shared review card. The note's supporting quote remains exact and approval is still required. Future-conversation plans are observations, not player tasks; vague “next week” does not become an invented date. An existing unmatched draft needs re-extraction after updating the backend.

**Strategy room (implemented):** the Strategy sidebar opens a green football tactics field with the official BGSU Falcons graphic in its header and at midfield. Drag real synthetic-roster players, open formation slots, imaginary opponents and the football. Hover shows names/roles/assignments; select or tap to edit them. Drag roster/opponent chips from the list beneath the field, or use the add controls. Each side supports up to 11 markers. Shotgun, Spread, 4–3 and Nickel templates fill matching roster positions conservatively and leave explicit open slots where our roster lacks a position. Opponent templates are fictional. Routes, passing arrows, motion lines, blocks, coverage zones, freehand ink and text labels support coaching discussion. Selected drawings can move, resize through endpoint handles, rotate, change color or stroke width, and be removed. Undo/redo, snap to grid, a movable/show-hide line of scrimmage, reverse direction and full/half-field views are available.

**Game plans and game reviews:** each board stores a title, purpose (future plan/past review), game date, opponent label, coach notes, placements, drawings and individual assignments. Save, reopen, refresh the saved list, or Save a copy to compare alternatives. Unsaved edits are protected when replacing a board or leaving the page, and revision checks reject stale-window overwrites. Presentation hides editing panels; PNG and self-contained SVG exports embed the local logo. Keyboard users can select field objects, move them with arrow keys (Shift for larger steps), and remove selected players/drawings with Delete. These are coach-authored diagrams, not game footage or automatic performance analysis. No Aivana call is made and strategy notes never enter meeting timelines, the AI Assistant or preparation context. **Restart the backend** to initialize the new strategy table/routes, then refresh the frontend. No existing meeting data is changed.

**Meetings section:** the sidebar now opens a dedicated meeting library. Browse Individual, Group and Team meetings; search by title, attendee, or non-sensitive note text; filter by type, attendee, date range, and All / Today & future / Past; sort by date or title. View meeting opens its original note, attendee timeline links, approved feedback, and action completion controls. Sensitive records and their full notes remain hidden until explicitly enabled. A matching right-hand calendar shows type-colored meeting markers and red action-due dates using the active meeting filters. Click a day to filter the list and see its meeting/action agenda; agenda entries open the source meeting. Clear date restores the filtered list. The calendar has independent month controls and stacks above the list on narrow screens. Back to meetings preserves filters and the selected day. Overview meeting totals/type counts and recent conversations open this library or the specific meeting.

**Create a dated meeting without AI:** choose **Create meeting** or **New meeting**, enter a title, date, type, attendees, and an agenda or note, then click **Review meeting**. Confirm the details and choose **Approve & save meeting**. This uses the existing note-only SQLite save and does not call Aivana. If extracted records are already present, Review meeting keeps their normal review/approval workflow. Saving opens the meeting detail. Future-dated notes appear under Today & future and on the calendar; this is date-based record keeping, without invitations, time slots, or reminders.

**Meetings without tasks:** use **Review & save original note** in the review panel to keep a team speech, encouragement, or general discussion without calling Aivana. Confirm the date, attendees, and original text, then approve. If extraction returns no feedback/tasks, the same option remains available. These note-only meetings appear in Recent conversations, the calendar, each attendee's timeline, and meeting counts; they create no action items or invented feedback. Their unclassified text is shown when you open the meeting detail or expand the original note in a timeline and is excluded from AI Assistant/preparation context. Empty API saves require both `approved:true` and `note_only:true` with `items:[]`; normal source/attendee/date validation still applies.

**Individual continuation matching and meeting cards:** when an Individual note opens with the sole attendee's name (for example “Avery:”), direct continuation quotations such as “Your short passing was excellent” or “Work on reading the coverage” can inherit that attendee with a visible confirmation warning. Conflicting players, extra speaker headers, group/team notes, and invalid quotations do not use this fallback. Review has an explicit Group/Full team card around its records. Player timelines organize saved history into Individual/Group/Full team meeting cards with titles, dates, and attendee lists; every attendee sees the meeting, even without a separate extracted record, while another player's tasks stay out of their timeline. Different assignments remain separate actions.

**Action board meeting cards:** assignments are organized in compact Individual, Group, and Full team cards with the meeting title, date, previews, next due date, and expandable assignment/attendee details. Assigned player names identify responsibility inside each section. Different tasks stay separate; identical shared assignments still expand into per-player completion controls. Filters apply before meeting sections are built, and the selected sort orders meetings by their first matching assignment. Original saved text/quotes are retained; redundant player-name prefixes are omitted from the displayed assignment title.

**New practice examples:** “Group · offensive line shared drill” assigns one drill to Blair, Reese, and Quinn; “Full team · shared walkthrough assignment” assigns one walkthrough review to all 25 players. “Group · encouragement only, no tasks” and “Full team · encouragement speech, no tasks” demonstrate original-note saving. All four join the two existing Demo seeds on backend startup with stable IDs, without overwriting records or completion states. The two shared assignments appear on the Action board; encouragement notes appear in timelines, Recent conversations, and the calendar.

**Calendars and player history:** Overview shows Individual/Group/Full team meeting dots and red date text for action deadlines. Follow-ups has a separate right-hand calendar sidebar with Individual/Group/Full team filtering and colored meeting-type dots. Action deadlines use red date text in all calendars; hover text describes meetings/actions without repeating the date. Player detail uses a compact profile, meeting/open/overdue counts, cleaner history cards and its own right-hand calendar. The player's calendar includes their attended meetings and only their applicable action deadlines; clicking a meeting in the daily agenda jumps to its history card. Calendar months/dates are independent across views. The sidebars stack above content on narrow screens.

**Sensitive action example:** “Individual · sensitive trainer follow-up” adds Avery's fictional task to bring a trainer appointment confirmation by November 24. It is tagged Health & Injury Follow-up, hidden from Actions/timelines by default, and excluded from assistant/preparation context. Restart the backend to seed it once, then enable Show sensitive actions (All players / All categories) to reveal it. The source contains no diagnosis, treatment, clearance, or real medical information. Demo extraction preserves its reviewed sensitive topic.

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

The Football Coach Meeting Tracker lets a coach paste meeting notes (photo input is planned). The Aivana API extracts structured records: the player, meeting topic, skill area, feedback, action items, and deadlines. **The coach reviews and edits every AI-generated record next to the original note before anything is saved.** Approved records feed player timelines, an open and overdue action-item list, and follow-up tools.

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

### Level 2: Standard (assistant and streamed brief implemented)

- **Question box** ("What did I tell Jay about positioning?"). The backend first filters saved records by selected player/group/team, meeting type, skill, topic, and date range, then sends only those entries to Aivana. The answer must cite meeting dates and record IDs.
- **Streamed prep brief** for the next one-on-one. Summarizes past feedback, open action items, and suggests follow-up questions based only on documented feedback.
- **Players not met recently:** Overview → Players to check in with. Code computes each player’s most recent approved meeting date, defaults to Individual / 14 days, and supports 7/14/30/60/90-day windows and Individual/Group/Team/Any type. Shows players with no past matching meeting first, then oldest saved dates, with timeline links. Today and the preceding N−1 days count as recent; future-dated plans do not count. Note-only meetings count; sensitive note/record text is never used or displayed. Existing overdue-action lists remain separate; repeated-improvement flags are future work.

### Level 3: Advanced (calendar export implemented)

- **Handwritten notes** as photo input (Aivana image attachment), with the transcription shown for the coach to correct before extraction.
- **Implemented: follow-up calendar export (`.ics`).** Actions → Export calendar previews eligible actions matching the board’s status/player/category/search filters. Select individual actions, optionally add a day-before alert, and download an all-day calendar entry per open action on its due date. Includes player, action, source meeting/date, skill and topic. Completed, undated, invalid, unapproved and sensitive records are excluded; full source notes and quotes are never copied. Shared assignments retain separate player records. Import the file into a calendar app; it is a snapshot and later completion/edits do not sync. Alert handling and repeated-import behavior depend on the receiving app. No calendar account, Aivana request, new dependency or database change is required.
- **Team themes over time:** counts of praise and improvement by skill and topic per week, computed in code and charted; Aivana writes a short narrative from those counts only.
- **Extraction accuracy test** against synthetic notes with known answers, plus a separately labeled coach-edit rate; edits are not an accuracy measurement.
- **Action-item timing:** average days open and days to completion per player and per skill, computed in code.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.10+, **FastAPI**, Uvicorn | Fast to build, automatic API docs at `/docs`, Pydantic validation. |
| AI | **Aivana MMI API** (`aivana` Python SDK or HTTPS) | Required by the hackathon. Called only from the backend. |
| Database | **SQLite** (via `sqlite3` or SQLModel) | Zero setup, single file, easy to reset for demos. |
| Validation | Aivana JSON Schema + Python validators | Backend checks roster matches, evidence, categories, and dates; the provider schema checks structure. |
| Date handling | Standard-library `datetime` | Resolves supported unambiguous phrases against the meeting date; vague/event-relative deadlines remain for coach review. |
| Frontend | Vanilla JavaScript + Sass + Vite | Existing BGSU notebook UI; port 5174 proxies `/api` to FastAPI on 8001. No React/TypeScript. |
| Charts (planned) | Not installed | Team-theme and trend charts remain stretch work. |
| Calendar export | Native JavaScript / Blob download | Client-side `.ics` serializer; no added runtime dependency. |
| Tests | Python `unittest` + Node test runner | Offline regression checks; separate opt-in live verification. |

---

## 4. Architecture

```
┌──────────────────────────────┐
│  Browser (HTML/JS)           │   No API key here, ever.
│  - Meeting form + notes      │
│  - Review & approve screen   │
│  - Timelines, action items   │
│  - Prep brief, AI Assistant │
└──────────────┬───────────────┘
               │  JSON over HTTP (same origin)
┌──────────────▼───────────────┐
│  FastAPI backend             │
│  - Builds prompts + schema   │──────► Aivana API (api.aivana.ai)
│  - Validates AI output       │◄────── structured JSON / SSE stream
│  - Resolves dates, fan-out   │
│  - Validation/date logic     │        AIVANA_API_KEY lives only in
│  - Edit tracking             │        the backend environment.
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│ SQLite (backend/coach.sqlite3)│
│  approved meeting bodies,    │
│  extraction drafts, edit log │
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

Use this repository root (`bgsu-hackathon-2026`), not the separate `coach-meeting` checkout. Python 3.10+ and Node 20.19+ or 22.12+ are needed. Both Demo and Live use the same local SQLite notebook and require FastAPI; only Live extraction, preparation, and assistant answers need an Aivana key.

### Backend

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
# Fresh checkout only: create the private config without overwriting an existing one.
[ -f backend/.env ] || cp backend/.env.example backend/.env
.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

Set `AIVANA_API_KEY` privately in **`backend/.env`**. The existing local key is configured already; do not print or commit it. The backend automatically loads this explicit path; exported variables take precedence. Restart after changing `.env`. A root/frontend `.env` is not searched. Never put secrets in `VITE_` variables.

| Variable | Purpose |
|---|---|
| `AIVANA_API_KEY` | Backend-only Live key; Demo/manual entry need no key. |
| `COACH_DB_PATH` | Optional SQLite path; defaults to ignored `backend/coach.sqlite3`. |
| `COACH_ENV_FILE` | Optional explicit env-file override, used to isolate tests. |

### Frontend (separate terminal)

```bash
cd frontend
npm ci
npm run dev
```

Open <http://127.0.0.1:5174/login>. Coach ID **`demo`**, password **`demo`** opens Demo extraction. Inside the workspace, select **Live · Aivana** for real extraction. This is a local convenience, not authentication. Signup/other accounts remain previews; no passwords are stored or sent. FastAPI docs: <http://127.0.0.1:8001/docs>.

Both modes read and save the same SQLite records; changing modes never changes the notebook. The original team-authored football pack supplies the roster, exact Demo samples, and seven pre-reviewed, versioned seed meetings (the original seeds plus shared assignments, encouragement notes, and a fictional sensitive trainer follow-up). Seeding and browser-history migration are idempotent; existing SQLite records and completion states win conflicts, and the old browser copy is kept. No destructive reset is part of normal startup. The user has accepted this team-authored pack as the project dataset.

Regenerate fixtures with `.venv/bin/python scripts/build_demo_data.py`, restart FastAPI, and refresh Vite. Existing records are retained as historical notes. Dates and display counts use code; the model does not calculate them.

### Verification (from repository root)

```bash
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/verify_backend.py --port 18001
npm --prefix frontend test
npm --prefix frontend run build
# Optional paid live checks: one extraction (at most one correction) and one brief.
.venv/bin/python scripts/verify_backend.py --port 18001 --live --key-file aivana.api
```

HTTP smoke checks use a disposable SQLite file and cannot load the private `.env` in no-AI mode. Extraction output remains unsaved pending coach review; only the explicitly approved practice fixture is saved in the disposable check. See `docs/qa-2026-11-21.md` for actual evidence and remaining browser/data-pack checks.

---

## 6. Aivana features used

| Aivana feature | Where it is used | Level |
|---|---|---|
| **Structured JSON output** (`response_format` with JSON Schema) | Note extraction and source-cited assistant answers | 1, 2 |
| **`system` instructions** | Extraction rules and guardrails | 1 |
| **Streaming** (`/v1/generate:stream`) | One-on-one prep brief appears as it is written | 2 |
| **Image input** (`attachments`, PNG/JPEG) | Planned photographed-note support | 3 |
| **`max_tokens`, `effort`** | Token control; `effort: "low"` for short transcription | 1 to 3 |
| **`intelligence_trace`** (optional) | Planned debug/inspection support | 3 |

What the model does **not** do: compute dates, count records, sort, decide overdue status, or calculate trends. Relative deadlines and extraction validation run in Python; frontend dates, counts, filtering, and sorting run in application code. Recent-check-in calculations also run in JavaScript. Repeated-improvement flags and trend analytics remain planned.

Example extraction request body (simplified):

```json
{
  "system": "You extract structured records from football coach meeting notes. Follow the rules exactly...",
  "prompt": "MEETING: type=group, date=2026-11-17\nATTENDEES: [P07 Jay Carter #12 WR \"JC\"], [P09 ...]\nNOTE:\n...",
  "response_format": { "type": "json_schema", "schema": { "...": "see section 8" } },
  "max_tokens": 2048
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
- Use `null` for missing feedback/deadline fields. For no action, return an `action_item` object with all three fields null.
- Copy source text verbatim for every record.
- Return the deadline phrase as written. Do not calculate dates from relative phrases.
- If a player reference is ambiguous, return `unmatched`. Never guess.
- Do not independently assess a player's character, personality, or attitude. Only record what the coach explicitly said.
- Do not diagnose injuries, recommend treatment, determine medical clearance, or decide insurance coverage. Record only what the coach wrote.
- Use `low` confidence when the wording is vague, the player match is uncertain, or the category is a close call.

---

## 8. Extraction JSON Schema

Sent in `response_format.schema`. The executable contract is `backend/extraction_schema.py`; enums are shared with the frontend in `data/categories.json`. Aivana accepts nullable scalar fields but rejects nullable objects, so absent actions use an object with `task`, `deadline_text`, and `deadline_date` all null. See [Aivana’s supported schema subset](https://developers.aivana.ai/docs/parameters#json-schema-strict).

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
            "type": "object",
            "additionalProperties": false,
            "required": ["task", "deadline_text", "deadline_date"],
            "properties": {
              "task":          { "type": ["string", "null"] },
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
      "feedback": "Great hands today.", "action_item": {"task": null, "deadline_text": null, "deadline_date": null},
      "source_text": "Great hands from JC today.", "confidence": "high" },
    { "target": { "scope": "player", "player_id": "P09", "mention": "#4", "match_method": "jersey_number", "group_label": null },
      "topic": "Football Skills", "skill": "Route Running", "feedback_type": "Improvement",
      "feedback": "Drifting on slants; needs to stay on his landmark.", "action_item": {"task": null, "deadline_text": null, "deadline_date": null},
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
| Source evidence | Exact quotes pass; case/whitespace-only matches recover the original verbatim excerpt. Otherwise the draft is low confidence and cannot save until its quote is corrected or the record removed. Fuzzy matches are not silently accepted. |
| `deadline_date` is a valid date and not before the meeting date | Cleared to `null` and flagged. |
| Group label maps to a roster position group | Kept as one group record for the coach to assign. |

### Relative deadlines (done in code)

`deadline_text` such as "by Friday", "tomorrow", or "in 3 days" is resolved with the meeting date as the base date. Vague phrases such as "next week"/"sometime next week" stay null for coach review; the app does not invent a Monday deadline. The resolved date is shown next to the original phrase ("before Friday → Fri, Nov 20"). If the phrase cannot be resolved, the deadline stays empty and the review screen highlights it. Explicit “this Friday” on a Friday means that day; bare same-day weekday phrases are flagged as ambiguous, and “next Friday” means the next occurrence.

### Validation loop

1. Call Aivana with the schema.
2. For valid-shape drafts with hard content issues (unknown/ambiguous player, unsupported quote, invalid category), make at most **one** corrective model call with a short error list. HTTP/schema/auth/balance failures are not automatically retried; truncated extractions are rejected and must be shortened.
3. If the retry still fails, show the **partial results** with the problem records highlighted. The extraction never silently fails, and the coach can always add records by hand.

### Confidence and review priority

The review screen sorts and colors records: `unmatched` and `low` first (red), then `medium` (amber), then `high` (green). Coaches know where to look first.

### Edit tracking

Drafts and raw structured output are kept separately in `extraction_runs`; they never appear in approved history or prep context. Approval uses the extraction ID and verifies the meeting did not change, then saves records and `record_edits` atomically. The edit log records added/deleted/edited/unchanged drafts with field-level before/after values. Duplicate approval is rejected. A coach-edit rate is not a factual accuracy score; the Level 3 benchmark/stat remains planned.

---

## 10. Data model

**Implemented storage:** `meetings(id, body)` holds approved meeting JSON, preserving legacy records. Schema-v2 items retain the existing UI fields plus topic/confidence/matching/deadline metadata. Shared team feedback uses one item with `player_ids`; explicit team tasks expand to per-player items. `extraction_runs(id, body, saved_meeting_id)` contains drafts/raw model output, and `record_edits` contains atomic field changes. The relational design below is a proposed future migration, not the current on-disk layout.

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

The browser calls the local FastAPI backend through Vite’s `/api` proxy; it never calls Aivana directly.

### Implemented routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend/key-presence health; does not validate the key with Aivana. |
| `GET` | `/api/meta/categories` | Shared topics, skills, match methods, confidence values, schema version. |
| `GET` | `/api/meetings` | All approved meetings; frontend derives directory/timeline/action views. |
| `POST` | `/api/extract` | `{title,date,meeting_type,attendees,note,mode}` → reviewable `items`, `warnings`, `origin`, `extraction_id`, `schema_version`. No approved records are saved. |
| `POST` | `/api/meetings` | Approval/save, including `approved:true`, schema-v2 items, and the extraction ID when extracted. Manual additions and explicitly approved `note_only:true` meetings with `items:[]` are supported. |
| `POST` | `/api/meetings/import` | Idempotent migration of older reviewed Demo browser history. |
| `PATCH` | `/api/meetings/{meeting_id}/items/{item_id}` | Complete/reopen an action with `{completed: true/false}`. |
| `GET` | `/api/players/{player_id}/prep` | SSE brief from up to ten non-sensitive approved records. |
| `POST` | `/api/assistant` | Individual, group or team question with optional meeting-type/skill/topic/date/action/search filters; returns checked citations and supporting records. |
| `GET` | `/api/strategy-boards` | Saved board summaries, most recently updated first. |
| `GET` | `/api/strategy-boards/{id}` | Full coach-authored board. |
| `POST` | `/api/strategy-boards` | Validate and save a new board/copy. |
| `PUT` | `/api/strategy-boards/{id}` | Update with the current integer `revision`; stale revisions return 409. |

Separate roster/timeline endpoints, transcription and insights are planned. Calendar export runs client-side and uses no additional endpoint. Recent-check-in calculations run locally in JavaScript over the shared approved meetings; no additional API endpoint or Aivana call is needed. The current frontend reads the shared roster fixture and approved meetings. There is no public hosting/authentication boundary; run locally with synthetic data.

### AI Assistant

Open **AI Assistant** in the sidebar, **Ask about this player** on a timeline, or **Ask about these actions** on the Action board. The Action board passes its player, category (including legacy categories), status, and search filters; an all-player board opens Team scope. Group scope supports a position-group shortcut and an editable player checklist (at least two players). Team includes the full roster. Meeting type independently limits which conversations can supply records. Suggested prompts fill the question and action scope for the coach to submit.

`POST /api/assistant` accepts `scope` (`individual`, `group`, or `team`; defaults to `individual`), `player_id` for Individual, `player_ids` for Group (two or more distinct roster IDs), `question` (1–800 characters), `mode`, and optional `filters`: `meeting_type`, `skill`, `topic`, `start`, `end`, `status`, `actions_only`, `search`, and inherited Action-board `category`. Dates filter meeting dates. Questions are independent; chat history and questions are not stored. Retrieval uses keyword overlap after filtering, ranks by overlap and recency, and supplies at most 12 records. Group/Team selection first covers distinct players, then fills remaining slots by rank. Each source identifies its applicable selected players; shared feedback appears once. The response reports selected IDs and the number of players represented in the supplied context. A limited answer is not a complete team summary, and missing coverage does not prove missing history. This is bounded keyword retrieval, not semantic search; use explicit subject words or broaden the filters if relevant records are missed.

Live makes one structured Aivana call with a 1200-token output cap. Each factual statement requires known source IDs; invalid citations or truncated output fail the request. The UI maps those IDs to stored meeting dates and exact timeline records. This validates citation membership, not factual entailment; coaches must check the supporting records. Suggestions are separately labeled discussion questions. Full notes and quotes are not sent to the assistant model. No matching context returns without an AI call. Demo lists saved excerpts and explicitly labels them as application output.

Example provider answer:

```json
{
  "statements": [{"text": "The coach assigned coverage-clip review.", "source_ids": ["S1"]}],
  "suggestions": ["What did you learn from the coverage clips?"]
}
```

The HTTP response also includes `sources` (source ID, meeting/record IDs, date, title, and approved record fields), `matched_count`, `context_count`, `limited`, `origin`, `player_id`, and `question`. Counts and date/status comparisons come from code. Sensitive records are excluded even when shown in another view. Group/team chat is not implemented; shared feedback may appear only within the selected player's history.

---

## 12. Error handling and token management

### Aivana errors

| Status | Meaning | App behavior |
|---|---|---|
| 400 / 422 | Invalid request or schema | Logged with `details`; not retried. Coach sees "Extraction failed, you can add records manually." |
| 401 / 403 | Key missing, invalid, or revoked | Clear admin message: check `AIVANA_API_KEY`. Not retried. |
| 402 | Token balance empty | Friendly banner: "AI is unavailable (token balance)". Manual entry still works. |
| 413 | Request too large | Ask the coach to split the note or use a smaller photo. |
| 429 | Rate limit | Surface a clear error; user deliberately retries later. No automatic HTTP retry loop. |
| 502 / 504 | Aivana could not finish / timed out | Surface the error and allow manual entry. Invalid/truncated extraction is not approved. |
| Network error | Connection failed | Surface the error; retain any prior drafts. No automatic HTTP retry. |

Raw structured extraction output and normalized drafts are logged separately from approved records. Detailed transport usage/request-ID logging remains planned. `finish_reason: length` is rejected rather than saved as partial output. At most one corrective call is used for valid-shape drafts with content-validation failures; it is not a general retry policy.

### Bad input

- Empty or very short notes are rejected before any API call.
- Notes over 12,000 characters are rejected; long output may still require much shorter notes under the workspace’s 2048-token cap.
- Unknown/duplicate attendees and invalid date formats are rejected. Bad model targets become unmatched drafts for coach review.

### Token management

- Send only the **attendees'** roster rows, not all 25 players, in a compact one-line format.
- Set `max_tokens` on every call.
- The question box sends only **filtered** records (by player, skill, topic, date), capped at 12 entries, with a visible context-limit notice.
- Prep briefs use only the player's last N records and open action items.
- No PDFs are sent to Aivana. Photo input remains planned.
- No AI calls inside render loops. Extraction runs retain drafts for approval, but a new deliberate extraction makes a new call.
- A token-usage admin panel remains planned.

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
- Sensitive record content is hidden from directory snapshots/radar, and from timelines/action lists until the coach selects the explicit show-sensitive toggle. Full source notes containing sensitive entries are withheld while that toggle is off. This is a local UI filter, not an access-control system.
- Sensitive records are always excluded from preparation and AI Assistant context. Team themes remain planned.

---

## 14. Testing and accuracy measurement

### Regression tests (offline, Aivana mocked)

- Roster matching and `unmatched` handling
- Relative deadline resolution ("by Friday" from a Tuesday meeting date)
- Group fan-out into per-player action items
- Overdue computation, player summaries, and sensitive previews; recent-check-in windows, meeting-type filters, future-date exclusion, never-recorded players, and calendar-day boundaries
- Validation loop: unknown `player_id`, missing source text, bad dates
- Error handling for mocked 402, 429, and 502 responses

### Strategy board verification

Strategy model/rendering tests cover formation membership and open slots, imaginary opponents, coordinate clamping, drawing movement/resizing/rotation, direction reversal, undo/redo snapshots, escaped labels, interactive accessibility metadata and export markup. Backend tests cover round trips and copies, independent meeting storage, stale revisions, malformed geometry, finite/bounded coordinates, roster/side constraints, drawing limits and HTTP errors. A temporary DOM simulation exercised workspace initialization/navigation, field dragging, roster/opponent drag/drop, undo/redo, saving/updating/copying, zone creation/removal, presentation and unsaved-change protection. The SVG field was rendered and visually inspected independently. Browser access was unavailable, so real pointer/touch behavior, responsive layout, native download and canvas PNG export still need browser verification; simulation is not a substitute for those checks.

### Calendar export verification

`frontend/test/calendar-export.test.js` covers eligibility and sensitive-topic exclusion, current action filters, explicit selection, independent shared-player records, stable source/action UIDs, RFC text escaping and injection prevention, UTF-8 75-octet line folding, CRLF output, all-day dates/exclusive end dates, leap/year/DST boundaries, optional alarms, escaped previews and nonmutation. The serializer follows [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html). A separate temporary `icalendar` parser check accepted the 30-event synthetic-pack export and a Unicode/leap-day fixture. Browser download interaction and real calendar-client import/alert handling have not yet been verified for this new feature.

### Extraction accuracy test (Level 3)

**Planned.** Current author-written reference answers are in `data/synthetic/expected.json`; live spot checks are documented separately. A future accuracy runner should use independent labels and report:

| Field | Metric |
|---|---|
| Player match | exact match on `player_id` |
| Topic, skill, feedback type | exact match |
| Action item present | precision and recall |
| Due date (after resolution) | exact match |
| Invented records | count of records with no matching label (should be 0) |

### Live accuracy from coach edits

The `record_edits` log captures coach changes. A future edit-rate display must not call unchanged fields factually correct: coach edits are not an independently measured extraction-accuracy score.

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
| 0:00 to 0:30 | **Problem.** Show the dashboard: saved coaching conversations and open/overdue actions. |
| 0:30 to 1:45 | **Core flow.** Load the individual Avery quarterback sample. Extract in Live, inspect player attribution and exact source quotations, and edit one field. |
| 1:45 to 2:30 | **Approval.** Show that save requires approval, then approve and save. Open Avery's timeline and its original source note. |
| 2:30 to 3:15 | **Follow-up.** Open the Action board, filter by player/status, complete an action, then reopen it. |
| 3:15 to 4:15 | **Level 2 assistant.** Use Jordan's seeded records. Ask “What did I tell Jordan about coverage?” in Live. Open a date citation and its timeline record. Explain that only filtered approved records were sent. |
| 4:15 to 4:45 | **Second Aivana feature.** Start Jordan's streamed preparation brief from his timeline. |
| 4:45 to 5:00 | **Close.** Coach approval, exact evidence, code-computed dates/counts, synthetic data, and the provenance of our team-authored synthetic dataset. |

Backup plan: if the network or Aivana is down, show a saved extraction from a previous run (clearly labeled as recorded) and the manual entry path.

---

## 16. Known limits

- Extraction quality depends on how clearly the note is written. Very short or shorthand notes produce more `low` confidence and `unmatched` records.
- Aivana validates the JSON shape, not the facts. The coach review step is the final check.
- Relative deadline phrases tied to events ("before the Michigan game") cannot be resolved without a schedule and are left for the coach to set.
- Handwriting recognition may misread messy notes. The coach must correct the transcription before extraction.
- Name matching depends on the nicknames and jersey numbers in the synthetic roster.
- Single-user app: demo/demo is a local access shortcut, not authentication; signup/other accounts are previews. No roles or multi-coach permissions.
- SQLite is fine for a demo but is not set up for concurrent multi-user use.
- Free-tier token budget (1M tokens per student) limits how many extractions and accuracy tests can run.
- Not a travel planner: trip notes are recorded, but the app does not book or price travel.
- Not a medical, insurance, or analytics system. Sensitive topics are recorded only as the coach wrote them.
- All data is synthetic. The app has not been tested with real coaching staff.

---

## 17. Roadmap

| Status | Item | Level |
|---|---|---|
| Implemented; agent live flow checked and user reports browser checks complete; team dataset accepted | Meeting form, structured extraction, source highlighting, manual/edit/remove/approve, shared SQLite, timelines, open/overdue actions | 1 |
| Implemented; live spot checks passed | Confidence/unmatched flags, attendee name/nickname/jersey matching, Python deadlines, group/team expansion, bounded correction, edit audit | 1 |
| Implemented; one real HTTP answer checked; user reports browser checks complete | Individual/group/team AI Assistant with filtered records and attributed date/source links | 2 |
| Implemented; live stream checked | Streamed one-on-one prep brief from approved non-sensitive context | 2 |
| Implemented; automated recency checks passed | Players not met recently, with lookback/type controls and timeline links | 2 |
| Stretch | Handwritten note photos | 3 |
| Implemented; unit tests and independent parser checks passed; calendar-app import unverified | Selected open-action `.ics` export with optional day-before alerts | 3 |
| Stretch | Team themes dashboard and action-item timing analysis | 3 |
| Stretch | Extraction accuracy test on labeled notes | 3 |
| Future | Player progress stages per skill (for example, Introduced → Practicing → Consistent) set by the coach | Beyond |
| Stretch | Voice dictation of notes | 3 |
| Future | Multi-coach accounts with role-based access to sensitive records | Beyond |

---

## 18. Judging rubric map

| Criterion (points) | Where this project addresses it |
|---|---|
| Core functionality (30) | Section 2, Level 1: full note → extraction → review → save → timeline → action items flow on the data pack. |
| Use of Aivana (20) | Sections 6 and 8: strict JSON Schema for extraction/assistant, streaming prep brief, `max_tokens`, no calculations left to the model. |
| Depth (15) | All three Level 2 options: individual/group/team assistant, streamed prep brief, and code-computed recent-check-in list. Level 3 calendar export is implemented; other advanced features remain planned. |
| Reliability and data handling (15) | Sections 9 and 12: validation loop, roster checks, error handling for 401/402/429/502, coach approval, no invented facts. |
| Usability (10) | Side-by-side review with highlighted source text, confidence colors, dropdowns for unmatched players. |
| Demo and documentation (10) | Section 15 demo script; this README covers running the app, Aivana features, and known limits; key kept out of the repo. |

---

## 19. Project structure

```text
backend/
  main.py                 # FastAPI routes, bounded corrective extraction, prep SSE
  aivana.py               # Server-side HTTP/SSE adapter
  assistant.py            # Filtered retrieval and citation validation
  config.py               # Explicit private backend/.env loading
  core.py                 # Approved SQLite meetings, draft runs, field edit audit
  extraction_schema.py    # Provider-compatible structured contract
  extraction.py           # Matching, evidence checks, group/team normalization
  dates.py                # Deterministic, conservative deadlines
frontend/
  src/                    # Vanilla JS, BGSU Sass, access/workspace/review views
  test/                   # Node regression checks
  vite.config.js          # Frontend 5174, backend proxy 8001
data/
  categories.json         # Shared frontend/backend enums
  synthetic/              # Original football practice roster, notes and references
  demo.json               # Generated shared app fixtures
scripts/
  build_demo_data.py
  verify_backend.py       # Disposable no-AI checks; --live is explicit/paid
sources/                  # Organizer briefs/emails/guide, NOT a player-data pack
tests/                    # Python unittest suite with mocked AI
```

*Built for the 2026 BGSU Hackathon by picInfiniti. Synthetic data only. No deployment or push is implied by local commits.*
