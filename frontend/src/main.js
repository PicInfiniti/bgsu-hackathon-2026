import './styles.scss';
import './workspace.scss';
import './coach.scss';
import './film.scss';
import './profile.scss';
import demo from '../../data/demo.json';
import { workspaceMode } from './access.js';
import { loadSharedNotebook } from './shared-notebook.js';
import { formatBrief } from './brief-format.js';
import { summarizePlayers, filterPlayers } from './player-directory.js';
import categories from '../../data/categories.json';
import { appliesTo, reviewIssues, reviewPriority, highlightSource } from './review-state.js';
import { meetingTypeForAttendees } from './meeting-input.js';
import { activityForDate } from './calendar-activity.js';
import { upcomingActions } from './upcoming.js';
import { filterActions } from './action-board.js';
import { assistantAnswerMarkup } from './assistant-view.js';
import { groupRecords, meetingTypeLabel } from './shared-groups.js';
import { actionRows } from './action-board-view.js';
import { createNoteEditor, NOTEBOOK_LABELS, NOTEBOOK_HINTS } from './notes-editor.js';
import { createSchedule, createMiniCalendar, audienceLabel } from './schedule-view.js';
import { createAskPanel } from './ask-panel.js';
import { createBell } from './bell.js';
import { clockLabel, dayLabel, shortDate } from './calendar-math.js';
import { statusChip, matchPlayersInText } from './player-status.js';
import { createFilmRoom } from './film-room.js';
import { openWhiteboard } from './whiteboard.js';
import { renderPlayerFilm } from './player-film.js';
import { createQuickNote } from './quick-note.js';
import { createProfileMenu } from './profile-menu.js';
import { roster, isActive, applyRoster } from './roster-store.js';
import { SMART_VIEWS, notebookRows, viewCounts, DELETE_FOLDER_TEXT } from './notebook-views.js';
import { openPlayerForm } from './player-form.js';
import { STANDARD_TAGS, TABS, headerMarkup, playerFacts, factsMarkup, overviewParts, standardsMarkup, goalsMarkup, playerRecords } from './player-page.js';
import { renderSettings } from './settings-page.js';
import { renderHelp } from './help-page.js';
import { startTour, shouldStart, tourActive } from './tour.js';

const $ = (s) => document.querySelector(s);
// demo.players holds the ACTIVE roster (every picker uses it); allPlayers also has inactive players, for names and history.
let allPlayers = roster.all.length ? roster.all : [...demo.players];
applyRoster(demo.players, allPlayers);
let showInactive = false, playerTab = 'overview', playerDev = null, playerGame = null;
const escape = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (x) => structuredClone(x);
let meetings = [];
let mode = workspaceMode(window.location.search), view = 'desk', draft = [], origin = 'demo', selectedPlayer = 'p01', busy = false, connected = false, prepSource = null;
let current = clone(demo.samples[0]);
let playerDetailOpen = false, playerUnitFilter = 'all';
let extractionId = null, extractionWarnings = [], highlightedDraft = 0;
let statusTimer = null;
let assistantResult = null, assistantPending = false, assistantRevision = 0, assistantActionCategory = '';
const player = (id) => allPlayers.find(p => p.id === id);
const name = (id) => player(id)?.name ?? 'Unknown player';
const positionLabel = (p) => p.position_label ? `${p.position} · ${p.position_label}` : p.position;
const today = () => new Date().toLocaleDateString('en-CA');
const overdue = (x) => x.kind === 'action' && !x.completed && x.due_date && x.due_date < today();
const items = () => meetings.flatMap(m => m.items.map(i => ({...i, meeting:m})));


const icon = (name) => {
  const paths = {
    chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z"/><path d="M7 10h10M7 14h6"/>',
    football: '<path d="M3 21C1 11 11 1 21 3c2 10-8 20-18 18Z"/><path d="m8 16 8-8M9 11l4 4M12 8l4 4"/>',
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    note: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h4M3 7h4M3 12h4M3 17h4"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    user: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M5 19a7 7 0 0 1 14 0"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.note}</svg>`;
};
document.querySelector('#app').classList.add('workspace-app');
document.querySelector('#app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="/workspace"><span class="brand-mark">F<span>·</span></span><span>Falcon<small>Follow-up</small></span></a>
    <div class="workspace-label">COACH'S NOTEBOOK</div>
    <nav aria-label="Main navigation">
      <button data-view="desk" class="active">${icon('home')} Home</button>
      <button data-view="schedule">${icon('calendar')} Schedule</button>
      <button data-view="meetings">${icon('note')} Coach's notebook</button>
      <button data-view="film"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M7 5v4M12 5v4M17 5v4M7 15v4M12 15v4M17 15v4"/></svg> Film room</button>
      <button data-view="players">${icon('people')} Players</button>
      <button data-view="tasks">${icon('check')} Homework <b id="nav-count" title="Late homework"></b></button>
    </nav>
    <div class="sidebar-note">From the film room<br>to the next practice.<span>Make the follow-up count.</span></div>
    <div class="sidebar-bottom"><span class="team-avatar">pi</span><div id="sidebar-team">picInfiniti<small>Football Meeting Tracker</small></div></div>
  </aside>
  <div class="shell">
    <header class="topbar"><div><h1 id="page-title">Home</h1><p id="page-date"></p></div><div class="header-actions"><label class="mode-control">Mode <select id="mode"><option value="demo">Demo · no AI calls</option><option value="live">Live · Aivana</option></select></label><button class="secondary new-note-button" id="new-note" type="button">${icon('plus')} New note</button><button class="ask-button" id="open-ask" data-open-ask type="button" aria-label="Ask Aivana">✦ Ask Aivana</button><button class="bell-button" id="bell" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Notifications"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg><span class="bell-count" hidden></span></button><button type="button" class="profile-link profile-button" id="profile-button" aria-haspopup="menu" aria-label="Profile">${icon('user')}</button></div></header>
    <div id="status-toast" class="status-toast" role="status" aria-live="polite" hidden><span id="status-toast-text"></span><button class="icon-button" id="close-status-toast" aria-label="Dismiss notification">×</button></div>
    <main>
      <div id="message" role="status" aria-live="polite" hidden></div>
      <section id="desk" class="view">
        <div class="home-grid">
          <div class="home-col home-left">
            <section class="panel notebooks-card"><div class="section-heading"><h2>Coach's notebook</h2></div><label class="notes-search"><span class="sr-only">Search all notes</span><input id="notes-search" type="search" placeholder="Search all notes" autocomplete="off"></label><div id="notebook-list" class="notebook-list"></div><div id="folder-list" class="folder-list"></div></section>
            <section class="panel recent-card"><div class="section-heading"><h2 id="recent-heading">Recent notes</h2><span id="recent-count" class="muted"></span></div><div id="recent" class="recent-list"></div></section>
          </div>
          <div class="home-col home-center" id="note-editor-root"></div>
          <div class="home-col home-right">
            <section class="panel mini-cal-card"><div id="mini-calendar"></div><button class="rail-link" type="button" data-open-schedule>Open schedule →</button></section>
            <section class="panel next-up-card"><div class="section-heading"><h2>Next up</h2>${icon('calendar')}</div><div id="next-up"></div></section>
            <section class="panel watch-card"><div class="section-heading"><h2>Watch list</h2>${icon('check')}</div><div id="watch-list"></div><button class="rail-link" type="button" data-view="tasks">All homework →</button></section>
          </div>
        </div>
      </section>
      <section id="schedule" class="view" hidden><div id="schedule-root"></div></section>
      <section id="film" class="view" hidden><div id="film-root"></div></section>
      <section id="meetings" class="view" hidden><div class="section-heading meeting-page-heading"><div><p class="eyebrow">PLAYER MEETINGS</p><h2>Find homework</h2><p>Write the meeting on the left. Check every piece of homework on the right before it is saved.</p></div><button class="secondary" type="button" id="new-meeting">${icon('plus')} New player meeting</button></div><div class="meeting-workspace"><div class="meeting-notebook"><div class="meeting-sheet-heading">${icon('note')} The conversation</div><div class="notebook-caption">${icon('people')} Your original note stays attached to every piece of homework.</div>
            <form id="meeting-form" class="panel note-panel">
              <label class="title-label"><span>Meeting title</span><input id="title" maxlength="160" placeholder="Give this conversation a title" required></label>
              <div class="form-row meeting-meta"><label>Date<input id="date" type="date" required></label><label>Meeting type<select id="meeting-type"><option value="individual">Individual</option><option value="group">Group</option><option value="team">Full team</option></select></label></div>
              <label class="sample-control">Start with a sample<select id="sample">${demo.samples.map(s => `<option value="${s.id}">${escape(s.label)}</option>`).join('')}</select></label>
              <details class="attendee-picker"><summary id="attendee-summary">Meeting attendees</summary><fieldset><legend class="sr-only">Attendees</legend><div id="attendees" class="attendees"></div></fieldset></details>
              <label class="note-label">The conversation<textarea id="note" rows="8" maxlength="12000" placeholder="What did you discuss? Add player names, football skills, film assignments, and deadlines…" required></textarea></label>
              <details class="writing-help"><summary>Tips for a useful meeting note</summary><p>Synthetic notes only. Write what the coach said; avoid assumptions about character or attitude. Split long team notes into short sections with a few assignments each. Keep the date, attendees, and attribution context; review and save each section separately. Shorten truncated extractions before retrying.</p></details>
              <div class="editor-footer"><span>${icon('note')} Original notes stay attached.</span><button class="primary" id="extract" type="submit">Find homework (sample)</button></div>
            </form>
        </div>
            <section id="review-panel" class="panel review-panel"><div class="panel-heading">${icon('check')}<div><h3>A second look, before you save.</h3><p>Check the player, the meaning, and the next step.</p></div></div><div id="review"></div></section>
        </div></section>
      <section id="players" class="view" hidden>
        <div id="player-directory">
          <div class="section-heading directory-heading"><div><p class="eyebrow">THE FOOTBALL ROSTER</p><h2 id="players-title" tabindex="-1">Players</h2><p id="players-count">${demo.players.length} players · Synthetic football roster</p></div><div class="directory-actions"><label class="check-line"><input type="checkbox" id="show-inactive"> Show inactive</label><button class="primary" type="button" id="add-player">${icon('plus')} Add player</button></div></div>
          <div class="player-filters"><label class="player-search">${icon('people')}<span class="sr-only">Search players or jersey numbers</span><input id="player-search" type="search" placeholder="Search players or jersey numbers" autocomplete="off"></label><label><span class="sr-only">Position group</span><select id="player-group"><option value="all">All position groups</option>${[...new Set(demo.players.map(p => p.position_group))].sort().map(g => `<option value="${escape(g)}">${escape(g)}</option>`).join('')}</select></label><label><span class="sr-only">Position</span><select id="player-position"><option value="all">All positions</option>${[...new Map(demo.players.map(p => [p.position, p.position_label || p.position]))].sort((a,b) => a[1].localeCompare(b[1])).map(([code,label]) => `<option value="${escape(code)}">${escape(code)} · ${escape(label)}</option>`).join('')}</select></label></div>
          <div class="directory-layout"><div class="roster-table-area"><div class="unit-tabs" aria-label="Filter roster by team unit" id="player-unit-tabs"></div><div class="roster-table-wrap"><table class="roster-table"><caption class="sr-only">Football players, meetings attended, and open homework. Select a player for a snapshot or open their timeline.</caption><thead><tr><th scope="col">Player</th><th scope="col">#</th><th scope="col">Position</th><th scope="col">Unit</th><th scope="col">Meetings</th><th scope="col">Homework</th><th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody id="roster"></tbody></table></div><p id="player-results" class="directory-results" role="status"></p></div>
            <aside class="player-summary-rail"><section class="player-snapshot panel"><h3>Player snapshot</h3><div id="player-snapshot"></div></section><section class="unit-summary panel"><h3>Team units</h3><dl id="player-unit-summary"></dl></section></aside>
          </div>
        </div>
        <div id="player-detail" hidden><button class="secondary back-to-roster" id="back-to-roster">Back to players</button><div class="player-detail-panel">
          <div id="player-heading" class="panel"></div>
          <div id="player-facts" class="pp-facts"></div>
          <div class="pp-tabs" role="tablist" aria-label="Player sections">${TABS.map(([k, l]) => `<button type="button" role="tab" data-pp-tab="${k}" aria-selected="${k === 'overview'}">${l}</button>`).join('')}</div>
          <div class="pp-panel" data-pp-panel="overview"><div class="pp-overview">
            <section class="panel pp-card"><h3>Next meeting prep</h3><div id="pp-prep"></div><div class="prep-box"><button id="prep" class="secondary compact" type="button">Build preparation brief</button><div id="prep-text" class="prep-content" aria-live="polite"></div></div></section>
            <section class="panel pp-card"><h3>Strengths &amp; work-ons</h3><div id="pp-strengths"></div></section>
            <section class="panel pp-card"><h3>Recent activity</h3><div id="pp-recent"></div><button class="text-button" type="button" data-pp-tab="timeline">Full timeline →</button></section>
          </div></div>
          <div class="pp-panel" data-pp-panel="timeline" hidden><label class="sensitive-toggle"><input id="show-sensitive" type="checkbox"> Show sensitive notes</label><div id="timeline"></div></div>
          <div class="pp-panel" data-pp-panel="assignments" hidden><div id="pp-assignments"></div></div>
          <div class="pp-panel" data-pp-panel="film" hidden><div id="player-film"></div></div>
          <div class="pp-panel" data-pp-panel="development" hidden><div class="pp-dev"><div id="pp-dev-top"></div><div id="player-skills"></div></div></div>
        </div></div>
      </section>
      <section id="tasks" class="view" hidden>
        <div class="section-heading action-heading"><div><p class="eyebrow">PLAYER ASSIGNMENTS · WHAT YOU TOLD A PLAYER TO DO</p><h2>Homework board</h2><p class="action-caption">Find homework. Open its title to see where it came from.</p></div><label>Status<select id="task-filter"><option value="open">Open homework</option><option value="overdue">Late</option><option value="done">Done</option><option value="all">All homework</option></select></label></div>
        <button class="secondary assistant-action-entry" id="ask-actions" type="button">${icon('chat')} Ask Aivana about this homework</button><div class="panel action-board"><div class="action-filters">
          <label>Search<input id="task-search" type="search" placeholder="Homework, player, jersey, or tag"></label>
          <label>Player<select id="task-player"><option value="">All players</option>${demo.players.map(p => `<option value="${escape(p.id)}">#${p.number} ${escape(p.name)}</option>`).join('')}</select></label>
          <label>Category<select id="task-category"><option value="">All categories</option></select></label>
          <label>Sort by<select id="task-sort"><option value="due">Deadline · earliest first</option><option value="player">Player name</option><option value="recent">Newest meeting</option></select></label>
        </div><div class="action-results-bar"><p id="task-results" role="status"></p><button id="reset-task-filters" class="rail-link" type="button">Reset filters</button></div>
        <div class="action-table-wrap"><table class="action-table"><thead><tr><th scope="col">Homework / source</th><th scope="col">Player</th><th scope="col">Category</th><th scope="col">Deadline</th><th scope="col">Status</th><th scope="col">Update</th></tr></thead><tbody id="task-list"></tbody></table></div></div>
        <label class="sensitive-toggle"><input id="show-sensitive-actions" type="checkbox"> Show sensitive homework</label><p id="task-hidden-note" class="sensitive-notice" hidden></p>
      </section>
      <section id="settings" class="view" hidden><div id="settings-root"></div></section>
      <section id="help" class="view" hidden><div id="help-root"></div></section>
      <section id="assistant" class="view" hidden>
        <div class="section-heading assistant-heading"><div><p class="eyebrow">BEFORE THE NEXT 1-ON-1</p><h2 id="assistant-title" tabindex="-1">Ask Aivana about a player</h2><p>Ask about a player. Bring their documented feedback into your next meeting.</p></div><span class="assistant-scope">${icon('chat')} Your approved notebook</span></div>
        <div class="assistant-layout">
          <aside class="panel assistant-context"><h3>Player context</h3><label>Player<select id="assistant-player"><option value="">Choose a player…</option>${demo.players.map(p => `<option value="${p.id}">#${p.number} ${escape(p.name)}</option>`).join('')}</select></label>
            <label>Skill<input id="assistant-skill" list="skill-ideas" maxlength="100" placeholder="Any skill"></label>
            <label>Topic<input id="assistant-topic" list="topic-ideas" maxlength="100" placeholder="Any topic"></label>
            <div class="form-row"><label>From<input id="assistant-start" type="date"></label><label>Through<input id="assistant-end" type="date"></label></div>
            <label>Homework status<select id="assistant-status"><option value="all">All statuses</option><option value="open">Open homework</option><option value="overdue">Late homework</option><option value="done">Done homework</option></select></label>
            <label class="assistant-check"><input id="assistant-actions" type="checkbox"> Homework only</label>
            <label>Search notes<input id="assistant-search" type="search" maxlength="300" placeholder="Optional words from a note"></label>
            <p id="assistant-inherited-category" class="assistant-privacy" hidden></p><button id="assistant-reset" class="rail-link" type="button">Reset filters</button><p class="assistant-privacy">One player at a time. Uses checked, non-sensitive notes only. Group and team feedback is included when it applies to this player.</p>
          </aside>
          <div class="panel assistant-chat"><div class="assistant-chat-top"><span>${icon('chat')} A little context. A better conversation.</span><button id="assistant-clear" class="rail-link" type="button">Clear answer</button></div>
            <div id="assistant-answer" class="assistant-answer" aria-live="polite" aria-busy="false"><div class="assistant-welcome"><span class="assistant-emblem">${icon('chat')}</span><h3>What would you like to revisit?</h3><p>Choose a player, then ask about past feedback, homework, or your next 1-on-1. Answers link back to saved notes.</p></div></div>
            <div class="assistant-prompts"><button type="button" data-assistant-prompt="Prepare my next meeting.">Prepare my next meeting</button><button type="button" data-assistant-prompt="Summarize past feedback.">Recap past feedback</button><button type="button" data-assistant-prompt="Which actions need follow-up?" data-assistant-actions>Review open homework</button></div>
            <form id="assistant-form"><label for="assistant-question">Your question</label><div class="assistant-composer"><textarea id="assistant-question" rows="2" maxlength="800" required placeholder="What did I tell this player about footwork?"></textarea><button id="assistant-send" class="primary" type="submit">Ask Aivana</button></div><p id="assistant-mode-note">Demo shows matching saved notes. Switch to Live for an Aivana answer.</p><p id="assistant-error" class="assistant-error" role="alert" hidden></p></form>
          </div>
        </div>
      </section>
      <datalist id="skill-ideas">${categories.skills.filter(s => !['Other','Not Specified','Not Applicable'].includes(s)).map(s => `<option value="${escape(s)}">`).join('')}</datalist><datalist id="topic-ideas">${categories.topics.filter(s => s !== 'Other').map(s => `<option value="${escape(s)}">`).join('')}</datalist>
      <footer><span>FALCON FOLLOW-UP <b> / </b> picInfiniti</span><span>Every conversation deserves a next step. · Synthetic data only</span></footer>
    </main>
  </div>`;

function notify(text, error = false) {
  clearTimeout(statusTimer); $('#status-toast').hidden = true;
  $('#message').hidden = !text || !error;
  if (!text) return;
  if (!error) { showModeAlert(text); return; }
  $('#message').textContent = text; $('#message').className = 'error';
}
function showModeAlert(text) {
  clearTimeout(statusTimer); $('#message').hidden = true;
  $('#status-toast-text').textContent = text;
  $('#status-toast').hidden = false;
  statusTimer = setTimeout(() => { $('#status-toast').hidden = true; }, 3000);
}
$('#close-status-toast').addEventListener('click', () => { clearTimeout(statusTimer); $('#status-toast').hidden = true; });

async function api(path, body, method = 'POST') {
  let res;
  try { res = await fetch(`/api${path}`, {method, headers:{'Content-Type':'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}); }
  catch { throw Error('Shared notebook unavailable. Start FastAPI on port 8001; both Demo and Live use SQLite.'); }
  if (res.status === 204) return null;
  let data; try { data = await res.json(); } catch { throw Error('Backend unavailable or returned an invalid response. Start FastAPI on port 8001.'); }
  if (!res.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Request could not be completed. Check the meeting fields.');
  return data;
}
function capture() {
  current = {title:$('#title').value.trim(), date:$('#date').value, meeting_type:$('#meeting-type').value, attendees:[...document.querySelectorAll('[name="attendee"]:checked')].map(x => x.value), note:$('#note').value.trim()};
  updateAttendeeSummary();
  return clone(current);
}
function validMeeting(m) {
  if (!m.title || !m.note || !m.date || !m.attendees.length) throw Error('Add a title, date, note, and at least one attendee.');
  if (m.meeting_type === 'individual' && m.attendees.length !== 1) throw Error('An individual meeting needs exactly one attendee.');
  if (m.meeting_type === 'group' && m.attendees.length < 2) throw Error('A group meeting needs at least two attendees.');
  if (m.meeting_type === 'team' && m.attendees.length !== demo.players.length) throw Error('Select the full fictional roster for a team meeting.');
}
function updateAttendeeSummary() {
  const selected = [...document.querySelectorAll('[name="attendee"]:checked')].map(el => name(el.value));
  $('#attendee-summary').textContent = `Attendees · ${selected.length ? selected.length <= 2 ? selected.join(', ') : `${selected.length} players selected` : 'Choose players'}`;
}
function loadSample(id) {
  current = clone(demo.samples.find(x => x.id === id)); draft = []; extractionId = null; extractionWarnings = [];
  $('#title').value = current.title; $('#date').value = current.date; $('#meeting-type').value = current.meeting_type; $('#note').value = current.note;
  $('#attendees').innerHTML = demo.players.map(p => `<label class="attendee"><input name="attendee" type="checkbox" value="${p.id}" ${current.attendees.includes(p.id) ? 'checked' : ''}><span>${escape(p.name.split(' ')[0])}</span></label>`).join('');
  updateAttendeeSummary();
  renderReview();
}
function invalidate() { draft = []; extractionId = null; extractionWarnings = []; renderReview(); }
function optionList(values, selected) { return values.map(v => `<option value="${escape(v)}" ${v === selected ? 'selected' : ''}>${escape(v)}</option>`).join(''); }
function renderReview() {
  const review = $('#review');
  const warnings = extractionWarnings.length ? `<div class="extraction-warnings" role="status"><strong>Notes from Find homework</strong><ul>${extractionWarnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></div>` : '';
  if (!draft.length) {
    review.innerHTML = `${warnings}<div class="empty-review"><h3>A little clarity goes a long way.</h3><p>Press Find homework, then check each item.<br>You can also add homework by hand.</p></div><button class="secondary full" data-add-record type="button">Add homework by hand</button>`;
    return;
  }
  const blocked = draft.some(i => reviewIssues(i, current).length);
  highlightedDraft = Math.min(highlightedDraft, draft.length-1);
  const expanded = new Set([...review.querySelectorAll('[data-review-group][open]')].map(el => el.dataset.reviewGroup));
  const cards = draft.map((i,n) => {
    const issues = reviewIssues(i,current);
    const shared = i.scope === 'team' && i.player_ids?.length && i.kind !== 'action';
    return `<article class="draft-item confidence-${i.confidence || 'medium'}"><p class="record-origin">${escape(meetingTypeLabel(current.meeting_type))} · ${escape(current.title)}</p><div class="draft-flags"><span class="confidence-badge ${i.confidence || 'medium'}">${escape(i.confidence || 'medium')} confidence</span>${!i.player_id && !shared ? '<span class="badge overdue">Unmatched player</span>' : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive topic</span>' : ''}${i.group_record_id ? '<span class="badge">Shared instruction</span>' : ''}</div><div class="form-row"><label>Player<select data-index="${n}" data-field="player_id"><option value="" ${!i.player_id && !shared ? 'selected' : ''}>Choose attendee…</option>${current.meeting_type === 'team' && i.kind !== 'action' ? `<option value="__team__" ${shared ? 'selected' : ''}>Whole team feedback</option>` : ''}${current.attendees.map(id => `<option value="${id}" ${id === i.player_id ? 'selected' : ''}>${escape(name(id))}</option>`).join('')}</select></label><label>Type<select data-index="${n}" data-field="kind">${optionList(['action','praise','improvement','observation'], i.kind)}</select></label></div><label>Topic <small>(any words)</small><input data-index="${n}" data-field="topic" list="topic-ideas" maxlength="100" value="${escape(i.topic || '')}"></label><label>Coach's note<textarea rows="2" data-index="${n}" data-field="text" maxlength="1000">${escape(i.text)}</textarea></label><div class="form-row"><label>Skill <small>(any words)</small><input data-index="${n}" data-field="skill" list="skill-ideas" maxlength="100" value="${escape(i.skill || '')}"></label><label>Due date <small>(homework only)</small><input type="date" data-index="${n}" data-field="due_date" value="${escape(i.due_date || '')}" ${i.kind !== 'action' ? 'disabled' : ''}></label></div>${i.deadline_text ? `<p class="deadline-evidence">Original deadline: “${escape(i.deadline_text)}” · ${i.due_date ? `Resolved: ${escape(i.due_date)}` : 'No definite date — coach review needed'}</p>` : ''}<label>Tags <small>(any words, comma between, up to 3)</small><input data-index="${n}" data-field="tags" maxlength="130" value="${escape((i.tags || []).join(', '))}" placeholder="route running, red zone"></label>${i.kind === 'praise' || i.kind === 'improvement' ? `<div class="std-chips"><span>Program standard <small>(optional, your call)</small></span>${STANDARD_TAGS.map(([tag, label]) => `<button type="button" class="chip-button ${(i.tags || []).includes(tag) ? 'on' : ''}" data-std-tag="${tag}" data-index="${n}" aria-pressed="${(i.tags || []).includes(tag)}">${label}</button>`).join('')}</div>` : ''}${i.details ? `<p class="deadline-evidence">Key details: ${escape(i.details)}</p>` : ''}<label>Verbatim source quote<textarea rows="2" data-index="${n}" data-field="quote" maxlength="2000">${escape(i.quote)}</textarea></label><button class="text-button" data-highlight="${n}" type="button">Highlight in original note</button>${i.mention ? `<p class="match-evidence">Mention: ${escape(i.mention)} · ${escape(i.match_method || 'unmatched')}</p>` : ''}${i.warnings?.length ? `<details class="draft-extraction-notes"><summary>Notes from Find homework</summary><ul>${i.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></details>` : ''}<div class="record-issues" data-issues="${n}">${issues.map(issue => `<p>${escape(issue)}</p>`).join('')}</div><button class="text-button remove" data-remove="${n}" type="button">Remove</button></article>`;
  });
  const groups = groupRecords(draft);
  const sectioned = groups.map(group => {
    if (!group.shared) return {bucket: reviewBucket(draft[group.indexes[0]]), html: group.indexes.map(n => cards[n]).join('')};
    const i = group.item, key = `${i.display_group.id}-${i.player_id}`;
    const issues = group.members.some(item => reviewIssues(item,current).length);
    const warnings = group.members.filter(item => item.confidence === 'low' || item.warnings?.length).length;
    return `<article class="shared-review-card"><div class="shared-card-heading"><div><span class="record-origin">${escape(meetingTypeLabel(current.meeting_type))}</span><h3>Shared ${escape(i.kind)} · ${escape(group.label)}</h3></div><span class="badge">${group.members.length} players</span></div><div class="draft-flags">${warnings ? `<span class="badge overdue">${warnings} player item${warnings === 1 ? '' : 's'} need a second look</span>` : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive topic</span>' : ''}</div><p class="shared-player-names">${group.members.map(item => escape(name(item.player_id))).join(' · ')}</p><p class="shared-record-text">${escape(i.text)}</p><p class="shared-record-meta">${escape(i.skill)}${i.topic ? ` · ${escape(i.topic)}` : ''}${i.due_date ? ` · Due ${escape(i.due_date)}` : ''}</p><blockquote>${escape(i.quote)}</blockquote><button class="text-button" type="button" data-highlight="${group.indexes[0]}">Highlight in original note</button><p class="shared-review-hint">One shared statement, ${group.members.length} player items. Expand to review confidence, warnings, or change an individual player's version.</p><details data-review-group="${escape(key)}" ${issues || warnings || expanded.has(key) ? 'open' : ''}><summary>Review / edit each player${issues ? ' · Corrections required' : ''}</summary>${group.indexes.map(n => cards[n]).join('')}<button class="secondary compact" type="button" data-regroup-review>Update shared cards</button></details></article>`;
  }).map(x => typeof x === 'string' ? {bucket: 'shared', html: x} : x);
  const reviewCards = reviewSections(sectioned, current.attendees);
  review.innerHTML = `${warnings}<div class="review-summary"><strong>${groups.length} card${groups.length === 1 ? '' : 's'} · ${draft.length} player items to check</strong><span>${origin === 'demo' ? 'Prepared samples · not AI' : origin === 'manual' ? 'Added by hand or from a Recap' : 'Aivana drafts · check every field'}</span></div><div class="review-source-preview"><strong>Original note · highlighted evidence</strong><div id="highlighted-source">${highlightSource(current.note, draft[highlightedDraft]?.quote)}</div></div><div class="draft-list">${reviewCards}</div><button class="secondary full" data-add-record type="button">Add another</button><div class="review-footer"><label class="approval"><input id="approved" type="checkbox" ${blocked ? 'disabled' : ''}>I reviewed the player, meaning, source, deadline, and warnings for every item.</label><button id="save" class="primary full" disabled>Approve & save meeting</button></div>`;
}
/** Review sections: one per player, then shared group feedback, then unassigned feedback. */
function reviewBucket(item) { return item.player_ids?.length && !item.player_id ? 'shared' : item.player_id || 'unassigned'; }
function reviewSections(parts, attendees) {
  const order = [...attendees, 'shared', 'unassigned'];
  const label = (b) => b === 'shared' ? 'Shared group feedback' : b === 'unassigned' ? 'Unassigned feedback · choose the player' : `${name(b)}${player(b) ? ` · #${player(b).number} ${player(b).position}` : ''}`;
  return order.filter(b => parts.some(p => p.bucket === b)).map(b => `<section class="review-section review-${b === 'shared' || b === 'unassigned' ? b : 'player'}"><h3 class="review-section-title">${escape(label(b))} <small>${parts.filter(p => p.bucket === b).length} card${parts.filter(p => p.bucket === b).length === 1 ? '' : 's'}</small></h3>${parts.filter(p => p.bucket === b).map(p => p.html).join('')}</section>`).join('')
    + parts.filter(p => !order.includes(p.bucket)).map(p => p.html).join('');
}
function updateReviewReadiness() {
  draft.forEach((item,n) => { const el = $(`[data-issues="${n}"]`); if (el) el.innerHTML = reviewIssues(item,current).map(issue => `<p>${escape(issue)}</p>`).join(''); });
  if ($('#approved')) { $('#approved').checked = false; $('#approved').disabled = draft.some(i => reviewIssues(i,current).length); $('#save').disabled = true; }
}
function statusBadge(i) { return i.completed ? '<span class="badge completed">Complete</span>' : overdue(i) ? '<span class="badge overdue">Late</span>' : `<span class="badge ${i.kind}">${i.kind === 'action' ? 'Homework' : i.kind}</span>`; }
function recordMarkup(i, m, showSensitive = false) {
  const sourceNote = m.items.some(item => item.sensitive) && !showSensitive ? 'Full note contains sensitive content. Enable sensitive records to view it; the supporting excerpt is shown above.' : m.note;
  return `<article class="record" id="record-${escape(m.id)}-${escape(i.id)}" tabindex="-1"><div class="record-top">${statusBadge(i)}<span>${escape(i.skill)}</span>${i.topic ? `<span class="record-topic">${escape(i.topic)}</span>` : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive</span>' : ''}${m.id.startsWith('m-seed-') ? '<span class="badge">Earlier practice pack</span>' : ''}</div><h4>${escape(i.text)}</h4><p class="record-origin">${escape(meetingTypeLabel(m.meeting_type))} · ${escape(m.title)}</p><p class="record-meta">${i.player_ids?.length ? 'Whole team' : escape(name(i.player_id))} · ${escape(m.date)}${i.due_date ? ` · Due ${escape(i.due_date)}` : ''}</p><details><summary>Source meeting note</summary><blockquote>${escape(i.quote)}</blockquote><p>${escape(sourceNote)}</p></details>${i.kind === 'action' ? `<button class="secondary compact" data-meeting="${escape(m.id)}" data-item="${escape(i.id)}">${i.completed?'Reopen':'Mark done'}</button>` : ''}</article>`;
}
const initials = (p) => p.name.split(' ').map(part => part[0]).slice(0,2).join('');
function renderPlayerDirectory() {
  const summaries = summarizePlayers(showInactive ? allPlayers : demo.players, meetings, today());
  const inactiveCount = allPlayers.filter(p => !isActive(p)).length;
  $('#players-count').textContent = `${demo.players.length} active players${inactiveCount ? ` · ${inactiveCount} inactive` : ''} · Synthetic football roster`;
  const visible = filterPlayers(summaries, {search: $('#player-search').value, unit: playerUnitFilter, group: $('#player-group').value, position: $('#player-position').value});
  if (!playerDetailOpen && visible.length && !visible.some(p => p.id === selectedPlayer)) selectedPlayer = visible[0].id;
  const count = (unit) => unit === 'all' ? summaries.length : summaries.filter(p => p.unit === unit).length;
  $('#player-unit-tabs').innerHTML = ['all','Offense','Defense','Special Teams'].map(unit => `<button type="button" data-player-unit="${unit}" aria-pressed="${unit === playerUnitFilter}">${unit === 'all' ? 'All' : unit}<span>${count(unit)}</span></button>`).join('');
  $('#roster').innerHTML = visible.map(p => `<tr data-select-player="${p.id}" class="${p.id === selectedPlayer ? 'selected' : ''}"><th scope="row"><button class="table-player" data-select-player="${p.id}" aria-pressed="${p.id === selectedPlayer}"><span class="initial-avatar">${p.photo ? `<img src="${p.photo}" alt="">` : escape(initials(p))}</span><span>${escape(p.name)}${isActive(p) ? '' : ' <small class="inactive-tag">Inactive</small>'}</span></button></th><td>${p.number}</td><td><abbr title="${escape(p.position_label || p.position)}">${escape(p.position)}</abbr></td><td><span class="unit-badge ${p.unit === 'Offense' ? 'offense' : p.unit === 'Defense' ? 'defense' : 'special'}">${escape(p.unit)}</span></td><td>${p.meetingCount} <span class="cell-detail">meeting${p.meetingCount === 1 ? '' : 's'}</span></td><td><span class="action-count ${p.openCount ? 'has-actions' : ''}">${p.openCount} open</span> ${statusChip(playerStatuses[p.id])}</td><td><button class="row-details" data-player="${p.id}" aria-label="View ${escape(p.name)}'s timeline">View</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No matching players. Try another name, jersey number, or filter.</td></tr>';
  $('#player-results').textContent = `Showing ${visible.length} of ${summaries.length} players. Select a row for a snapshot; View opens the full timeline.`;
  const selected = visible.length ? summaries.find(p => p.id === selectedPlayer) : null;
  $('#player-snapshot').innerHTML = selected ? `<div class="snapshot-profile"><span class="initial-avatar large">${escape(initials(selected))}</span><div><h4>${escape(selected.name)}</h4><p>#${selected.number} · ${escape(selected.position_label || selected.position)}</p></div></div><dl class="snapshot-stats"><div><dt>Meetings attended</dt><dd>${selected.meetingCount}</dd></div><div><dt>Open homework</dt><dd>${selected.openCount}</dd></div><div><dt>Late</dt><dd class="${selected.overdueCount ? 'overdue-number' : ''}">${selected.overdueCount}</dd></div></dl><div class="snapshot-followup"><h4>Latest checked note</h4>${selected.latest ? `<p><time>${escape(selected.latest.meeting.date)}</time> · ${escape(selected.latest.text)}</p>` : '<p>No checked note to preview yet. Open the timeline to see more.</p>'}</div><button class="snapshot-link" data-player="${selected.id}">View timeline</button>` : '<p class="empty">No player matches these filters.</p>';
  $('#player-unit-summary').innerHTML = ['Offense','Defense','Special Teams'].map(unit => `<div><dt>${unit}</dt><dd>${count(unit)}</dd></div>`).join('') + `<div class="total"><dt>Total</dt><dd>${summaries.length}</dd></div>`;
  $('#player-directory').hidden = playerDetailOpen;
  $('#player-detail').hidden = !playerDetailOpen;
}
function setPlayerTab(tab) {
  playerTab = tab;
  document.querySelectorAll('[data-pp-tab][role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ppTab === tab)));
  document.querySelectorAll('[data-pp-panel]').forEach(el => el.hidden = el.dataset.ppPanel !== tab);
}
async function loadPlayerExtras(id) {
  const filmCtx = {api, notify, players: allPlayers, openFilm: (fid, t) => { switchView('film'); filmRoom.openFilm(fid, t); }};
  renderPlayerFilm($('#player-film'), filmCtx, id, 'film');
  renderPlayerFilm($('#player-skills'), filmCtx, id, 'skills');
  playerDev = null; playerGame = null;
  try {
    const [dev, game] = await Promise.all([api(`/players/${id}/development`, undefined, 'GET'), api(`/next-game?player_id=${id}`, undefined, 'GET')]);
    if (id === selectedPlayer) { playerDev = dev; playerGame = game; renderPlayerPage(); }
  } catch { /* the page still shows the saved records */ }
}
function renderPlayerPage() {
  const p = player(selectedPlayer);
  if (!p) return;
  const records = playerRecords(meetings, p.id, false);
  const facts = playerFacts({records, today: today(), game: playerGame});
  $('#player-heading').innerHTML = headerMarkup(p, {status: statusChip(playerStatuses[p.id]), gamesPlayed: playerDev?.games_played});
  $('#player-facts').innerHTML = factsMarkup(facts);
  const parts = overviewParts({records, facts, game: playerGame});
  $('#pp-prep').innerHTML = parts.prep; $('#pp-strengths').innerHTML = parts.strengths; $('#pp-recent').innerHTML = parts.recent;
  const assignments = playerRecords(meetings, p.id, $('#show-sensitive').checked).filter(i => i.kind === 'action');
  $('#pp-assignments').innerHTML = assignments.map(i => recordMarkup(i, i.meeting, $('#show-sensitive').checked)).join('') || '<div class="empty">No assignments yet. Find homework in a meeting note to add one.</div>';
  const gp = playerDev?.games_played;
  $('#pp-dev-top').innerHTML = (gp ? `<section class="panel pp-card"><h3>Games played</h3><p class="pp-big">${gp.played} of ${gp.of}</p><p class="muted">Official games with a saved "Who played?" list. Scrimmages are not counted.</p></section>` : '') + standardsMarkup(playerDev?.standards) + goalsMarkup(records);
  setPlayerTab(playerTab);
}
function openPlayerTimeline(id) {
  if (id !== selectedPlayer) playerTab = 'overview';
  if (id !== selectedPlayer) $('#show-sensitive').checked = false;
  selectedPlayer = id; playerDetailOpen = true; cancelPrep(); render(); switchView('players');
  loadPlayerExtras(id);
  $('#player-heading').tabIndex = -1; $('#player-heading').focus({preventScroll:true});
  $('#player-heading').scrollIntoView({block:'start', behavior:'instant'});
}
$('#back-to-roster').addEventListener('click', () => {
  playerDetailOpen = false; cancelPrep(); render(); $('#players-title').focus({preventScroll:true});
  $('#players-title').scrollIntoView({block:'start', behavior:'instant'});
});
$('#player-search').addEventListener('input', renderPlayerDirectory);
$('#show-inactive').addEventListener('change', e => { showInactive = e.target.checked; renderPlayerDirectory(); });
function rosterChanged(saved) {
  allPlayers = allPlayers.some(p => p.id === saved.id) ? allPlayers.map(p => p.id === saved.id ? saved : p) : [...allPlayers, saved];
  applyRoster(demo.players, allPlayers);
  const pickers = (sel, first) => { const el = $(sel); const v = el.value; el.innerHTML = first + demo.players.map(p => `<option value="${escape(p.id)}">#${p.number} ${escape(p.name)}</option>`).join(''); el.value = v; };
  pickers('#task-player', '<option value="">All players</option>'); pickers('#assistant-player', '<option value="">Choose a player…</option>');
  loadSample('individual'); render();
}
const playerFormCtx = {api, notify, getAll: () => allPlayers, onSaved: (saved) => rosterChanged(saved)};
$('#add-player').addEventListener('click', () => openPlayerForm(playerFormCtx));
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-pp-tab]'); if (tab) setPlayerTab(tab.dataset.ppTab);
  const edit = e.target.closest('[data-edit-player]'); if (edit) openPlayerForm(playerFormCtx, player(edit.dataset.editPlayer));
  if (e.target.closest('[data-pp-quick-note]')) document.querySelector('.quick-note-fab')?.click();
  const rec = e.target.closest('[data-pp-record]'); if (rec) { e.preventDefault(); setPlayerTab('timeline'); document.getElementById(rec.dataset.ppRecord)?.scrollIntoView({block: 'center'}); }
});
$('#player-group').addEventListener('change', renderPlayerDirectory);
$('#player-position').addEventListener('change', renderPlayerDirectory);
$('#player-unit-tabs').addEventListener('click', e => {
  const tab = e.target.closest('[data-player-unit]');
  if (tab) { playerUnitFilter = tab.dataset.playerUnit; renderPlayerDirectory(); if (e.detail === 0) $(`[data-player-unit="${playerUnitFilter}"]`).focus({preventScroll:true}); }
});

function render() {
  $('#assistant-mode-note').textContent = mode === 'demo' ? 'Demo shows matching saved notes. Switch to Live for an Aivana answer.' : 'Live · Aivana answers from matching notes. Questions are not saved.';
  $('#assistant-send').disabled = assistantPending || !connected;
  const all = items(), actions = all.filter(i => i.kind === 'action'), open = actions.filter(i => !i.completed);
  const lateCount = open.filter(overdue).length;
  $('#nav-count').textContent = lateCount; $('#nav-count').hidden = !lateCount;
  $('#extract').textContent = mode === 'demo' ? 'Find homework (sample)' : 'Find homework with Aivana';
  $('#extract').disabled = busy || !connected;
  renderPlayerDirectory();
  renderHome();
  if (playerDetailOpen) renderPlayerPage();
  const playerRecords = all.filter(i => appliesTo(i, selectedPlayer));
  const hiddenCount = playerRecords.filter(i => i.sensitive && !$('#show-sensitive').checked).length;
  const history = playerRecords.filter(i => !i.sensitive || $('#show-sensitive').checked).sort((a,b) => b.meeting.date.localeCompare(a.meeting.date));
  $('#timeline').innerHTML = (hiddenCount ? `<p class="sensitive-notice">${hiddenCount} sensitive note${hiddenCount === 1 ? '' : 's'} hidden.</p>` : '') + (history.map(i => recordMarkup(i,i.meeting,$('#show-sensitive').checked)).join('') || (hiddenCount ? '<div class="empty">Turn on sensitive notes above to see the hidden entries.</div>' : '<div class="empty">No checked notes yet. Save a meeting for this player to start their timeline.</div>'));
  renderActionBoard(actions);

}
function renderActionBoard(actions = items().filter(i => i.kind === 'action')) {
  const categorySelect = $('#task-category'), selectedCategory = categorySelect.value;
  const available = actions.filter(i => !i.sensitive || $('#show-sensitive-actions').checked);
  const categoryNames = [...new Set(available.flatMap(i => [i.skill, i.topic]).filter(Boolean))].sort();
  categorySelect.innerHTML = '<option value="">All categories</option>' + categoryNames.map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
  categorySelect.value = categoryNames.includes(selectedCategory) ? selectedCategory : '';
  const options = {status: $('#task-filter').value, search: $('#task-search').value, player: $('#task-player').value, category: categorySelect.value, sort: $('#task-sort').value, showSensitive: $('#show-sensitive-actions').checked, today: today()};
  const filtered = filterActions(actions, demo.players, options);
  const hiddenActions = filterActions(actions, demo.players, {...options, showSensitive:true}).filter(i => i.sensitive && !options.showSensitive).length;
  $('#task-hidden-note').hidden = !hiddenActions;
  $('#task-hidden-note').textContent = `${hiddenActions} sensitive homework item${hiddenActions === 1 ? '' : 's'} hidden in this view.`;
  const expanded = new Set([...$('#task-list').querySelectorAll('[data-action-key]')].filter(row => row.querySelector('details')?.open).map(row => row.dataset.actionKey));
  const {rows, count} = actionRows(filtered, available, demo.players, {today:today(), busy, showSensitive:options.showSensitive});
  $('#task-results').textContent = `${count} homework item${count === 1 ? '' : 's'} shown · ${filtered.length} matching · ${available.filter(i => !i.completed).length} open · ${available.filter(overdue).length} late`;
  $('#task-list').innerHTML = rows;
  $('#task-list').querySelectorAll('[data-action-key]').forEach(row => { if (expanded.has(row.dataset.actionKey)) row.querySelector('details').open = true; });
}
const PAGE_TITLES = {desk:'Home', schedule:'Schedule', meetings:"Coach's notebook", film:'Film room', players:'Players', tasks:'Homework', assistant:'Ask Aivana about a player', settings:'Settings', help:'Help & Q&A'};
function switchView(next) {
  view = next;
  $('#page-title').textContent = PAGE_TITLES[next] || 'Home';
  $('#message').hidden = true; // a validation message belongs to the page it came from
  document.title = `${PAGE_TITLES[next] || 'Home'} | Falcon Follow-up`;
  askPanel?.refreshChips();
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== view);
  document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
}
function cancelPrep() { prepSource?.close(); prepSource = null; $('#prep').disabled = false; $('#prep-text').textContent = ''; }

function newMeeting() {
  if (busy) return;
  current = {title:'', date:today(), meeting_type:'individual', attendees:[], note:''};
  draft = []; extractionId = null; extractionWarnings = []; $('#title').value = ''; $('#date').value = current.date; $('#meeting-type').value = 'individual'; $('#note').value = '';
  $('#sample').selectedIndex = -1;
  document.querySelectorAll('[name="attendee"]').forEach(el => el.checked = false);
  updateAttendeeSummary(); $('.attendee-picker').open = true;
  renderReview(); switchView('meetings'); $('#title').focus();
  notify('New player meeting ready. Choose who was there and write the note. Use Live to find homework in your own notes.');
}
$('#sample').addEventListener('change', e => { loadSample(e.target.value); notify('Sample loaded. Press Find homework to check it.'); });
$('#meeting-form').addEventListener('input', e => {
  if (busy) return;
  if (e.target.matches('[name="attendee"]')) {
    const count = document.querySelectorAll('[name="attendee"]:checked').length;
    $('#meeting-type').value = meetingTypeForAttendees($('#meeting-type').value, count, demo.players.length);
  }
  capture(); invalidate();
});
$('#meeting-type').addEventListener('change', () => {
  if ($('#meeting-type').value === 'team') document.querySelectorAll('[name="attendee"]').forEach(x => x.checked = true);
  capture(); invalidate();
});
$('#meeting-form').addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return;
  try {
    const named = matchPlayersInText($('#note').value, demo.players).filter(id => !document.querySelector(`[name="attendee"][value="${id}"]`)?.checked);
    if (named.length) {
      named.forEach(id => { const box = document.querySelector(`[name="attendee"][value="${id}"]`); if (box) box.checked = true; });
      const count = document.querySelectorAll('[name="attendee"]:checked').length;
      $('#meeting-type').value = meetingTypeForAttendees($('#meeting-type').value, count, demo.players.length);
      notify(`Added ${named.map(name).join(', ')} to this meeting because the note names ${named.length === 1 ? 'him' : 'them'}. Untick anyone who wasn't there.`);
    }
    const meeting = capture(); validMeeting(meeting); busy = true; $('#extract').disabled = true; $('#extract').textContent = 'Extracting…'; notify('');
    $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = true); $('#sample').disabled = true; $('#mode').disabled = true;
    const result = await api('/extract', {...meeting,mode});
    draft = result.items.sort((a,b) => reviewPriority(a)-reviewPriority(b)); origin = result.origin;
    extractionId = result.extraction_id; extractionWarnings = result.warnings || []; highlightedDraft = 0;
    renderReview(); notify(draft.length ? 'Check every item before saving.' : 'No homework found. Change the note and try again.');
  } catch (error) { notify(error.message, true); }
  finally { busy = false; $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = false); $('#sample').disabled = false; $('#mode').disabled = false; $('#extract').disabled = false; render(); }
});
$('#review').addEventListener('click', e => {
  // The coach tags a line with a program standard; it is saved only when the review is approved.
  const chip = e.target.closest('[data-std-tag]'); if (!chip) return;
  const i = draft[Number(chip.dataset.index)], tag = chip.dataset.stdTag, tags = i.tags || [];
  i.tags = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag].slice(-3);
  renderReview();
});
$('#review').addEventListener('input', e => {
  if (e.target.id === 'approved') { $('#save').disabled = !e.target.checked; return; }
  if (e.target.dataset.field) {
    const field = e.target.dataset.field, i = draft[Number(e.target.dataset.index)];
    if (field === 'player_id' && e.target.value === '__team__') { i.player_id = null; i.scope = 'team'; i.player_ids = [...current.attendees]; }
    else if (field === 'tags') { i.tags = [...new Set(e.target.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 3); }
    else { i[field] = e.target.value || null; if (field === 'player_id') { i.scope = 'player'; delete i.player_ids; } }
    if (field === 'topic' || field === 'tags') i.sensitive = ['Health & Injury Follow-up','Insurance & Administration'].includes(i.topic) || /\b(injur\w*|health|medical|concussion|insurance)\b/i.test(`${i.topic || ''} ${(i.tags || []).join(' ')}`);
    if (field === 'kind' && i.kind !== 'action') i.due_date = null;
    if (field === 'kind' && i.kind === 'action' && i.player_ids) { i.player_id = null; delete i.player_ids; i.scope = 'player'; }
    if (['kind','player_id'].includes(field)) renderReview();
    if (field === 'quote') $('#highlighted-source').innerHTML = highlightSource(current.note,i.quote);
    const sharedCard = e.target.closest('.shared-review-card');
    if (sharedCard) sharedCard.querySelector('.shared-review-hint').textContent = 'Individual edits below are the values that will be saved. Use Update shared cards to separate changed versions.';
    updateReviewReadiness();
  }
});
$('#review').addEventListener('click', async e => {
  if (e.target.closest('[data-regroup-review]')) { renderReview(); return; }
  const add = e.target.closest('[data-add-record]');
  if (add && !busy) {
    try { capture(); validMeeting(current); } catch (error) { notify(error.message,true); return; }
    if (!draft.length && !extractionId) origin = 'manual';
    draft.unshift({id:crypto.randomUUID(), schema_version:2, player_id:null, scope:'player', kind:'action', text:'', topic:null, skill:null, tags:[], quote:'', due_date:null, deadline_text:null, confidence:'low', mention:'', match_method:'unmatched', sensitive:false, warnings:[]});
    highlightedDraft = 0; renderReview(); return;
  }
  const highlight = e.target.closest('[data-highlight]');
  if (highlight) { highlightedDraft = Number(highlight.dataset.highlight); $('#highlighted-source').innerHTML = highlightSource(current.note,draft[highlightedDraft].quote); return; }
  const remove = e.target.closest('[data-remove]');
  if (remove) { draft.splice(Number(remove.dataset.remove),1); renderReview(); return; }
  if (e.target.id !== 'save' || !$('#approved')?.checked || busy) return;
  try {
    validMeeting(current);
    if (draft.some(i => reviewIssues(i,current).length)) throw Error('Fix the highlighted items before approval.');
    const body = {...clone(current), approved:true, origin, extraction_id:extractionId, items:clone(draft)};
    busy = true; e.target.disabled = true;
    const meeting = await api('/meetings',body);
    meetings.unshift(meeting); clearAssistant();
    draft = []; extractionId = null; extractionWarnings = []; renderReview(); cancelPrep(); render(); notify('Meeting approved and saved. Homework is now on player pages and the Homework board.');
    if (pendingNoteLink) { api(`/notes/${pendingNoteLink}`, {meeting_id: meeting.id}, 'PATCH').then(() => refreshHomeData()).catch(() => {}); pendingNoteLink = null; }
    refreshHomeData();
  } catch (error) { notify(error.message,true); if ($('#save')) $('#save').disabled = false; }
  finally { busy = false; $('#extract').disabled = !connected; renderActionBoard(); }
});
document.addEventListener('click', async e => {
  const summary = e.target.closest('[data-stat]');
  if (summary && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    const destination = summary.dataset.stat;
    let target;
    if (destination === 'meetings') {
      switchView('desk'); target = $('#recent-heading');
    } else if (destination === 'players') {
      playerDetailOpen = false; render(); switchView('players'); target = $('#players-title');
    } else {
      $('#task-search').value = ''; $('#task-player').value = ''; $('#task-category').value = ''; $('#task-filter').value = destination; render(); switchView('tasks'); target = $('#tasks h2');
    }
    target.tabIndex = -1;
    target.focus({preventScroll: true});
    target.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
  }
  const tab = e.target.closest('[data-view]'); if (tab) { if (tab.dataset.view === 'players') { playerDetailOpen = false; cancelPrep(); render(); } switchView(tab.dataset.view); }
  const targetPlayer = e.target.closest('[data-player],[data-open-player]');
  if (targetPlayer) openPlayerTimeline(targetPlayer.dataset.player || targetPlayer.dataset.openPlayer);
  const selectedRow = e.target.closest('[data-select-player]');
  if (selectedRow && !targetPlayer) { selectedPlayer = selectedRow.dataset.selectPlayer; cancelPrep(); render(); if (e.detail === 0) $(`.table-player[data-select-player="${selectedPlayer}"]`)?.focus({preventScroll:true}); }
  const expandAction = e.target.closest('[data-expand-action]');
  if (expandAction) { const details = expandAction.closest('tr').querySelector('details'); details.open = !details.open; if (details.open) details.querySelector('.shared-action-members')?.scrollIntoView({block:'nearest',behavior:'smooth'}); }
  const action = e.target.closest('[data-item][data-meeting]');
  if (action && !busy) {
    try {
      action.disabled = true; busy = true;
      const meeting = meetings.find(m => m.id === action.dataset.meeting), item = meeting.items.find(i => i.id === action.dataset.item);
      const updated = await api(`/meetings/${encodeURIComponent(meeting.id)}/items/${encodeURIComponent(item.id)}`,{completed:!item.completed},'PATCH');
      meetings = meetings.map(m => m.id === updated.id ? updated : m); clearAssistant();
      cancelPrep(); render(); notify('Homework updated.');
    } catch (error) { action.disabled = false; notify(error.message,true); }
    finally { busy = false; $('#extract').disabled = !connected; renderActionBoard(); }
  }
});
$('#task-filter').addEventListener('change', () => renderActionBoard());
$('#task-search').addEventListener('input', () => renderActionBoard());
['#task-player','#task-category','#task-sort'].forEach(id => $(id).addEventListener('change', () => renderActionBoard()));
$('#reset-task-filters').addEventListener('click', () => { $('#task-filter').value = 'open'; $('#task-search').value = ''; $('#task-player').value = ''; $('#task-category').value = ''; $('#task-sort').value = 'due'; renderActionBoard(); });
$('#show-sensitive').addEventListener('change',render);
$('#show-sensitive-actions').addEventListener('change',render);
$('#mode').addEventListener('change', e => {
  if (busy) { e.target.value = mode; return; }
  mode = e.target.value;
  clearAssistant();
  const url = new URL(window.location.href); url.searchParams.set('mode', mode);
  window.history.replaceState(null, '', url);
  draft = []; extractionId = null; extractionWarnings = []; cancelPrep(); renderReview(); render();
  if (!connected) { initializeNotebook(); return; }
  showModeAlert(`${mode === 'demo' ? 'Demo' : 'Live'} extraction enabled. Saved records unchanged.`);
});
$('#prep').addEventListener('click', () => {
  cancelPrep();
  const records = items().filter(i => appliesTo(i,selectedPlayer) && !i.sensitive);
  if (!records.length) { notify('No checked, non-sensitive notes for this player yet.',true); return; }
  if (mode === 'demo') {
    $('#prep-text').innerHTML = formatBrief(`## Preparation checklist\n\nDemo · Application-generated checklist, not Aivana output.\n\n${records.map(i => `- **${i.kind[0].toUpperCase()+i.kind.slice(1)}** · ${i.meeting.date}: ${i.text}${i.kind === 'action' ? ` (${i.completed ? 'complete' : 'open'}${i.due_date ? `; due ${i.due_date}`:''})`:''}`).join('\n')}\n\n### Suggested discussion\n\nAsk the player for an update on open actions.`);
    return;
  }
  $('#prep').disabled = true; $('#prep-text').textContent = 'Connecting to Aivana…'; let content = '';
  prepSource = new EventSource(`/api/players/${encodeURIComponent(selectedPlayer)}/prep`);
  prepSource.addEventListener('delta', e => { try { content += JSON.parse(e.data).text || ''; $('#prep-text').innerHTML = formatBrief(content); } catch { notify('Unreadable preparation event.',true); prepSource?.close(); $('#prep').disabled = false; } });
  prepSource.addEventListener('done', e => { const data = JSON.parse(e.data); prepSource?.close(); prepSource = null; $('#prep').disabled = false; if (data.finish_reason === 'length') notify('The brief was cut short. Treat this as an incomplete draft.',true); });
  prepSource.addEventListener('error', e => { let message = 'Preparation stream failed. Check your backend, key, balance, and connection.'; try { message = JSON.parse(e.data).message || message; } catch {} notify(message,true); prepSource?.close(); prepSource = null; $('#prep').disabled = false; $('#prep-text').innerHTML = formatBrief(content || 'No brief was generated.'); });
});
function clearAssistant() {
  assistantRevision++; assistantResult = null;
  $('#assistant-answer').innerHTML = '<div class="assistant-welcome"><span class="assistant-emblem">' + icon('chat') + '</span><h3>What would you like to revisit?</h3><p>Choose a player, then ask about past feedback, homework, or your next 1-on-1. Answers link back to saved notes.</p></div>';
  $('#assistant-error').hidden = true;
}
function resetAssistantFilters() {
  assistantActionCategory = ''; $('#assistant-inherited-category').hidden = true;
  for (const key of ['skill','topic','start','end','search']) $(`#assistant-${key}`).value = '';
  $('#assistant-status').value = 'all'; $('#assistant-actions').checked = false;
}
function openAssistant(playerId, fromActions = false) {
  if (assistantPending) { notify('Wait for the current assistant answer before changing its context.'); return; }
  resetAssistantFilters(); clearAssistant();
  $('#assistant-player').value = playerId || (fromActions ? '' : selectedPlayer);
  if (fromActions) {
    assistantActionCategory = $('#task-category').value;
    $('#assistant-inherited-category').textContent = `Action-board category: ${assistantActionCategory}`;
    $('#assistant-inherited-category').hidden = !assistantActionCategory;
    $('#assistant-status').value = $('#task-filter').value;
    $('#assistant-actions').checked = true; $('#assistant-search').value = $('#task-search').value;
  }
  $('#assistant-question').value = fromActions ? 'Which actions need follow-up?' : '';
  switchView('assistant'); $('#assistant-title').focus({preventScroll:true});
  $('#assistant-title').scrollIntoView({block:'start', behavior:'instant'});
  if (fromActions && !playerId) notify('Choose one player to ask about their filtered actions.');
  $('#assistant-question').focus({preventScroll:true});
}
document.addEventListener('click', e => {
  const entry = e.target.closest('[data-ask-player]');
  if (entry) openAssistant(entry.dataset.askPlayer);
});
$('#ask-actions').addEventListener('click', () => openAssistant($('#task-player').value, true));
$('#assistant-reset').addEventListener('click', () => { resetAssistantFilters(); clearAssistant(); });
$('#assistant-clear').addEventListener('click', clearAssistant);
$('.assistant-context').addEventListener('input', clearAssistant);
$('.assistant-prompts').addEventListener('click', e => {
  const prompt = e.target.closest('[data-assistant-prompt]');
  if (!prompt || assistantPending) return;
  $('#assistant-question').value = prompt.dataset.assistantPrompt;
  if (prompt.hasAttribute('data-assistant-actions')) { $('#assistant-actions').checked = true; $('#assistant-status').value = 'open'; }
  else { $('#assistant-actions').checked = false; $('#assistant-status').value = 'all'; }
  clearAssistant(); $('#assistant-question').focus();
});
$('#assistant-answer').addEventListener('click', e => {
  const citation = e.target.closest('[data-assistant-source]');
  if (citation) {
    const source = document.getElementById(`assistant-source-${citation.dataset.assistantSource}`);
    if (source) { source.closest('details').open = true; source.focus({preventScroll:true}); source.scrollIntoView({block:'nearest',behavior:'smooth'}); }
  }
  const recordLink = e.target.closest('[data-assistant-record]');
  if (recordLink && assistantResult) {
    const source = assistantResult.sources.find(s => s.source_id === recordLink.dataset.assistantRecord);
    if (!source) return;
    openPlayerTimeline(assistantResult.player_id);
    const record = document.getElementById(`record-${source.meeting_id}-${source.record_id}`);
    if (record) { record.querySelector('details').open = true; record.focus({preventScroll:true}); record.scrollIntoView({block:'center',behavior:'smooth'}); }
    else notify('This note is no longer visible. Reload the notebook to check its latest state.',true);
  }
});
$('#assistant-form').addEventListener('submit', async e => {
  e.preventDefault(); if (assistantPending || !connected) return;
  const question = $('#assistant-question').value.trim(); if (!question) return;
  if (!$('#assistant-player').value) { $('#assistant-error').textContent = 'Choose one player for this question.'; $('#assistant-error').hidden = false; $('#assistant-player').focus(); return; }
  const start = $('#assistant-start').value, end = $('#assistant-end').value;
  if (start && end && start > end) { $('#assistant-error').textContent = 'From must be on or before Through.'; $('#assistant-error').hidden = false; return; }
  const body = {player_id:$('#assistant-player').value, question, mode, filters: {
    skill:$('#assistant-skill').value, topic:$('#assistant-topic').value, start, end,
    status:$('#assistant-status').value, actions_only:$('#assistant-actions').checked, search:$('#assistant-search').value, category:assistantActionCategory,
  }};
  clearAssistant(); const revision = assistantRevision; assistantPending = true;
  $('#assistant-answer').innerHTML = '<p class="assistant-loading" role="status">' + (mode === 'demo' ? 'Finding saved notes…' : 'Finding notes and asking Aivana…') + '</p>';
  $('#assistant-answer').setAttribute('aria-busy','true');
  document.querySelectorAll('#assistant input, #assistant select, #assistant textarea, #assistant button').forEach(el => el.disabled = true);
  $('#mode').disabled = true;
  try {
    const result = await api('/assistant', body);
    if (revision !== assistantRevision) return;
    assistantResult = result;
    $('#assistant-answer').innerHTML = `<div class="assistant-question-bubble"><strong>${escape(name(body.player_id))}</strong><p>${escape(question)}</p></div>` + assistantAnswerMarkup(result);
  } catch (error) {
    if (revision !== assistantRevision) return;
    $('#assistant-answer').innerHTML = '<p>No answer was generated. Your question is ready to retry.</p>';
    $('#assistant-error').textContent = error.message; $('#assistant-error').hidden = false;
  } finally {
    assistantPending = false; $('#assistant-answer').setAttribute('aria-busy','false');
    document.querySelectorAll('#assistant input, #assistant select, #assistant textarea, #assistant button').forEach(el => el.disabled = false);
    $('#mode').disabled = busy; $('#assistant-send').disabled = !connected;
  }
});
// ---------------- Home, Schedule, Ask Aivana, bell ----------------
let notes = [], notebookFilter = 'all', folderFilter = null, folders = [], archivedFolders = [], filmNotes = [], playerStatuses = {}, settings = {game_day:'saturday', day_labels:{}, notification_kinds:{}}, upcomingEvents = [], watchReviewCount = 0;
let pendingNoteLink = null, nextGame = null, repeatFlags = [], filmTodo = [];
var askPanel = null;
const notebookOf = (n) => NOTEBOOK_LABELS[n] || n;
async function saveSettings(change) { settings = await api('/settings', change, 'PATCH'); setDateLine(); return settings; }
function setDateLine() {
  $('#page-date').textContent = `${new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})} · ${dayLabel(today(), settings.game_day, settings.day_labels)}`;
}
function renderHome() {
  if (!$('#notebook-list')) return;
  const counts = viewCounts({notes, meetings, filmNotes});
  $('#notebook-list').innerHTML = SMART_VIEWS.map(v => `<button type="button" class="notebook-card ${notebookFilter === v.key ? 'active' : ''}" data-notebook="${v.key}" aria-pressed="${notebookFilter === v.key}">${icon(v.key === 'player_meetings' ? 'people' : v.key === 'team_strategy' ? 'football' : v.key === 'film' ? 'check' : 'note')}<span><strong>${v.label}${v.key === 'personal' ? ' <small class="private-tag">private</small>' : ''}</strong><small>${v.hint}</small></span><b>${counts[v.key]}</b></button>`).join('');
  const noFolder = notes.filter(n => n.folder_id == null).length;
  $('#folder-list').innerHTML = `<div class="folder-head"><h3>Folders</h3><button type="button" class="text-button" data-new-folder>+ New folder</button></div>
    ${folders.map(f => `<div class="folder-row ${String(folderFilter) === String(f.id) ? 'active' : ''}"><button type="button" class="folder-pick" data-folder="${f.id}" aria-pressed="${String(folderFilter) === String(f.id)}">📁 ${escape(f.name)} <b>${f.note_count}</b></button><details class="folder-menu"><summary aria-label="Folder actions for ${escape(f.name)}">⋯</summary><div><button type="button" data-folder-rename="${f.id}">Rename</button><button type="button" data-folder-archive="${f.id}">Archive</button><button type="button" class="danger" data-folder-delete="${f.id}">Delete…</button></div></details></div>`).join('')}
    <div class="folder-row ${folderFilter === 'none' ? 'active' : ''}"><button type="button" class="folder-pick" data-folder="none" aria-pressed="${folderFilter === 'none'}">No folder <b>${noFolder}</b></button></div>
    ${folderFilter != null ? '<button type="button" class="text-button" data-folder="">Show every folder</button>' : ''}
    ${archivedFolders.length ? `<details class="archived-folders"><summary>Archived folders (${archivedFolders.length})</summary>${archivedFolders.map(f => `<div class="folder-row"><span>📁 ${escape(f.name)} <b>${f.note_count}</b></span><button type="button" class="text-button" data-folder-restore="${f.id}">Restore</button></div>`).join('')}</details>` : ''}`;
  const search = $('#notes-search').value;
  const rows = notebookRows({notes, meetings, filmNotes, view: notebookFilter, folder: folderFilter, search}).map(r => ({...r, html:
    r.kind === 'note' ? `<button type="button" class="meeting-row" data-open-note="${r.id}"><span class="meeting-date">${icon('note')}</span><span class="meeting-title"><strong>${escape(r.note.title)}</strong><small>${escape(shortDate(r.note.note_date))} · ${escape(notebookOf(r.note.notebook))}${r.note.folder_id != null ? ` · 📁 ${escape(folders.find(f => f.id === r.note.folder_id)?.name || archivedFolders.find(f => f.id === r.note.folder_id)?.name || '')}` : ''}${r.note.input_method !== 'type' ? ` · ${escape(r.note.input_method)}` : ''}${r.note.summary ? ' · Recap' : ''}</small></span></button>`
    : r.kind === 'meeting' ? `<button type="button" class="meeting-row" data-open-player="${escape(r.meeting.attendees[0])}"><span class="meeting-date">${icon('people')}</span><span class="meeting-title"><strong>${escape(r.meeting.title)}</strong><small>${escape(shortDate(r.meeting.date))} · ${escape(meetingTypeLabel(r.meeting.meeting_type))} · ${r.meeting.items.filter(i => i.kind === 'action').length} homework</small></span><span class="badge reviewed">✓ Checked</span></button>`
    : `<button type="button" class="meeting-row" data-open-film-note="${r.film.film_id}@${r.film.t_seconds}"><span class="meeting-date">${icon('check')}</span><span class="meeting-title"><strong>${escape(r.film.text.slice(0, 80))}</strong><small>${escape(shortDate(r.date))} · Film · ${escape(r.film.film_title)}</small></span></button>`}));
  $('#recent-heading').textContent = search.trim() ? 'Search results' : folderFilter != null ? 'In this folder' : 'Recent notes';
  $('#recent').innerHTML = rows.slice(0, 7).map(r => r.html).join('') || `<p class="radar-empty">${search.trim() ? 'No note matches. Search looks in every folder.' : folderFilter != null ? 'No notes here yet. Open a note and pick this folder.' : 'No notes yet. Write one in the middle and press Save note.'}</p>`;
  $('#recent-count').textContent = rows.length > 7 ? `7 of ${rows.length}` : '';
  const gameCard = nextGame?.event ? `<div class="next-game"><span class="ng-kicker">NEXT GAME · ${escape(nextGame.when.toUpperCase())}</span><strong>${escape(nextGame.opponent || nextGame.event.title)}</strong><small>${nextGame.home_away ? (nextGame.home_away === 'home' ? 'Home · ' : 'Away · ') : ''}${escape(shortDate(nextGame.event.date))} ${clockLabel(nextGame.event.start_at)}</small><small>Before kickoff: ${nextGame.homework_due_count} homework${filmTodo.length ? ` · ${filmTodo.length} film to break down` : ''}</small></div>` : '';
  const filmRows = filmTodo.slice(0, 2).map(f => `<button type="button" class="upcoming-item ev-row-film" data-open-film-home="${f.id}"><span class="upcoming-date">Film<small>${escape(f.status === 'in_progress' ? 'In progress' : 'To do')}</small></span><span><strong>Film to break down: ${escape(f.title)}</strong><small>${escape(f.assigned_to)}</small></span></button>`).join('');
  $('#next-up').innerHTML = gameCard + filmRows + upcomingEvents.map(e => `<button type="button" class="upcoming-item ev-row-${e.type}" data-schedule-date="${e.date}"><span class="upcoming-date">${e.date === today() ? 'Today' : escape(new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}))}<small>${clockLabel(e.start_at)}</small></span><span><strong>${escape(e.title)}</strong><small>${escape(audienceLabel(e.audience, demo.players))}</small></span></button>`).join('') || '<p class="radar-empty">Nothing on the schedule. Add a practice or game.</p>';
  const late = items().filter(i => i.kind === 'action' && !i.completed && !i.sensitive && overdue(i));
  const lateRows = late.slice(0, 4).map(i => `<button class="radar-item" data-player="${escape(i.player_id)}"><span class="status-dot red" aria-hidden="true"></span><span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small><em class="late-word">Late · was due ${escape(shortDate(i.due_date))}</em></span>${icon('chevron')}</button>`);
  const since = `${Number(today().slice(5,7)) >= 8 ? today().slice(0,4) : Number(today().slice(0,4)) - 1}-08-01`;
  const noOneOnOne = Object.keys(playerStatuses).length ? demo.players.filter(p => !((playerStatuses[p.id]?.last_one_on_one || '') >= since)) : [];
  const review = watchReviewCount ? `<button class="radar-item" data-view="meetings"><span class="status-dot amber" aria-hidden="true"></span><span><strong>${watchReviewCount} AI note${watchReviewCount === 1 ? '' : 's'} to check</strong><small>Waiting in Find homework</small></span>${icon('chevron')}</button>` : '';
  const checkins = noOneOnOne.length ? `<button class="radar-item" data-ask-prompt="Who hasn't had a 1-on-1?"><span class="status-dot amber" aria-hidden="true"></span><span><strong>${noOneOnOne.length} player${noOneOnOne.length === 1 ? '' : 's'} with no 1-on-1</strong><small>This season · ${escape(noOneOnOne.slice(0,3).map(p => p.name.split(' ')[0]).join(', '))}${noOneOnOne.length > 3 ? '…' : ''}</small><em class="amber-word">Ask Aivana who</em></span>${icon('chevron')}</button>` : '';
  const repeatRows = repeatFlags.slice(0, 3).map(f => `<button class="radar-item" data-plan-one="${escape(f.player_id)}"><span class="status-dot amber" aria-hidden="true"></span><span><strong>Same correction ${f.weeks} weeks: ${escape(f.player_name)}</strong><small>${escape(f.tag)}</small><em class="amber-word">Plan a 1-on-1 →</em></span>${icon('chevron')}</button>`).join('');
  $('#watch-list').innerHTML = (review + repeatRows + lateRows.join('') + (late.length > 4 ? `<p class="watch-more">+${late.length - 4} more late</p>` : '') + checkins) || '<p class="radar-empty">All clear. Nobody is late on homework.</p>';
}
async function folderAction(run) {
  try { const message = await run(); if (message) { notify(message); await refreshHomeData(); } } catch (error) { notify(error.message, true); }
}
$('#notes-search').addEventListener('input', () => renderHome());
async function refreshHomeData() {
  try {
    const [n, st, up, bellData, game, repeats, films, allFolders, fnotes] = await Promise.all([api('/notes', undefined, 'GET'), api('/players/status', undefined, 'GET'), api('/events/upcoming?limit=3', undefined, 'GET'), api('/notifications', undefined, 'GET'), api('/next-game', undefined, 'GET'), api('/watch-list/repeats', undefined, 'GET'), api('/films', undefined, 'GET'), api('/folders?archived=true', undefined, 'GET'), api('/film-notes', undefined, 'GET').catch(() => [])]);
    notes = n; playerStatuses = st; upcomingEvents = up; watchReviewCount = bellData.items.filter(i => i.kind === 'review').length;
    folders = allFolders.filter(f => !f.archived_at); archivedFolders = allFolders.filter(f => f.archived_at); filmNotes = fnotes; editor.refreshFolders();
    if (folderFilter != null && folderFilter !== 'none' && !folders.some(f => String(f.id) === String(folderFilter))) folderFilter = null;
    nextGame = game; repeatFlags = repeats; filmTodo = films.filter(f => f.status !== 'done' && f.assigned_to);
  } catch { /* the connection message is already shown */ }
  render(); miniCalendar.refresh(); bell.refresh();
}
const editor = createNoteEditor($('#note-editor-root'), {
  api, notify, getMode: () => mode, players: demo.players, getFolders: () => folders,
  onSaved: () => refreshHomeData(),
  onContextChange: () => askPanel?.refreshChips(),
  findHomework: (note) => openFindHomework(note),
  sendToReview: (note, recap) => openFindHomework(note, recap),
  addToSchedule: (event) => { showSchedule(event.start_at.slice(0, 10), 'week'); schedule.openAdd(event); },
  openWhiteboard: (note, opts = {}) => openWhiteboard({api, notify, players: demo.players, onSaved: opts.onSaved, onClose: opts.onClose}, opts.id ? {id: opts.id} : {template: 'play', note_id: note.id, title: note.title}),
});
function openFindHomework(note, recap = null) {
  if (busy) return;
  const attendees = recap ? [...new Set(recap.to_dos.map(t => t.player_id).filter(Boolean))] : matchPlayersInText(note.body, demo.players);
  current = {title: note.title.slice(0, 160), date: note.note_date, meeting_type: attendees.length === demo.players.length ? 'team' : attendees.length > 1 ? 'group' : 'individual', attendees, note: note.body.slice(0, 12000)};
  $('#title').value = current.title; $('#date').value = current.date; $('#meeting-type').value = current.meeting_type; $('#note').value = current.note; $('#sample').selectedIndex = -1;
  document.querySelectorAll('[name="attendee"]').forEach(el => el.checked = attendees.includes(el.value));
  updateAttendeeSummary(); $('.attendee-picker').open = !attendees.length;
  draft = []; extractionId = null; extractionWarnings = []; pendingNoteLink = note.id;
  if (recap) {
    origin = 'manual';
    draft = recap.to_dos.filter(t => t.player_id).map(t => ({id: crypto.randomUUID(), schema_version: 2, player_id: t.player_id, scope: 'player', kind: 'action', text: t.task, topic: null, skill: null, tags: [], quote: t.source_found ? t.source_text : '', due_date: t.due_date && t.due_date >= note.note_date ? t.due_date : null, deadline_text: t.due_phrase, confidence: 'medium', mention: t.player, match_method: 'full_name', sensitive: false, warnings: ['From the Recap. Check the player, homework, date and quote before saving.']}));
  }
  renderReview(); switchView('meetings'); window.scrollTo({top: 0});
  notify(recap ? 'Homework from the Recap is ready to check. Nothing is saved until you approve it.' : attendees.length ? 'Note copied in. Press Find homework, then check each item.' : 'Note copied in. Choose who was in the meeting, then press Find homework.');
}
const schedule = createSchedule($('#schedule-root'), {
  api, notify, players: demo.players, getSettings: () => settings, saveSettings,
  onChanged: () => refreshHomeData(),
  onOpenItem: (item) => {
    if (item.source === 'note') { switchView('desk'); editor.open(item.id); }
    else if (item.source === 'meeting') { if (item.note_id) { switchView('desk'); editor.open(item.note_id); } else if (item.player_id) openPlayerTimeline(item.player_id); else switchView('tasks'); }
    else if (item.source === 'homework') openPlayerTimeline(item.player_id);
  },
});
function showSchedule(date, nextView = 'week') { switchView('schedule'); schedule.show(date, nextView); }
const miniCalendar = createMiniCalendar($('#mini-calendar'), {api, onPickDay: (date) => showSchedule(date, 'week')});
function openLink(link = '') {
  const kind = link.split(':')[0], value = link.split(':').slice(1).join(':');
  if (kind === 'note') { switchView('desk'); editor.open(Number(value)); }
  else if (kind === 'schedule') showSchedule(value || today(), 'day');
  else if (kind === 'player') openPlayerTimeline(value);
  else if (kind === 'homework') { $('#task-filter').value = 'open'; render(); switchView('tasks'); }
  else if (kind === 'notebook') switchView('meetings');
  else if (kind === 'film') { switchView('film'); if (value) { const [fid, t] = value.split('@'); filmRoom.openFilm(Number(fid), t ? Number(t) : null); } else filmRoom.show(); }
  else switchView('desk');
}
askPanel = createAskPanel({
  api, notify, getMode: () => mode, openLink,
  getContext: () => view === 'film' ? filmRoom.context : view === 'players' && playerDetailOpen ? {page:'player', selected_id:selectedPlayer} : view === 'schedule' ? {page:'schedule', selected_id:null} : view === 'desk' ? (editor.noteId ? {page:'note', selected_id:editor.noteId} : {page:'home', selected_id:null}) : {page: view === 'tasks' ? 'homework' : view === 'meetings' ? 'notebook' : view === 'players' ? 'players' : 'home', selected_id:null},
  runConfirm: async (c) => {
    if (c.kind === 'add_event') { const e = await api('/events', c.event); refreshHomeData(); if (view === 'schedule') schedule.refresh(); return `${e.title} added to the schedule.`; }
    if (c.kind === 'save_playlist') { const pl = await api('/playlists', c.playlist); return `Cut-up saved: ${pl.title} (${pl.clip_ids.length} clips). Find it in Film room → Cut-ups.`; }
    if (c.kind === 'mark_done') { const updated = await api(`/meetings/${encodeURIComponent(c.meeting_id)}/items/${encodeURIComponent(c.item_id)}`, {completed:true}, 'PATCH'); meetings = meetings.map(m => m.id === updated.id ? updated : m); refreshHomeData(); return 'Homework marked done.'; }
    if (c.kind === 'apply_text') {
      if (editor.noteId === c.note_id) { editor.applyText(c.text); return 'Fixes applied in the editor. Press Save note to keep them, or Undo.'; }
      await api(`/notes/${c.note_id}`, {body: c.text}, 'PATCH'); refreshHomeData(); return 'Fixes saved to the note.';
    }
    throw Error('Unknown change.');
  },
  playerName: (id) => player(id)?.name,
  runButton: (b) => { if (b.action === 'plan_one_on_one') { const p = player(b.player_id); const d = new Date(); d.setDate(d.getDate() + 1); showSchedule(d.toLocaleDateString('en-CA'), 'week'); schedule.openAdd({type: 'meeting', title: `1-on-1: ${p.name}`, start_at: `${d.toLocaleDateString('en-CA')}T14:00`, duration_min: 30, audience: `player:${p.id}`}); return; } if (b.action === 'find_homework') api(`/notes/${b.note_id}`, undefined, 'GET').then(note => openFindHomework(note)).catch(e => notify(e.message, true)); },
});
function openReviewDraft({meeting, items: drafted}) {
  if (busy) return;
  current = {...meeting};
  $('#title').value = current.title; $('#date').value = current.date; $('#meeting-type').value = current.meeting_type; $('#note').value = current.note; $('#sample').selectedIndex = -1;
  document.querySelectorAll('[name="attendee"]').forEach(el => el.checked = current.attendees.includes(el.value));
  updateAttendeeSummary(); origin = 'manual'; extractionId = null; extractionWarnings = []; pendingNoteLink = null;
  draft = drafted.map(i => ({...i, id: crypto.randomUUID(), completed: false}));
  renderReview(); switchView('meetings'); window.scrollTo({top: 0});
  notify('Homework from your film note is ready to check. Nothing is saved until you approve it.');
}
const filmRoom = createFilmRoom($('#film-root'), {api, notify, players: demo.players, getMode: () => mode, openReviewDraft, openPlayer: (id) => openPlayerTimeline(id), onChanged: () => refreshHomeData()});
const bell = createBell($('#bell'), {api, notify, openLink, getSettings: () => settings, saveSettings});
$('#open-ask').addEventListener('click', () => askPanel.toggle());
$('#new-note').addEventListener('click', () => { switchView('desk'); editor.reset({notebook: ['personal', 'player_meetings', 'team_strategy'].includes(notebookFilter) ? notebookFilter : 'personal', folder_id: folderFilter && folderFilter !== 'none' ? folderFilter : ''}); editor.focus(); });
$('#new-meeting').addEventListener('click', newMeeting);
document.addEventListener('click', e => {
  const nb = e.target.closest('[data-notebook]'); if (nb) { notebookFilter = nb.dataset.notebook; renderHome(); }
  const fp = e.target.closest('[data-folder]'); if (fp) { folderFilter = fp.dataset.folder === '' ? null : fp.dataset.folder === 'none' ? 'none' : Number(fp.dataset.folder); if (folderFilter != null && notebookFilter === 'film') notebookFilter = 'all'; renderHome(); }
  const fn = e.target.closest('[data-open-film-note]'); if (fn) { const [fid, t] = fn.dataset.openFilmNote.split('@'); switchView('film'); filmRoom.openFilm(Number(fid), Number(t)); }
  if (e.target.closest('[data-new-folder]')) folderAction(async () => { const name = prompt('Folder name (for example "Week 12" or "Recruiting")'); if (name?.trim()) { const f = await api('/folders', {name: name.trim()}); folderFilter = f.id; return `Folder "${f.name}" created. Open a note and choose it under Folder.`; } });
  const ren = e.target.closest('[data-folder-rename]'); if (ren) folderAction(async () => { const f = folders.find(x => x.id === Number(ren.dataset.folderRename)); const name = prompt('Rename folder', f.name); if (name?.trim() && name.trim() !== f.name) { await api(`/folders/${f.id}`, {name: name.trim()}, 'PATCH'); return 'Folder renamed. Its notes did not change.'; } });
  const arc = e.target.closest('[data-folder-archive]'); if (arc) folderAction(async () => { const f = folders.find(x => x.id === Number(arc.dataset.folderArchive)); if (confirm(`Archive "${f.name}"? It is hidden from the list. Its notes stay in it and still show in All notes and search.`)) { await api(`/folders/${f.id}`, {archived: true}, 'PATCH'); return `"${f.name}" archived.`; } });
  const res = e.target.closest('[data-folder-restore]'); if (res) folderAction(async () => { await api(`/folders/${res.dataset.folderRestore}`, {archived: false}, 'PATCH'); return 'Folder restored.'; });
  const del = e.target.closest('[data-folder-delete]'); if (del) folderAction(async () => { const f = folders.find(x => x.id === Number(del.dataset.folderDelete)); if (confirm(DELETE_FOLDER_TEXT(f.name, f.note_count))) { const r = await api(`/folders/${f.id}`, undefined, 'DELETE'); if (String(folderFilter) === String(f.id)) folderFilter = null; return `Folder deleted. ${r.moved_to_no_folder} note${r.moved_to_no_folder === 1 ? '' : 's'} moved to No folder.`; } });
  const openNote = e.target.closest('[data-open-note]'); if (openNote) editor.open(Number(openNote.dataset.openNote));
  if (e.target.closest('[data-open-schedule]')) showSchedule(today(), 'week');
  const sd = e.target.closest('[data-schedule-date]'); if (sd) showSchedule(sd.dataset.scheduleDate, 'day');
  const ask = e.target.closest('[data-ask-prompt]'); if (ask) askPanel.open(ask.dataset.askPrompt);
  if (e.target.closest('nav [data-view="schedule"]')) schedule.show(today());
  if (e.target.closest('nav [data-view="film"]')) { filmRoom.show(); maybeTour('film'); }
  const filmHome = e.target.closest('[data-open-film-home]'); if (filmHome) { switchView('film'); filmRoom.openFilm(Number(filmHome.dataset.openFilmHome)); }
  const plan = e.target.closest('[data-plan-one]'); if (plan) { const p = player(plan.dataset.planOne); const d = new Date(); d.setDate(d.getDate() + 1); showSchedule(d.toLocaleDateString('en-CA'), 'week'); schedule.openAdd({type: 'meeting', title: `1-on-1: ${p.name}`, start_at: `${d.toLocaleDateString('en-CA')}T14:00`, duration_min: 30, audience: `player:${p.id}`}); }
});
function openSettingsPage(section = null) {
  renderSettings($('#settings-root'), {getSettings: () => settings, saveSettings, notify, onChanged: () => { profileMenu.refresh(); setTeamName(); bell.refresh(); }});
  switchView('settings');
  const target = section === 'profile' ? $('[data-settings-form="profile"] [name="name"]') : $('#settings-title');
  target?.focus({preventScroll: true}); window.scrollTo({top: 0});
}
function openHelpPage() { renderHelp($('#help-root'), {replayTour}); switchView('help'); $('#help-title')?.focus({preventScroll: true}); window.scrollTo({top: 0}); }
function setTeamName() { const t = settings.team?.name; $('#sidebar-team').innerHTML = t ? `${escape(t)}<small>Falcon Follow-up</small>` : 'picInfiniti<small>Football Meeting Tracker</small>'; $('.sidebar-bottom .team-avatar').textContent = t ? t.slice(0, 2) : 'pi'; }
// Tours: first visit only; finished or closed is remembered in Settings. Replay lives in Help.
let toursReady = false;
function runTour(id) { startTour(id, {onEnd: (how) => saveSettings({tour: {id, state: how}}).catch(() => {})}); }
function maybeTour(id) { if (toursReady && !tourActive() && shouldStart(settings, id)) setTimeout(() => runTour(id), 400); }
function replayTour(id) {
  const go = () => setTimeout(() => runTour(id), 400);
  if (id === 'film') { switchView('film'); filmRoom.show(); go(); }
  else if (id === 'playboard') { openWhiteboard({api, notify, players: demo.players}, {template: 'play', title: 'Tour practice'}); go(); }
  else { switchView('desk'); go(); }
}
document.addEventListener('playboard-opened', () => maybeTour('playboard'));
const profileMenu = createProfileMenu($('#profile-button'), {getSettings: () => settings, openSettings: openSettingsPage, openHelp: openHelpPage});
createQuickNote({api, notify, players: demo.players, getMeetings: () => meetings, onSaved: () => refreshHomeData(),
  getContext: () => ({page: view === 'film' ? 'film' : view, player_id: view === 'players' && playerDetailOpen ? selectedPlayer : null})});
api('/settings', undefined, 'GET').then(s => { settings = s; setDateLine(); profileMenu.refresh(); setTeamName(); toursReady = true; maybeTour('welcome'); }).catch(() => setDateLine());
if (editor.restoreDraft()) notify('Your unsaved draft is back.');
loadSample('individual'); $('#mode').value = mode; render(); switchView('desk');
async function initializeNotebook() {
  busy = true; $('#mode').disabled = true; render();
  notify('Loading the shared SQLite notebook…');
  try {
    let storage;
    try { storage = window.localStorage; } catch { /* SQLite works without browser storage. */ }
    const result = await loadSharedNotebook(api, storage);
    meetings = result.meetings; connected = true; refreshHomeData();
    const missingKey = mode === 'live' && !result.status.aivana_configured;
    notify(result.migrationError || (missingKey ? 'Notebook loaded. Configure backend/.env before live extraction; Demo needs no Aivana key.' : 'Notebook connected. Demo and Live share the same saved records.'), Boolean(result.migrationError || missingKey));
  } catch (error) { notify(error.message, true); }
  finally { busy = false; $('#mode').disabled = false; render(); }
}
initializeNotebook();
