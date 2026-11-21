# Player profile, players, notebook folders, settings and sign-in: review (November 21, 2026)

## What existed before this change (checked in the code)
- **Add player:** did not exist. The roster was fixed at 25 synthetic players in `data/demo.json` (id, name, number, position, position label, position room, nickname), read directly by both the backend and the frontend.
- **Edit / inactive:** did not exist. Nothing could be renamed, renumbered or retired.
- **Notebooks:** every note had one of three fixed notebooks (`personal` = My notes, `player_meetings`, `team_strategy` = Game plan). Home showed filter cards for All / My notes / Player meetings / Game plan, plus search. There were no custom folders.
- **Settings:** game day, day labels, which bell alerts show, profile name and photo, and season start/end. They were only reachable from small menus; there was no Settings page.
- **Authentication:** **visual prototype only.** The login page checks `demo` / `demo` in the browser (`access.js`, `isDemoLogin`) and opens `/workspace?mode=demo`. Sign-up is a preview. There are no sessions or cookies, no server-side login, no per-coach data (one shared SQLite file), and `/workspace` and `/api` are open to anyone who can reach the port. There was no Sign out.
- **Demo vs Live:** a Mode select labelled "Demo · no AI calls" / "Live · Aivana", kept in the URL (`?mode=demo|live`). Demo never calls Aivana.

## What changed
- **Players.** Add player / Edit player (first and last name, jersey number, position, position room, season, and optional photo, class year, height and weight). The new `players` table stores additions and edits by **player id**, so every meeting, assignment, film note and drawing stays linked. There is **no delete**: "Mark inactive" hides a player from pickers and the roster (a "Show inactive" filter shows them again), and their history is kept. "Copy to next season" keeps the same id and moves the season forward a year, so old notes stay linked. Name and number are validated, and a number already worn by an active player in the same season shows a warning, not a block. Team meetings now need every *active* player.
- **Player page.** Header (photo or initials, name, number, position, room, facts, follow-up status, Ask about, Quick note, Plan 1-on-1), a summary strip of 4 facts, an Overview with only 3 cards, and tabs: Overview, Timeline, Assignments, Film & diagrams, Development. **Recommendation: play diagrams belong in Film & diagrams** as their own section; coaches use them next to clips, and keeping them there keeps Overview short.
- **Games played** is computed, never typed: each Official game has a "Who played?" tick list. The count shows only once at least one game list has been saved. Scrimmages are not counted.
- **Program standards** (Development tab): Prepared & on time, Effort, Communication, Ownership, Attitude, Respect. These are **not scores**. Each shows how many approved notes in the last 30 days the coach tagged with that standard as praise or as a concern, with links to the notes. The tag is a normal open tag, set in review; nothing is saved without approval. Sensitive notes are never counted.
- **Folders.** Built-in views are computed from the note type and can't be edited: All notes, Private, Player meetings, Game plans, Film observations. Custom folders are personal: create, rename, archive or delete. A note has one optional folder, and moving a note changes only its folder (nothing else, not even its "updated" time). Deleting a folder moves its notes to "No folder" and never deletes a note; the confirmation says so. The folder filter combines with search, and search covers all folders by default.
- **Account menu and Settings page.** My profile, Settings, Help & Q&A. Settings has four sections: Profile (name, role, photo); Team & season (team name, season dates, game day); Calendar (default view, show assignment deadlines); Privacy & notifications (player names in exports, off by default; which bell alerts show). Every setting changes behaviour.
- **Help & Q&A** with short answers, Contact support (mailto) and Replay tour buttons. **Guided tours**: Welcome (4 steps), Film room and Playboard, each with Back, Next and Close. They have no dark overlay, and finishing or closing one is remembered in settings.

## Sign out: why it is not shown
There is no real sign-in, so a Sign out button would only pretend to protect data. The account menu shows **"Local demo · one coach on this computer"** instead. Real sign-in would need:
1. Accounts on the server, with passwords stored as salted hashes (argon2 or bcrypt), or a school single sign-on (BGSU SSO through OIDC or SAML).
2. A server-side session in a `HttpOnly; Secure; SameSite=Lax` cookie, protection against cross-site requests, rate-limited login, and expiry.
3. Every `/api` route checking the session. The workspace page would redirect to login when there is no session.
4. Per-coach data: a `coach_id` column on notes, folders, meetings, settings and film, with every query filtered by it, plus a decision on what a staff shares (for example the roster and schedule) and what stays private (notes).
5. HTTPS hosting, and Sign out that deletes the session on the server.

## Decisions left for the team
- Real sign-in (above) is not built.
- Whether the roster and schedule should be shared by the whole staff once accounts exist.
- Whether Aivana should ever suggest a standard tag. It currently may suggest any tag, but "Attitude" is close to the rule "never infer player character or attitude", so only the coach sets standard tags, in review.
