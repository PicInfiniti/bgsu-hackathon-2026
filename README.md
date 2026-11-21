# Falcon Follow-up — Project A: Coach Meeting Tracker

The selected hackathon project for picInfiniti (Siavash and Salma), currently a local prototype. Project A was selected on November 20, 2026. This checkout is `/home/siavash/Programming/Hackathon/bgsu-hackathon-2026`. Its existing `origin` is `git@github.com:PicInfiniti/bgsu-hackathon-2026.git`; local commits do not publish changes. The earlier Project B implementation remains in Git history. Other checkouts are independent and are not modified by these instructions.

## Run the frontend

Requirements: Node 20.19+ or 22.12+ (per Vite's supported versions), npm, and the backend described below. **Both Demo and Live use the same SQLite database.** Demo needs no Aivana key; Live extraction and streaming need one.

```bash
# From this repository root:
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5174/login**. Use **`demo` for the coach ID and `demo` for the password** to open Demo extraction. The login field accepts a coach ID as well as an email. To use Aivana, choose **Open live workspace** or open **http://127.0.0.1:5174/workspace?mode=live**. The signup preview is at **http://127.0.0.1:5174/signup**. Both modes require FastAPI on port 8001; Vite serves the frontend on 5174. Switch the **Extraction** selector to change the extractor without replacing your records. The selected mode remains in the URL after reload.

The frontend follows a warm notebook design with BGSU orange and brown: notebook navigation, a ruled meeting editor, a calendar based on saved meeting/action dates, and a follow-up sidebar. Login and signup use matching paper panels and notebook artwork.

The `demo` / `demo` login is a local access shortcut, not server authentication or an account. No password is saved or sent. Other account login and signup remain design previews; the workspace is directly accessible. Forms retain native required-field validation, email validation on signup, password visibility controls, and the signup password minimum. Browser interaction and visual QA remain unverified.

1. Start with the one-on-one sample, or select the group/team example.
2. Click **Extract sample records**. These are prepared fixtures, not AI-generated results. Extraction intentionally refuses changed notes, date, meeting type, or attendees rather than pretending to understand arbitrary text.
3. Review/edit the player, record type, text, skill area, and due date; remove unwanted records.
4. Check the approval box, then save the meeting.
5. Open player timelines or the action board; complete and reopen tasks. Source notes stay attached.
6. Build a preparation checklist in a player's timeline. In demo mode this is a deterministic checklist, not an Aivana stream.

Both modes read, save, and update records through the same backend SQLite store. The practice pack’s two pre-reviewed example meetings are seeded once with stable IDs; later startups never overwrite existing SQLite records or completion states. Mode switching changes extraction and preparation behavior only. Both modes use the current local date for overdue status.

Older approved browser Demo history under `picinfiniti.coach.prototype.v1` is imported into SQLite on connection, preserving meeting/item IDs and completion status. Existing SQLite records win ID conflicts; imports are idempotent and the original browser copy is retained. Historical team notes from the smaller roster are allowed during migration; new team notes still require the current full roster. Invalid legacy notes are not partially imported; the app reports the issue and keeps the browser copy. Browser storage is no longer used for new saves. If the backend is unavailable, the app reports that instead of switching to a different dataset.

## Run the shared backend

Requirements: Python 3.10+ and package download access. A private Aivana Live key is needed only for Live extraction and preparation.

```bash
# From this repository root
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

The backend automatically loads **`backend/.env`**, using an explicit server-side path. This checkout’s private file has been configured from the existing `aivana.api` key. On a fresh checkout, copy `backend/.env.example` to `backend/.env` and replace the placeholder privately. Both `.env` and the old key file are ignored by Git. Never put the key in a `VITE_` variable or browser code.

Start the backend from this repository root:

```bash
.venv/bin/python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

Exported environment variables take precedence over `.env`; remove a stale export with `unset AIVANA_API_KEY` if you want to use the file. Restart the backend after changing `.env` (the Python reload watcher may not notice that file). Keep the frontend running in another terminal; choose **Live · Aivana**. Vite forwards `/api` to port 8001.

`GET /api/health` reports whether the running server has a key; it does not validate the key with Aivana. Check the current health response before using live extraction; an older server may need restarting to receive the environment variable.

Live mode supports:

- Aivana JSON Schema extraction at `/api/extract`, with server-side validation of attendees, verbatim source quotations, and date/type constraints.
- Explicit approval before SQLite persistence, plus retrieval and action completion.
- A separate Aivana SSE preparation brief from up to eight recent meetings for the selected player. Briefs cite dates; streamed errors and incomplete answers are surfaced.
- No automatic retries in this prototype: failures are surfaced and the user can deliberately retry. Never loop on failed requests.
- Extraction requests up to 2048 output tokens, matching the verified workspace limit. Truncated extraction is rejected; shorten the note rather than saving partial output. For long team notes, use short sections with a few assignments each, retaining the original date, attendees, and context needed to attribute each statement; review and save each section separately. A short 25-attendee note with three named records has passed a live check. Automatic batching is not implemented. A 403 can indicate a workspace limit as well as key permissions.

SQLite is stored in ignored `backend/coach.sqlite3`; override `COACH_DB_PATH` to use another local file. It contains the same pack examples and approved records in both modes. New extractions are never saved until the coach approves them.

Official API references: [structured output](https://developers.aivana.ai/docs/structured-outputs), [streaming](https://developers.aivana.ai/docs/streaming).

## Checks

```bash
# From this repository root
.venv/bin/python -m unittest discover -s tests -v
cd frontend
npm test
npm run build
```

Core/adapter checks use only Python's standard library and mocked API responses. Route tests require the backend development dependencies and otherwise explicitly skip. No test sends real requests or consumes tokens.

Run the separate HTTP smoke check from the project root. It starts and stops a temporary backend and uses a disposable SQLite database. Port 18001 avoids the frontend's normal backend on 8001:

```bash
.venv/bin/python scripts/verify_backend.py --port 18001
# Opt in to two real Aivana calls; consumes tokens:
.venv/bin/python scripts/verify_backend.py --port 18001 --live --key-file aivana.api
```

The key file may contain a raw Live key or `AIVANA_API_KEY=value`; its contents are never executed or printed. Alternatively, export the key and omit `--key-file`. The check saves only the explicitly approved synthetic demo fixture. It displays real extracted records for review without saving them, then streams a brief from the approved fixture. Application data is untouched. It stops on errors without retrying. Run scripts normally without Python's `-O` flag, since checks use assertions.

Verification results and outstanding checks are recorded in [the QA report](docs/qa-2026-11-20.md). Tests use mocks unless explicitly run with `--live`. Browser QA and organizer-pack validation are separate requirements.

## Synthetic practice data

See [the pack guide](data/synthetic/README.md) for the 25-player roster, readable meeting notes, and reference extraction answers. Regenerate app fixtures with `.venv/bin/python scripts/build_demo_data.py`. Restart the backend to load roster changes; refresh the frontend to see all 14 scenarios. Existing browser history and SQLite records are preserved. The all-player broadcast is an intentional 2048-token output-budget stress case, not a verified live demo. Reference answers are not sent to Aivana. Only the two pre-reviewed example meetings seed SQLite; the other expected records are for review/testing, not automatic import.

The four workspace summary cards are navigation links: saved meetings jump to recent conversations, open actions and needs follow-up open their respective action filters, and players reached opens player timelines.

## Scope and limitations

- Synthetic data only: `data/synthetic/` contains our own 25-player practice pack, 14 meeting scenarios, and 57 author-written expected records. `data/demo.json` is generated from it. It is **not** the organizers' data pack; validation on their supplied data remains outstanding.
- This is a local prototype of the final selected project, not a completed competition submission. Live extraction has been sampled on individual, group, team, and deadline/attribution edge cases; this is not a general accuracy benchmark. The full browser live workflow still needs review.
- Both extraction modes require the Python backend for shared SQLite storage. The production build passes, but the browser access host is unavailable in this environment; browser interaction and visual QA remain unverified.
- Human review is required. Schema/source validation cannot prove that a paraphrase or player attribution is correct. Source quotations are evidence, not factual guarantees.
- No authentication, multi-user synchronization, deletion UI, reminder export, voice input, handwritten notes, or accuracy benchmark is included. Demo fixture tests are not an AI accuracy evaluation.
- Prototype data is local and single-user. Do not expose the development backend publicly.
- The public Aivana schema/streaming contracts and the individual-sample live integration have been checked. Human review remains necessary for every extracted meeting.

## Repository isolation

This checkout has its own `.git`, `AGENTS.md`, frontend lockfile, fixtures, ignored database, and dependencies. An existing GitHub `origin` is configured as described above; it has not been changed or pushed during local review. Publishing, judge access, and submission remain separate steps. Do not copy keys or runtime databases between checkouts.
