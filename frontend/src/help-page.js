// Help & Q&A: short answers, Replay tour buttons and Contact support.
// The support email is a blank template: it never includes notes, player names or app data.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const SUPPORT_TO = ['salmah@bgsu.edu', 'moghadm@bgsu.edu'];
export const SUPPORT_SUBJECT = 'Falcon Follow-up Support Request';
export const SUPPORT_BODY = [
  'Hi,', '',
  'Page (for example Home, Schedule, Film room, Players):', '',
  'What I did, step by step:', '1.', '2.', '3.', '',
  'What I expected:', '',
  'What happened instead:', '',
  'Browser and computer (optional):', '',
  'Please do not paste notes, player names or other private information here.',
].join('\n');

/** mailto: link with fixed text only. */
export function supportMailto() {
  return `mailto:${SUPPORT_TO.join(',')}?subject=${encodeURIComponent(SUPPORT_SUBJECT)}&body=${encodeURIComponent(SUPPORT_BODY)}`;
}

export const QA = [
  ['How do I create a note?', 'Home → New note (top bar). Type, draw with Pen, add a Photo or use Voice, pick a notebook and, if you like, a folder, then Save note.'],
  ['How does Aivana make a recap?', 'Open a saved note and press ✦ Recap. In Live mode the note is sent to Aivana, which lists key points and possible assignments; code checks names and works out dates. In Demo the recap is built by code and labelled Demo.'],
  ['How do I review AI suggestions?', 'Find homework (or "Send homework to review" on a recap) opens the review. Check each line: the player, the meaning, the date and the quote from your note. Edit or remove anything, then Approve. Nothing is saved before that.'],
  ['How do I assign homework?', 'Write it in a player-meeting note ("Jordan: watch three coverage clips by Friday") and press Find homework, or add a line by hand in the review. From film, use "Make homework" on a film note. Approved homework shows on the player page and the Homework board.'],
  ['How do I add or find a player?', 'Players → Add player (name, number, position and room are required). To find one, search by name or jersey number, or filter by unit and room. Players are never deleted: Edit player → Mark inactive keeps their history, and Copy to next season keeps old notes linked.'],
  ['How do I use the Film room?', 'Add film (upload or a YouTube, Hudl, Vimeo or Drive link), open it, and write notes at a time. Mark clips, grade plays with Quick grade, build cut-ups, and share a read-only Film pack. Replay the Film room tour below.'],
  ['How do I save a Playboard diagram?', 'Press ✎ Playboard in a note (or New play diagram on a player\'s Film & diagrams tab), draw, name it, pick players, then Save. PNG downloads a picture.'],
  ['How do I export my calendar?', 'Schedule → Export / Print. Choose the dates and whether to include assignment deadlines and player names (names are off unless you turn them on in Settings). It downloads an .ics file for Google, Apple or Outlook calendars.'],
  ['What is the difference between Demo and Live?', 'Demo never calls AI and shows prepared answers labelled Demo. Live sends the text you choose to Aivana. Nothing AI-made is saved until you approve it.'],
  ['How do folders work?', 'All notes, Private, Player meetings, Game plans and Film observations are built in and fill themselves. Your own folders are under Folders: open a note and choose a folder. Search covers every folder. Deleting a folder moves its notes to No folder; no note is ever deleted.'],
  ['How do I contact support?', 'Use Email support on this page. It opens your email app with a short blank form. Nothing from your notebook is added.'],
  ['Is my data private?', 'Everything is stored on this computer in one local database. Demo sends nothing to AI. Live sends only the text needed for the button you press (for example Recap on one note). The support email never includes your notes. Calendar exports leave out player names unless you turn them on.'],
  ['Why is there no Sign out?', 'This demo has no real accounts. demo / demo only opens the workspace on this computer, so a Sign out button would not protect anything. Real sign-in needs server accounts, sessions and per-coach data.'],
  ['How is "Games played" counted?', 'Open an Official game on the Schedule and tick "Who played?". The count uses only official games with a saved list. Scrimmages are not counted, and nothing shows until a list is saved.'],
  ['What are program standards?', 'Prepared & on time, Effort, Communication, Ownership, Attitude and Respect. They are not scores: the Development tab counts approved notes you tagged with a standard in the last 30 days, with links to the notes.'],
  ['Can I write notes with voice?', 'Yes, in Chrome or Edge. Tap a name under "Who\'s talking?" when the speaker changes. The app never guesses who is speaking.'],
];

export function renderHelp(root, { replayTour }) {
  root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">HELP</p><h2 id="help-title" tabindex="-1">Help &amp; Q&amp;A</h2><p>Short answers to common questions.</p></div></div>
  <div class="help-layout">
    <section class="panel help-qa">${QA.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
    <aside class="help-side">
      <section class="panel settings-card"><h3>Guided tours</h3><p class="muted">Replay a tour at any time.</p>
        <button type="button" class="secondary compact" data-replay-tour="welcome">Replay welcome tour</button>
        <button type="button" class="secondary compact" data-replay-tour="film">Replay Film room tour</button>
        <button type="button" class="secondary compact" data-replay-tour="playboard">Replay Playboard tour</button></section>
      <section class="panel settings-card"><h3>Contact support</h3><p class="muted">Opens your email app with a short form: the page, the steps, and what you expected compared with what happened. Nothing from your notebook is added. Please don't paste notes or player names.</p>
        <a class="primary compact support-link" href="${supportMailto()}">Email support</a><p class="muted small">To: ${SUPPORT_TO.map(esc).join(', ')}</p></section>
    </aside>
  </div>`;
  root.onclick = (e) => { const b = e.target.closest('[data-replay-tour]'); if (b) replayTour(b.dataset.replayTour); };
}
