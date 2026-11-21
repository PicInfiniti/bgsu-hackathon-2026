# Project A synthetic football practice pack

Version 2, revision 4: original fictional football coaching data by picInfiniti, created November 20, 2026. **This is not the organizers' data pack** and does not establish compliance with their supplied-data requirement. All player names, meetings, and statements are invented; any resemblance is coincidental. No contact information, accounts, credentials, or medical records are included.

The pack contains **25 players, 19 meetings, and 86 expected extraction records**. Its reference-answer date is **2026-11-20**; both app modes use the current local date for overdue status.

| File | Purpose |
| --- | --- |
| `manifest.json` | Provenance, version, counts, and limitations |
| `roster.json` | Stable player IDs `p01`–`p25`, fictional names, unique jersey numbers/nicknames, football positions, position labels, and position groups |
| `meetings.json` | Meeting inputs: title, date, type, attendees, source note, and scenario tags |
| `expected.json` | Author-written per-player reference records and review guidance, keyed by meeting ID |
| `notes.md` | Readable source notes for manual review or copy/paste |

The cases include individual, group, and full-team meetings; shared praise; separate player assignments; absolute, relative, missing, and ambiguous deadlines; overdue actions; follow-up context; scheduling without extractable records; and a non-attendee mention. In the normal team huddle all 25 players attend, but only three named players receive records. The separate all-player broadcast case expects 25 actions and deliberately stresses the live output budget.

## Use in Falcon Follow-up

Run `.venv/bin/python scripts/build_demo_data.py` from the project root to regenerate `data/demo.json`. Both frontend and backend use that generated file for the football roster and sample selector. Choose a scenario in Meeting desk, extract its prepared records, review, and approve to save. Prepared Demo extractions are not AI output. Both modes require the backend and share SQLite. The scheduling-only scenario correctly returns no records. Choose Review & save original note to keep its date, attendees, and original text without adding player records or tasks.

Existing browser history and SQLite data are not reset or rewritten. All player IDs `p01`–`p25` and names retain their identities; football positions, position groups, nicknames, and appropriate jersey numbers replace the old basketball metadata. Previously saved eight-player team meetings remain historical records; new team meetings use all 25 players. Restart the backend after changing the pack because it loads roster data on startup.

Seven pre-reviewed football examples seed the shared SQLite notebook once. The original IDs `m-football-v2-0` and `m-football-v2-1` are retained. Revision 3 adds `m-football-v2-shared-group-action`, `m-football-v2-shared-team-action`, `m-football-v2-group-encouragement`, and `m-football-v2-team-encouragement`; the last two explicitly use note-only storage with no extracted records. The manifest lists the seeded scenarios, and new IDs remain stable if their order changes. They are added alongside earlier records; legacy `m-seed-*` examples stay unchanged and appear as earlier practice-pack history in the UI. The remaining expected extraction answers are not imported or sent to Aivana. New extraction results in both modes require coach review and explicit approval before saving. Older browser Demo history is migrated on connection with stable IDs; existing SQLite records win conflicts, and the original browser copy is kept.

## Evaluate deliberately

Review an extracted result against the matching entry in `expected.json`: player attribution, action/praise/improvement kind, meaning, skill area, source evidence, and deadline. Faithful paraphrases and equivalent skill labels can differ from the reference wording. A valid quote may be a different verbatim excerpt of the same evidence; the backend checks that it appears in the source note. Missing or ambiguous deadlines stay null; “tomorrow” is relative to the meeting date. Never infer character or attitude.

These reference answers were written with the notes. They are useful for regression checks but are not an independently annotated dataset or an AI accuracy score. Real Aivana spot checks in [the QA report](../../docs/qa-2026-11-20.md) apply to the earlier basketball pack. Selected football cases now have live development checks in [the November 21 report](../../docs/qa-2026-11-21.md); these do not establish a general accuracy benchmark. Those earlier checks were a small spot check, not a general accuracy benchmark. The schema-v2 broadcast now returns one whole-team model instruction and fans it out in Python; a real check produced all 25 actions. Longer or more complex notes can still exceed the 2048-token output limit. Reject truncation and shorten the note; this single-case result is not a general token-budget guarantee.

Run `.venv/bin/python -m unittest discover -s tests -p test_synthetic_pack.py -v` to check IDs, dates, source evidence, attendee attribution, scenario coverage, persistence of reference fixtures, and the generated app fixture. Those checks use no AI calls.

## Football scope

The roster covers QB, RB, WR, TE, OL, DL, LB, DB, and special teams. Notes cover quarterback footwork and passing, defensive coverage and pre-snap calls, route releases, tackling, ball security, pass protection, catching, placekicking, and punting. Reference skill labels follow the football taxonomy in the team README; praise about communication uses `Not Applicable` rather than inventing a technical skill. This pack keeps the current action/praise/improvement schema. Schema-v2 extraction now adds confidence, unmatched-player resolution, and backend group/team expansion; the reference pack remains compatible with earlier saved item fields.

Revision 3 adds a three-player offensive-line shared drill, a 25-player shared walkthrough review, and group/team encouragement-only notes. The Action board presents assignments under meeting-type headers. Encouragement-only examples create no action rows; find those conversations in timelines, Recent conversations, or the calendar. Existing roster IDs and original seed contents are preserved. All additions are original fictional practice examples, not organizer data.

Revision 4 adds `sensitive-followup`, a fictional individual trainer-confirmation task for Avery due November 24. It seeds as `m-football-v2-sensitive-followup`, keeps its Health & Injury Follow-up topic in Demo extraction, is hidden by default, and is excluded from AI context. Enable Show sensitive actions to reveal it. Existing records and completion states remain unchanged.
