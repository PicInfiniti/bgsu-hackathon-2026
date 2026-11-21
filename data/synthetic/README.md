# Project A synthetic football practice pack

Version 2: original fictional football coaching data by picInfiniti, created November 20, 2026. **This is not the organizers' data pack** and does not establish compliance with their supplied-data requirement. All player names, meetings, and statements are invented; any resemblance is coincidental. No contact information, accounts, credentials, or medical records are included.

The pack contains **25 players, 14 meetings, and 57 expected extraction records**. Its reference-answer date is **2026-11-20**; both app modes use the current local date for overdue status.

| File | Purpose |
| --- | --- |
| `manifest.json` | Provenance, version, counts, and limitations |
| `roster.json` | Stable player IDs `p01`–`p25`, fictional names, unique jersey numbers/nicknames, football positions, position labels, and position groups |
| `meetings.json` | Meeting inputs: title, date, type, attendees, source note, and scenario tags |
| `expected.json` | Author-written per-player reference records and review guidance, keyed by meeting ID |
| `notes.md` | Readable source notes for manual review or copy/paste |

The cases include individual, group, and full-team meetings; shared praise; separate player assignments; absolute, relative, missing, and ambiguous deadlines; overdue actions; follow-up context; scheduling without extractable records; and a non-attendee mention. In the normal team huddle all 25 players attend, but only three named players receive records. The separate all-player broadcast case expects 25 actions and deliberately stresses the live output budget.

## Use in Falcon Follow-up

Run `.venv/bin/python scripts/build_demo_data.py` from the project root to regenerate `data/demo.json`. Both frontend and backend use that generated file for the football roster and sample selector. Choose a scenario in Meeting desk, extract its prepared records, review, and approve to save. Prepared Demo extractions are not AI output. Both modes require the backend and share SQLite. The scheduling-only scenario correctly returns no records and cannot be saved under the current nonempty-record rule.

Existing browser history and SQLite data are not reset or rewritten. All player IDs `p01`–`p25` and names retain their identities; football positions, position groups, nicknames, and appropriate jersey numbers replace the old basketball metadata. Previously saved eight-player team meetings remain historical records; new team meetings use all 25 players. Restart the backend after changing the pack because it loads roster data on startup.

Two pre-reviewed football example meetings seed the shared SQLite notebook once, with versioned IDs `m-football-v2-0` and `m-football-v2-1`. They are added alongside earlier records; legacy `m-seed-*` examples stay unchanged and appear as earlier practice-pack history in the UI. The remaining expected extraction answers are not imported or sent to Aivana. New extraction results in both modes require coach review and explicit approval before saving. Older browser Demo history is migrated on connection with stable IDs; existing SQLite records win conflicts, and the original browser copy is kept.

## Evaluate deliberately

Review an extracted result against the matching entry in `expected.json`: player attribution, action/praise/improvement kind, meaning, skill area, source evidence, and deadline. Faithful paraphrases and equivalent skill labels can differ from the reference wording. A valid quote may be a different verbatim excerpt of the same evidence; the backend checks that it appears in the source note. Missing or ambiguous deadlines stay null; “tomorrow” is relative to the meeting date. Never infer character or attitude.

These reference answers were written with the notes. They are useful for regression checks but are not an independently annotated dataset or an AI accuracy score. Real Aivana spot checks in [the QA report](../../docs/qa-2026-11-20.md) apply to the earlier basketball pack. The football version has fixture/source/storage checks but has not yet had a live AI accuracy evaluation. Those earlier checks were a small spot check, not a general accuracy benchmark. The 25-player broadcast can exceed the verified 2048-token workspace output limit: reject partial results, and validate any future batching approach separately. Do not use that stress case as a guaranteed live demo.

Run `.venv/bin/python -m unittest discover -s tests -p test_synthetic_pack.py -v` to check IDs, dates, source evidence, attendee attribution, scenario coverage, persistence of reference fixtures, and the generated app fixture. Those checks use no AI calls.

## Football scope

The roster covers QB, RB, WR, TE, OL, DL, LB, DB, and special teams. Notes cover quarterback footwork and passing, defensive coverage and pre-snap calls, route releases, tackling, ball security, pass protection, catching, placekicking, and punting. Reference skill labels follow the football taxonomy in the team README; praise about communication uses `Not Applicable` rather than inventing a technical skill. This pack keeps the current action/praise/improvement schema. Confidence, unmatched-player resolution, and backend group fan-out in the roadmap are separate implementation tasks.
