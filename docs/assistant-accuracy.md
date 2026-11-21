# Ask Aivana: accuracy report (November 21, 2026)

## How it was measured
- `scripts/eval_assistant.py` builds a throwaway database with synthetic approved meetings whose facts are known (for example: Taylor Hayes *must complete route-running drills* due 2 days ago and still open; Casey Lane was *late to his coverage rotation* in two meetings; Avery Brooks's footwork homework is *done*).
- 34 questions go through the real `/api/assistant/message` route in **Demo mode** (the deterministic code path; no Aivana call). 5 more cases check multi-player attribution in the extraction code with a fixed model output.
- Each case has expected evidence: the intent, the player, the records that must be cited, words that must **not** be claimed, the late/open/done counts, the context after a follow-up question, and so on.
- Full case list and results: [`assistant-accuracy-cases.md`](assistant-accuracy-cases.md). Re-run with `python scripts/eval_assistant.py --write`. The same cases run as an automated test (`tests/test_assistant_brain.py`).

## Results

| Run | Cases | Passed | Accuracy |
|---|---|---|---|
| First run (before fixes) | 39 | 36 | 92% |
| After fixes | 39 | 39 | 100% |

| Category | Cases | Final |
|---|---|---|
| Intent recognition | 6 | 6 |
| Player identification (incl. ambiguous names → clarification) | 5 | 5 |
| Meeting / record retrieval | 2 | 2 |
| Correct attribution of feedback (incl. two-player extraction) | 6 | 6 |
| Citation accuracy (every cited source is a saved record) | 2 | 2 |
| Recommendation grounding (no invented completions or progress) | 3 | 3 |
| Dates and deadlines (late/open/done from code, "before Friday") | 4 | 4 |
| Handling missing information | 4 | 4 |
| Multi-turn context ("his", "what should I do next?") | 5 | 5 |
| No duplicate records | 2 | 2 |

## Failures found on the first run and what changed
1. **"Summarize his feedback" with a player in context** was sent to the note recap ("Open a saved note first"). Fix: the router now treats summary questions as player summaries when a player is in context and you are not on a note or film page.
2. **Homework counts for Avery** showed "1 late" instead of "1 done". Cause: the eval's seed data, not the app. Saving always starts homework as open, and the coach marks it done afterwards. The seed now marks it done the same way the app does.
3. **Grounding check flagged "no record says it was finished"**. This was a false alarm in the checker, not the assistant: the sentence says the opposite of a claim. The checker now ignores "no record says…" phrases.

## Earlier common failures (from the coach's report) and the fixes
- **Repeated matching records instead of advice.** Before, every non-action question was a keyword search that listed matches. Now the assistant tells the question types apart: search, player summary, homework, recommendation, meeting preparation and clarification. Recommendations are built from approved records, open assignments, due dates computed in code, recurring themes, the next game and the date of the last 1-on-1.
- **Duplicates.** The same statement saved for several players, or a film note and the homework made from it, is merged into one source.
- **Facts versus suggestions.** Answers show *Recommended next steps* (suggestions, each with a "why" and source chips), *What the records say* (known facts with sources) and *Check before you act* (missing information).

## Live mode
- One live check (Casey Lane, "What should I do next?") returned 3 recommendations, 4 known facts and 3 missing-information points. All cited sources were saved records. Live answers go through the same checks: unknown source IDs are dropped, and a recommendation without a source is dropped. If Aivana fails, the code-built recommendations are shown instead.
- The wording of live answers was **not** scored automatically; that needs more live runs (each costs tokens). There is no accuracy percentage on the dashboard.
