# Ask Aivana accuracy report

Run on 2026-11-21 with `python scripts/eval_assistant.py --write`. Synthetic records with known expected evidence, run through the real API on a throwaway database in Demo mode (deterministic code path, no Aivana call). Live-mode answers use the same retrieval and the same citation checks, but their wording was not scored here.

**39 of 39 cases passed (100%).**

| Category | Passed | Cases | Accuracy |
|---|---|---|---|
| Intent recognition | 6 | 6 | 100% |
| Player identification | 5 | 5 | 100% |
| Meeting / record retrieval | 2 | 2 | 100% |
| Correct attribution | 6 | 6 | 100% |
| Citation accuracy | 2 | 2 | 100% |
| Recommendation grounding | 3 | 3 | 100% |
| Dates and deadlines | 4 | 4 | 100% |
| Missing information | 4 | 4 | 100% |
| Multi-turn context | 5 | 5 | 100% |
| No duplicate records | 2 | 2 | 100% |

## Failures

None in this run.

## Cases

| Category | Question | Context | Result |
|---|---|---|---|
| intent | What should I do next with Taylor Hayes? |  | pass |
| intent | What homework is overdue for Taylor Hayes? |  | pass |
| intent | Summarize Casey Lane |  | pass |
| intent | What's on this week? |  | pass |
| intent | Add practice Tuesday 3:30 |  | pass |
| intent | What is the next step? Do you have any recommendations? |  | pass |
| player | What did I tell Morgan Reed about catching? |  | pass |
| player | Summarize #3 |  | pass |
| player | What should I discuss with Casey tomorrow? |  | pass |
| player | What did I tell Quinn? |  | pass |
| player | How is Ellis doing? |  | pass |
| retrieval | Summarize Casey Lane |  | pass |
| retrieval | What did I tell Taylor Hayes? |  | pass |
| attribution | Summarize Morgan Reed |  | pass |
| attribution | Summarize Taylor Hayes |  | pass |
| citations | What should I do next with Casey Lane? |  | pass |
| citations | What should I do next with Taylor Hayes? |  | pass |
| grounding | What should I do next with Taylor Hayes? |  | pass |
| grounding | What should I do next with Casey Lane? |  | pass |
| grounding | What should I do next with Avery Brooks? |  | pass |
| dates | What homework is overdue for Taylor Hayes? |  | pass |
| dates | What homework does Casey Lane have? |  | pass |
| dates | What homework does Avery Brooks have? |  | pass |
| missing | What should I do next with Taylor Hayes? |  | pass |
| missing | What should I do next with Skyler Vale? |  | pass |
| missing | Summarize Dakota Penn |  | pass |
| missing | What did I say about the punt team flight plan? |  | pass |
| multiturn | What should I do next? | Casey | pass |
| multiturn | What about his overdue homework? | Taylor | pass |
| multiturn | Summarize his feedback | Morgan | pass |
| multiturn | What should the whole team prioritize? | Casey | pass |
| multiturn | What about his homework? |  | pass |
| dedupe | What should I do next with Casey Lane? |  | pass |
| dedupe | Summarize Casey Lane |  | pass |
| attribution | Jordan feedback goes to Jordan |  | pass |
| attribution | Morgan feedback goes to Morgan |  | pass |
| attribution | "Both players" homework kept for each named attendee (flagged) |  | pass |
| attribution | Record quoting Jordan but labelled Morgan is not attributed |  | pass |
| dates | "before Friday" resolved in code |  | pass |
