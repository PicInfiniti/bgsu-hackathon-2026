# Schedule: search, export and checklist review (November 21, 2026)

## 1. What the code did before this change

**Search** (`frontend/src/schedule-view.js`)
- Ran in the browser. It loaded every calendar item from 190 days ago to 200 days ahead (it had asked for 2 years and failed until this morning), plus a full-text search of **all notes, including private "My notes"**.
- Every word had to appear in the item's title, type, event note or "who" label. "#4" was turned into that player's first name, and a player name was cut to the first name.
- Opponent was found only if it was in the title. Location and practice focus were not searched.
- It showed the 8 results closest to today with no Past/Upcoming split, and a click always jumped to Day view.
- One message for every miss: "No match. Try a player, opponent or film."
- Problems: private note bodies were searched (only titles were shown, but the match itself leaks); notes were mixed with scheduled activities; the example mixed three kinds of things; there was no "not this week but elsewhere" message.

**Export to phone** (`GET /api/events/export.ics`, `backend/notebook.py build_ics`)
- One button, **no date range**: every event ever saved, plus every open homework due date.
- Format: ICS. Weekly practices were exported as RRULE repeats with no end, so they repeated forever on the phone.
- Times were "floating" local times with no time zone, so a phone in another zone would shift them.
- UIDs were stable per event (`event-ID@…`), so a re-import updated in Apple/Outlook. Google's file import can still duplicate.
- Homework always included **the player's full name** ("Homework due: Jordan Ellis – …"). Sensitive homework was left out, but only when it carried the sensitive flag.
- Notes and meetings were not exported. There was no print option and no CSV.

**Calendar content**
- **Every note** with a date was drawn as a yellow "Note" chip. That's too many: notes are not scheduled activities.
- Homework due dates were drawn as chips computed from the homework record on each load (not copies). The toggle only hid them.

## 2. What changed (Core / Level 1)

| Area | Now |
|---|---|
| Search | Server-side over **scheduled activities and assignment deadlines only**, past and upcoming (±200 days): title, type, opponent, location, practice focus, player or position-room names, homework task text, and saved player meetings (title and attendee names, never the note text). Private notes and health/insurance items are never searched. Placeholder: "Search games, practices, players or assignments". Results split into **Upcoming** and **Past**; a click jumps to that date and keeps your view. Two different empty messages: *"Nothing matches in this week. N matches in other weeks."* versus *"No games, practices, meetings or assignments match 'X'."* Identical duplicate records show once |
| Type chips | All · Games (official games and scrimmages) · Practices (practice, walk-through, lift) · Film · Meetings · Assignments. They filter the calendar **and** search, and stay set when switching Day/Week/Month/Year |
| Export / Print | One small menu: **This week / This month / Season (Aug 1 – Jan 31, editable and saved) / Custom dates**. ICS with repeats written out as single events, **UTC times**, multi-day events allowed, and stable UIDs per occurrence (`event-ID-date@…`, `homework-ID-player@…`) so importing again updates instead of duplicating. "Include assignment deadlines" (on, all-day) and "Include player names" (**off**: names and jersey numbers are replaced by "player"). Notes, coach to-dos and health items are never exported. **Print schedule** uses a print stylesheet (the browser's Save as PDF works). The menu explains that the file works with Google, Apple and Outlook |
| To do panel | Collapsible panel beside the calendar (a Calendar / To do switch on narrow screens). It lists **existing homework** plus **coach to-dos**, grouped as Late, Today and Due before the next official game, with "Done this week" collapsed and struck through. Ticking homework marks the **original homework** done everywhere (Homework board, player page, calendar chip). Coach to-dos are stored in the existing events table, with no new task system |
| Data rules | Homework deadline chips are derived from the homework record on every load. Completing it updates every view, and the toggle only hides. **Ordinary notes are no longer drawn on the calendar** (they stay in the Coach's notebook). Saved player meetings still show on their date |
| Football week | A **Next game** strip at the top of the Schedule: vs./at opponent, home or away, kickoff time and "In N days". Only Official games count, not scrimmages. Week view stays the default |
| First use | An empty week shows "Nothing scheduled this week yet." with an **+ Add event** button and a hint to click any hour |

## 3. Your questions, briefly
- **Search notes?** No. The Schedule searches the schedule only; notes are searched in the Coach's notebook. That keeps private notes off this page.
- **Player search?** Yes: "Jordan Ellis" (or "#12") finds his 1-on-1, his assignment deadlines and meetings he attended. It's one search box with chips, not a separate search mode.
- **Past and future?** Both, split into Upcoming and Past.
- **Whole year export?** The football season is the practical default; a custom range covers anything else. CSV comes later.
- **Repeats, changes, duplicates?** Repeats are exported one by one. A change after export needs a new export; importing again updates the same events in Apple and Outlook. In Google, import into the same calendar (its file import can still add copies; a live subscription feed would fix that and is Later).
- **Checklist vs. homework?** One system: the checklist *is* the homework list plus coach to-dos, read from the same records. There is no copying.
- **Should notes show on the calendar?** No. Only scheduled activities, saved meetings and assignment deadlines.

## 4. Priority

| Idea | Value | Easy to understand | Complexity | Bug risk | Level |
|---|---|---|---|---|---|
| Search activities + deadlines, chips, two empty states | High | High | Low | Low | **Core (done)** |
| Export range + names off + print | High | High | Low | Low | **Core (done)** |
| To do panel from existing homework + coach to-dos | High | High | Medium | Low | **Level 1 (done)** |
| Next game strip | High | High | Low | Low | **Level 1 (done)** |
| Notes off the calendar | High | High | Low | Low | **Core (done)** |
| CSV export | Low | Medium | Low | Low | Later |
| Live calendar subscription (no re-import) | Medium | Medium | Medium | Medium | Later |
| Game Week view, season phases (pre/regular/post) | Medium | Medium | Medium | Medium | Later |
| Checklist templates per game / per practice | Medium | Medium | Medium | Medium | Later |
| Owner per checklist item (staff) | Low until there are staff accounts | — | Medium | Medium | Later |

## 5. Decisions for Salma
1. **Season dates**: Aug 1 – Jan 31 is the default (editable in the export menu). Is that right for your level (high school or college)?
2. **Player names in exports**: off by default. Should printed schedules for staff show names by default?
3. **Saved meetings on the calendar**: they still show on their date. Keep them, or show only scheduled 1-on-1s?
4. **Editing a homework deadline after approval**: the app has no screen for it yet. Should it be on the Homework board (the chip on the calendar would move with it)?
5. **Coach to-dos**: should they ever be shared with staff or players? Today they stay in the app and are not exported.
