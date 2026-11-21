# Falcon Follow-up

A football coaching notebook that turns meeting notes into source-backed, coach-approved player records and helps the coach follow through.

Built by **picInfiniti — Siavash and Salma** for **Project A: Coach Meeting Tracker**, 2026 BGSU Hackathon. All application players and coaching records are fictional.

**Implemented:** Level 1 core, all three Level 2 options, and three Level 3 options: calendar export, voice dictation and a known-answer development benchmark. The workspace also includes a football Strategy room. Implementation and verification are distinguished below; no general AI accuracy score is claimed.

[Quick start](#quick-start) · [Coaching workflow](#coaching-workflow) · [Feature coverage](#feature-coverage) · [Verification](#verification) · [Limitations](#limitations) · [Demo](#five-minute-demo) · [Technical reference](docs/technical-reference.md)

## Quick start

Run commands from this repository, `bgsu-hackathon-2026`. Requirements: Python 3.10+ and Node.js 20.19+ or 22.12+.

### 1. Start the backend

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
# Create config only if it does not already exist.
[ -f backend/.env ] || cp backend/.env.example backend/.env
```

For **Live** AI features, set `AIVANA_API_KEY` privately in `backend/.env`. Leave it empty to use Demo samples and manual entry. Never put a key in frontend code or a `VITE_` variable.

```bash
.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

### 2. Start the frontend in another terminal

```bash
cd frontend
npm ci
npm run dev
```

Open **<http://127.0.0.1:5174/login>** and enter **`demo` / `demo`**. Select **Live · Aivana** inside the workspace when the backend key is configured.

This login is a local demo shortcut, not authentication. Other login/signup screens are previews and do not save or send passwords. Both modes require the backend and share the same SQLite notebook.

| Mode | Extraction | Assistant | Preparation |
|---|---|---|---|
| Demo | Exact prepared sample fixtures; use manual entry for other notes | Labeled saved-record excerpts | Labeled application-generated checklist |
| Live | Aivana structured extraction | Aivana answer with checked source IDs and dated links | Streamed Aivana brief |

Demo makes no Aivana calls. Switching modes does not reset records or completion states.

### Configuration and troubleshooting

| Setting | Purpose |
|---|---|
| `AIVANA_API_KEY` | Backend-only key for Live extraction, assistant and preparation. |
| `COACH_DB_PATH` | SQLite location; defaults to ignored `backend/coach.sqlite3`. |
| `COACH_ENV_FILE` | Optional explicit environment-file override, useful for isolated checks. |

The backend loads `backend/.env`; exported variables take precedence. Restart after changing the key. Health: <http://127.0.0.1:8001/api/health>. API docs: <http://127.0.0.1:8001/docs>. Health reports key presence, not whether Aivana accepts it.

- **Cannot connect:** confirm both servers are running on ports 8001 and 5174. Vite proxies `/api` to the backend.
- **Live unavailable:** check backend configuration and the displayed error. Manual entry remains available.
- **403 from Aivana:** this can mean a workspace limit as well as permissions. This workspace has a 2048-token extraction output cap.
- **Incomplete extraction:** shorten the note and retry deliberately. Truncated output is rejected, not saved as a partial extraction.
- **Voice unavailable:** browser recognition support and microphone permission vary; typing/pasting remains available.

## Coaching workflow

1. **Create a meeting.** Choose Individual, Group or Full team, a date and roster attendees. Type, paste or dictate the conversation.
2. **Extract and review.** Aivana proposes player actions, deadlines, praise/improvement and skill/topic categories. Inspect the supporting source text; edit, remove or add records. Unresolved players and invalid quotes block saving.
3. **Approve and save.** Explicit coach approval saves records to SQLite. Conversations without extractable feedback/tasks can instead be reviewed and saved as original notes.
4. **Follow up.** Open a player's compact timeline or Actions. Complete/reopen assignments, inspect source notes, and identify open or overdue work. Shared assignments retain independent player completion controls.
5. **Prepare or ask.** Choose a saved/custom preparation target, date, focus and source conversations. Or ask the assistant about an individual, selected group or full team and follow its dated sources.

**Meetings** offers Month, Week and List views, type-colored meeting chips, due-action chips and filters. A small calendar/day agenda stays available in all three modes. Saved future dates are notebook entries; they do not send invitations or schedule timed appointments.

**Players** provides a searchable position/group roster and compact history. Meeting rows show action counts with orange open, red overdue and green completed-only borders. **Overview → Players to check in with** computes recency in code, with meeting-type and 7/14/30/60/90-day controls. Future dates do not count as completed check-ins.

## Feature coverage

The [official brief](sources/2026_BGSU_Hackathon_Project_Briefs.pdf), page 2, allows **any** of the listed Level 2 and Level 3 additions; completing every optional feature is not required.

| Level | Implemented features |
|---|---|
| **1 — Core** | Meeting type/date/attendees; structured per-player extraction; source-backed review/edit/approval; persistent records; player timelines; open/overdue actions. |
| **2 — Standard** | Backend-filtered Individual/Group/Team questions with dated source links; streamed player preparation; code-computed players-not-met-recently list. All three official options implemented. |
| **3 — Advanced** | Selected follow-up `.ics` export, browser voice dictation and a repeatable known-answer development benchmark. Verification and evaluation limits are listed below. |

### Calendar export

**Actions → Export calendar** previews eligible dated open actions matching current board filters. Select entries and optionally request a day-before display alert. Each player action becomes an all-day event on its due date; shared assignments keep separate player entries. Sensitive records/topics, full notes and quotes are excluded. Export makes no AI call or storage change.

The file is a snapshot. Later edits/completion do not sync, and repeated imports or alerts depend on the receiving calendar app.

### Voice dictation

**Create meeting → Voice to text** appends final speech to existing notes and shows interim words separately. Stop, review the text, then extract. Context changes cancel recognition; stale results cannot enter another meeting. Recognition invalidates any previous extraction approval and never automatically calls Aivana or saves a meeting.

The browser speech service may process audio online. The app stores no audio. See [voice-to-text details](docs/voice-to-text.md).

### Football Strategy room

Plan a future game or review a past one on a football field with the BGSU Falcons graphic. Add roster players, open formation slots and imaginary opponents, with up to 11 markers per side. Drag players, inspect names/roles/assignments, draw routes, passes, motion, blocks, zones, ink and labels; use templates, a ball/line of scrimmage, snap, reverse direction and undo/redo.

Save/reopen/copy boards with game date, opponent and coach notes; present them or export PNG/SVG. Revision checks reject stale-window overwrites. These are coach-authored diagrams, not automatic game analysis. Strategy storage is separate, makes no AI calls, and never supplies board notes to meeting history, assistant or preparation. Logo provenance is in [assets documentation](frontend/public/assets/README.md).

**Not implemented:** photographed handwriting input, team-theme/trend analytics, action-timing analytics, an independent held-out extraction evaluation, or multi-coach authentication. These are optional future work.

## Aivana and application logic

```text
Browser (vanilla JavaScript + Sass + Vite, :5174)
    → FastAPI (:8001) → Aivana HTTPS API
    → SQLite: approved meetings, extraction drafts, edit audit, strategy boards
```

The backend uses Python's standard-library HTTP client for Aivana and `sqlite3` for storage; no AI SDK or ORM is required.

| Aivana capability | How it is used |
|---|---|
| Structured output / JSON Schema | Extraction contract and source-cited assistant statements. |
| Streaming | Preparation appears incrementally through backend SSE. |
| System instructions | Record what the coach said; avoid unsupported player judgments and facts. |
| Bounded requests | Extraction: 2048 output tokens; assistant: 1200; preparation: 650; `effort: low`. |

Application code resolves supported relative deadlines, matches roster references, expands group assignments, validates quotes/categories, computes counts/overdue status/recency, filters context and sorts results. The model does not perform those calculations.

Assistant requests supply at most **12** approved non-sensitive records; preparation supplies at most **10** from selected conversations. Both report limited context. Full source notes and quotes are excluded from these AI contexts. Questions are independent; there is no persistent multi-turn chat history. Citation checks validate source membership, not whether a statement is fully supported by that source.

Extraction may make **one** content-correction call. HTTP failures and truncated responses are not automatically retried. Drafts/raw extraction output remain separate from approved history; approval records field-level edits atomically. See the [technical reference](docs/technical-reference.md) for schemas, matching rules, API routes and error handling.

## Synthetic dataset and storage

The working dataset is our **team-authored football pack**, selected for this project: **25 fictional players, 19 scenarios and 86 author-written reference records**, version 2, revision 4. It is not organizer-provided data. See [dataset guide](data/synthetic/README.md).

The frontend and backend share generated `data/demo.json`. To rebuild it from `data/synthetic/`:

```bash
.venv/bin/python scripts/build_demo_data.py
```

Restart the backend and refresh the frontend afterward. Seven versioned, pre-reviewed meetings seed SQLite idempotently. Existing records and completion states are preserved; old notes may therefore retain earlier sport terminology. Older approved browser history is imported idempotently, with SQLite winning ID conflicts. New records are saved to SQLite, not browser storage. There is no offline database fallback.

For a separate rehearsal notebook, set `COACH_DB_PATH` to a new local SQLite path before starting the backend. Keep the normal database intact. Use a separate browser profile without legacy localStorage history if you want to avoid importing earlier notes into that rehearsal notebook.

## Verification

From the repository root:

```bash
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/verify_backend.py --port 18001
npm --prefix frontend test
npm --prefix frontend run build
```

The HTTP smoke script uses a disposable database. Its default run makes no AI calls and does not load the private backend environment file. An optional Live run consumes Aivana tokens for extraction and preparation, with at most one extraction correction:

```bash
.venv/bin/python scripts/verify_backend.py --port 18001 --live --key-file aivana.api
```

`aivana.api` is an optional ignored local key file; never commit it or `backend/.env`.

| Evidence | Scope and remaining limits |
|---|---|
| Automated regression checks | Backend tests, frontend tests and production build passed at the latest feature checkpoints. Covers validation, storage, approval, assistant/preparation selection, calendar serialization, strategy and mocked recognition. |
| Live Aivana checks | Individual/group/team spot checks, an individual browser flow, an assistant HTTP response and streamed preparation are documented. These are selected cases, not a general accuracy benchmark. |
| Existing workspace browser checks | Reported complete by the project owner; distinct from agent-run checks and from features added afterward. |
| Newer interaction checks | DOM simulations cover calendar views, selected preparation, Strategy and mocked dictation. They do not prove native browser/device behavior. |
| Remaining focused checks | Actual microphone/permission UI; `.ics` download and calendar-client import/alerts; Strategy pointer/touch/responsive layout and PNG download; newer calendar/selected-preparation browser interactions. |

Detailed evidence: [November 21 QA](docs/qa-2026-11-21.md), [historical November 20 QA](docs/qa-2026-11-20.md). Older entries describe their historical state.

A [repeatable extraction development benchmark](docs/extraction-benchmark.md) now runs Live Aivana against the 19 team-authored scenarios and supports offline replay. It reports evidence/player/kind precision and recall, exact field agreement, failed calls and a discrepancy review queue. The [recorded run](docs/benchmarks/football-v2-r4-2026-11-21.md) is one pass over known development cases, not an independent held-out evaluation. Task meaning and extra records require review. Coach-edit logs are **not** an accuracy score.

## Limitations

- **Human review is essential.** Schema validation checks structure; source checks and citations do not guarantee factual correctness. Ambiguous players/deadlines require coach resolution. The app must not infer a player's character or attitude.
- **Long team output can exceed the workspace cap.** The 12,000-character input limit does not guarantee a complete response under 2048 output tokens. Prefer short, clear notes; truncation is rejected.
- **Event-relative dates need context.** “Before the Michigan game” cannot be resolved without a schedule. Vague “next week” does not receive an invented deadline.
- **Local, single-user prototype.** Demo login and sensitive-record toggles are not authentication or access control. No production hosting or multi-coach permissions are provided.
- **Sensitive content stays restricted in the UI and AI context.** It is hidden by default and excluded from assistant/preparation/calendar export. Stored notes still exist locally; use synthetic data only.
- **Network/browser dependencies.** Live needs Aivana availability/balance; voice depends on the browser speech service. Demo still needs the local backend. Calendar alerts/import behavior depends on the receiving client.
- **No real coaching validation or independent accuracy evaluation.** The development benchmark uses author-written labels on previously used examples. The app has not been tested with real coaching staff or real player records.

## Five-minute demo

Rehearse with a separate synthetic notebook and enough Aivana balance. Pick short known notes and keep optional features brief.

| Time | Demonstration |
|---|---|
| 0:00–0:25 | Explain the coaching follow-up problem; show Overview and the football roster. |
| 0:25–1:35 | Create an Individual meeting using Avery's quarterback sample; extract in Live, inspect exact evidence and edit one field. |
| 1:35–2:15 | Explicitly approve/save; open the player timeline and original source. |
| 2:15–2:50 | Filter Actions, complete/reopen an assignment and show its deadline. |
| 2:50–3:35 | Ask the Live assistant about Jordan's coverage records; open a dated citation. |
| 3:35–4:20 | Select preparation sources/target and show the Aivana stream. |
| 4:20–4:45 | Show one verified Level 3 feature: selected `.ics` export or voice dictation. |
| 4:45–5:00 | Close with coach approval, evidence, code-computed dates/counts and the synthetic dataset. |

Keep Strategy as an optional follow-up demonstration. If Aivana is unavailable, use clearly labeled Demo samples or a previously captured result, explain the limitation, and show manual review/entry; do not present fixture output as a Live response.

## Judging rubric and submission

The [official brief](sources/2026_BGSU_Hackathon_Project_Briefs.pdf), page 3, defines the rubric. These are feature mappings, not claimed scores.

| Criterion | Points | Project evidence |
|---|---:|---|
| Core functionality | 30 | Note → structured extraction → review/approval → stored timeline → open/overdue actions. |
| Aivana use | 20 | JSON Schema, filtered source-cited answers, streamed preparation and bounded context/output. |
| Depth | 15 | All three Level 2 options; Level 3 calendar export, voice dictation and a known-answer benchmark, subject to verification/evaluation limits above. |
| Reliability/data handling | 15 | Bad-input checks, bounded correction, visible API failures, quote/roster validation and approval audit. |
| Usability | 10 | Source-backed review, searchable roster/actions, compact history and Month/Week/List calendars. |
| Demo/documentation | 10 | Setup instructions, explicit limitations, verification evidence and a timed demo. |

Submission requires a repository accessible to judges, a README, synthetic application data, no committed credentials, and a working 3–5 minute presentation. Official submission deadline: **November 21, 2026, 5 PM America/New_York**; presentations begin at **5:30 PM**. Local commits alone do not establish publication, judge access or submission.

## Repository guide

| Path | Contents |
|---|---|
| `backend/` | FastAPI routes, Aivana HTTP/SSE, extraction/approval logic, preparation, assistant and separate Strategy storage. |
| `frontend/src/` | Vanilla JavaScript, Sass, calendar views, voice dictation, `.ics` export and Strategy UI. |
| `data/synthetic/` | Fictional roster, meeting scenarios, reference answers and provenance. |
| `data/demo.json` | Generated shared application fixture. |
| `tests/`, `frontend/test/` | Backend and frontend regression suites. |
| `scripts/` | Fixture generation and disposable HTTP verification. |
| `docs/` | QA evidence, voice details and [technical reference](docs/technical-reference.md). |
| `sources/` | Organizer briefs, API guide and emails; not an application player roster. |

The BGSU graphic's source is documented with the asset. Participant contact lists are excluded from version control and must never become player data. Keep keys and runtime databases local and ignored.
