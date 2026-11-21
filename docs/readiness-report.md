# Readiness check before judging (November 21, 2026, 12:45–13:00 ET)

**No code was changed in this check.** Everything ran on a **copy** of the database (`coach.sqlite3` and `data/film` copied to a temporary folder) with its own backend on port 8002 and its own Vite server on port 5175. The real notebook on ports 8001/5174 was not touched, and the copy was deleted afterwards.

Severity levels: **Blocks the demo** · **Visible glitch** (the audience could notice) · **Minor**.

## Summary
| Area | Result |
|---|---|
| Full workflow, Demo | Passed (Recap → review → correct → approve → save → player pages → Homework → restart). Demo "Find homework" works only on the sample notes (known) |
| Full workflow, Live (real Aivana) | Passed. Attribution was correct for both players, and the corrected deadline was saved. "Both receivers…" is not offered as a Shared item in a group meeting (see F2) |
| Aivana calls | 3 Live calls, no auth or balance errors: Recap **8.3 s**, Find homework **12.7 s**, Ask Aivana **8.8 s** |
| Persistence | Passed: notes, recaps, meetings, homework and corrected dates survived a page refresh and two backend restarts |
| Duplicates | A double-click on Save saves once. **Sending the same note to review twice saves a second, identical meeting** (F1) |
| Demo vs Live labels | Clear everywhere checked |
| Playboard | Passed: drawing-only save, reopen and edit (same diagram, 3 → 4 objects) |
| Console errors on every page | None (only the expected 422 when Demo "Find homework" refuses a non-sample note) |
| Test suites | Backend **119/119**, frontend **72/72**, build OK, accuracy check **39/39** |
| API key | Not found in the frontend bundle, the source, the docs, the tests, the server logs or any git-tracked file. `backend/.env` and `aivana.api` are git-ignored |
| Git | **Most of today's work is not committed** (F6) |

## Workflow details
Test note (Player meetings): *"Jordan needs to improve route depth, run 20 curls by Friday. Morgan should work on catching under pressure, watch 5 clips by Thursday. Both receivers review red-zone fades."* Today is Sat Nov 21, so Friday is Nov 27 and Thursday is Nov 26.

**Demo**
1. Note saved. Recap (instant) was labelled "Demo recap · made by code, not AI". It listed Jordan's homework due 2026-11-27 and Morgan's due 2026-11-26. The "Both receivers" line appears as a key point only, not as homework.
2. "Send homework to review": 2 cards, one under Jordan and one under Morgan.
3. Corrected Morgan's deadline to 2026-11-25, ticked the review box, then double-clicked "Approve & save". **One** meeting was saved, with the corrected date.
4. Jordan's Overview, Assignments and Timeline show only Jordan's homework, and the same holds for Morgan. The Homework board shows each item once, under the right player. (Each card's "Source meeting note" shows the whole original note, which mentions both players. That is expected.)
5. After restarting the backend, everything was still there.
6. Ask Aivana (Demo, code answers, labelled "Demo · code answers"):
   - "What should I do next with Jordan?" was answered in 0.3 s, but from older records. It did not mention the new route-depth homework (F4).
   - "What about his homework?" correctly took "his" to mean Jordan and cited the saved note: "Open: Jordan needs to improve route depth… (due 2026-11-27)".

**Live (real Aivana)**
1. Recap, 8.3 s, labelled "By Aivana · check it before you use it":
   - Jordan: "improve route depth, run 20 curls", due 11-27.
   - Morgan: "work on catching under pressure, watch 5 clips", due 11-26.
   - "review red-zone fades" was listed once under each player.
2. Find homework, 12.7 s, labelled "Aivana drafts · check every field". Attendees (Jordan, Morgan) were picked automatically.
   - Jordan: action "run 20 curls" (11-27) and improvement "improve route depth".
   - Morgan: action "watch 5 clips" (11-26) and improvement "catching under pressure".
   - No item was mixed up between the two players.
   - "Both receivers review red-zone fades" came back as 2 **unassigned** cards ("Unmatched player · Shared instruction"), which block approval until a player is chosen (F2).
3. I assigned the red-zone card to Jordan, removed its duplicate improvement card, changed Morgan's deadline to 11-25, approved, and double-clicked Save. **One** meeting was saved, with origin `aivana` and the corrected date.
4. Player pages were correct and separate: Jordan has 3 new items, Morgan 2, and neither page shows the other player's homework. Current focus showed "route depth" for Jordan and "catching under pressure" for Morgan.
5. After a backend restart, all 5 Live items and the corrected date were still there.
6. Ask Aivana (Live):
   - "What should I do next with Jordan?" took 8.8 s, was labelled "By Aivana · checked against sources", and cited S1–S7: route depth with 20 curls due 11-27, the red-zone fades review, and the communication praise.
   - "What about his homework?" was answered by code in about 0.02 s ("Made by code from your records"): 3 open homework items with sources. The label says honestly that it came from code.

## Findings (exact steps)
| # | Severity | Finding | Steps |
|---|---|---|---|
| F1 | **Visible glitch** | The same homework can be saved twice. There is no warning that a note was already approved | Save a note → Recap → Send homework to review → approve and save → go back to the note → Recap again → Send homework to review → approve and save. Two identical meetings are saved, and the player page and Homework board show each item twice. (A double-click on Save is safe.) |
| F2 | **Visible glitch** | A group instruction ("Both receivers…") cannot be given to both players in one step. It arrives as unassigned cards that block approval, and the player menu has no "both / shared" choice in a group meeting | Live → note above → Find homework → the "Unassigned feedback · choose the player" section has 2 cards for the red-zone line. Workaround: assign it to one player and use "Add another" for the second |
| F3 | Minor | Demo "Find homework" refuses any note that is not an unchanged sample ("Demo extraction requires unchanged sample notes…", HTTP 422) | Demo → open your own note → Find homework → Find homework (sample). Use Recap → "Send homework to review" in Demo instead, or switch to Live |
| F4 | Minor | Demo "What should I do next with Jordan?" uses older records and does not mention the homework just saved | Demo → save the note above → Ask Aivana "What should I do next with Jordan?" |
| F5 | Minor | The review keeps the old warning "Some records require correction…" at the top after every card has been fixed | Live → Find homework → assign the unassigned card → the header warning is still shown, although Approve works |
| F6 | **Blocks submission** (not the demo) | Today's work is **not committed**. Untracked new files include `backend/roster.py`, `backend/schedule_tools.py`, all the new frontend modules (`player-page.js`, `player-form.js`, `roster-store.js`, `notebook-views.js`, `settings-page.js`, `help-page.js`, `game-played.js`, `profile.scss`…) and the docs. A fresh checkout would not run. 23 tracked files are also modified | `git status --short` |
| F7 | Minor (data) | The real notebook has repeated seed homework for Jordan ("Review the defensive coverage clips." ×3), so his page shows it several times | Players → Jordan Ellis → Assignments |
| F8 | Minor | Jordan Ellis is listed as a cornerback (#12 CB) while the demo note calls him a receiver | Synthetic roster data; pick a WR such as Taylor Hayes for the demo, or edit the player |

## Not covered
- Real microphone input (the test browser has none). Live handwriting and photo reading were not repeated today.
- Ask Aivana Live answers depend on Aivana; timings above are from one run each.

## Suggested before judging (not done; no code changes in this step)
1. Commit the work locally (F6). Pushing and sharing only with your OK.
2. In the demo, use one recap → review → save per note to avoid F1, and give "both receivers" lines to each player by hand (F2).
3. Demo in Live mode for extraction. Expect about 8–13 s per Aivana call.

## Readiness against the judging criteria (honest view)
| Criterion | Ready? | Evidence | Risk |
|---|---|---|---|
| Core functionality (30) | **Ready** | Note → Recap → per-player review → correct → approve → save → player pages and Homework → persists after restart, in Demo and Live | F1 duplicates if the same note is approved twice; F2 "both players" lines need manual assignment |
| Use of Aivana (20) | **Ready** | Structured extraction, Recap, Ask Aivana with checked sources, streamed prep brief; 8–13 s per call, no errors today | Network or balance on the day; Demo works as a fallback and is clearly labelled |
| Depth (15) | **Strong** | Film room, Playboard, Schedule with .ics export, player development tab, folders, settings, tours | Breadth can eat demo time; show depth briefly |
| Reliability and data handling (15) | **Mostly ready** | 119 + 72 tests, accuracy check 39/39, nothing saved without approval, sensitive items kept out, key never reaches the browser | F6 uncommitted work; F1 duplicates; no real sign-in (stated honestly in the app) |
| Usability (10) | **Good** | Clear labels, tours, Help, works at 1024 px | F5 stale warning; Demo Find homework only on samples (F3) |
| Demo and documentation (10) | **Needs a final pass** | README, app guide, accuracy report, this report | README not yet updated for today's features; rehearse the 3-minute script below |

## Three-minute demo
1. **(0:00) Home, Live mode.** Write the two-player note (use Taylor Hayes and Morgan Reed, both receivers). Save, press **✦ Recap**: "By Aivana", each player's homework with dates computed in code.
2. **(0:45) Find homework → review.** Show the per-player sections, fix one deadline, assign the "both" line, tick the review box, approve. Say: nothing AI-made is saved without the coach.
3. **(1:30) Player page.** Header, 4 facts, Overview cards; Assignments shows only this player's homework; open the other player to show it is not there. Homework board.
4. **(2:10) Ask Aivana:** "What should I do next with Taylor?" then "What about his homework?" Point at the source chips.
5. **(2:40) Quick depth:** Film room note at a time → Make homework, or a Playboard diagram. Close on reliability: tests, accuracy 39/39, the key stays on the server.

## Postpone until after judging
- Real sign-in and per-coach data.
- Speaker diarization, live video conversion (ffmpeg), Google/Outlook calendar sync.
- New player-page additions (last 1-on-1 date, "ask how it's going").
- Bigger review changes beyond the F1/F2 fixes.

## The three design ideas
- **Custom notebooks:** already built today as **folders** (create, rename, archive, delete; notes move to No folder, never deleted). No further work before the deadline.
- **Recap-to-calendar confirmation:** already works as a confirmation. The Recap lists "Schedule items found in this note"; **Add to schedule** opens the filled-in event form, and nothing is added until the coach presses Add event. No change needed.
- **Rename Watch List to Needs attention:** worth it, very low risk. One heading in `frontend/src/main.js` (Home right column) and the welcome text if any. Do it with the critical fixes if you approve.

## Fixes made after the check (second local commit)
| # | Fix | How it was checked |
|---|---|---|
| F1 | A note's homework is saved once. Sending the same note to review again (Find homework or Recap) shows "Already sent to review on DATE" with **Open it**; the server also refuses a second meeting from the same note (409) or with identical content | `tests/test_readiness_fixes.py`, `frontend/test/readiness-fixes.test.js`; browser: second send showed the message, still 1 meeting |
| F2 | Unassigned group cards have **Give to everyone in this meeting**: one item per attendee, each still checked before approval | Tests; browser: 1 card became 2 (Morgan, Taylor) |
| F5 | The "requires correction / unmatched" notes disappear once every card is valid; other notes stay | Tests |
| F7 | Cause found: on Windows the backend read `data/demo.json` without UTF-8, so the seed title became "Defensive backs Â· coverage film review" and approving the Demo sample did not match it. Fixed the reads, repair the stored seed text at start-up, and refuse identical meetings. `scripts/remove_duplicate_meetings.py` removed the 2 exact copies from the real notebook (dry run first, backup `backend/coach.sqlite3-backup-20261121-131029`, the "done" tick kept) | Tests; real notebook now has 4 meetings, no duplicates |
| Rename | "Watch list" is now **Needs attention** on Home and in the bell text; one section only | Test checks the heading appears once and "Watch list" is gone |

Live recheck (on a copy of the database): Find homework 7.2 s with correct attribution (Taylor: 20 curls due 11-27, route depth; Morgan: 5 clips, catching; red-zone fades for both), corrected date saved, one meeting saved after a double-click, second send blocked, each player page shows only their own homework, Ask Aivana 8.5 s with sources. Backend 122 tests, frontend 76, accuracy 39/39.
