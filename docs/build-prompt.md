# Build prompt: Notes, Calendar and "Ask Aivana" side panel

> Reference copy of the build prompt Salma supplied on November 21, 2026. Design reference images (`design/10-overview-final.png`, `design/11-calendar-final.png`) and `design/v4/SPEC.md` were not in the repository when this was built. See "Implementation status" at the end.

---

## 0. Before you start

- Read `AGENTS.md` first, then `README.md` and `ASSISTANT.md`. Follow every rule in them, especially these:
  - The Aivana API key stays in the backend. **The browser never calls Aivana.** All AI calls go through FastAPI and `app/aivana_client.py`.
  - **Nothing the AI produces is saved until the coach approves it.**
  - Code does the math: dates, counts, sorting and overdue status are computed in Python, never by the model.
  - Tests mock Aivana. Never call the real API from `pytest`.
- **Section 0.1 below changes some rules in `ASSISTANT.md` and `README.md`. Where they disagree, section 0.1 wins.**
- Do not remove existing features. Re-use the existing extraction, review, approve, `/api/ask`, `/api/assistant/message` and `.ics` code where it fits.
- Work in small steps (section 9) and keep the app runnable after each one.

## 0.1 Rule changes: free extraction instead of fixed categories

The old rules forced everything into fixed lists: the AI could only answer a small fixed set of intents (`ASSISTANT.md` section 2, "Keep the list fixed and small. Anything else gets I can't do that yet"), and every note had to be squeezed into a fixed skill, topic and vocabulary (`README.md` 7.1 to 7.3, `ASSISTANT.md` "One fixed vocabulary"). The coach then had to pick from those categories. **We are dropping that.**

**New rules:**

1. **Extract everything useful, in the coach's own words.** Aivana pulls out the information that is actually in the note: who, what was said, to-dos, due dates, decisions, plays, injuries mentioned, and logistics. It does not throw information away because it does not fit a category.
2. **Categories become suggested tags, not a required choice.** Aivana may suggest 0 to 3 short tags per item (for example "route running", "red zone", "travel"). It can suggest a skill/topic from the old lists **or a new tag in plain words**. The coach never has to pick from a dropdown. They can keep, edit or remove tags with one click, or type their own.
   - Schema change: replace the required `skill` / `topic` enums with `tags: string[]` (optional, max 3). Keep `skill` and `topic` as **optional** fields that are filled only when one clearly fits; otherwise `null`. Existing charts and filters use them when present and fall back to tags.
   - Tag clean-up runs in code: lower-case, trim, and merge exact synonyms from `app/vocabulary.py` (for example "wide outs" → "receivers"). The Terms page stays as a place to **merge** tags, not to restrict them.
3. **Keep a "Key details" field.** Each extracted item has `details` (free text, copied or lightly shortened from the note) so nothing important is lost.
4. **Ask Aivana answers open questions.** Remove the "fixed and small" intent limit. If the request is not one of the action intents, the assistant treats it as a question and answers **from the coach's saved notes, events and to-dos**, with citations. It says "I couldn't find that in your notes" only when nothing matches. The fixed intents remain only for actions that change something or open a page (add event, mark done, export, open meeting).
5. **Rules we keep, because they protect the coach and players:**
   - Only extract what is in the note. No invented facts, names, dates or feedback. Unclear → `null` or `[?]`.
   - Copy `source_text` for every item so the coach can check it.
   - The coach reviews before anything is saved. Any change from chat needs a confirm.
   - Dates and counts are computed in code.
   - No judging character or attitude, and no medical or insurance advice. Health and insurance items are still tagged sensitive and kept out of team views.
6. **Update the tests:** the accuracy test (`ACCURACY.md`) scores players, to-dos, deadlines and source text as before; tags are scored as "useful / not useful" in a small manual check instead of exact category match.

## 1. Goal

Make the coach's home page simple, clean and friendly. A football coach should be able to:

1. Write a note four ways: **type, write with a pen, add a photo, or speak**.
2. Press **Summarize** and get the important information from a note.
3. See a small calendar on the right, open the full calendar, and **add events by hand**.
4. Press **Ask Aivana** at the top right on any page and ask questions in a side panel, like Copilot in Outlook.

Design rules: calm cream background, white cards, one orange main button per screen, at most 3 cards per column, plain coach words (no "records", "fixtures" or "actions").

## 2. Page layout (Overview)

```
┌ menu ┐┌────────────── header: title · date · [+ New note] [✦ Ask Aivana] [🔔] [profile] ─────────────┐
│Overview││ My notebooks      │        Note editor               │  Month calendar (dots)  │
│Calendar││  Personal notes   │  [Type] [Pen] [Photo] [Voice]    │  [Open calendar →]      │
│Notebook││  Player meetings  │  Title / date / notebook         │  Upcoming (next 3)      │
│Players ││  Team strategy    │  lined page                      │  Needs attention        │
│To-dos  ││ Recent notes      │  [Summarize] [Save note]         │                         │
└────────┘└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Left menu: Overview, Calendar, Notebook, Players, Player to-dos (badge = number of late to-dos).
- **Ask Aivana** lives at the top right of every page (not in the menu).
- Needs attention: AI notes waiting for review, late player to-dos, players with no 1-on-1 this season.

## 3. Note editor: four ways to write

A small switch above the page: **Type · Pen · Photo · Voice**. All four end in the same place: plain text in the note, which the coach can edit before saving.

### 3.1 Type
Plain text area with a lined-paper look. Toolbar: bold, italic, bullet list, checklist. Autosave a draft every 5 seconds to the browser (`localStorage`), and only save to the server when the coach presses **Save note**.

### 3.2 Pen (handwriting on screen)
- An HTML `<canvas>` using **Pointer Events** so it works with a finger, mouse, Apple Pencil or Surface pen. Use `pointerType` and `pressure` for line width. Set `touch-action: none` on the canvas.
- Tools: pen, eraser, undo, clear, and 3 colors (black, blue, red).
- Button **Convert to text**:
  1. Export the canvas as PNG (white background, trimmed to the ink, max 1600 px).
  2. `POST /api/notes/transcribe` with the image (Aivana image input, `effort: "low"`).
  3. Show the drawing on the left and the text on the right. **Words the AI was not sure about are highlighted in yellow** so the coach can fix them with one tap.
  4. The coach presses **Use this text**. The drawing is kept as an attachment on the note.
- How Aivana should help with handwriting (put this in the transcribe prompt):
  - Copy what is written. Do not add, reword or summarize.
  - Use the roster (names, nicknames, jersey numbers) only to fix spelling of names that are clearly written. If unsure, keep what is written and mark it uncertain.
  - Keep football shorthand as written ("3rd & 7", "Q2", "#4", "slant", "RZ").
  - Mark unreadable words as `[?]` and list them in `uncertain_words`.
  - Return: `{ "text": "...", "uncertain_words": ["..."], "warnings": ["..."] }` using a JSON Schema in `response_format`.

### 3.3 Photo (paper notes, whiteboard, film screenshot)
- **Add photo** opens the file picker. On a phone it can open the camera: `<input type="file" accept="image/png,image/jpeg" capture="environment" multiple>`.
- Up to 5 photos per note. Resize to max 1600 px in the browser before upload.
- Same transcribe endpoint and the same side-by-side check as Pen. The photo stays attached to the note.
- HEIC from iPhones: convert in the browser or ask the coach for JPEG. Aivana takes PNG and JPEG only.

### 3.4 Voice
- **Important:** the Aivana features listed in the README (text, structured output, streaming, chat, image input) do **not** include audio. So speech-to-text runs in the browser with the **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`), as `ASSISTANT.md` section 6 already says. It is free and needs no extra API.
- A mic button: press to start, press to stop. Show the words live as the coach speaks, with a red "Recording" dot and a timer.
- After the coach stops, Aivana helps clean it up: `POST /api/notes/clean-transcript` sends **only the text** (never audio) with the roster. Aivana fixes punctuation, turns "number four" into "#4" and matches spoken names to the roster. It returns the cleaned text plus a list of changes. Show the changes so the coach can accept or undo each one.
- If the browser does not support speech (Firefox, some Safari), hide the Voice button and show a tooltip: "Voice works in Chrome and Edge."
- If Aivana adds audio input later, only the backend endpoint changes. The screen stays the same.

## 4. Summarize button

- Under the note: **✦ Summarize**. Works for any saved note.
- `POST /api/notes/{id}/summarize` → Aivana with a JSON Schema:
  ```json
  {
    "summary": "2-3 sentences",
    "key_points": ["..."],
    "players_mentioned": [{ "name": "...", "player_id": "P07 or null" }],
    "to_dos": [{ "player": "...", "task": "...", "due_phrase": "by Friday or null", "source_text": "exact words from the note" }],
    "decisions": ["..."],
    "questions_to_follow_up": ["..."]
  }
  ```
- The backend turns `due_phrase` into a real date in Python (not the model). It drops any player who is not on the roster and marks them "unknown name".
- The summary appears as a card under the note with sections: Summary, Key points, Player to-dos, Decisions, Follow up.
- Buttons on the card: **Copy**, **Send to-dos to review** (goes to the existing review screen, so nothing is saved without approval) and **Add to calendar** (for a dated item).
- Personal notes are sent to Aivana **only when the coach presses Summarize or Convert to text**. Show the line "Your private note is sent to Aivana only for this summary" under the button.
- Sensitive topics (health, insurance) follow the README rules: no judging, and kept out of team views.

## 5. Calendar

### 5.1 On the Overview page (right column)
- A month calendar with small colored dots (game, practice, film, meeting, note, to-do due). Today is a dark circle and the current week is shaded.
- Clicking a day opens the full calendar on that week. **Open calendar →** opens it on today.
- **Upcoming:** the next 3 events, computed in code.

### 5.2 Full calendar page
- Week view with hours from 7 AM to 9 PM, plus a Month view. Buttons: Today, previous and next.
- Each day has a football-week label the coach can edit: Recovery, Install, Install, Polish, Walk-through, Game day, Review. Game day is a setting (Saturday or Friday).
- Event colors: Practice green, Game orange, Film purple, Meeting blue, Note yellow, To-do due red (the coach can hide it with a toggle).
- A meeting that has saved notes shows "✓ notes saved". Clicking it opens the note.
- **Add event** (button and clicking an empty time slot) opens a side panel with: Type, Title, Date, Start time, Length, Who (whole team, position group, or one player), Note, and Repeat weekly. Edit and delete use the same panel. Delete asks "Are you sure?".
- **Export to phone** downloads an `.ics` file of events plus to-do due dates.

### 5.3 Data and API
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  type TEXT CHECK(type IN ('practice','game','film','meeting','note','other')),
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,      -- ISO local time
  duration_min INTEGER DEFAULT 60,
  audience TEXT,               -- 'team' | 'group:WR' | 'player:P07'
  note TEXT,
  repeat_weekly INTEGER DEFAULT 0,
  meeting_id INTEGER NULL REFERENCES meetings(id),
  created_at TEXT
);
```
`GET /api/events?from=&to=` · `POST /api/events` · `PATCH /api/events/{id}` · `DELETE /api/events/{id}` · `GET /api/events/export.ics`

## 6. "Ask Aivana" side panel (like Copilot in Outlook)

- Button **✦ Ask Aivana** at the top right of every page. It opens a panel that slides in from the right (about 380 px wide). The page stays visible and usable next to it. Close with ✕ or Esc. On small screens it covers the page.
- Panel content, top to bottom: title "Aivana", a "New chat" button, the messages, then the input box with a mic button and send.
- **It knows which page you are on** (send `page` and `selected_id` with each message):
  - Calendar: suggestion chips "What's on this week?", "Add practice Tuesday 3:30", "When is my next 1-on-1?"
  - Note open: "Summarize this note", "Turn this into to-dos", "Fix my spelling"
  - Overview: "What do I need to do today?", "Who hasn't had a 1-on-1?", "Late to-dos"
- Uses the existing `POST /api/assistant/message` pipeline from `ASSISTANT.md` (understand → code does the work → answer with citations). Add the intents `list_events`, `add_event` and `summarize_note`.
- **Any change (adding an event, marking a to-do done) shows a confirm card first.** Aivana never changes data on its own.
- Answers cite meeting dates and link to the note or event. If nothing matches: "I couldn't find that in your notes." Do not guess.
- Keep the last 6 turns. Stream plain-text answers for a typing effect.
- Footer: "Aivana can make mistakes. Check important info."

## 7. Notes data

```sql
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  notebook TEXT CHECK(notebook IN ('personal','player_meetings','team_strategy')),
  title TEXT, body TEXT,
  input_method TEXT CHECK(input_method IN ('type','pen','photo','voice')),
  meeting_id INTEGER NULL REFERENCES meetings(id),   -- set when it is a meeting note
  summary_json TEXT NULL,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE note_attachments (
  id INTEGER PRIMARY KEY, note_id INTEGER REFERENCES notes(id),
  kind TEXT CHECK(kind IN ('ink','photo')), path TEXT, created_at TEXT
);
```
Endpoints: `GET/POST /api/notes`, `GET/PATCH/DELETE /api/notes/{id}`, `POST /api/notes/transcribe`, `POST /api/notes/clean-transcript`, `POST /api/notes/{id}/summarize`.
A **Meeting note** still uses the current extraction → review → approve flow.

## 8. Football words (use the coach's language everywhere)

The app should sound like a football staff room, not like software. Use these words on every screen, button and message, including Aivana's answers.

| Software word (don't show) | Football word (show) |
|---|---|
| Overview / Dashboard | **Home** |
| Calendar | **Schedule** |
| Notebook | **Coach's notebook** |
| Personal notes | **My notes** (private) |
| Player meetings | **Player meetings** (1-on-1s and position rooms) |
| Team strategy | **Game plan** |
| Group meeting / position group | **Position room** (WRs, DBs, OL…) |
| Open actions / player to-dos | **Homework** (what you told a player to do) |
| Overdue | **Late** |
| Upcoming | **Next up** |
| Needs attention / Needs follow-up | **Watch list** |
| Summarize / summary | **Recap** |
| Records / items | **Notes** |
| Extract | **Find homework** |
| Saved meetings / recent conversations | **Recent notes** |
| Demo Fixture | (hide) |
| Assistant / Chat | **Ask Aivana** |

Schedule words: **Game week**, **Week 12 · vs. North**, **Game day**, **Practice** (pads, shells, helmets), **Walk-through**, **Lift**, **Film**, **Install**, **Scout team**, **Travel**, **Bye week**, **Off day**. Week day labels: Recovery, Install, Install, Polish, Walk-through, Game day, Review (editable).

Tone: short, direct and positive, like a coach talking ("3 guys are late on homework", "Next up: walk-through at 3:00"). Never label a player as "bad", "lazy" or similar. Describe the homework, not the person.

## 8.5 Additions requested by Salma (Nov 21)

### 8.5.1 "Add events by hand" means
Today the calendar only shows things the app already knows (saved meetings and homework due dates). **By hand** means the coach can type in anything themselves: a practice, a game, a lift, film, a bus time or a reminder, just like adding an event in Outlook or Google Calendar.

### 8.5.2 Jump to any year, month or day
- Views: **Day · Week · Month · Year**.
- Click the title ("November 2026 ▾") to open a date picker: year arrows at the top, a grid of 12 months, then the days of the chosen month. One click jumps there.
- Quick buttons: **Today**, **This game week**, **Next game**.
- The mini calendar on Home has ◀ ▶ for months and a click on the month name opens the same year/month picker.
- A search box on Schedule finds events and notes by word, player or opponent ("North", "#4", "film") and jumps to that date.
- Year view: 12 small months with dots on days that have games, so a coach sees the whole season at a glance.

### 8.5.3 Bell (notifications)
- The bell at the top right shows a red dot with a number when something new needs the coach.
- Click it to open a short list, newest first. Each item links to the right page:
  - "AI notes ready to check: Receivers check-in"
  - "Homework late: Chris Walker, travel form"
  - "Homework due tomorrow: 3 players"
  - "Next up in 1 hour: Practice (pads) 3:30"
  - "Recap ready: DB coverage film"
- Buttons: **Mark all read** and a link to notification settings (turn each type on or off).
- Notifications are created in code from the database (no AI). Table: `notifications(id, kind, text, link, created_at, read_at)`.

### 8.5.4 Red, amber and green for players
- **Red**: homework is late. Shown as a red "Late" label and a red dot by the player's name in Watch list, Homework and on their player page.
- **Amber**: homework due within 2 days, or no 1-on-1 in 21+ days.
- **Green**: all homework done.
- Colors are always paired with a word ("Late", "Due Fri", "Done") so they are clear for color-blind users. Only coaches see them.

### 8.5.5 Replay a note like a video, plus undo
Under every note there is a small player bar: **⏮ ◀ ▶ ▶▶ ⏭**, a slider and a speed button (1×, 2×, 4×).
- **Pen notes:** every stroke is saved with its time. ▶ replays the handwriting being drawn stroke by stroke. ◀ / ▶ (the small triangles) step back or forward one stroke, and the slider scrubs.
- **Typed and voice notes:** the app saves a version every time the coach pauses typing for 3 seconds and on every Save. ◀ / ▶ step through the versions, and changed words are briefly highlighted. ▶ plays them in order.
- **Restore this version** brings an old version back. That restore itself becomes a new version, so nothing is ever lost.
- **Undo / Redo:** toolbar buttons and Ctrl+Z / Ctrl+Y (Cmd on Mac). For pen it undoes the last stroke. For text it undoes the last edit. Undo also works after "Convert to text" and after accepting Aivana's spelling fixes.
- Data:
  ```sql
  CREATE TABLE note_versions (id INTEGER PRIMARY KEY, note_id INTEGER REFERENCES notes(id), body TEXT, created_at TEXT, source TEXT); -- source: typing|save|convert|aivana_fix|restore
  CREATE TABLE ink_strokes (id INTEGER PRIMARY KEY, note_id INTEGER REFERENCES notes(id), seq INTEGER, color TEXT, points_json TEXT); -- points: [[x,y,t_ms,pressure],...]
  ```
- Keep at most 200 versions per note (drop the oldest typing versions first, never drop Save versions).

## 9. Build order (each step should be demo-able)

1. Layout shell: menu, header with Ask Aivana button, three columns, mini calendar with real events.
2. Notes table, notebooks, Recent notes, Type mode, Save.
3. Calendar page, events CRUD, Add event panel, `.ics` export.
4. Summarize button and card.
5. Photo → transcribe → check → use text.
6. Pen canvas → convert to text.
7. Voice (Web Speech) and transcript clean-up.
8. Ask Aivana side panel with page-aware chips and confirm cards.
9. Schedule views Day/Week/Month/Year, year-month-day picker, search (8.5.2).
10. Bell notifications (8.5.3) and red/amber/green player status (8.5.4).
11. Note replay bar, version history, undo/redo (8.5.5).
12. Swap every label to the football words in section 8.

## 10. Done when

- A coach can create a note by typing, pen, photo and voice, fix the text and save it.
- Summarize shows all six sections. "Send to-dos to review" opens the review screen and nothing is saved before approval.
- Events can be added, edited and deleted by hand and appear on both calendars. The `.ics` file opens in Outlook or Google Calendar.
- The Ask Aivana panel opens on every page and answers with links. Adding an event from chat needs a confirm.
- The coach can jump to any year, month and day in two clicks, and switch Day/Week/Month/Year.
- The bell lists new items, and each one opens the right page. Late homework shows red with the word "Late".
- A pen note replays stroke by stroke. A typed note steps through versions with ◀ ▶. Undo and redo work, and an old version can be restored.
- No screen shows a word from the "don't show" column in section 8.
- No Aivana call from the browser, and the API key does not appear in the frontend bundle.
- New tests (Aivana mocked): transcribe schema handling and `[?]` words, summarize to-do date math, events CRUD and repeat-weekly expansion, `.ics` contents, the assistant `add_event` confirm flow, and the Voice button hidden when unsupported.

## 11. Not in scope

Video or audio upload, live meeting recording, sharing notes with players, syncing with Outlook/Google (export only), and grading players.

---

## Implementation status (November 21, 2026, branch `coach-dashboard-redesign`)

Built: sections 1 to 8.5 and steps 1 to 12, with these differences from the text above.

- The repository has no `ASSISTANT.md` and no `app/` folder. Aivana calls live in `backend/aivana.py` (existing) and `backend/aivana_notes.py` (new). The existing per-player `POST /api/assistant` stays; the panel uses the new `POST /api/assistant/message`.
- Section 0.1 (open categories) was finished later the same day: tags instead of fixed skill/topic enums, `details`, `backend/vocabulary.py`, open review and Ask Aivana filters. See `docs/film-room-prompt.md`. The Terms page and the ACCURACY.md manual tag check were not added.
- Demo mode makes no AI calls: Recap and voice clean-up use code-only versions labelled "Demo"; reading pen/photo images needs Live.
- Chips and labels use the football words (for example "Recap this note", "Late homework") because section 8 overrides the software words in section 6.
- A synthetic sample game week (practices, film, lift, walk-through, games vs. North and at Lakeside) is seeded once so the Schedule is not empty.
