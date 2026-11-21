# Film room, Playboard, Skill checks and Film packs

Build brief approved by Salma on November 21, 2026 (10:12 AM). It combines the coordinator's delivered prompt with these items from the earlier research draft: player packet "Opened" / "I watched it" status, the keyboard grading flow with "Everyone did his job", the 80% target and optional Technique/Effort marks, the YouTube IFrame API, Mark in/out with I/O and auto-start of the next clip, Must/Should/Later order with a 4:00 PM stop-and-report, and the packet line "works on this computer and local network only". Later the same day Salma added two rules: **no fixed categories anywhere (open tags)**, and **accept any video file type** (convert to MP4 with ffmpeg if installed).

## 1. Inspection report (before building)

| Area | Where it lives |
|---|---|
| Meetings, review, approval, homework (action items) | `backend/core.py` (`Store`, `validate_meeting`, `validate_item`), `backend/extraction.py`, `backend/extraction_schema.py`; review UI in `frontend/src/main.js` (`renderReview`, `openFindHomework`, `openReviewDraft`) |
| Notes (Home editor), versions, ink | `backend/notebook.py`, `backend/notebook_routes.py`; `frontend/src/notes-editor.js` |
| Player timeline | `frontend/src/main.js` (`openPlayerTimeline`, `#timeline`), now plus `frontend/src/player-film.js` |
| Schedule | `backend/notebook.py` (events, `expand_events`, `.ics`), `frontend/src/schedule-view.js` |
| Pen pad / undo | `frontend/src/pen-pad.js`, `frontend/src/history-stack.js` (re-used by the Playboard) |
| Ask Aivana | `backend/notebook_routes.py` (`/api/assistant/message`), `backend/coach_logic.py`, `frontend/src/ask-panel.js` |
| Database and "migrations" | One SQLite file (`backend/coach.sqlite3`). No migration tool: each store runs `CREATE TABLE IF NOT EXISTS` at start-up, so new tables appear on the next backend start and old data is untouched |
| Upload storage | Note photos: `backend/coach_files/`. Film, drawings and frame captures: `data/film/` (git-ignored). Override with `COACH_FILM_DIR` |
| Libraries | No new dependencies. Plain JS + SVG/Canvas, FastAPI, SQLite. YouTube IFrame API and Vimeo player.js load in the browser only when a YouTube/Vimeo film is opened |

## 2. What was built

### Film room (menu item between Coach's notebook and Players)
- **Library**: cards with title, date, kind (Game/Practice/Other), opponent, clip/note/graded counts, breakdown status and assigned coach. Filters: kind chips, position room, "Assigned to me", search by title, opponent, player, tag or note text.
- **Add film**: upload **any video file** (mp4, mov, m4v, webm, avi, mkv, wmv, flv, mpg, ts, 3gp…; up to 20 GB, streamed to disk, played with HTTP range requests) or an https link from YouTube, Vimeo, Hudl or Google Drive. YouTube/Vimeo embed so seeking works; Hudl/Drive open in a new tab and times are saved as references. Links are never fetched by the server. A file the browser can't play is kept and shows "This video format can't play in the browser. Convert it to MP4 to watch it here." with a **Make it playable** button (works when ffmpeg is installed; it is not installed on this computer).
- **Player screen**: play/pause, −5 s/+5 s, frame step (uploads only; hidden with a tooltip for YouTube/Vimeo), speed 0.25×–2×, loop clip, full screen, time, and a timeline with marks (notes blue, graded clips grey, drawings orange, mark-in green). Keys (ignored while typing): Space/K, J/L, ←/→, N note, D draw, G grade, [ or I mark in, ] or O mark out.
- **Notes at a time**: pauses and captures the time; players, text, any tags, tone (Praise/Improve/Observation), "Show in film pack". Clicking ▶ mm:ss seeks. **Make homework** builds a draft for the existing review screen (due date checked in code, `film_note_id` kept on the saved homework); nothing is saved until the coach approves.
- **Recap this film**: Aivana reads the written notes only and the card says "From your notes, not from the video". Demo mode uses a code-only recap.
- **Clips**: mark in/out, label, quarter, down, distance (short/medium/long), field zone, hash, play type, formation, result, any tags, players. Saving a clip starts the next one where it ended.
- **Quick grade**: ✓ did the job / ✗ missed / ✗* critical, optional Technique ± and Effort ±, reason (Alignment, Assignment, Technique, Effort or any text). Keyboard ↑/↓, 1, 0, Shift+8, Enter for next clip. **Everyone did his job** marks all tagged players ✓ (keeps the coach's edits). Summary per player computed in Python: plays, %, critical (red), and "On target"/"Below target" against 80%. Written film summary per player (Coaching points / This week work on / Summary) with "Draft from my notes". Aivana never grades.
- **Cut-ups, playlists, Teach list**: filters across all films (position room, player, down, distance, zone, play type, tag, not graded) build an instant cut-up; save as Cut-up, Teach list (max 15) or Good plays.
- **Assign film**: assigned coach + status To do / In progress / Done; shows on Home Next up as "Film to break down: …".
- **Playbook** tab with all drawings.

### Playboard
- Opens from the Home note editor (✎ Playboard), the Film room (Draw on this frame, Playbook), and the player page.
- Templates: Play diagram (yard lines every 5, numbers, hashes, draggable blue line of scrimmage and yellow 1st-down line), Full field (120 × 53⅓ yd), Film frame, Blank. Objects are stored in yards (board units), so they don't move when the screen size changes.
- Tools (44 px buttons with tooltips and keys): Select V (drag, group box), Pen P, Arrow A (solid/dashed/curved), Line L (plain or Block T), Player M (circle/X/O/square, any label, offense white / defense orange, double-click to relabel or link a roster #), Text T, Highlight H, Eraser E (objects only), Undo/Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y), Zoom −/+/Fit, Pan (Space, or finger when a pen is used), Duplicate Ctrl+D, Delete, Flip left/right, Replay, PNG export. Six colors and S/M/L widths.
- Quick formations (all editable): Pro I (11), Shotgun 2x2, Trips, Empty, 4-3 Over, 3-4, Cover 2 shell, Cover 3 shell, Punt, Kickoff.
- **Draw on this frame**: uploads capture the paused frame; embeds ask for a screenshot. Linked to film + time and shown as an orange mark.
- Saving: editable JSON + PNG preview; Not saved / Saving… / Saved / Save failed – retry; autosave 2 s after a change once saved; warning before leaving with unsaved changes; other-tab edits detected (HTTP 409); several drawings per film/note with thumbnails.

### Skill checks, Next game, Watch list
- Player page **Skill checks** card: suggested skills per position room (editable via `/api/position-skills`), any skill can be typed. Score 1–5 with meanings (Lots of work · Developing · Meets my standard · Consistently good · Excellent), a required "why", and "from" (film/practice/meeting/game). Trend ▲ Improving / — Steady / ▼ Needs attention and a one-skill line chart. Quick-grade % is shown beside it, never mixed in. No overall player number.
- **Next game** card (Home and player page): opponent, home/away, date/time, days left, homework due before kickoff, film to break down, next 1-on-1 — all from code.
- **Watch list**: the same tag noted as Improve for one player in 3 different weeks → "Same correction 3 weeks → plan a 1-on-1", with a button that opens the Schedule with a 1-on-1 ready to add. Also on the bell.

### Film packs
- Per player or position room: clips (max 15), Good plays, notes marked "Show in film pack", up to 3 drawings, up to 3 questions, homework lines, due date, optional Quick grade % (off by default).
- Read-only phone page at `/pack/<192-bit random token>`, expires in 14 days, revocable, "Download PDF" (print). Health, insurance and other sensitive notes are refused; other players and skill scores are never included.
- The coach sees "Link ready to send", **Opened** (first time the page loads) and **"I watched it"** (the player's button). These are recorded by our own page; the UI never says "Delivered" or "Seen". The page says the link works on this computer and local network only.

### Ask Aivana
- Film chips: "Recap this film", "Make a WR cut-up of 3rd downs" (confirm card before saving), "Which notes have no homework yet?". Player chips: "What did I note on this player in film?", "What does he need before Saturday?". Answers cite film + time and link to it.

### Open categories (Salma's rule)
- Extraction schema: `topic` and `skill` are optional free text; new `tags` (0–3, any words) and `details`. Code only tidies tags (lower-case, trim, exact synonyms in `backend/vocabulary.py`). Approval, review and Ask Aivana filters accept any topic/skill/tag text. Suggestions (datalists) are never a limit. Health/insurance words still mark an item sensitive.

## 3. Database changes (new tables, created automatically)
`films`, `film_players`, `clips`, `playlists`, `playlist_clips`, `film_notes`, `film_note_players`, `quick_grades`, `film_summaries`, `play_diagrams`, `diagram_players`, `position_skills`, `skill_checks`, `film_packs`. Homework items saved from a film note carry an optional `film_note_id`. Homework items may now carry `tags` and `details`. No existing table was altered.

## 4. Not built / limits
- Apple Pencil, palm rejection and pinch-to-zoom were not tested on an iPad. Pen vs finger switching is implemented; zoom is by buttons and Ctrl+wheel.
- "Make it playable" needs ffmpeg, which is not installed on this computer, so it shows the convert message.
- No clip video export, AI video analysis, player logins or live sideline replay (out of scope).
- Sample data: the roster has no "Alex Carter #12", so the demo uses the roster QB **Avery Brooks #4** and the WRs. The demo film is a synthetic animation recorded in the browser; the link film is a Hudl placeholder link.
