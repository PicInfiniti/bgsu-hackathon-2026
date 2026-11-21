# Falcon Follow-up technical reference

[Back to README](../README.md). Implementation details for extraction, approval, APIs and token limits. Planned features are not active routes.

## Classification and extraction

### 1 Football skill categories

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

### 2 Meeting topic categories

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

`Health & Injury Follow-up` and `Insurance & Administration` records are tagged **sensitive** (see [README limitations](../README.md#limitations)).

**Travel & Away Games** records capture only what the coach said about a trip ("bus leaves 6 AM Friday, bring travel polos", "Marcus not on the travel roster"). Travel action items such as "turn in travel forms by Wednesday" become normal action items with deadlines. The app does not plan trips, compare hotels, or calculate travel costs; that is a separate tool (Project B). A player being left off a travel roster is recorded as stated, without the AI adding reasons.

### 3 Feedback type values

| Value | When used |
|---|---|
| `Praise` | The coach explicitly praised something. |
| `Improvement` | The coach explicitly asked for improvement or named a weakness. |
| `Neutral/Observation` | The coach noted something without praise or criticism ("Jay ran mostly slants today"). |
| `null` | No feedback is stated (for example, a pure scheduling item). |

### 4 Information extracted per record

For each relevant player or group, the AI extracts:

1. **Player reference:** the player ID from the synthetic roster when identifiable, the exact mention used in the note, and how it was matched.
2. **Meeting topic:** the general subject of the discussion.
3. **Skill category:** a football skill, when applicable.
4. **Feedback type:** Praise, Improvement, Neutral/Observation, or null.
5. **Feedback description:** what the coach said about performance, close to the coach's wording.
6. **Action item:** a specific assigned task, if present.
7. **Deadline:** the deadline phrase exactly as written ("by Friday"), plus an ISO date only if the note states an exact date. Relative phrases are resolved by the backend.
8. **Source text:** the original note excerpt supporting the record.
9. **Confidence:** `high`, `medium`, or `low`.

Meeting type, meeting date, and attendees are entered by the coach, not extracted.

A single meeting can produce many records for different players, topics, or actions.

### 5 Player name matching rules

Notes say "Jay", "#12", "JC", or "the QBs". The AI returns a `match_method` for every record:

| `match_method` | Meaning |
|---|---|
| `full_name` | Matched a roster full name. |
| `first_or_last_name` | Matched a unique first or last name among attendees. |
| `nickname` | Matched a nickname listed in the roster. |
| `jersey_number` | Matched a jersey number ("#12"). |
| `position_group` | The note refers to a group ("all receivers", "the QBs"). |
| `team` | The note refers to the whole team. |
| `individual_context` | A clearly addressed individual note matches its sole attendee without a conflicting named person. |
| `selected_attendees` | An explicit collective reference covers all selected attendees with any stated count matching. |
| `unmatched` | The mention is ambiguous or not on the roster. `player_id` is `null`. |

The model is instructed not to guess. Ambiguous references must remain unmatched for coach resolution; this instruction does not guarantee model accuracy, so backend checks and review are still required.

### 6 Group fan-out

When a note says "All receivers run extra routes by Thursday", the AI returns **one** group record with `scope: "group"` and `group_label: "WR"`. The **backend** then expands it into one record per attending player in that position group, so each player's timeline and overdue tracking work. Each expanded record keeps a shared `group_record_id` so the coach can approve or edit the group as one unit.

Team records (`scope: "team"`) are stored once at the meeting level and shown on every attendee's timeline, without creating per-player action items unless the note assigns a task to everyone.

### 7 Extraction rules (sent as `system` instructions)

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

## Extraction JSON Schema

The contract below documents the provider format. The executable source of truth is [`backend/extraction_schema.py`](../backend/extraction_schema.py); normalized review items also use the shared [`data/categories.json`](../data/categories.json).

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

### Practice examples

Use the versioned [synthetic dataset guide](../data/synthetic/README.md) and its author-written expected records for concrete roster IDs and sample notes. Reference answers are not measured Live Aivana results. Actual selected-call results and corrections are recorded in the [QA report](qa-2026-11-21.md).

---

## Validation and post-processing

Aivana checks the response's **shape and types**, not whether the facts are correct. The backend adds these checks in code:

| Check | What happens on failure |
|---|---|
| `player_id` exists in the roster and is a meeting attendee | Record set to `unmatched` and flagged for the coach. |
| `topic`, `skill`, `feedback_type` are allowed values | Enforced by the schema; double-checked by application validators. |
| Source evidence | Exact quotes pass; case/whitespace-only matches recover the original verbatim excerpt. Otherwise the draft is low confidence and cannot save until its quote is corrected or the record removed. Fuzzy matches are not silently accepted. |
| `deadline_date` is a valid date and not before the meeting date | Cleared to `null` and flagged. |
| Group label maps to an attendee position group | Valid groups expand to applicable attendees; unresolved groups are flagged for coach resolution. |

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

## Storage

SQLite stores approved meeting bodies in `meetings`, extraction drafts/raw structured output in `extraction_runs`, and field-level approval changes in `record_edits`. Strategy boards use the separate `strategy_boards` table, including revision checks. The roster comes from `data/demo.json`; it is not a relational player table. Existing historical meetings and completion states are preserved.

---

## API endpoints

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
| `GET` | `/api/players/{player_id}/prep` | Legacy Live SSE brief from up to ten latest non-sensitive approved player records. |
| `POST` | `/api/players/{player_id}/prep` | Selected-target/source preparation SSE; accepts `mode`, `meeting_ids`, `target_meeting_id`, `target_date`, `purpose`, `goal`. Includes context counts, deltas, terminal done/error events. |
| `POST` | `/api/assistant` | Individual, group or team question with optional meeting-type/skill/topic/date/action/search filters; returns checked citations and supporting records. |
| `GET` | `/api/strategy-boards` | Saved board summaries, most recently updated first. |
| `GET` | `/api/strategy-boards/{id}` | Full coach-authored board. |
| `POST` | `/api/strategy-boards` | Validate and save a new board/copy. |
| `PUT` | `/api/strategy-boards/{id}` | Update with the current integer `revision`; stale revisions return 409. |

Separate roster/timeline endpoints, server-side audio/photo transcription and insights are not implemented. Browser voice dictation needs no transcription endpoint. Calendar export runs client-side and uses no additional endpoint. Recent-check-in calculations run locally in JavaScript over the shared approved meetings; no additional API endpoint or Aivana call is needed. The current frontend reads the shared roster fixture and approved meetings. There is no public hosting/authentication boundary; run locally with synthetic data.

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

The HTTP response also includes `sources` (source ID, meeting/record IDs, date, title, and approved record fields), `matched_count`, `context_count`, `limited`, `origin`, `player_id`, and `question`. Counts and date/status comparisons come from code. Sensitive records are excluded even when shown in another view. Individual, Group and Team scopes are supported; answers remain limited to the supplied records and represented players.

---

## Error handling and token management

### Aivana errors

| Status | Meaning | App behavior |
|---|---|---|
| 400 / 422 | Invalid request or schema | Logged with `details`; not retried. Coach sees a failure message; manual records remain available |
| 401 | Invalid or expired key | Check backend key configuration; not retried. |
| 403 | Permission or workspace restriction, including output-token limits | Surface the restriction; the `max_output_tokens` bucket gets a specific budget message. Not retried. |
| 503 | Backend key missing | Configure `AIVANA_API_KEY` and restart the backend. |
| 402 | Token balance empty | Friendly banner: "AI is unavailable (token balance)". Manual entry still works. |
| Oversized note | More than 12,000 characters | Reject before extraction; shorten the note. Photo input is not implemented. |
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
- Prep briefs use up to 10 approved non-sensitive records from the coach-selected conversations for this player. With no selection, the legacy GET route uses the latest records. The target/focus describes the coach's intent and does not establish facts about a game or player.
- No PDFs are sent to Aivana. Photo input remains planned.
- No AI calls inside render loops. Extraction runs retain drafts for approval, but a new deliberate extraction makes a new call.
- A token-usage admin panel remains planned.

---

