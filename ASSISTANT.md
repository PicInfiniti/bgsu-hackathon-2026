# Coach Assistant: talk to the app in your own words

The Coach Assistant is a chat panel (with an optional microphone) where the coach types or says what they want in everyday language, and the app does it:

| Coach says | App does |
|---|---|
| "Open Tuesday's receivers meeting" | Opens that meeting's page |
| "Play the film from Friday" / "open the film for play 14" | Opens the film session and its saved clip link |
| "Give me a summary of Marcus" / "how's #4 doing?" | Shows a short summary of Marcus Lee's approved records, with meeting dates |
| "Give me a CSV of what I have to do" | Downloads a CSV of open action items |
| "What's overdue for the DBs?" | Lists overdue action items for DB players |
| "What did I tell JC about blocking?" | Answers from saved records, citing meeting dates |
| "Mark Andre's ball security drill done" | Asks "Mark this done?", then updates it after the coach confirms |
| "Who haven't I met with lately?" | Shows the players-needing-attention list |
| "Start a team meeting for today" | Opens a new meeting form, pre-filled |

The coach does not need special commands, player IDs, or exact names. Nicknames, jersey numbers, "the receivers", "last Tuesday", and "that guy from the film" all work, and when something is unclear the assistant asks instead of guessing.

This counts toward Level 2 (the question box and prep brief ideas, done conversationally) and adds **multi-turn chat**, another Aivana feature from the hackathon list.

---

## 1. How it works

The key idea: **the AI only figures out what the coach wants. The app's own code does it.** The model never touches the database, never invents records, and never computes dates or counts.

```
Coach message ("csv of what I have to do this week")
        │
        ▼
1. UNDERSTAND   Aivana structured call → { intent, player mentions, date phrases, filters }
        │
        ▼
2. RESOLVE      Python: match names/nicknames/#numbers to the roster,
                turn "this week" / "Tuesday" into dates, find the meeting
        │       (unclear? → ask the coach a short question, do nothing yet)
        ▼
3. ACT          Python: open page, query records, build CSV, mark done (after confirm)
        │
        ▼
4. ANSWER       Summaries and questions only: second Aivana call that sees ONLY the
                filtered records, must cite meeting dates (structured output)
        │
        ▼
Chat reply + action card (link, download button, summary, or confirm buttons)
```

Opening pages, exporting a CSV, and listing items need **one** AI call. Summaries and questions need **two** (understand, then answer from records).

---

## 2. Supported intents

Keep the list fixed and small. Anything else gets a friendly "I can't do that yet, here's what I can do."

| Intent | Example | What the code does | Changes data? |
|---|---|---|---|
| `open_meeting` | "open Tuesday's WR meeting" | Find meeting by date/type/attendees, return its URL | No |
| `open_film` | "play the film from Friday" | Find film-review meeting, return its clip link (`film_link`) and notes | No |
| `open_player` | "pull up Marcus" | Return player page URL | No |
| `summarize_player` | "summary of #4" | Filter player's approved records → answer call | No |
| `summarize_meeting` | "what happened in yesterday's meeting?" | Meeting's approved records → answer call | No |
| `ask_records` | "what did I tell JC about blocking?" | Filter records → answer call with citations | No |
| `list_action_items` | "what's overdue for the DBs?" | Query with filters, overdue computed in code | No |
| `export_csv` | "csv of what I have to do" | Build CSV from filtered action items, return download | No |
| `players_needing_attention` | "who haven't I met with?" | Run the attention rules | No |
| `mark_action_done` | "mark Andre's drill done" | Show confirm card, update only after "Yes" | **Yes** |
| `new_meeting` | "start a team meeting for today" | Open the new-meeting form pre-filled | No (form only) |
| `clarify` | (AI is unsure) | Show the clarifying question | No |
| `unsupported` | "book the bus" | Explain what the assistant can do | No |

Rules:
- **Anything that changes data needs a confirm button.** The assistant never deletes records and never approves AI drafts; approval stays on the review screen.
- **Summaries exclude sensitive records** (health, insurance) unless the coach asks about that player and that topic by name.
- **No trip planning, no video analysis.** "Play the film" only opens a link the coach saved on the film session.

---

## 3. Intent JSON Schema (call 1: understand)

Sent with `response_format`. Short prompt, `max_tokens` about 300, `effort: "low"`.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["intent", "player_mentions", "group_mention", "meeting_ref", "filters",
               "topic_hint", "clarifying_question", "confidence"],
  "properties": {
    "intent": {
      "type": "string",
      "enum": ["open_meeting", "open_film", "open_player", "summarize_player",
               "summarize_meeting", "ask_records", "list_action_items", "export_csv",
               "players_needing_attention", "mark_action_done", "new_meeting",
               "clarify", "unsupported"]
    },
    "player_mentions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Names, nicknames, or jersey numbers exactly as the coach wrote them."
    },
    "group_mention": { "type": ["string", "null"], "description": "e.g. 'receivers', 'DBs', 'team'" },
    "meeting_ref": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "required": ["date_text", "meeting_type", "session_context"],
      "properties": {
        "date_text":       { "type": ["string", "null"], "description": "Copied as written: 'Tuesday', 'last week'" },
        "meeting_type":    { "type": ["string", "null"], "enum": ["individual", "group", "team", null] },
        "session_context": { "type": ["string", "null"], "enum": ["regular", "film_review", "practice_debrief", null] }
      }
    },
    "filters": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status", "skill", "topic", "date_range_text"],
      "properties": {
        "status":          { "type": ["string", "null"], "enum": ["open", "overdue", "done", "all", null] },
        "skill":           { "type": ["string", "null"] },
        "topic":           { "type": ["string", "null"] },
        "date_range_text": { "type": ["string", "null"], "description": "'this week', 'since the Michigan game'" }
      }
    },
    "topic_hint": { "type": ["string", "null"], "description": "What the question is about, e.g. 'blocking'" },
    "clarifying_question": { "type": ["string", "null"] },
    "confidence": { "type": "string", "enum": ["high", "medium", "low"] }
  }
}
```

The prompt gives the model the list of intents with one example each, today's date only as context (it must still copy date phrases as written), and the last few chat turns. It does **not** get the roster or any records in this call, which keeps it cheap and safe.

### Resolution in code (step 2)

- **Players:** match each mention against full name, first/last name, nickname, and `#number`. One match → use it. Several → ask "Did you mean Chris Walker or Chris Morales?" with buttons. None → "I couldn't find that player."
- **Groups:** "receivers", "WRs", "wide outs" → `WR` using a small synonym table in code.
- **Dates:** resolve `date_text` / `date_range_text` relative to today with the same `dates.py` used for deadlines. "Tuesday" means the most recent Tuesday for past meetings.
- **Meetings:** filter by resolved date, type, session context, and attendees. One match → open it. Several → show a short pick list.
- **Follow-ups:** "and his overdue stuff?" uses the player from the previous turn. Store the last resolved player and meeting in the chat session.

If `confidence` is `low` or anything fails to resolve, ask one short question and do nothing else.

---

## 4. Answer schema (call 2: summaries and questions)

The backend sends **only** the filtered approved records (max about 30, newest first, non-sensitive by default) in a compact format, for example:

```
[R101 | 2026-11-17 | group | Route Running | Improvement | "Drifting on slants; stay on landmark"]
```

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["summary", "bullets", "citations", "insufficient_data"],
  "properties": {
    "summary":   { "type": "string", "description": "2 to 3 sentences, the coach's own words where possible" },
    "bullets":   { "type": "array", "items": { "type": "string" }, "maxItems": 5 },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["record_id", "meeting_date"],
        "properties": { "record_id": { "type": "string" }, "meeting_date": { "type": "string" } }
      }
    },
    "insufficient_data": { "type": "boolean" }
  }
}
```

Rules in the system prompt: use only the records given; cite every claim; do not describe character or attitude beyond the coach's words; no medical or insurance advice; if the records do not answer the question, set `insufficient_data` and say so.

The backend removes any citation whose `record_id` was not sent, and computes all counts shown in the card ("3 improvement notes in Route Running") itself. If no records match, it replies "No matching records" **without** calling Aivana.

Optionally, stream the summary text with `/v1/generate:stream` for a typing effect (stream a plain-text version; structured output cannot be streamed).

---

## 5. CSV export

`export_csv` with "what I have to do" means open action items. The coach's filters (player, group, overdue, this week) apply.

| Column | Example |
|---|---|
| player_name | Marcus Lee |
| jersey | 4 |
| position | WR |
| task | Extra route work on slants |
| due_date | 2026-11-20 |
| status | overdue |
| days_overdue | 1 |
| topic | Training & Conditioning |
| skill | Route Running |
| meeting_date | 2026-11-17 |
| source_text | Both WRs: extra route work before Friday. |

- Built entirely in Python with the `csv` module, sorted by due date (overdue first).
- Sensitive items are excluded unless the coach says "include health items".
- File name: `action_items_2026-11-21.csv`. The chat shows a download button and a 3-row preview.

---

## 6. Voice (optional, Level 3)

Use the browser's built-in **Web Speech API** (`webkitSpeechRecognition` in Chrome) for a microphone button. Speech becomes text in the browser, and the text goes through the same pipeline. It costs no tokens and no extra API. The text appears in the input box first so the coach can fix a misheard name before sending. If the browser does not support it, hide the button.

---

## 7. Multi-turn chat and tokens

- Keep the last **6 turns** of the conversation only (Aivana `messages` is stateless and the whole history is resent each time).
- Store resolved context (last player, last meeting) in the backend session, not in the prompt.
- Call 1: `effort: "low"`, `max_tokens` about 300. Call 2: `max_tokens` about 600.
- A "New chat" button clears history.
- Show token use per reply in a small debug line during the demo.

---

## 8. API endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/assistant/message` | Body: `{ "session_id", "text" }`. Returns `{ "reply", "card" }` where `card` is one of `link`, `summary`, `table`, `download`, `confirm`, `choices`. |
| `POST` | `/api/assistant/confirm` | Body: `{ "session_id", "action_id", "confirmed": true }`. Runs a pending data change. |
| `GET` | `/api/assistant/export/{file_id}.csv` | Downloads a generated CSV. |
| `POST` | `/api/assistant/reset` | Clears the chat session. |

Add `film_link TEXT NULL` to `meetings` so film sessions can store a clip URL or file path the coach entered.

---

## 9. Testing the assistant

Add `tests/assistant_cases.json`: about 25 coach phrasings with the expected intent and resolved values, including casual and messy ones:

```json
[
  { "text": "csv of what i gotta do this week", "intent": "export_csv", "status": "open" },
  { "text": "how's JC doing", "intent": "summarize_player", "player_id": "P07" },
  { "text": "play friday's film", "intent": "open_film" },
  { "text": "what did chris do", "intent": "clarify" },
  { "text": "book the bus to Ohio State", "intent": "unsupported" }
]
```

Report **intent accuracy** and **resolution accuracy** with the same script style as `ACCURACY.md`. Unit-test the resolver, CSV builder, and confirm flow offline with a mocked Aivana.

---

## 10. Build plan

Do this after Level 1 (M5) works.

| Step | Time | Done when |
|---|---|---|
| A. Chat panel UI (slide-out on every page) + `/api/assistant/message` stub | 30 min | Messages appear in the panel |
| B. Intent call + resolver + `open_*`, `list_action_items`, `export_csv` | 1.5 h | "csv of what I have to do" downloads a correct file |
| C. `summarize_player`, `ask_records` with the answer schema and citations | 1 h | "summary of Marcus" shows a cited summary |
| D. `mark_action_done` with confirm, follow-up context, clarifying questions | 45 min | "mark it done" after a summary works with a confirm |
| E. Voice button, intent test set | 45 min | Optional |

If time runs short, ship A to C. That already covers the demo moments: open, summarize, CSV.

---

## 11. Demo lines

1. "Give me a summary of number 4." → cited summary of Marcus Lee.
2. "And what's he got overdue?" → follow-up uses the same player.
3. "Give me a CSV of everything I have to do this week." → download with preview.
4. "What did I tell Chris?" → "Did you mean Chris Walker or Chris Morales?" (shows it never guesses).
5. "Play Friday's film." → opens the film session and clip link.
