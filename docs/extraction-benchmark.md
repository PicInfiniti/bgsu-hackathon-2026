# Extraction benchmark

[Back to README](../README.md). This is a repeatable **known-answer development benchmark**, not an independent or held-out AI evaluation.

## Run

From the repository root, with backend dependencies installed and `AIVANA_API_KEY` configured privately in the environment or `backend/.env`:

```bash
.venv/bin/python scripts/benchmark_extraction.py --live --output /tmp/falcon-benchmark.json
```

The default selects all 19 synthetic football scenarios (86 author-written reference records). Calls are sequential, with at most one content-correction call per case: **at most 38 Aivana requests**. No preparation or assistant requests are made. Use `--cases individual,group,team` for a smaller selection.

The runner imports the production Aivana adapter and normalizer directly, mirrors their bounded correction policy, and never opens a notebook database or approves records. It does not exercise HTTP routing, approval UI or persistence. Tests cover those separately. The expected answers are used only by the scorer and are never sent to Aivana. No key is included in reports.

The output path must be new. A JSON artifact and Markdown sibling are checkpointed after each case; `complete: true` in JSON indicates the selected run finished. Authentication, workspace-limit, balance or rate-limit errors on an initial call stop further calls and mark remaining cases skipped. Other failed cases remain visible. A failed corrective call retains the first drafts for review, as in the application. There is no automatic HTTP retry loop.

An `ok` case status means a response was returned, not that it passed the references or can be approved unchanged. Field scores are pooled per-player measurements; team fan-out can dominate the totals.

Results and raw provider records contain only the synthetic scenario content. They may be committed after review. Never use this runner on private or real player data.

## Replay without tokens

```bash
.venv/bin/python scripts/benchmark_extraction.py --replay docs/benchmarks/football-v2-r4-2026-11-21.json --output /tmp/falcon-replay.json
```

Replay uses saved normalized items and the current scorer, makes no provider calls, and rejects changed input/label hashes. It does not re-normalize raw provider output; it therefore cannot verify a normalizer change. Original run artifacts remain unchanged. Replay reports zero new provider requests and identifies its source artifact.

## What the scores mean

1. Expand shared feedback to the players it applies to, matching the per-player reference format.
2. Require each candidate quote to occur in the original note, allowing the production normalizer's case/whitespace recovery.
3. Align candidates and references by contiguous source-word overlap (at least 60% of the longer quote), using maximum-weight one-to-one matching. Prefer correct player and kind among competing matches. Dummy columns permit missing records; duplicates cannot improve recall.
4. Report evidence/player/kind precision and recall; action precision and recall; player, kind and exact skill agreement on aligned pairs; and deadline equality on aligned expected actions, also requiring correct player/kind. Show dated and null-deadline subsets separately.
5. List every missing reference, unaligned extra candidate, field disagreement, validation warning and failed call for review. Failed/skipped cases have zero candidates and stay in recall denominators. Conditional field agreement can look high even when recall is low: read both.

An **extra candidate is not automatically invented**. A valid neutral observation may be absent from a reference, and a faithful quote may fail the lexical alignment threshold. Similarly, the action/improvement boundary and skill taxonomy allow disagreements. The scorer does not automatically assess semantic equivalence of task/feedback wording or topic correctness. Those need a separate review.

The dataset was authored alongside its answers and has been used during development. A good result here is evidence about these examples, not general accuracy on unfamiliar notes. No single overall accuracy score or claim of independent labeling is made. Coach-edit rate is a separate measure, not ground truth.

## Recorded run

- [November 21 Live results](benchmarks/football-v2-r4-2026-11-21.md)
- [Machine-readable inputs, outputs, alignment and hashes](benchmarks/football-v2-r4-2026-11-21.json)
- [Review of discrepancies](benchmarks/football-v2-r4-review.md)

Do not change references, prompts or application code merely to improve this saved score. Review a discrepancy first, preserve the original result, and use a new output path for later runs. A stronger next evaluation would use separately reviewed notes not used to tune the implementation.
