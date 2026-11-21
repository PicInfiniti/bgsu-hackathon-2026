# Review of the November 21 development benchmark

[Scored report](football-v2-r4-2026-11-21.md) · [Full synthetic outputs](football-v2-r4-2026-11-21.json) · [Method](../extraction-benchmark.md)

This is an agent review of one Live run against author-written development references, not independent human annotation. No references, prompts or application behavior were changed during the run. Review checks wording and the main discrepancy groups; it does not certify every classification.

## Results and interpretation

All 19 cases returned normalized results in 22 provider requests. No transport/truncation failures occurred. This does **not** mean all cases passed: shared-praise, group-encouragement and team-encouragement retained unresolved-player validation errors after a correction attempt and would require coach correction/removal before saving.

- All **69 reference actions** were found with the expected player and deadline. Of these, 65 had dates and 4 correctly remained undated. These are pooled per-player counts: two whole-team cases contribute 50 actions, not 50 independent AI calls.
- The provider produced **72 action candidates**. Three were improvement statements extracted as actions instead of the reference's improvement kind. Action precision was 69/72 (95.8%); action recall was 69/69 (100%). This is evidence/player/kind agreement, not a semantic correctness score.
- Across all kinds, 80/86 reference records matched evidence/player/kind (93.0% recall), while 80/119 candidates matched (67.2% precision). The much lower overall precision is material: extra feedback is the main weakness.
- All candidate source quotations occurred in the notes under the application's case/whitespace recovery. Valid source text alone did not prevent classification or attribution failures.
- Exact skill agreement was 54/84 aligned pairs (64.3%). Some differences are reasonable taxonomy choices; the walkthrough disagreement alone repeats across 25 players.

## Discrepancies

| Case(s) | Observation | Assessment / next action |
|---|---|---|
| `shared-praise` | Praise addressed to Blair, Reese and Quinn stayed unmatched, while Blair's task was correctly attributed. Two reference praise rows had no aligned candidate; the remaining praise candidate had no player. | Concrete failure. Fix explicit multi-name attribution or the model's target formatting, preserving exact evidence and rejecting ambiguous subsets. Add a regression before a fresh Live recheck. |
| `group-four`, `shared-team-action` | Action text was also emitted as Improvement feedback: four individual copies plus a team statement expanded to 25 player rows. | 29 extra per-player feedback records lack an explicit separate performance judgment. Prioritize separating pure assignments from improvement feedback. Do not delete genuine feedback that accompanies an action. |
| `team`, `no-deadline`, `group-pivots` | “Work on…” technique advice became an action, while references label it Improvement. | Three kind disagreements. The words are preserved, but behavior is inconsistent with the reference distinction. Clarify the rule for general advice versus a concrete assigned follow-up. |
| `group-encouragement`, `team-encouragement` | Five unmatched praise/improvement/observation candidates were emitted for notes intended to be saved without extracted records. | Grounded words, but unsuitable records for this workflow and unresolved attribution. “Keep going” is not demonstrated performance praise. Prefer note-only handling for generic encouragement without explicit feedback or tasks. |
| `followup` | A statement that the footwork session was completed became Praise, in addition to the correct new task. | One extra record. The completion statement is source-backed; it is not necessarily praise and must not automatically complete a separately stored action. Consider a neutral observation policy and label it explicitly. |
| `group` | Coverage calls became Not Specified skill; communication praise became Not Specified instead of Not Applicable. | Taxonomy inconsistency; preserve separate coverage technique and general communication cases. |
| `shared-praise` | Pass-protection footwork became Footwork & Agility rather than Blocking. | Plausible alternative skill. Do not call this an invented fact; decide the labeling policy before changing gold labels. |
| `group-feedback` | Clear pre-snap line calls became Decision-Making rather than Not Applicable. | Plausible taxonomy disagreement requiring policy review. |
| `shared-team-action` | Walkthrough-sheet review became Not Applicable rather than Decision-Making for 25 action rows. | One underlying classification difference repeated by fan-out; not 25 independent failures. |

The 35 unaligned extras comprise 29 assignment-as-feedback copies, one completion-as-praise record and five encouragement records. They are not 35 proven inventions of events or task content. No aggregate “hallucination rate” is claimed.

## Prioritized follow-up

1. Fix named shared-praise attribution and prevent redundant feedback inferred from pure task instructions.
2. Make generic encouragement and action-versus-improvement handling consistent, with targeted tests on new wording as well as the benchmark cases.
3. Review ambiguous skill labels separately; keep the original references/results unchanged and document any later label revision.
4. Recheck only the affected cases in a new run, then use separately reviewed unfamiliar notes for stronger validation. Do not tune to the saved score and call it independent accuracy.
