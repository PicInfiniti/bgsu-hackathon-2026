import './styles.scss';
import './workspace.scss';
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

const $ = (s) => document.querySelector(s);
const escape = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (x) => structuredClone(x);
let meetings = [];
let mode = workspaceMode(window.location.search), view = 'desk', draft = [], origin = 'demo', selectedPlayer = 'p01', busy = false, connected = false, prepSource = null;
let current = clone(demo.samples[0]);
let playerDetailOpen = false, playerUnitFilter = 'all';
let extractionId = null, extractionWarnings = [], highlightedDraft = 0;
let statusTimer = null;
const player = (id) => demo.players.find(p => p.id === id);
const name = (id) => player(id)?.name ?? 'Unknown player';
const positionLabel = (p) => p.position_label ? `${p.position} · ${p.position_label}` : p.position;
const today = () => new Date().toLocaleDateString('en-CA');
const overdue = (x) => x.kind === 'action' && !x.completed && x.due_date && x.due_date < today();
const items = () => meetings.flatMap(m => m.items.map(i => ({...i, meeting:m})));


const icon = (name) => {
  const paths = {
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
    <div class="workspace-label">THE FOOTBALL NOTEBOOK</div>
    <nav aria-label="Main navigation">
      <button data-view="desk" class="active">${icon('home')} Overview</button>
      <button data-view="meetings">${icon('note')} Meeting notes</button>
      <button data-view="players">${icon('people')} Players</button>
      <button data-view="tasks">${icon('check')} Actions <b id="nav-count"></b></button>
    </nav>
    <div class="sidebar-note">From the film room<br>to the next practice.<span>Make the follow-up count.</span></div>
    <div class="sidebar-bottom"><span class="team-avatar">pi</span><div>picInfiniti<small>Football Meeting Tracker</small></div></div>
  </aside>
  <div class="shell">
    <header class="topbar"><div><h1>Your football workspace</h1><p>A place for every conversation. A plan for what comes next.</p></div><div class="header-actions"><button class="primary" id="new-meeting">${icon('plus')} New meeting</button><a class="profile-link" href="/login" aria-label="Open coach sign-in preview">${icon('user')}</a></div></header>
    <div id="status-toast" class="status-toast" role="status" aria-live="polite" hidden><span id="status-toast-text"></span><button class="icon-button" id="close-status-toast" aria-label="Dismiss notification">×</button></div>
    <main>
      <div class="workspace-toolbar"><span class="workspace-date">${icon('football')} Football · Your coaching notebook</span><label class="mode-control">Extraction <select id="mode"><option value="demo">Demo · prepared samples</option><option value="live">Live · Aivana</option></select></label></div>
      <div id="message" role="status" aria-live="polite" hidden></div>
      <section id="desk" class="view">
        <div class="overview-lead"><div><p class="eyebrow">THE COACH'S DASHBOARD</p><h2>A clear view of your team.</h2><p>Conversations captured. Next steps ready.</p></div><button class="secondary" data-view="meetings">${icon('note')} Open meeting notebook</button></div>
            <section class="stats" aria-label="Workspace summary"><a href="#recent-heading" data-stat="meetings"><strong id="meeting-count">0</strong><span>Saved meetings</span><small>Reviewed conversations</small></a><a href="#tasks" data-stat="open"><strong id="open-count">0</strong><span>Open actions</span><small>Ready to follow up</small></a><a href="#tasks" data-stat="overdue" class="urgent"><strong id="overdue-count">0</strong><span>Needs follow-up</span><small id="clock-note"></small></a><a href="#players" data-stat="players"><strong id="players-count">0</strong><span>Players reached</span><small>Of ${demo.players.length} fictional players</small></a></section>
        <div class="overview-grid"><div class="overview-main">
          <div class="panel overview-conversation-hub">
            <section class="upcoming-panel"><div class="section-heading"><h2>Upcoming</h2>${icon('calendar')}</div><p class="upcoming-caption">Open actions due today or later</p><div id="upcoming-list"></div><button class="rail-link" data-stat="open">View all open actions</button></section>
          <section class="overview-conversations"><div id="recent-heading" class="section-heading"><div><p class="eyebrow">THE RUNNING RECORD</p><h2>Recent conversations</h2><span id="overview-recent-count" class="recent-count"></span></div><button class="rail-link" data-view="meetings">Write a note</button></div><div id="recent" class="recent-list"></div></section>
          </div>
          <section class="panel overview-checkins"><div class="section-heading"><div><p class="eyebrow">KEEP THE CONNECTION</p><h2>Individual check-ins</h2></div>${icon('people')}</div><div id="overview-checkins"></div><button class="rail-link" data-view="players">Browse the football roster</button></section>
          <section class="panel overview-types"><div class="section-heading"><h2>Your conversations</h2><span class="muted">All saved meetings</span></div><div id="overview-meeting-types"></div></section>
        </div><aside class="overview-aside">

            <section class="calendar-panel panel"><div class="calendar-heading"><h2 id="calendar-title"></h2><div><button class="icon-button" id="calendar-prev" aria-label="Previous month">${icon('chevron')}</button><button class="icon-button" id="calendar-next" aria-label="Next month">${icon('chevron')}</button></div></div><p class="calendar-caption">Saved conversations & action deadlines</p><div class="calendar-grid" id="calendar"></div><div class="calendar-key"><span>Meeting</span><span>Action due</span></div><div id="calendar-activities" class="calendar-activities" aria-live="polite" hidden></div></section>

            <section class="followup-panel panel"><div class="section-heading"><h2>Needs follow-up</h2>${icon('check')}</div><div id="radar-list"></div><button class="rail-link" data-stat="overdue">Review overdue actions</button></section>
        </aside></div>
      </section>
      <section id="meetings" class="view" hidden><div class="section-heading meeting-page-heading"><div><p class="eyebrow">CAPTURE & CLARIFY</p><h2>Meeting notes</h2><p>Keep the conversation on the left. Check every next step on the right.</p></div></div><div class="meeting-workspace"><div class="meeting-notebook"><div class="meeting-sheet-heading">${icon('note')} The conversation</div><div class="notebook-caption">${icon('people')} Original notes stay attached to every approved record.</div>
            <form id="meeting-form" class="panel note-panel">
              <label class="title-label"><span>Meeting title</span><input id="title" maxlength="160" placeholder="Give this conversation a title" required></label>
              <div class="form-row meeting-meta"><label>Date<input id="date" type="date" required></label><label>Meeting type<select id="meeting-type"><option value="individual">Individual</option><option value="group">Group</option><option value="team">Full team</option></select></label></div>
              <label class="sample-control">Start with a sample<select id="sample">${demo.samples.map(s => `<option value="${s.id}">${escape(s.label)}</option>`).join('')}</select></label>
              <details class="attendee-picker"><summary id="attendee-summary">Meeting attendees</summary><fieldset><legend class="sr-only">Attendees</legend><div id="attendees" class="attendees"></div></fieldset></details>
              <label class="note-label">The conversation<textarea id="note" rows="8" maxlength="12000" placeholder="What did you discuss? Add player names, football skills, film assignments, and deadlines…" required></textarea></label>
              <details class="writing-help"><summary>Tips for a useful meeting note</summary><p>Synthetic notes only. Record what the coach said; avoid assumptions about character or attitude. For long team notes, extract short sections with a few assignments each. Keep the date, attendees, and attribution context; review and save each section separately. Shorten truncated extractions before retrying.</p></details>
              <div class="editor-footer"><span>${icon('note')} Original notes stay attached.</span><button class="primary" id="extract" type="submit">Extract sample records</button></div>
            </form>
        </div>
            <section id="review-panel" class="panel review-panel"><div class="panel-heading">${icon('check')}<div><h3>A second look, before you save.</h3><p>Check the player, the meaning, and the next step.</p></div></div><div id="review"></div></section>
        </div></section>
      <section id="players" class="view" hidden>
        <div id="player-directory">
          <div class="section-heading directory-heading"><div><p class="eyebrow">THE FOOTBALL ROSTER</p><h2 id="players-title" tabindex="-1">Players</h2><p>${demo.players.length} players · Synthetic football roster</p></div></div>
          <div class="player-filters"><label class="player-search">${icon('people')}<span class="sr-only">Search players or jersey numbers</span><input id="player-search" type="search" placeholder="Search players or jersey numbers" autocomplete="off"></label><label><span class="sr-only">Position group</span><select id="player-group"><option value="all">All position groups</option>${[...new Set(demo.players.map(p => p.position_group))].sort().map(g => `<option value="${escape(g)}">${escape(g)}</option>`).join('')}</select></label><label><span class="sr-only">Position</span><select id="player-position"><option value="all">All positions</option>${[...new Map(demo.players.map(p => [p.position, p.position_label || p.position]))].sort((a,b) => a[1].localeCompare(b[1])).map(([code,label]) => `<option value="${escape(code)}">${escape(code)} · ${escape(label)}</option>`).join('')}</select></label></div>
          <div class="directory-layout"><div class="roster-table-area"><div class="unit-tabs" aria-label="Filter roster by team unit" id="player-unit-tabs"></div><div class="roster-table-wrap"><table class="roster-table"><caption class="sr-only">Football players, meetings attended, and open actions. Select a player for a snapshot or open their timeline.</caption><thead><tr><th scope="col">Player</th><th scope="col">#</th><th scope="col">Position</th><th scope="col">Unit</th><th scope="col">Meetings</th><th scope="col">Open actions</th><th scope="col"><span class="sr-only">Details</span></th></tr></thead><tbody id="roster"></tbody></table></div><p id="player-results" class="directory-results" role="status"></p></div>
            <aside class="player-summary-rail"><section class="player-snapshot panel"><h3>Player snapshot</h3><div id="player-snapshot"></div></section><section class="unit-summary panel"><h3>Team units</h3><dl id="player-unit-summary"></dl></section></aside>
          </div>
        </div>
        <div id="player-detail" hidden><button class="secondary back-to-roster" id="back-to-roster">Back to players</button><div class="panel player-detail-panel"><div id="player-heading"></div><label class="sensitive-toggle"><input id="show-sensitive" type="checkbox"> Show sensitive records</label><div id="timeline"></div><div class="prep-box"><h3>Prepare for the next conversation</h3><p>Build a brief from this player's approved records.</p><button id="prep" class="secondary">Build preparation brief</button><div id="prep-text" class="prep-content" aria-live="polite"></div></div></div></div>
      </section>
      <section id="tasks" class="view" hidden>
        <div class="section-heading action-heading"><div><p class="eyebrow">A LITTLE FOLLOW-THROUGH</p><h2>Action board</h2><p class="action-caption">Find a follow-up. Open its title for the source and details.</p></div><label>Status<select id="task-filter"><option value="open">Open actions</option><option value="overdue">Overdue</option><option value="done">Completed</option><option value="all">All actions</option></select></label></div>
        <div class="panel action-board"><div class="action-filters">
          <label>Search<input id="task-search" type="search" placeholder="Action, player, jersey, or category"></label>
          <label>Player<select id="task-player"><option value="">All players</option>${demo.players.map(p => `<option value="${escape(p.id)}">#${p.number} ${escape(p.name)}</option>`).join('')}</select></label>
          <label>Category<select id="task-category"><option value="">All categories</option></select></label>
          <label>Sort by<select id="task-sort"><option value="due">Deadline · earliest first</option><option value="player">Player name</option><option value="recent">Newest meeting</option></select></label>
        </div><div class="action-results-bar"><p id="task-results" role="status"></p><button id="reset-task-filters" class="rail-link" type="button">Reset filters</button></div>
        <div class="action-table-wrap"><table class="action-table"><thead><tr><th scope="col">Action / source</th><th scope="col">Player</th><th scope="col">Category</th><th scope="col">Deadline</th><th scope="col">Status</th><th scope="col">Update</th></tr></thead><tbody id="task-list"></tbody></table></div></div>
        <label class="sensitive-toggle"><input id="show-sensitive-actions" type="checkbox"> Show sensitive actions</label><p id="task-hidden-note" class="sensitive-notice" hidden></p>
      </section>
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
const optionList = (values, selected) => values.map(v => `<option value="${escape(v)}" ${v === selected ? 'selected' : ''}>${escape(v)}</option>`).join('');
function renderReview() {
  const review = $('#review');
  const warnings = extractionWarnings.length ? `<div class="extraction-warnings" role="status"><strong>Extraction notes</strong><ul>${extractionWarnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></div>` : '';
  if (!draft.length) {
    review.innerHTML = `${warnings}<div class="empty-review"><h3>A little clarity goes a long way.</h3><p>Extract your meeting note, then check each record.<br>You can also add a record manually.</p></div><button class="secondary full" data-add-record type="button">Add record manually</button>`;
    return;
  }
  const blocked = draft.some(i => reviewIssues(i, current).length);
  highlightedDraft = Math.min(highlightedDraft, draft.length-1);
  review.innerHTML = `${warnings}<div class="review-summary"><strong>${draft.length} records to review</strong><span>${origin === 'demo' ? 'Prepared samples · not AI' : origin === 'manual' ? 'Manual records' : 'Aivana drafts · verify all fields'}</span></div><div class="review-source-preview"><strong>Original note · highlighted evidence</strong><div id="highlighted-source">${highlightSource(current.note, draft[highlightedDraft]?.quote)}</div></div><div class="draft-list">${draft.map((i,n) => {
    const issues = reviewIssues(i,current);
    const shared = i.scope === 'team' && i.player_ids?.length && i.kind !== 'action';
    return `<article class="draft-item confidence-${i.confidence || 'medium'}"><div class="draft-flags"><span class="confidence-badge ${i.confidence || 'medium'}">${escape(i.confidence || 'medium')} confidence</span>${!i.player_id && !shared ? '<span class="badge overdue">Unmatched player</span>' : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive topic</span>' : ''}${i.group_record_id ? '<span class="badge">Shared instruction</span>' : ''}</div><div class="form-row"><label>Player<select data-index="${n}" data-field="player_id"><option value="" ${!i.player_id && !shared ? 'selected' : ''}>Choose attendee…</option>${current.meeting_type === 'team' && i.kind !== 'action' ? `<option value="__team__" ${shared ? 'selected' : ''}>Whole team feedback</option>` : ''}${current.attendees.map(id => `<option value="${id}" ${id === i.player_id ? 'selected' : ''}>${escape(name(id))}</option>`).join('')}</select></label><label>Record type<select data-index="${n}" data-field="kind">${optionList(['action','praise','improvement','observation'], i.kind)}</select></label></div><label>Meeting topic<select data-index="${n}" data-field="topic">${optionList(categories.topics,i.topic)}</select></label><label>Coach's record<textarea rows="2" data-index="${n}" data-field="text" maxlength="1000">${escape(i.text)}</textarea></label><div class="form-row"><label>Football skill<select data-index="${n}" data-field="skill">${optionList(categories.skills,i.skill)}</select></label><label>Due date <small>(actions only)</small><input type="date" data-index="${n}" data-field="due_date" value="${escape(i.due_date || '')}" ${i.kind !== 'action' ? 'disabled' : ''}></label></div>${i.deadline_text ? `<p class="deadline-evidence">Original deadline: “${escape(i.deadline_text)}” · ${i.due_date ? `Resolved: ${escape(i.due_date)}` : 'No definite date — coach review needed'}</p>` : ''}<label>Verbatim source quote<textarea rows="2" data-index="${n}" data-field="quote" maxlength="2000">${escape(i.quote)}</textarea></label><button class="text-button" data-highlight="${n}" type="button">Highlight in original note</button>${i.mention ? `<p class="match-evidence">Mention: ${escape(i.mention)} · ${escape(i.match_method || 'unmatched')}</p>` : ''}${i.warnings?.length ? `<details class="draft-extraction-notes"><summary>Extraction notes</summary><ul>${i.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul></details>` : ''}<div class="record-issues" data-issues="${n}">${issues.map(issue => `<p>${escape(issue)}</p>`).join('')}</div><button class="text-button remove" data-remove="${n}" type="button">Remove record</button></article>`;
  }).join('')}</div><button class="secondary full" data-add-record type="button">Add another record</button><div class="review-footer"><label class="approval"><input id="approved" type="checkbox" ${blocked ? 'disabled' : ''}>I reviewed the player, meaning, source, deadline, and warnings for every record.</label><button id="save" class="primary full" disabled>Approve & save meeting</button></div>`;
}
function updateReviewReadiness() {
  draft.forEach((item,n) => { const el = $(`[data-issues="${n}"]`); if (el) el.innerHTML = reviewIssues(item,current).map(issue => `<p>${escape(issue)}</p>`).join(''); });
  if ($('#approved')) { $('#approved').checked = false; $('#approved').disabled = draft.some(i => reviewIssues(i,current).length); $('#save').disabled = true; }
}
function statusBadge(i) { return i.completed ? '<span class="badge completed">Complete</span>' : overdue(i) ? '<span class="badge overdue">Overdue</span>' : `<span class="badge ${i.kind}">${i.kind === 'action' ? 'Open action' : i.kind}</span>`; }
function recordMarkup(i, m, showSensitive = false) {
  const sourceNote = m.items.some(item => item.sensitive) && !showSensitive ? 'Full note contains sensitive content. Enable sensitive records to view it; the supporting excerpt is shown above.' : m.note;
  return `<article class="record"><div class="record-top">${statusBadge(i)}<span>${escape(i.skill)}</span>${i.topic ? `<span class="record-topic">${escape(i.topic)}</span>` : ''}${i.sensitive ? '<span class="badge sensitive">Sensitive</span>' : ''}${m.id.startsWith('m-seed-') ? '<span class="badge">Earlier practice pack</span>' : ''}</div><h4>${escape(i.text)}</h4><p class="record-meta">${i.player_ids?.length ? 'Whole team' : escape(name(i.player_id))} · ${escape(m.date)}${i.due_date ? ` · Due ${escape(i.due_date)}` : ''}</p><details><summary>Source meeting note</summary><blockquote>${escape(i.quote)}</blockquote><p>${escape(sourceNote)}</p></details>${i.kind === 'action' ? `<button class="secondary compact" data-meeting="${escape(m.id)}" data-item="${escape(i.id)}">${i.completed?'Reopen action':'Mark complete'}</button>` : ''}</article>`;
}
const initials = (p) => p.name.split(' ').map(part => part[0]).slice(0,2).join('');
function renderPlayerDirectory() {
  const summaries = summarizePlayers(demo.players, meetings, today());
  const visible = filterPlayers(summaries, {search: $('#player-search').value, unit: playerUnitFilter, group: $('#player-group').value, position: $('#player-position').value});
  if (!playerDetailOpen && visible.length && !visible.some(p => p.id === selectedPlayer)) selectedPlayer = visible[0].id;
  const count = (unit) => unit === 'all' ? summaries.length : summaries.filter(p => p.unit === unit).length;
  $('#player-unit-tabs').innerHTML = ['all','Offense','Defense','Special Teams'].map(unit => `<button type="button" data-player-unit="${unit}" aria-pressed="${unit === playerUnitFilter}">${unit === 'all' ? 'All' : unit}<span>${count(unit)}</span></button>`).join('');
  $('#roster').innerHTML = visible.map(p => `<tr data-select-player="${p.id}" class="${p.id === selectedPlayer ? 'selected' : ''}"><th scope="row"><button class="table-player" data-select-player="${p.id}" aria-pressed="${p.id === selectedPlayer}"><span class="initial-avatar">${escape(initials(p))}</span><span>${escape(p.name)}</span></button></th><td>${p.number}</td><td><abbr title="${escape(p.position_label || p.position)}">${escape(p.position)}</abbr></td><td><span class="unit-badge ${p.unit === 'Offense' ? 'offense' : p.unit === 'Defense' ? 'defense' : 'special'}">${escape(p.unit)}</span></td><td>${p.meetingCount} <span class="cell-detail">meeting${p.meetingCount === 1 ? '' : 's'}</span></td><td><span class="action-count ${p.openCount ? 'has-actions' : ''}">${p.openCount} open</span></td><td><button class="row-details" data-player="${p.id}" aria-label="View ${escape(p.name)}'s timeline">View</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No matching players. Try another name, jersey number, or filter.</td></tr>';
  $('#player-results').textContent = `Showing ${visible.length} of ${summaries.length} players. Select a row for a snapshot; View opens the full timeline.`;
  const selected = visible.length ? summaries.find(p => p.id === selectedPlayer) : null;
  $('#player-snapshot').innerHTML = selected ? `<div class="snapshot-profile"><span class="initial-avatar large">${escape(initials(selected))}</span><div><h4>${escape(selected.name)}</h4><p>#${selected.number} · ${escape(selected.position_label || selected.position)}</p></div></div><dl class="snapshot-stats"><div><dt>Meetings attended</dt><dd>${selected.meetingCount}</dd></div><div><dt>Open actions</dt><dd>${selected.openCount}</dd></div><div><dt>Overdue</dt><dd class="${selected.overdueCount ? 'overdue-number' : ''}">${selected.overdueCount}</dd></div></dl><div class="snapshot-followup"><h4>Latest reviewed record</h4>${selected.latest ? `<p><time>${escape(selected.latest.meeting.date)}</time> · ${escape(selected.latest.text)}</p>` : '<p>No non-sensitive reviewed record to preview. Open the timeline to review available records.</p>'}</div><button class="snapshot-link" data-player="${selected.id}">View timeline</button>` : '<p class="empty">No player matches these filters.</p>';
  $('#player-unit-summary').innerHTML = ['Offense','Defense','Special Teams'].map(unit => `<div><dt>${unit}</dt><dd>${count(unit)}</dd></div>`).join('') + `<div class="total"><dt>Total</dt><dd>${summaries.length}</dd></div>`;
  $('#player-directory').hidden = playerDetailOpen;
  $('#player-detail').hidden = !playerDetailOpen;
}
function openPlayerTimeline(id) {
  if (id !== selectedPlayer) $('#show-sensitive').checked = false;
  selectedPlayer = id; playerDetailOpen = true; cancelPrep(); render(); switchView('players');
  $('#player-heading').tabIndex = -1; $('#player-heading').focus({preventScroll:true});
  $('#player-heading').scrollIntoView({block:'start', behavior:'instant'});
}
$('#back-to-roster').addEventListener('click', () => {
  playerDetailOpen = false; cancelPrep(); render(); $('#players-title').focus({preventScroll:true});
  $('#players-title').scrollIntoView({block:'start', behavior:'instant'});
});
$('#player-search').addEventListener('input', renderPlayerDirectory);
$('#player-group').addEventListener('change', renderPlayerDirectory);
$('#player-position').addEventListener('change', renderPlayerDirectory);
$('#player-unit-tabs').addEventListener('click', e => {
  const tab = e.target.closest('[data-player-unit]');
  if (tab) { playerUnitFilter = tab.dataset.playerUnit; renderPlayerDirectory(); if (e.detail === 0) $(`[data-player-unit="${playerUnitFilter}"]`).focus({preventScroll:true}); }
});

function render() {
  const all = items(), actions = all.filter(i => i.kind === 'action'), open = actions.filter(i => !i.completed);
  $('#meeting-count').textContent = meetings.length; $('#open-count').textContent = open.length; $('#overdue-count').textContent = open.filter(overdue).length;
  $('#players-count').textContent = new Set(meetings.flatMap(m => m.attendees)).size; $('#nav-count').textContent = open.length;
  $('#clock-note').textContent = `As of ${today()}`;
  $('#extract').textContent = mode === 'demo' ? 'Extract sample records' : 'Extract with Aivana';
  $('#extract').disabled = busy || !connected;
  $('#recent').innerHTML = [...meetings].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5).map(m => `<button class="meeting-row" data-open-player="${escape(m.attendees[0])}"><span class="meeting-date">${icon('note')}</span><span class="meeting-title"><strong>${escape(m.title)}</strong><small>${escape(m.date)} · ${m.items.length} records</small></span><span class="badge">${m.origin === 'demo' ? 'Demo fixture' : 'Reviewed'}</span></button>`).join('') || '<div class="panel empty">No meetings yet. Save your first reviewed extraction.</div>';
  renderPlayerDirectory();
  renderPlanning();
  renderOverview();
  const p = player(selectedPlayer);
  $('#player-heading').innerHTML = `<div class="player-profile"><span class="avatar large">${p.number}</span><div><p class="eyebrow">${escape(positionLabel(p))}</p><h2>${escape(p.name)}</h2><p>Approved feedback and follow-up, in context.</p></div></div>`;
  const playerRecords = all.filter(i => appliesTo(i, selectedPlayer));
  const hiddenCount = playerRecords.filter(i => i.sensitive && !$('#show-sensitive').checked).length;
  const history = playerRecords.filter(i => !i.sensitive || $('#show-sensitive').checked).sort((a,b) => b.meeting.date.localeCompare(a.meeting.date));
  $('#timeline').innerHTML = (hiddenCount ? `<p class="sensitive-notice">${hiddenCount} sensitive record${hiddenCount === 1 ? '' : 's'} hidden.</p>` : '') + (history.map(i => recordMarkup(i,i.meeting,$('#show-sensitive').checked)).join('') || (hiddenCount ? '<div class="empty">Enable sensitive records above to review the hidden entries.</div>' : '<div class="empty">No reviewed records yet. Save a meeting for this player to start their timeline.</div>'));
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
  $('#task-hidden-note').textContent = `${hiddenActions} sensitive action${hiddenActions === 1 ? '' : 's'} hidden in this view.`;
  $('#task-results').textContent = `${filtered.length} action${filtered.length === 1 ? '' : 's'} shown · ${available.filter(i => !i.completed).length} open · ${available.filter(overdue).length} overdue`;
  $('#task-list').innerHTML = filtered.map(i => {
    const m = i.meeting;
    const sourceNote = m.items.some(item => item.sensitive) && !options.showSensitive ? 'Full note contains sensitive content. Enable sensitive actions to view it.' : m.note;
    const ids = i.player_ids?.length ? i.player_ids : [i.player_id];
    return `<tr><td class="action-description"><details><summary>${escape(i.text)}</summary><div class="action-source"><strong>${escape(m.title)}</strong><p>Meeting: ${escape(m.date)}${m.id.startsWith('m-seed-') ? ' · Earlier practice pack' : ''}</p><blockquote>${escape(i.quote)}</blockquote><details><summary>Full meeting note</summary><p class="action-note">${escape(sourceNote)}</p></details></div></details>${i.sensitive ? '<span class="badge sensitive">Sensitive</span>' : ''}</td><td><div class="action-players">${ids.map(id => `<button class="action-player-link" data-player="${escape(id)}">${escape(name(id))}<small>#${escape(player(id)?.number ?? '')} · ${escape(player(id)?.position ?? '')}</small></button>`).join('')}</div></td><td><span class="action-category">${escape(i.skill || 'Uncategorized')}</span>${i.topic && i.topic !== i.skill ? `<small class="action-topic">${escape(i.topic)}</small>` : ''}</td><td class="action-deadline ${overdue(i) ? 'late' : ''}">${i.due_date ? `<time datetime="${escape(i.due_date)}">${escape(new Date(i.due_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}</time>${i.due_date === today() && !i.completed ? '<small>Today</small>' : ''}` : '<span class="undated">No deadline</span>'}</td><td>${statusBadge(i)}</td><td><button class="secondary compact" data-meeting="${escape(m.id)}" data-item="${escape(i.id)}" aria-label="${i.completed ? 'Reopen' : 'Complete'} action: ${escape(i.text)}" ${busy ? 'disabled' : ''}>${i.completed ? 'Reopen' : 'Complete'}</button></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="empty">No matching actions. Try another search or reset the filters.</td></tr>';
}
function switchView(next) {
  view = next;
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== view);
  document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
}
function cancelPrep() { prepSource?.close(); prepSource = null; $('#prep').disabled = false; $('#prep-text').textContent = ''; }

let calendarMonth = today().slice(0, 7), selectedCalendarDate = null;
function renderOverview() {
  $('#overview-recent-count').textContent = meetings.length ? `Latest ${Math.min(meetings.length,5)} of ${meetings.length} saved` : 'Your approved notes appear here';
  const individual = new Set(meetings.filter(m => m.meeting_type === 'individual').flatMap(m => m.attendees));
  const reached = demo.players.filter(p => individual.has(p.id)).length;
  const remaining = demo.players.length - reached;
  $('#overview-checkins').innerHTML = `<div class="checkin-summary"><strong>${reached}<span> / ${demo.players.length}</span></strong><p>players have a saved one-on-one conversation.</p></div><progress max="${demo.players.length}" value="${reached}" aria-label="Players with a saved individual meeting">${reached} of ${demo.players.length}</progress><p class="checkin-remaining">${remaining} player${remaining === 1 ? '' : 's'} without a saved individual check-in. Group and team meetings are counted separately.</p>`;
  $('#overview-meeting-types').innerHTML = [['individual','One-on-one'],['group','Group'],['team','Full team']].map(([type,label]) => `<button data-view="meetings"><span>${icon(type === 'individual' ? 'user' : 'people')}${label}</span><strong>${meetings.filter(m => m.meeting_type === type).length}</strong></button>`).join('');
}
function renderPlanning() {
  const [year, month] = calendarMonth.split('-').map(Number);
  const start = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  $('#calendar-title').textContent = new Date(year, month - 1, 1).toLocaleDateString('en-US', {month:'long', year:'numeric'});
  const meetingDates = new Set(meetings.map(m => m.date));
  const deadlines = new Set(items().filter(i => i.kind === 'action' && !i.completed && i.due_date).map(i => i.due_date));
  $('#calendar').innerHTML = ['Su','Mo','Tu','We','Th','Fr','Sa'].map(day => `<span class="weekday">${day}</span>`).join('') + '<span aria-hidden="true"></span>'.repeat(start) + Array.from({length:days}, (_, i) => {
    const date = `${calendarMonth}-${String(i+1).padStart(2,'0')}`;
    const hasMeeting = meetingDates.has(date), hasDeadline = deadlines.has(date);
    return `<button type="button" class="calendar-day ${date === today() ? 'today' : ''} ${date === selectedCalendarDate ? 'selected-day' : ''} ${hasMeeting ? 'has-meeting' : ''} ${hasDeadline ? 'has-deadline' : ''}" data-calendar-date="${date}" aria-pressed="${date === selectedCalendarDate}" ${date === today() ? 'aria-current="date"' : ''} aria-label="${date}${hasMeeting ? ', saved meeting' : ''}${hasDeadline ? ', action due' : ''}">${i+1}<span class="day-markers" aria-hidden="true">${hasMeeting ? '<i></i>' : ''}${hasDeadline ? '<i class="deadline-dot"></i>' : ''}</span></button>`;
  }).join('');
  const agenda = $('#calendar-activities');
  agenda.hidden = !selectedCalendarDate;
  if (selectedCalendarDate) {
    const activity = activityForDate(meetings,selectedCalendarDate);
    const label = new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    const meetingRows = activity.meetings.map(m => `<details class="date-meeting"><summary><strong>${escape(m.title)}</strong><small>${escape(m.meeting_type)} · ${m.attendees.length} attendees · ${m.items.length} records</small></summary>${m.items.some(i => i.sensitive) ? '<p>Full note contains sensitive content. Open the player timeline and enable sensitive records to review it.</p>' : `<p>${escape(m.note)}</p>`}</details>`).join('');
    const actionRows = activity.actions.map(i => `<button class="date-action" data-player="${escape(i.player_id)}"><span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small></span><em class="${i.completed ? 'done' : overdue(i) ? 'late' : ''}">${i.completed ? 'Complete' : overdue(i) ? 'Overdue' : 'Open'}</em></button>`).join('');
    agenda.innerHTML = `<div class="date-agenda-heading"><h3>${label}</h3><button class="icon-button" data-clear-calendar aria-label="Close date activities">×</button></div>${meetingRows ? `<h4>Meetings · ${activity.meetings.length}</h4>${meetingRows}` : '<p class="date-empty">No meetings saved on this date.</p>'}${actionRows ? `<h4>Actions due · ${activity.actions.length}</h4>${actionRows}` : '<p class="date-empty">No visible actions due on this date.</p>'}${activity.hiddenActionCount ? `<p class="date-empty">${activity.hiddenActionCount} sensitive action${activity.hiddenActionCount === 1 ? '' : 's'} hidden. Review them in the action board.</p>` : ''}`;
  }
  const pending = items().filter(i => i.kind === 'action' && !i.completed && !i.sensitive && overdue(i)).sort((a,b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0,3);
  const upcoming = upcomingActions(meetings,today());
  $('#upcoming-list').innerHTML = upcoming.map(i => `<button class="upcoming-item" data-player="${escape(i.player_id)}"><span class="upcoming-date">${i.due_date === today() ? 'Today' : new Date(`${i.due_date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span><span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small></span></button>`).join('') || '<p class="radar-empty">No upcoming dated actions. Approved tasks with future deadlines will appear here.</p>';
  $('#radar-list').innerHTML = pending.map(i => `<button class="radar-item" data-player="${escape(i.player_id)}">${icon(overdue(i) ? 'check' : 'people')}<span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small><em>${i.due_date ? `Due ${escape(i.due_date)}${overdue(i) ? ' · Overdue' : ''}` : 'No deadline set'}</em></span>${icon('chevron')}</button>`).join('') || (items().some(i => i.kind === 'action' && !i.completed && i.sensitive && overdue(i)) ? '<p class="radar-empty">Sensitive overdue actions are hidden here. Open the action board to review them.</p>' : '<p class="radar-empty">No overdue actions. Future deadlines appear in Upcoming.</p>');
}
function newMeeting() {
  if (busy) return;
  current = {title:'', date:today(), meeting_type:'individual', attendees:[], note:''};
  draft = []; extractionId = null; extractionWarnings = []; $('#title').value = ''; $('#date').value = current.date; $('#meeting-type').value = 'individual'; $('#note').value = '';
  $('#sample').selectedIndex = -1;
  document.querySelectorAll('[name="attendee"]').forEach(el => el.checked = false);
  updateAttendeeSummary(); $('.attendee-picker').open = true;
  renderReview(); switchView('meetings'); $('#title').focus();
  notify('New meeting ready. Choose attendees and add your synthetic notes. Use live mode to extract custom notes.');
}
$('#new-meeting').addEventListener('click', newMeeting);
for (const [id, offset] of [['calendar-prev', -1], ['calendar-next', 1]]) {
  $(`#${id}`).addEventListener('click', () => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    calendarMonth = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
    selectedCalendarDate = null; renderPlanning();
  });
}
$('#calendar').addEventListener('click', e => {
  const day = e.target.closest('[data-calendar-date]');
  if (!day) return;
  selectedCalendarDate = day.dataset.calendarDate;
  renderPlanning();
  if (e.detail === 0) $(`[data-calendar-date="${selectedCalendarDate}"]`)?.focus({preventScroll:true});
});
$('#calendar-activities').addEventListener('click', e => {
  if (e.target.closest('[data-clear-calendar]')) { selectedCalendarDate = null; renderPlanning(); }
});

$('#sample').addEventListener('change', e => { loadSample(e.target.value); notify('Sample loaded. Extract it to review the records.'); });
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
    const meeting = capture(); validMeeting(meeting); busy = true; $('#extract').disabled = true; $('#extract').textContent = 'Extracting…'; notify('');
    $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = true); $('#sample').disabled = true; $('#mode').disabled = true;
    const result = await api('/extract', {...meeting,mode});
    draft = result.items.sort((a,b) => reviewPriority(a)-reviewPriority(b)); origin = result.origin;
    extractionId = result.extraction_id; extractionWarnings = result.warnings || []; highlightedDraft = 0;
    renderReview(); notify(draft.length ? 'Review every extracted record before saving.' : 'No records were extracted. Revise the note and try again.');
  } catch (error) { notify(error.message, true); }
  finally { busy = false; $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = false); $('#sample').disabled = false; $('#mode').disabled = false; $('#extract').disabled = false; render(); }
});
$('#review').addEventListener('input', e => {
  if (e.target.id === 'approved') { $('#save').disabled = !e.target.checked; return; }
  if (e.target.dataset.field) {
    const field = e.target.dataset.field, i = draft[Number(e.target.dataset.index)];
    if (field === 'player_id' && e.target.value === '__team__') { i.player_id = null; i.scope = 'team'; i.player_ids = [...current.attendees]; }
    else { i[field] = e.target.value || null; if (field === 'player_id') { i.scope = 'player'; delete i.player_ids; } }
    if (field === 'topic') i.sensitive = ['Health & Injury Follow-up','Insurance & Administration'].includes(i.topic);
    if (field === 'kind' && i.kind !== 'action') i.due_date = null;
    if (field === 'kind' && i.kind === 'action' && i.player_ids) { i.player_id = null; delete i.player_ids; i.scope = 'player'; }
    if (['kind','player_id','topic'].includes(field)) renderReview();
    if (field === 'quote') $('#highlighted-source').innerHTML = highlightSource(current.note,i.quote);
    updateReviewReadiness();
  }
});
$('#review').addEventListener('click', async e => {
  const add = e.target.closest('[data-add-record]');
  if (add && !busy) {
    try { capture(); validMeeting(current); } catch (error) { notify(error.message,true); return; }
    if (!draft.length && !extractionId) origin = 'manual';
    draft.unshift({id:crypto.randomUUID(), schema_version:2, player_id:null, scope:'player', kind:'action', text:'', topic:'Other', skill:'Not Specified', quote:'', due_date:null, deadline_text:null, confidence:'low', mention:'', match_method:'unmatched', sensitive:false, warnings:[]});
    highlightedDraft = 0; renderReview(); return;
  }
  const highlight = e.target.closest('[data-highlight]');
  if (highlight) { highlightedDraft = Number(highlight.dataset.highlight); $('#highlighted-source').innerHTML = highlightSource(current.note,draft[highlightedDraft].quote); return; }
  const remove = e.target.closest('[data-remove]');
  if (remove) { draft.splice(Number(remove.dataset.remove),1); renderReview(); return; }
  if (e.target.id !== 'save' || !$('#approved')?.checked || busy) return;
  try {
    validMeeting(current);
    if (draft.some(i => reviewIssues(i,current).length)) throw Error('Correct the highlighted record issues before approval.');
    const body = {...clone(current), approved:true, origin, extraction_id:extractionId, items:clone(draft)};
    busy = true; e.target.disabled = true;
    const meeting = await api('/meetings',body);
    meetings.unshift(meeting);
    draft = []; extractionId = null; extractionWarnings = []; renderReview(); cancelPrep(); render(); notify('Meeting approved and saved. Its records are now in player timelines and the action board.');
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
  const action = e.target.closest('[data-item]');
  if (action && !busy) {
    try {
      action.disabled = true; busy = true;
      const meeting = meetings.find(m => m.id === action.dataset.meeting), item = meeting.items.find(i => i.id === action.dataset.item);
      const updated = await api(`/meetings/${encodeURIComponent(meeting.id)}/items/${encodeURIComponent(item.id)}`,{completed:!item.completed},'PATCH');
      meetings = meetings.map(m => m.id === updated.id ? updated : m);
      cancelPrep(); render(); notify('Action status updated.');
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
  const url = new URL(window.location.href); url.searchParams.set('mode', mode);
  window.history.replaceState(null, '', url);
  draft = []; extractionId = null; extractionWarnings = []; cancelPrep(); renderReview(); render();
  if (!connected) { initializeNotebook(); return; }
  showModeAlert(`${mode === 'demo' ? 'Demo' : 'Live'} extraction enabled. Saved records unchanged.`);
});
$('#prep').addEventListener('click', () => {
  cancelPrep();
  const records = items().filter(i => appliesTo(i,selectedPlayer) && !i.sensitive);
  if (!records.length) { notify('No non-sensitive approved records are available for this player.',true); return; }
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
loadSample('individual'); $('#mode').value = mode; render(); switchView('desk');
async function initializeNotebook() {
  busy = true; $('#mode').disabled = true; render();
  notify('Loading the shared SQLite notebook…');
  try {
    let storage;
    try { storage = window.localStorage; } catch { /* SQLite works without browser storage. */ }
    const result = await loadSharedNotebook(api, storage);
    meetings = result.meetings; connected = true;
    const missingKey = mode === 'live' && !result.status.aivana_configured;
    notify(result.migrationError || (missingKey ? 'Notebook loaded. Configure backend/.env before live extraction; Demo needs no Aivana key.' : 'Notebook connected. Demo and Live share the same saved records.'), Boolean(result.migrationError || missingKey));
  } catch (error) { notify(error.message, true); }
  finally { busy = false; $('#mode').disabled = false; render(); }
}
initializeNotebook();
