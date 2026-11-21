# Project A synthetic practice pack

Original fictional basketball coaching data by picInfiniti, created November 20, 2026. **This is not the organizers' data pack** and does not establish compliance with their supplied-data requirement. All player names, meetings, and statements are invented; any resemblance is coincidental. No contact information, accounts, credentials, or medical records are included.

The pack contains **25 players, 14 meetings, and 57 expected extraction records**. Its reference-answer date is **2026-11-20**; both app modes use the current local date for overdue status.

| File | Purpose |
| --- | --- |
| `manifest.json` | Provenance, version, counts, and limitations |
| `roster.json` | Stable player IDs `p01`–`p25`, fictional names, jersey numbers, and positions |
| `meetings.json` | Meeting inputs: title, date, type, attendees, source note, and scenario tags |
| `expected.json` | Author-written per-player reference records and review guidance, keyed by meeting ID |
| `notes.md` | Readable source notes for manual review or copy/paste |

The cases include individual, group, and full-team meetings; shared praise; separate player assignments; absolute, relative, missing, and ambiguous deadlines; overdue actions; follow-up context; scheduling without extractable records; and a non-attendee mention. In the normal team huddle all 25 players attend, but only three named players receive records. The separate all-player broadcast case expects 25 actions and deliberately stresses the live output budget.

## Use in Falcon Follow-up

Run `.venv/bin/python scripts/build_demo_data.py` from the project root to regenerate `data/demo.json`. The app uses that generated file for its roster and offline sample selector. Choose a scenario in Meeting desk, extract its prepared records, review, and approve to save. Prepared Demo extractions are not AI output. Both modes require the backend and share SQLite. The scheduling-only scenario correctly returns no records and cannot be saved under the current nonempty-record rule.

Existing browser demo history and live SQLite data are not reset or replaced. Existing IDs `p01`–`p08` keep their original identities. Previously saved eight-player team meetings remain historical records; new team meetings use all 25 players. Restart the backend after changing the pack because it loads roster data on startup.

Only two pre-reviewed example meetings seed the shared SQLite notebook, once by stable ID. The remaining expected extraction answers are not imported or sent to Aivana. New extraction results in both modes require coach review and explicit approval before saving. Older browser Demo history is migrated on connection with stable IDs; existing SQLite records win conflicts, and the original browser copy is kept.

## Evaluate deliberately

Review an extracted result against the matching entry in `expected.json`: player attribution, action/praise/improvement kind, meaning, skill area, source evidence, and deadline. Faithful paraphrases and equivalent skill labels can differ from the reference wording. A valid quote may be a different verbatim excerpt of the same evidence; the backend checks that it appears in the source note. Missing or ambiguous deadlines stay null; “tomorrow” is relative to the meeting date. Never infer character or attitude.

These reference answers were written with the notes. They are useful for regression checks but are not an independently annotated dataset or an AI accuracy score. Selected cases have been checked with real Aivana calls; see [the QA report](../../docs/qa-2026-11-20.md) for the reviewed results, initial failures, and fixes. This remains a small spot check, not a general accuracy benchmark. The 25-player broadcast can exceed the verified 2048-token workspace output limit: reject partial results, and validate any future batching approach separately. Do not use that stress case as a guaranteed live demo.

Run `.venv/bin/python -m unittest discover -s tests -p test_synthetic_pack.py -v` to check IDs, dates, source evidence, attendee attribution, scenario coverage, persistence of reference fixtures, and the generated app fixture. Those checks use no AI calls.
