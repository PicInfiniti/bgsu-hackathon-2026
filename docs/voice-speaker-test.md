# Speakers in voice notes: what exists, what was built, and how to test it

## What the app can and cannot do (checked in the code)
- **Voice** uses the browser's Web Speech API (`frontend/src/voice.js`). It returns **one combined text** with no speaker information, no voice IDs and no per-speaker confidence.
- **Aivana never receives audio.** Only the typed or recognized text is sent, for "clean up" and Find homework. The Aivana API accepts text, chat, structured output, streaming and image/PDF/Word/CSV attachments, **not audio**.
- So the app has **no speaker diarization** (detecting when the speaker changes) and **no speaker identification** (recognizing who it is). The app never shows "N speakers detected".

## What was built: "Who's talking?" (labels set by the coach)
- In the note editor's **Voice** mode there is a row of buttons: **Coach**, the players you add with "+ Player…", and **Other**. Tap a name whenever the speaker changes; everything recognized after that goes under that name, with a mm:ss time from the start of the recording.
- After you stop, a **speaker-labelled transcript** appears: time · speaker · text, each line marked **"tagged by coach"**. You can change the speaker on any line, mark a line **Unknown** (never linked to a player), **Split** a line where two people talked, or discard it.
- **Use this transcript** puts lines like `[00:07] Taylor Hayes: I missed the safety rotation.` into the note. The lines are saved with the note as segments (`speaker_label`, `player_id` or null, `start_ms`, `text`, `source = coach_tag`), and labels from any other source are refused.
- **Find homework / Recap** treat a line spoken by a player as **his own words**, not coach feedback. Aivana is told this, and code flags any record quoting a player's line ("This line was spoken by …, not the coach"), which blocks approval until the coach fixes it. Homework and feedback still go through the per-player review (each player, Shared, Unassigned) and are saved only after approval.
- If you never tap a name, voice works exactly as before. Background noise, overlapping speech and low confidence are not measured by the browser, so mark doubtful lines **Unknown** and fix them in the transcript.

## Reproducible test: 1 coach, 2 players
Script (read it aloud with three people, or by one person tapping the names):

| # | Speaker (tap) | Line |
|---|---|---|
| 1 | Coach | Taylor, what happened on third down? |
| 2 | Taylor Hayes | I missed the safety rotation. |
| 3 | Coach | Morgan, what happened with your route? |
| 4 | Morgan Reed | I ran it too deep. |
| 5 | Coach | Taylor must watch the safety on three clips by Friday. Morgan must run the dig at 12 yards by Friday. |

Steps:
1. Home → New note → Player meetings → **Voice**. "+ Player…" → add Taylor Hayes and Morgan Reed.
2. Press the mic. Before each line, tap that line's speaker. Stop after line 5.
3. Check the transcript, then **Use this transcript** and **Save note**.
4. **Find homework** (Live), check the review and **Approve**.
5. Open each player's page.

Pass criteria:
- Every transcript line shows the right name and a time, marked "tagged by coach". The header says "speakers tagged by you", never "detected".
- Changing line 4 to Unknown removes the player link; changing it back restores it.
- After saving and reloading the note, the lines and names are unchanged.
- Review shows Taylor's homework (watch the safety, 3 clips) **only** under Taylor and Morgan's (dig at 12 yards) **only** under Morgan, both due Friday. Lines 2 and 4 (players' own words) are not turned into coach feedback.
- After approval, each assignment appears only on its own player's page.

Result on November 21, 2026: passed in the browser using a stand-in speech recognizer that returns text only, exactly like the real one, because the test browser has no microphone. In a real Aivana extraction of the same transcript, Taylor's and Morgan's homework came back separately, both due Fri Nov 27, and neither player's own line was used as coach feedback. Automated tests: `tests/test_speaker_tags.py`, `frontend/test/speaker-tags.test.js`.

## Later: real diarization
- Simplest reliable path: run **Whisper** (speech to text) with **pyannote** (speaker diarization) **on this computer**, so no audio leaves it. It returns "Speaker 1 / Speaker 2" turns with times. The coach then maps each speaker to a player once, using this same transcript screen. Speaker identification by voice (knowing it's Taylor without being told) would need voice samples and consent; leave it out.
- Test it with the same script, recorded with three real voices, and the same pass criteria. Score **word-level attribution**: the share of words assigned to the right speaker compared with the script. Accept only at **90% or more**. Report overlaps and low-confidence turns as "Unknown" rather than guessing.
- Don't show "N speakers detected" until that test passes on our own recordings.
