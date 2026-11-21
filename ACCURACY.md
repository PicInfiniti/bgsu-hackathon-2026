# Measuring AI Extraction Accuracy

How the Football Coach Meeting Tracker tests whether the Aivana extraction is correct. This covers the Level 3 "test of extraction accuracy against notes with known answers" and the "Reliability and data handling" part of the judging rubric.

---

## Short answers

| Question | Answer |
|---|---|
| Do I need to train or run a separate model? | **No.** You test the same Aivana extraction call the app already uses. No training and no extra model. |
| Do I need to write code? | **Yes, but only plain Python** (about 150 to 250 lines): a script that runs the extractor on each test note and compares the output with your answer key. No machine learning libraries are needed. |
| What do I need to create by hand? | About **10 synthetic test notes** and, for each one, the **answer key**: the records a perfect extraction should produce. |
| How many tokens does it use? | About 1,000 to 2,000 tokens per note, so roughly 15,000 to 20,000 per full run. Three runs for the consistency check are about 50,000 to 60,000, which is about 5% of the 1M budget. |
| Should I use another AI to grade the answers ("LLM as a judge")? | **Not needed.** Almost every field is a category, an ID, or a date, so code can grade it exactly. Use simple text similarity for the free-text feedback field. |

Common practice for structured extraction is to compare the output with human-written "gold" labels field by field and report precision, recall, and F1, using exact match for categories and IDs. LLM judges are mainly used for open-ended text, where exact matching does not work, and they add cost and their own errors.

---

## 1. What gets measured

There are two measurements, and the demo shows both.

1. **Offline test set (before the demo):** 10 notes with known answers, scored by a script. This tells you how good the extraction is and lets you compare prompt versions.
2. **Live accuracy from coach edits (during use):** every approval compares the AI draft with what the coach saved. This is the "AI field accuracy" tile on the dashboard.

---

## 2. Build the test set (by hand, about 45 minutes)

### 2.1 Write 10 synthetic notes

Use players from the synthetic roster. Write the notes the way a coach really would: short, with nicknames and abbreviations. Make sure the set covers these cases:

| # | Case | What it tests |
|---|---|---|
| 1 | Simple individual note, one praise and one improvement | Basic extraction |
| 2 | Group note with 3 players, separate feedback each | Keeping feedback with the right player |
| 3 | Nickname ("JC") and jersey number ("#4") | Name matching |
| 4 | Two attendees named Chris, note says only "Chris" | Must return `unmatched`, not guess |
| 5 | "All WRs run extra routes by Friday" | Group fan-out, relative deadline |
| 6 | Vague deadline ("before the Michigan game", "soon") | Must leave the due date empty |
| 7 | Injury mention ("ankle sore, trainer appt Thursday") | Sensitive tag, no diagnosis |
| 8 | Away-game trip briefing | Travel & Away Games topic, team action item |
| 9 | Film review with play references | `film_reference` copied correctly |
| 10 | Note with no feedback at all (pure scheduling) | No invented feedback; `feedback_type` stays null |

Optional trap note: a note where the coach says nothing about attitude, to check the AI does not add words like "lazy" or "great attitude".

### 2.2 Write the answer key for each note

Write the answer key **before** you run the AI on the note, so the AI's output does not influence you. Save one JSON file per note in `tests/labeled_notes/`:

```json
{
  "id": "note_05",
  "meeting": { "type": "group", "date": "2026-11-17", "session_context": "regular",
               "attendees": ["P07", "P09", "P11"] },
  "note": "All WRs: extra route work before Friday. JC great hands today.",
  "expected_records": [
    { "player_id": "P07", "topic": "Training & Conditioning", "skill": "Route Running",
      "feedback_type": null, "has_action_item": true, "due_date": "2026-11-20",
      "source_text": "All WRs: extra route work before Friday." },
    { "player_id": "P09", "topic": "Training & Conditioning", "skill": "Route Running",
      "feedback_type": null, "has_action_item": true, "due_date": "2026-11-20",
      "source_text": "All WRs: extra route work before Friday." },
    { "player_id": "P07", "topic": "Football Skills", "skill": "Receiving",
      "feedback_type": "Praise", "has_action_item": false, "due_date": null,
      "feedback": "Great hands today.",
      "source_text": "JC great hands today." }
  ],
  "expected_unmatched": [],
  "must_not_contain": ["attitude", "lazy", "diagnos"]
}
```

Rules for the answer key:

- Write records **after** fan-out and date resolution, because that is what the coach sees.
- Where you would accept two answers (for example, Training & Conditioning or Football Skills), list both: `"topic": ["Training & Conditioning", "Football Skills"]`. The scorer counts either as correct. Use this sparingly.
- If the right answer is "the AI should not know", write `null` or put the mention in `expected_unmatched`.

---

## 3. The scoring script (code to write)

`scripts/accuracy_test.py` does four steps. It reuses the app's own functions so you test what the app really does.

```
for each labeled note:
    1. RUN      draft = extract_records(note, meeting)   # same function as /extract, incl. validation,
                                                         # date resolution, and fan-out
    2. MATCH    pair each AI record with an expected record
    3. SCORE    compare the paired fields; count unpaired records
    4. LOG      tokens, credits, latency, request_id
write results/accuracy_<date>.json and print a summary table
```

### 3.1 Matching AI records to expected records

A note can produce several records, so first decide which AI record corresponds to which expected record.

1. For every (AI record, expected record) pair in the same note, compute a match score:
   - `+0.5` if `player_id` is the same
   - `+0.5 × similarity(source_text_ai, source_text_expected)`, using `difflib.SequenceMatcher(...).ratio()`
2. Sort the pairs by score and pair them greedily, best first, each record used once.
3. Pairs scoring below 0.6 do not count as a match.
4. AI records left over are **extra** (possible invented records). Expected records left over are **missed**.

### 3.2 Metrics

| Metric | How to compute | Why it matters |
|---|---|---|
| **Record precision** | matched ÷ AI records | Low means the AI adds records that should not exist. |
| **Record recall** | matched ÷ expected records | Low means the AI misses things the coach said. |
| **Record F1** | 2PR ÷ (P + R) | One number combining both. |
| **Field accuracy** | For matched pairs: percent correct for `player_id`, `topic`, `skill`, `feedback_type`, `due_date`, `film_reference` (exact match) | Shows which fields are weak. |
| **Action item recall and precision** | Same as records, counting only records with an action item | Missed tasks hurt coaches most, so report this on its own. |
| **Deadline accuracy** | Percent of action items whose resolved `due_date` equals the key | Tests your date code and the AI's phrase copying together. |
| **Feedback text similarity** | Average `SequenceMatcher` ratio for `feedback` on matched pairs; count ≥ 0.7 as correct | Approximate check for the free-text field. |
| **Grounding rate** | Percent of AI records whose `source_text` appears in the note (normalized, fuzzy ≥ 0.9) | Should be 100%. Anything lower is a made-up quote. |
| **Abstention accuracy** | Of the ambiguous mentions in `expected_unmatched`, percent returned as `unmatched`; of the vague deadlines, percent left `null` | Shows the AI says "I don't know" instead of guessing. |
| **Guardrail violations** | Count of AI records containing any `must_not_contain` phrase, or character words not in the note | Should be 0. |
| **Skill confusion table** | Rows = expected skill, columns = AI skill, counts in cells | Shows which categories get mixed up so you can fix the prompt. |
| **Consistency** (optional) | Run each note 3 times; percent of fields that agree across runs | Shows how stable the output is. |
| **Cost and speed** | Average `input_tokens`, `output_tokens`, `credits`, and seconds per note | Shows token management. |

All the counting, matching, and percentages are done in Python. The model is never asked to grade itself.

### 3.3 Example output (fill in with your real numbers)

```
Extraction accuracy: prompt v2, 10 notes, run 2026-11-21 13:40
------------------------------------------------------------------
Records            expected 34   AI 35   matched 32
Record precision   __%     Record recall   __%     F1  __
Action items       precision __%   recall __%
Field accuracy     player __%  topic __%  skill __%  feedback_type __%  due_date __%
Grounding rate     __%   (AI quotes found in the note)
Abstention         ambiguous names __/3 unmatched   vague deadlines __/2 left empty
Guardrails         __ violations
Avg cost           ____ tokens, __ credits, __ s per note
```

Never put estimated numbers in the demo or README. Only report what the script produced.

---

## 4. Prompt v1 vs v2 (the strongest depth point)

1. Run the test set on your first prompt and save the result as `results/accuracy_v1.json`.
2. Read the misses and the confusion table. Fix the prompt (for example, add "a note about blocking is Blocking even when the player is a receiver").
3. Run again as v2 and compare.

Show a small before-and-after table in the demo: "Skill accuracy went from X% to Y% after we fixed the prompt using the test set." This proves you improved the AI with data instead of guessing.

Keep the test notes fixed between versions. If you change the prompt based on a note, that note is no longer an unbiased test; mention this in the known limits, or write 2 or 3 fresh notes for the final run.

---

## 4b. Three extra depth checks (from the Genie One and Jev examples)

### Ablation: AI alone vs AI + our checks

Score the same test set twice, like a "with and without" bar chart:

| Condition | What is scored |
|---|---|
| **AI alone** | Aivana's raw `structured` output, before any backend processing. Relative deadlines count as wrong because the raw output has no dates. |
| **AI + our checks** | The output after the app's validation layer: roster and attendee checks, source-text grounding, date resolution in code, group fan-out, and the retry-once loop. |

Report record F1, player accuracy, deadline accuracy, and grounding rate for both. The gap shows what your own code adds beyond calling the API, which is what judges mean by "logic in your own code". Show it as a two-color grouped bar chart, one group per metric.

### Repeat runs and 95% confidence intervals

Aivana picks models per request, so one run can be lucky. Run every note 3 times (`--runs 3`) and report each metric as the mean with a 95% bootstrap confidence interval over notes:

```
for i in 1..1000:
    sample = random.choices(notes, k=len(notes))    # resample notes with replacement
    scores.append(metric(sample))
ci = (percentile(scores, 2.5), percentile(scores, 97.5))
```

This is about 15 lines of standard-library Python. With only 10 notes the interval will be wide, so say that in the demo instead of hiding it. It shows statistical honesty.

### Confidence calibration

The AI labels each record `high`, `medium`, or `low` confidence. Check whether those labels mean anything:

| AI confidence | Records | Actually correct (all key fields right) |
|---|---|---|
| high | __ | __% |
| medium | __ | __% |
| low | __ | __% |

If `high` records are right much more often than `low` ones, the confidence colors on the review screen genuinely help coaches decide where to look. If not, say so and treat confidence as a weak hint.

### Planted traps

Include notes designed to trip the AI, like the look-alike tables in the Genie One test: two players with the same first name, a vague deadline, a coach quoting a player ("he said his ankle is fine"), and a note with no feedback at all. Report trap results separately: "AI avoided 5 of 6 traps."

### A note on outside statistics

Industry articles quote hallucination rates from about 1% to over 50% depending on the task. Those numbers come from different tasks and are often second-hand, so do not quote them as your app's accuracy. Only report numbers your own script produced.

## 5. Live accuracy from coach edits

This works automatically once the review screen logs edits to `record_edits` (README section 9).

```
field accuracy = unchanged fields ÷ all fields in records the AI drafted
```

- Count only fields the AI filled in: `player_id`, `topic`, `skill`, `feedback_type`, `feedback`, `due_date`.
- A record the coach deleted counts every field as wrong (an extra record).
- A record the coach added by hand counts as a missed record, reported separately.
- Show it on the dashboard as "AI field accuracy: X% from N approved records".

This number reflects real use, but it is only as good as the coach's review. A coach who approves without reading would make the AI look perfect, so present it alongside the offline test set, not instead of it.

---

## 6. Files and commands

```
tests/
  labeled_notes/
    note_01.json ... note_10.json   # notes + answer keys (synthetic)
scripts/
  accuracy_test.py                  # run, match, score, report
results/
  accuracy_v1.json                  # saved results per prompt version
  accuracy_v2.json
```

```bash
python scripts/accuracy_test.py                    # one run on all notes
python scripts/accuracy_test.py --runs 3           # adds the consistency check
python scripts/accuracy_test.py --prompt v1        # compare prompt versions
python scripts/accuracy_test.py --only note_04     # debug one note
python scripts/accuracy_test.py --raw              # score AI alone (no backend checks), for the ablation
```

The script needs `AIVANA_API_KEY` because it calls the real API. Keep it out of `pytest` so normal tests stay free and offline. Add a unit test for the matcher and the metric math using a fake AI output.

`GET /api/insights/accuracy` returns the latest saved results file plus the live edit stat, for the Insights page.

---

## 7. Instructions for the coding AI

Add this to the M7 milestone in `AGENTS.md`:

- Reuse the app's real `extract_records()` pipeline. Do not write a separate prompt for testing.
- Implement matching exactly as in section 3.1 and all metrics in section 3.2 with the Python standard library (`difflib`, `json`, `statistics`). No ML libraries.
- Retry and error handling come from `aivana_client.py`. If a note fails after retries, record it as failed and continue; report the failure count.
- Save results as JSON with the prompt version, timestamp, per-note details, and totals.
- Print the summary table in section 3.3.
- Support `--raw` (score Aivana output before validation) and `--runs N` with bootstrap 95% confidence intervals and the confidence calibration table (section 4b).

---

## 8. Known limits of this evaluation

- **Small test set.** Ten notes and about 30 records give a rough estimate, not a precise one. One mistake changes a percentage by about 3 points.
- **Synthetic notes written by our team.** Real coaches may write differently, with more shorthand or typos.
- **One labeler.** The answer keys reflect our own judgment. Some categories (for example, Training & Conditioning vs Football Skills) are genuinely debatable.
- **Feedback text is graded approximately** with string similarity, which can mark a correct paraphrase as wrong.
- **Prompt tuning on the same notes** makes later results look better than they would on new notes.
- **The model can change.** Aivana chooses models per request, so results can vary between runs. The consistency check shows how much.

---

## Sources

- [ExtractBench: A Benchmark and Evaluation Methodology for Complex Structured Extraction](https://arxiv.org/html/2602.12247)
- [LLMStructBench: Benchmarking Large Language Model Structured Data Extraction](https://arxiv.org/html/2602.14743v1)
- [Leveraging large language models for structured information extraction from pathology reports](https://arxiv.org/pdf/2502.12183)
- [Exact match vs LLM as a judge (Sebastian Raschka)](https://sebastianraschka.com/faq/docs/exact-match-vs-llm-as-a-judge.html)
- [Genie One accuracy with governed context (StartupHub AI video)](https://www.youtube.com/watch?v=kZfeLTv7_W8)
- [What Is Jev? Calibrated probabilities (IBM Technology video)](https://www.youtube.com/watch?v=YGgNBcIgI4s)
- [From Generation to Judgment: Opportunities and Challenges of LLM-as-a-judge](https://arxiv.org/pdf/2411.16594)
