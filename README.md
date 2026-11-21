# Falcon Follow-up

A football coaching notebook that turns meeting notes into source-backed, coach-approved player records and helps the coach follow through.

Built by **picInfiniti — Siavash and Salma** for **Project A: Coach Meeting Tracker**, 2026 BGSU Hackathon. All application players and coaching records are fictional.

**Implemented:** Level 1 core, all three Level 2 options, and four Level 3 code paths: photo/handwriting transcription, calendar export, voice dictation and a known-answer development benchmark. The workspace also includes a notebook Home, local Schedule, Film room and football Strategy room. Implementation and verification are distinguished below; no general AI accuracy score is claimed.

[Quick start](#quick-start) · [Coaching workflow](#coaching-workflow) · [Feature coverage](#feature-coverage) · [Verification](#verification) · [Accuracy test](#extraction-accuracy-test-known-answer-development-benchmark) · [Limitations](#limitations) · [Demo](#three-minute-demo) · [Technical reference](docs/technical-reference.md)

## Quick start

Run commands from this repository, `bgsu-hackathon-2026`. Requirements: Python 3.10+ and Node.js 20.19+ or 22.12+ (see `frontend/package.json` for the exact supported ranges).

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
| `AIVANA_API_KEY` | Backend-only key for Live extraction, assistant, preparation, image transcription and note/film recaps. |
| `COACH_DB_PATH` | SQLite location; defaults to ignored `backend/coach.sqlite3`. |
| `COACH_ENV_FILE` | Optional explicit environment-file override, useful for isolated checks. |

The backend loads `backend/.env`; exported variables take precedence. Restart after changing the key. Health: <http://127.0.0.1:8001/api/health>. API docs: <http://127.0.0.1:8001/docs>. Health reports key presence, not whether Aivana accepts it.

- **Cannot connect:** confirm both servers are running on ports 8001 and 5174. Vite proxies `/api` to the backend.
- **A feature returns 404:** check the running backend’s `/docs` for its routes and restart it from this checkout if it is stale. A successful health response alone does not prove newer routes are loaded.
- **Live unavailable:** check backend configuration and the displayed error. Manual entry remains available.
- **403 from Aivana:** this can mean a workspace limit as well as permissions. This workspace has a 2048-token extraction output cap.
- **Incomplete extraction:** shorten the note and retry deliberately. Truncated output is rejected, not saved as a partial extraction.
- **Voice unavailable:** browser recognition support and microphone permission vary; typing/pasting remains available.

## Coaching workflow

1. **Capture a note or create a meeting.** Home opens the notebook editor. Save a personal note, then use **Review actions** to enter the meeting approval flow; or use **New meeting** directly. Choose Individual, Group or Full team, a date and roster attendees. Type, paste, dictate or explicitly transcribe an image.
2. **Extract and review.** Aivana proposes player actions, deadlines, praise/improvement and skill/topic categories. Inspect the supporting source text; edit, remove or add records. Unresolved players and invalid quotes block saving.
3. **Approve and save.** Explicit coach approval saves records to SQLite. Conversations without extractable feedback/tasks can instead be reviewed and saved as original notes.
4. **Follow up.** Open a player's compact timeline or Actions. Complete/reopen assignments, inspect source notes, and identify open or overdue work. Shared assignments retain independent player completion controls.
5. **Prepare or ask.** Choose a saved/custom preparation target, date, focus and source conversations. Or ask the assistant about an individual, selected group or full team and follow its dated sources.

**Meetings** uses the calendar design adapted from `coach-dashboard-redesign`: compact Monday-first Month/Week views, Day and Year views, a year/month/day picker, and a deadline visibility toggle. Month remains the default; List, type-colored meeting chips, filters and the small calendar/day agenda stay available. Search/Filters sit on the left and type chips on the right; a selected date appears beside the saved-meeting count. Year dates open Day, and year month headings open Month. List uses compact meeting rows, the same collapsed Filters control, and a toolbar with view switches and sorting. Saved future dates are notebook entries; they do not send invitations or schedule timed appointments.

**Home and Overview.** Home is the default page and uses a three-column notebook: notebooks/folders and recent notes on the left, its note editor in the center, and mini-calendar/Next up/Needs attention on the right. The editor has Type/Pen/Photo/Voice, formatting, versions/replay, recap, speaker labels and Playboard. Live image transcription and recaps require explicit coach actions; there is no automatic voice clean-up call. Save note stores a notebook note; Review actions explicitly copies it into the existing attendee/extraction/coach-approval flow. Linked notes open their existing approved meeting on a second send. Home notes and drawings stay outside assistant and preparation context until meeting records are explicitly approved. The original Overview dashboard is preserved internally and hidden from the sidebar. The two editors retain separate drafts.

**Schedule.** Select a day in Home’s mini-calendar to open the local schedule. It combines saved meetings and eligible action deadlines with coach-created events and to-dos, including recurring events. Schedule entries are separate from approved meeting records; creating an event does not send invitations or create extracted player feedback.

**Film room.** Includes Films, Cut-ups & Teach list, Film packs and Playbook tabs. Add local video (up to 20 GB) or a supported YouTube/Vimeo/Hudl/Drive link. Uploaded playable formats and YouTube/Vimeo support embedded playback; restricted providers open externally with manual timestamp references. Add notes at a time, tag players, make clips, enter coach grades, assemble cut-ups/teaching lists and annotate frames with Playboard. Film observations and assigned breakdowns appear in Home’s existing panels.

**Create action** creates a draft in the existing meeting review screen. Coach approval is required; source film-note IDs/tags survive save, source/player changes block approval, and sensitive film tasks remain hidden/excluded by existing sensitive-record handling. Recap reads only the coach’s written film notes, never video/audio; Demo uses code and Live explicitly calls Aivana. Local `/pack/<token>` pages show only selected pack content and support expiry/revocation. No hosting, messages or publication are performed by this integration. Existing assistant behavior is retained; branch-only film assistant commands are not enabled. Restart FastAPI unless running with `--reload`.

Film verification: backend route/model checks and mocked DOM checks pass, including upload signature/range handling, notes/clips/grades, review handoff, packs and Playboard. Native media playback, external embeds/account access, frame capture, large uploads, mobile/touch layout and real Live film recaps remain unverified.


**Header and help.** The header shows the current page, date, Demo/Live mode and an **Ask Aivana** button. Ask opens a side chat with Individual/Group/Team selection, cited answers and timeline links. The chat’s Voice to text button appends finalized speech to your question; stop and review it before pressing Send. Browser speech support and microphone permission are required. Questions are independent; the drawer does not change records. A first-visit welcome tour introduces the workspace; closing or finishing it is remembered in this browser. Use **Tour** to replay it. Notifications appear at the bottom right.

**Players** provides a searchable position/group roster and compact history. Meeting rows show action counts with orange open, red overdue and green completed-only borders. The retained Overview dashboard computes players-to-check-in-with in code, with meeting-type and 7/14/30/60/90-day controls. Overview is hidden from the sidebar, so these controls are currently an internal dashboard feature. Future dates do not count as completed check-ins.

## Feature coverage

The [official brief](sources/2026_BGSU_Hackathon_Project_Briefs.pdf), page 2, allows **any** of the listed Level 2 and Level 3 additions; completing every optional feature is not required.

| Level | Implemented features |
|---|---|
| **1 — Core** | Meeting type/date/attendees; structured per-player extraction; source-backed review/edit/approval; persistent records; player timelines; open/overdue actions. |
| **2 — Standard** | Backend-filtered Individual/Group/Team questions with dated source links; streamed player preparation; code-computed players-not-met-recently list. All three official options implemented. |
| **3 — Advanced** | Explicit photo/handwriting-to-text input, selected follow-up `.ics` export, browser voice dictation and a repeatable known-answer development benchmark. Live image transcription and native device interactions still need verification. |

### Calendar export

**Actions → Export calendar** previews eligible dated open actions matching current board filters. Select entries and optionally request a day-before display alert. Each player action becomes an all-day event on its due date; shared assignments keep separate player entries. Sensitive records/topics, full notes and quotes are excluded. Export makes no AI call or storage change.

The file is a snapshot. Later edits/completion do not sync, and repeated imports or alerts depend on the receiving calendar app.

### Photo and freehand notes

Home uses the redesign’s **Type / Pen / Photo / Voice** notebook controls. Create meeting also retains the existing **Type / Freehand / Photo / Voice** capture controls. Freehand supports pen colors, eraser, undo/redo and touch/pointer drawing. Create meeting accepts up to four PNG/JPEG images under 8 MB each and resizes them in the browser; Home supports up to five photo attachments, each up to 8 MiB. **Convert handwriting to text** and **Read photos** explicitly use Live Aivana; Demo makes no transcription calls. Check/edit the returned transcript, then choose **Add checked text to note** before the usual extraction and coach approval. Failed or stale responses never append text automatically.

For Create meeting, the original photos and drawing are stored atomically with an approved meeting in the separate `meeting_media` table. Reopen the meeting to inspect them. Images remain in the current draft until approval; New meeting or loading a sample clears them. Source images do not enter assistant or preparation context. As with the source note, image previews are hidden when the meeting contains hidden sensitive records. Restart the backend after this upgrade if not using `--reload`. Real Aivana image transcription and pointer/device behavior still need a live browser check; mocked provider and DOM checks pass.

### Voice dictation

Home uses the branch’s **Voice → Start talking** panel with optional coach-selected speaker labels. Stop and review the transcript, then explicitly use it in the note. Switching pages, input methods or modes cancels recognition and rejects late callbacks. No automatic Aivana clean-up runs when dictation stops. Personal note drafts can be recovered from this browser’s storage; saved notes, folders, versions, images and drawings use separate notebook tables/files.

**Create meeting → Voice → Voice to text** appends final speech to existing notes and shows interim words separately. Stop, review the text, then extract. Context changes cancel recognition; stale results cannot enter another meeting. Recognition invalidates any previous extraction approval and never automatically calls Aivana or saves a meeting.

The browser speech service may process audio online. The app stores no audio. See [voice-to-text details](docs/voice-to-text.md).

### Football Strategy room

Plan a future game or review a past one on a football field with the BGSU Falcons graphic. Add roster players, open formation slots and imaginary opponents, with up to 11 markers per side. Drag players, inspect names/roles/assignments, draw routes, passes, motion, blocks, zones, ink and labels; use templates, a ball/line of scrimmage, snap, reverse direction and undo/redo.

Save/reopen/copy boards with game date, opponent and coach notes; present them or export PNG/SVG. Revision checks reject stale-window overwrites. These are coach-authored diagrams, not automatic game analysis. Strategy storage is separate, makes no AI calls, and never supplies board notes to meeting history, assistant or preparation. Logo provenance is in [assets documentation](frontend/public/assets/README.md).

**Not implemented:** team-theme/trend analytics, action-timing analytics, an independent held-out extraction evaluation, or multi-coach authentication. These are optional future work.

## Aivana and application logic

```text
Browser (vanilla JavaScript + Sass + Vite, :5174)
    → FastAPI (:8001) → Aivana HTTPS API
    → SQLite: approved meetings, drafts/audit, notebook, schedule, film, boards
    → Local files: notebook images, film uploads and Playboard images
```

The backend uses Python's standard-library HTTP client for Aivana and `sqlite3` for storage; no AI SDK or ORM is required.

| Aivana capability | How it is used |
|---|---|
| Structured output / JSON Schema | Extraction contract and source-cited assistant statements. |
| Streaming | Preparation appears incrementally through backend SSE, separately from structured extraction. |
| Image input | Explicit photo/freehand transcription produces text for coach checking before extraction. Video and audio are not sent for automatic analysis. |
| Structured recaps | Explicit Home and Film recaps use written coach notes; Film recap never watches the video. |
| System instructions | Record what the coach said; avoid unsupported player judgments and facts. |
| Bounded requests | Extraction/image transcription: 2048 output tokens; assistant: 1200; preparation: 650; note/film recaps: 1500; `effort: low`. |

Application code resolves supported relative deadlines, matches roster references, expands group assignments, validates quotes/categories, computes counts/overdue status/recency, filters context and sorts results. The model does not perform those calculations.

Assistant requests supply at most **12** approved non-sensitive records; preparation supplies at most **10** from selected conversations. Both report limited context. Full source notes and quotes are excluded from these AI contexts. Questions are independent; there is no persistent multi-turn chat history. Citation checks validate source membership, not whether a statement is fully supported by that source.

Extraction may make **one** content-correction call. HTTP failures and truncated responses are not automatically retried. Drafts/raw extraction output remain separate from approved history; approval records field-level edits atomically. See the [technical reference](docs/technical-reference.md) for schemas, matching rules, API routes and error handling.

## Synthetic dataset and storage

The working dataset is our **team-authored football pack**, selected for this project: **25 fictional players, 19 scenarios and 86 author-written reference records**, version 2, revision 4. The project owner accepted this pack as the working dataset. It is not organizer-provided data, and the supplied Project A pack described in the brief is absent from `sources/`; validation against an organizer pack is therefore not claimed. See [dataset guide](data/synthetic/README.md) and [source inventory](sources/README.md).

The frontend and backend share generated `data/demo.json`. To rebuild it from `data/synthetic/`:

```bash
.venv/bin/python scripts/build_demo_data.py
```

Restart the backend and refresh the frontend afterward. Seven versioned, pre-reviewed meetings seed SQLite idempotently. Existing records and completion states are preserved; old notes may therefore retain earlier sport terminology. Older approved browser history is imported idempotently, with SQLite winning ID conflicts. New approved meeting records are saved to SQLite. Home can retain a recoverable personal draft in browser storage; mode, tour and other UI preferences also use browser storage. There is no offline database fallback.

Notebook attachments, film uploads and Playboard images live beside the database in `<database-stem>_files/` (by default `backend/coach_files/`). Preserve that directory together with the SQLite database when backing up a notebook; copying only the database does not preserve those files.

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
| Automated regression checks | See the current review result below. Coverage includes validation, storage, approval, assistant/preparation selection, calendar serialization, Home/Film routes, Strategy and mocked recognition. |
| Live Aivana checks | Individual/group/team spot checks, an individual browser flow, an assistant HTTP response and streamed preparation are documented. These are selected cases, not a general accuracy benchmark. |
| Existing workspace browser checks | Reported complete by the project owner; distinct from agent-run checks and from features added afterward. |
| Newer interaction checks | DOM simulations cover calendar views, selected preparation, Strategy and mocked dictation. They do not prove native browser/device behavior. |
| Remaining focused checks | Actual microphone/permission UI and Live image transcription/recaps; `.ics` download and calendar-client import/alerts; Strategy pointer/touch/responsive layout and PNG download; newer Home/Film/calendar/selected-preparation browser interactions, native film playback/embeds/frame capture and large uploads. |

**Documentation review, November 21, 2026:** all **121 backend tests**, **25 frontend test files** and the production build passed. The isolated no-AI HTTP smoke check also passed health, Demo extraction, approval/save/read, completion/reopening, note-only persistence and missing-key handling. The backend suite required execution outside the sandbox because FastAPI TestClient hung inside it. These checks used mocked AI and disposable test data; no new Live AI or native browser verification was performed.

Detailed evidence: [November 21 QA](docs/qa-2026-11-21.md), [historical November 20 QA](docs/qa-2026-11-20.md). Older entries describe their historical state.

### Extraction accuracy test: known-answer development benchmark

We tested Live Aivana extraction against **19 synthetic football scenarios with 86 author-written reference records**. The cases cover individual, group and team meetings; shared assignments and praise; explicit, relative, missing and ambiguous deadlines; non-attendee mentions; encouragement-only notes; and a 25-player broadcast.

The November 21 run used **22 provider requests** with no transport or truncation failures. It called the production Aivana adapter and normalizer, including at most one content-correction call per case. Expected answers were never sent to the model. No notebook records were saved or approved.

Eleven scorer/runner tests and the full 89-test backend suite passed at this benchmark checkpoint. Offline replay reproduced the original totals and alignment without new provider calls.

**How scoring works:** the scorer checks source quotes against the note, expands shared records per player, and aligns candidate/reference records one to one using source-word overlap. A record match requires matching evidence, player and kind (action, praise, improvement or observation). Duplicate records cannot increase recall. Skill labels and deadlines are scored separately; task/feedback meaning and topic correctness are not automatically scored.

| Measurement | Recorded result | Meaning |
|---|---:|---|
| Action recall | **69/69 — 100%** | All reference actions were recovered with matching evidence, player and action kind. |
| Action precision | **69/72 — 95.8%** | Three additional action candidates were classified as improvements in the references. |
| Action deadlines | **69/69 — 100%** | All aligned reference actions also had the expected deadline: 65 dated, 4 correctly undated. |
| Overall record recall | **80/86 — 93.0%** | Reference records recovered with matching evidence, player and kind. |
| Overall record precision | **80/119 — 67.2%** | Generated records matching the reference evidence, player and kind. |
| Player agreement | **83/84 — 98.8%** | Correct player on evidence-aligned pairs; missing records are outside this denominator. |
| Record-kind agreement | **81/84 — 96.4%** | Correct action/praise/improvement/observation kind on evidence-aligned pairs. |
| Exact skill agreement | **54/84 — 64.3%** | Exact skill-label agreement on evidence-aligned pairs; reasonable alternatives still count as disagreements. |
| Invalid source quotes | **0** | Every candidate quote occurred in the note under case/whitespace recovery; this alone does not establish correctness. |

**Why 67.2%?** Of 119 generated per-player records, 80 matched, 35 were extra records not included in the reference answers, and 4 aligned with the evidence but disagreed on player or kind. For example, “Review the walkthrough sheet” should produce an action; the model also produced Improvement feedback repeating that assignment. “Extra” does not automatically mean invented: some source-backed observations may reasonably be missing from the reference list and require review.

**Failures found:** praise addressed to three named linemen remained unmatched; pure assignments were also emitted as improvement feedback; some “Work on…” advice became actions instead of improvement records; and encouragement-only notes produced unwanted unmatched records. Three cases retained validation errors and required coach correction/removal before saving. Returning a response for all 19 cases did **not** mean all cases passed.

**Evaluation limits:** this is one run on previously used, team-authored development examples, not an independent held-out evaluation or a general AI accuracy score. Two whole-team cases contribute 50 of the 69 reference actions, so pooled player counts are not independent samples. Lexical alignment can miss valid alternative quotes, and skill labels can be debatable. Coach-edit logs are also **not** an accuracy score. The next priorities are shared-praise attribution, redundant feedback and consistent encouragement handling, followed by a fresh run and separately reviewed unfamiliar notes.

To repeat the full test with the backend key configured privately (consumes tokens; at most 38 requests), use a new output path:

```bash
.venv/bin/python scripts/benchmark_extraction.py --live --output /tmp/falcon-accuracy-run.json
```

To reproduce scores from saved outputs without AI calls:

```bash
.venv/bin/python scripts/benchmark_extraction.py --replay docs/benchmarks/football-v2-r4-2026-11-21.json --output /tmp/falcon-accuracy-replay.json
```

See the [benchmark method and options](docs/extraction-benchmark.md), [full results](docs/benchmarks/football-v2-r4-2026-11-21.md), [machine-readable evidence](docs/benchmarks/football-v2-r4-2026-11-21.json), and [review of discrepancies](docs/benchmarks/football-v2-r4-review.md).

## Limitations

- **Human review is essential.** Schema validation checks structure; source checks and citations do not guarantee factual correctness. Ambiguous players/deadlines require coach resolution. The app must not infer a player's character or attitude.
- **Long team output can exceed the workspace cap.** The 12,000-character input limit does not guarantee a complete response under 2048 output tokens. Prefer short, clear notes; truncation is rejected.
- **Event-relative dates need context.** “Before the Michigan game” cannot be resolved without a schedule. Vague “next week” does not receive an invented deadline.
- **Local, single-user prototype.** Demo login and sensitive-record toggles are not authentication or access control. No production hosting or multi-coach permissions are provided.
- **Sensitive content stays restricted in the UI and AI context.** It is hidden by default and excluded from assistant/preparation/calendar export. Stored notes still exist locally; use synthetic data only.
- **Network/browser dependencies.** Live needs Aivana availability/balance; voice depends on the browser speech service. Demo still needs the local backend. Calendar alerts/import behavior depends on the receiving client.
- **No real coaching validation or independent accuracy evaluation.** The development benchmark uses author-written labels on previously used examples. The app has not been tested with real coaching staff or real player records.

## Three-minute demo

Rehearse with a separate synthetic notebook and enough Aivana balance. Pick short known notes and keep optional features brief.

| Time | Demonstration |
|---|---|
| 0:00–0:15 | Explain the coaching follow-up problem; show Home and identify the fictional football roster. |
| 0:15–1:15 | Use New meeting and Avery’s short quarterback sample; extract in Live, inspect evidence, edit one field and explicitly approve/save. |
| 1:15–1:45 | Open the player timeline/source, then show the action deadline and Complete/Reopen. |
| 1:45–2:10 | Ask the Live assistant a short question about saved records and open a dated citation. |
| 2:10–2:40 | Select preparation sources/target and show the Aivana stream. |
| 2:40–3:00 | Explain coach approval, code-computed dates/counts, synthetic data and the benchmark’s limits. |

The latest organizer email requests a precise presentation of about three minutes and recommends one presenter; the original brief allows 3–5 minutes. Rehearse provider latency and keep Film, Strategy, image input, voice and calendar export as optional follow-ups. If Aivana is unavailable, use clearly labeled Demo samples or a previously captured result, explain the limitation, and show manual review/entry; do not present fixture output as a Live response.

## Judging rubric and submission

The [official brief](sources/2026_BGSU_Hackathon_Project_Briefs.pdf), page 3, defines the rubric. These are feature mappings, not claimed scores.

| Criterion | Points | Project evidence |
|---|---:|---|
| Core functionality | 30 | Note → structured extraction → review/approval → stored timeline → open/overdue actions. |
| Aivana use | 20 | JSON Schema, filtered source-cited answers, streamed preparation and bounded context/output. |
| Depth | 15 | All three Level 2 options; Level 3 image-input path, calendar export, voice dictation and a known-answer benchmark, subject to verification/evaluation limits above. |
| Reliability/data handling | 15 | Bad-input checks, bounded correction, visible API failures, quote/roster validation and approval audit. |
| Usability | 10 | Source-backed review, searchable roster/actions, compact history and Month/Week/Day/Year/List calendars. |
| Demo/documentation | 10 | Setup instructions, explicit limitations, verification evidence and a timed demo. |

Organizer references are indexed in [sources/README.md](sources/README.md). The [latest email](sources/email-3.md) adds submission steps to the brief:

| Deadline (November 21, 2026, America/New_York) | Required team action |
|---|---|
| **2 PM** | Send **one email per team** to all three judges together, CC every participating team member, and include the team name, participating member names and GitHub repository link. Give the judges appropriate GitHub access. Judge contacts are in the email. |
| **At or before 5 PM** | Submit the project, stop all changes, and have one team member acknowledge in the event’s Microsoft Teams chat that no more changes will be made. |
| **5–5:30 PM** | Prepare the presentation; make no project changes after the freeze. |
| **5:30 PM** | Present the working app; aim for about three minutes with one presenter under the latest email guidance. |

The latest email warns that duplicate/correction submission emails and a missing freeze acknowledgment incur point deductions. The repository must include the README and synthetic application data, with no credentials or real player information. Configured repository: [PicInfiniti/bgsu-hackathon-2026](https://github.com/PicInfiniti/bgsu-hackathon-2026). Its remote URL and local commits do not establish judge access or completed submission; this documentation review does not send email, post to Teams or publish code.

## Repository guide

| Path | Contents |
|---|---|
| `backend/` | FastAPI routes, Aivana HTTP/SSE, extraction/approval, assistant/preparation, notebook/schedule, Film and Strategy storage. |
| `frontend/src/` | Vanilla JavaScript, Sass, Home notebook, Film, calendars, capture/dictation, `.ics` export and Strategy UI. |
| `data/synthetic/` | Fictional roster, meeting scenarios, reference answers and provenance. |
| `data/demo.json` | Generated shared application fixture. |
| `tests/`, `frontend/test/` | Backend and frontend regression suites. |
| `scripts/` | Fixture generation, disposable HTTP verification and extraction benchmark/replay. |
| `docs/` | QA evidence, voice details and [technical reference](docs/technical-reference.md). |
| `sources/` | Organizer briefs, API guide and emails; not an application player roster. |

The BGSU graphic's source is documented with the asset. Participant contact lists are excluded from version control and must never become player data. Keep keys and runtime databases local and ignored.
