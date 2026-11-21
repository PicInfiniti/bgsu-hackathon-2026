import './styles.scss';
import './workspace.scss';
import demo from '../../data/demo.json';
import { extractDemo } from './demo-extraction.js';
import { workspaceMode } from './access.js';
import { loadSharedNotebook } from './shared-notebook.js';

const $ = (s) => document.querySelector(s);
const escape = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (x) => structuredClone(x);
let meetings = [];
let mode = workspaceMode(window.location.search), view = 'desk', draft = [], origin = 'demo', selectedPlayer = 'p01', busy = false, connected = false, prepSource = null;
let current = clone(demo.samples[0]);
const player = (id) => demo.players.find(p => p.id === id);
const name = (id) => player(id)?.name ?? 'Unknown player';
const today = () => new Date().toLocaleDateString('en-CA');
const overdue = (x) => x.kind === 'action' && !x.completed && x.due_date && x.due_date < today();
const items = () => meetings.flatMap(m => m.items.map(i => ({...i, meeting:m})));


const icon = (name) => {
  const paths = {
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
    <div class="workspace-label">THE COACH'S NOTEBOOK</div>
    <nav aria-label="Main navigation">
      <button data-view="desk" class="active">${icon('home')} Overview</button>
      <button data-view="players">${icon('people')} Players</button>
      <button data-view="tasks">${icon('check')} Actions <b id="nav-count"></b></button>
    </nav>
    <div class="sidebar-note">A good conversation<br>is just the beginning.<span>Make the follow-up count.</span></div>
    <div class="sidebar-bottom"><span class="team-avatar">pi</span><div>picInfiniti<small>Coach Meeting Tracker</small></div></div>
  </aside>
  <div class="shell">
    <header class="topbar"><div><h1>Your coaching workspace</h1><p>A place for every conversation. A plan for what comes next.</p></div><div class="header-actions"><button class="primary" id="new-meeting">${icon('plus')} New meeting</button><a class="profile-link" href="/login" aria-label="Open coach sign-in preview">${icon('user')}</a></div></header>
    <main>
      <div class="workspace-toolbar"><span class="workspace-date">${icon('note')} Your notebook, at a glance</span><label class="mode-control">Extraction <select id="mode"><option value="demo">Demo · prepared samples</option><option value="live">Live · Aivana</option></select></label></div>
      <div id="mode-note" class="notice"></div>
      <div id="message" role="status" aria-live="polite" hidden></div>
      <section id="desk" class="view">
        <div class="notebook-layout">
          <aside class="notebook-rail" aria-label="Notebook navigation">
            <div class="section-heading"><h2>My notebooks</h2><button class="icon-button" data-new-meeting aria-label="Start a new meeting">${icon('plus')}</button></div>
            <div class="notebook-list">
              <button class="notebook-card selected" data-view="desk">${icon('note')}<span><strong>Meeting notes</strong><small>Capture & review</small></span>${icon('chevron')}</button>
              <button class="notebook-card" data-view="players">${icon('people')}<span><strong>Player records</strong><small>${demo.players.length} fictional players</small></span>${icon('chevron')}</button>
              <button class="notebook-card" data-view="tasks">${icon('check')}<span><strong>Follow-up actions</strong><small>Keep the next step clear</small></span>${icon('chevron')}</button>
            </div>
            <div id="recent-heading" class="section-heading recent-heading"><h2>Recent conversations</h2></div><div id="recent" class="recent-list"></div>
            <button class="rail-link" data-view="players">Browse player timelines</button>
          </aside>
          <div class="meeting-notebook">
            <div class="notebook-tabs" aria-label="Meeting workflow"><a href="#meeting-form" class="selected">${icon('note')} Meeting note</a><a href="#review-panel">${icon('check')} Review & approve</a></div>
            <div class="notebook-caption">${icon('people')} Coach-reviewed notes. Context that stays with the player.</div>
            <form id="meeting-form" class="panel note-panel">
              <label class="title-label"><span>Meeting title</span><input id="title" maxlength="160" placeholder="Give this conversation a title" required></label>
              <div class="form-row meeting-meta"><label>Date<input id="date" type="date" required></label><label>Meeting type<select id="meeting-type"><option value="individual">Individual</option><option value="group">Group</option><option value="team">Full team</option></select></label></div>
              <label class="sample-control">Start with a sample<select id="sample">${demo.samples.map(s => `<option value="${s.id}">${escape(s.label)}</option>`).join('')}</select></label>
              <details class="attendee-picker"><summary id="attendee-summary">Meeting attendees</summary><fieldset><legend class="sr-only">Attendees</legend><div id="attendees" class="attendees"></div></fieldset></details>
              <label class="note-label">The conversation<textarea id="note" rows="8" maxlength="12000" placeholder="What did you discuss? Add the player's name, feedback, next steps, and any deadlines…" required></textarea></label>
              <details class="writing-help"><summary>Tips for a useful meeting note</summary><p>Synthetic notes only. Record what the coach said; avoid assumptions about character or attitude. For long team notes, extract short sections with a few assignments each. Keep the date, attendees, and attribution context; review and save each section separately. Shorten truncated extractions before retrying.</p></details>
              <div class="editor-footer"><span>${icon('note')} Original notes stay attached.</span><button class="primary" id="extract" type="submit">Extract sample records</button></div>
            </form>
            <section id="review-panel" class="panel review-panel"><div class="panel-heading">${icon('check')}<div><h3>A second look, before you save.</h3><p>Check the player, the meaning, and the next step.</p></div></div><div id="review"></div></section>
          </div>
          <aside class="planning-rail" aria-label="Calendar and follow-up overview">
            <section class="calendar-panel panel"><div class="calendar-heading"><h2 id="calendar-title"></h2><div><button class="icon-button" id="calendar-prev" aria-label="Previous month">${icon('chevron')}</button><button class="icon-button" id="calendar-next" aria-label="Next month">${icon('chevron')}</button></div></div><p class="calendar-caption">Saved conversations & action deadlines</p><div class="calendar-grid" id="calendar"></div><div class="calendar-key"><span>Meeting</span><span>Action due</span></div></section>
            <section class="followup-panel panel"><div class="section-heading"><h2>On your radar</h2>${icon('check')}</div><div id="radar-list"></div><button class="rail-link" data-view="tasks">View all actions</button></section>
            <section class="stats" aria-label="Workspace summary"><a href="#recent-heading" data-stat="meetings"><strong id="meeting-count">0</strong><span>Saved meetings</span><small>Reviewed conversations</small></a><a href="#tasks" data-stat="open"><strong id="open-count">0</strong><span>Open actions</span><small>Ready to follow up</small></a><a href="#tasks" data-stat="overdue" class="urgent"><strong id="overdue-count">0</strong><span>Needs follow-up</span><small id="clock-note"></small></a><a href="#players" data-stat="players"><strong id="players-count">0</strong><span>Players reached</span><small>Of ${demo.players.length} fictional players</small></a></section>
          </aside>
        </div>
      </section>
      <section id="players" class="view" hidden><div class="section-heading"><div><p class="eyebrow">THE PLAYER NOTEBOOK</p><h2>Player timelines</h2></div></div><div class="player-layout"><div class="panel roster" id="roster"></div><div class="panel"><div id="player-heading"></div><div id="timeline"></div><div class="prep-box"><h3>Prepare for the next conversation</h3><p>Build a brief from this player's approved records.</p><button id="prep" class="secondary">Build preparation brief</button><pre id="prep-text" aria-live="polite"></pre></div></div></div></section>
      <section id="tasks" class="view" hidden><div class="section-heading"><div><p class="eyebrow">A LITTLE FOLLOW-THROUGH</p><h2>Action board</h2></div><label>Show <select id="task-filter"><option value="open">Open actions</option><option value="overdue">Overdue</option><option value="done">Completed</option><option value="all">All actions</option></select></label></div><div id="task-list"></div></section>
      <footer><span>FALCON FOLLOW-UP <b> / </b> picInfiniti</span><span>Every conversation deserves a next step. · Synthetic data only</span></footer>
    </main>
  </div>`;

function notify(text, error = false) {
  $('#message').hidden = !text; $('#message').textContent = text; $('#message').className = error ? 'error' : 'success';
}
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
  current = clone(demo.samples.find(x => x.id === id)); draft = [];
  $('#title').value = current.title; $('#date').value = current.date; $('#meeting-type').value = current.meeting_type; $('#note').value = current.note;
  $('#attendees').innerHTML = demo.players.map(p => `<label class="attendee"><input name="attendee" type="checkbox" value="${p.id}" ${current.attendees.includes(p.id) ? 'checked' : ''}><span>${escape(p.name.split(' ')[0])}</span></label>`).join('');
  updateAttendeeSummary();
  renderReview();
}
function invalidate() { draft = []; renderReview(); }
function renderReview() {
  const review = $('#review');
  if (!draft.length) {
    review.innerHTML = `<div class="empty-review"><div class="paper-icon" aria-hidden="true">✓</div><h3>A little clarity goes a long way.</h3><p>Extract your meeting note, then review the actions,<br>praise, and areas for improvement here.</p><div class="legend"><span>Action items</span><span>Praise</span><span>Improvement</span></div></div>`;
    return;
  }
  review.innerHTML = `<div class="review-summary"><strong>${draft.length} records to review</strong><span>${origin === 'demo' ? 'Sample fixture · not AI output' : 'Aivana extraction · check every item'}</span></div><div class="draft-list">${draft.map((i,n) => `
    <article class="draft-item"><div class="form-row"><label>Player<select data-index="${n}" data-field="player_id">${current.attendees.map(id => `<option value="${id}" ${id === i.player_id ? 'selected':''}>${escape(name(id))}</option>`).join('')}</select></label><label>Record type<select data-index="${n}" data-field="kind">${['action','praise','improvement'].map(k => `<option ${i.kind===k?'selected':''} value="${k}">${k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select></label></div>
    <label>Coach's record<textarea rows="2" data-index="${n}" data-field="text" maxlength="1000">${escape(i.text)}</textarea></label>
    <div class="form-row"><label>Skill area<input data-index="${n}" data-field="skill" maxlength="100" value="${escape(i.skill)}"></label><label>Due date <small>(actions only)</small><input type="date" data-index="${n}" data-field="due_date" value="${escape(i.due_date || '')}" ${i.kind !== 'action' ? 'disabled' : ''}></label></div>
    <div class="source"><span>SOURCE NOTE</span><blockquote>${escape(i.quote)}</blockquote></div><button class="text-button remove" data-remove="${n}" type="button">Remove record</button></article>`).join('')}</div>
    <div class="review-footer"><label class="approval"><input id="approved" type="checkbox">I reviewed the player, meaning, source, and deadline of every record.</label><button id="save" class="primary full" disabled>Approve & save meeting</button></div>`;
}
function statusBadge(i) { return i.completed ? '<span class="badge completed">Complete</span>' : overdue(i) ? '<span class="badge overdue">Overdue</span>' : `<span class="badge ${i.kind}">${i.kind === 'action' ? 'Open action' : i.kind}</span>`; }
function recordMarkup(i, m) {
  return `<article class="record"><div class="record-top">${statusBadge(i)}<span>${escape(i.skill)}</span></div><h4>${escape(i.text)}</h4><p class="record-meta">${escape(name(i.player_id))} · ${escape(m.date)}${i.due_date ? ` · Due ${escape(i.due_date)}` : ''}</p><details><summary>Source meeting note</summary><blockquote>${escape(i.quote)}</blockquote><p>${escape(m.note)}</p></details>${i.kind === 'action' ? `<button class="secondary compact" data-meeting="${escape(m.id)}" data-item="${escape(i.id)}">${i.completed?'Reopen action':'Mark complete'}</button>` : ''}</article>`;
}
function render() {
  const all = items(), actions = all.filter(i => i.kind === 'action'), open = actions.filter(i => !i.completed);
  $('#meeting-count').textContent = meetings.length; $('#open-count').textContent = open.length; $('#overdue-count').textContent = open.filter(overdue).length;
  $('#players-count').textContent = new Set(meetings.flatMap(m => m.attendees)).size; $('#nav-count').textContent = open.length;
  $('#clock-note').textContent = `As of ${today()}`;
  $('#mode-note').textContent = mode === 'demo' ? 'DEMO EXTRACTION · Prepared samples, no AI calls. Uses the same SQLite notebook and practice data pack as Live. New records require your approval.' : 'LIVE EXTRACTION · Aivana reads your notes. Uses the same SQLite notebook and practice data pack as Demo. New records require your approval.';
  $('#extract').textContent = mode === 'demo' ? 'Extract sample records' : 'Extract with Aivana';
  $('#extract').disabled = busy || !connected;
  $('#recent').innerHTML = [...meetings].sort((a,b) => b.date.localeCompare(a.date)).map(m => `<button class="meeting-row" data-open-player="${escape(m.attendees[0])}"><span class="meeting-date">${icon('note')}</span><span class="meeting-title"><strong>${escape(m.title)}</strong><small>${escape(m.date)} · ${m.items.length} records</small></span><span class="badge">${m.origin === 'demo' ? 'Demo fixture' : 'Reviewed'}</span></button>`).join('') || '<div class="panel empty">No meetings yet. Save your first reviewed extraction.</div>';
  $('#roster').innerHTML = `<p class="eyebrow">FICTIONAL TEAM ROSTER</p>${demo.players.map(p => `<button data-player="${p.id}" class="player-row ${p.id === selectedPlayer ? 'selected':''}"><span class="avatar">${p.number}</span><span><strong>${escape(p.name)}</strong><small>${escape(p.position)}</small></span></button>`).join('')}`;
  renderPlanning();
  const p = player(selectedPlayer);
  $('#player-heading').innerHTML = `<div class="player-profile"><span class="avatar large">${p.number}</span><div><p class="eyebrow">${escape(p.position)}</p><h2>${escape(p.name)}</h2><p>Approved feedback and follow-up, in context.</p></div></div>`;
  const history = all.filter(i => i.player_id === selectedPlayer).sort((a,b) => b.meeting.date.localeCompare(a.meeting.date));
  $('#timeline').innerHTML = history.map(i => recordMarkup(i,i.meeting)).join('') || '<div class="empty">No reviewed records yet. Save a meeting for this player to start their timeline.</div>';
  const filter = $('#task-filter').value;
  const filtered = actions.filter(i => filter === 'all' || (filter === 'open' && !i.completed) || (filter === 'done' && i.completed) || (filter === 'overdue' && overdue(i))).sort((a,b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  $('#task-list').innerHTML = filtered.map(i => recordMarkup(i,i.meeting)).join('') || '<div class="panel empty">No actions in this view.</div>';
}
function switchView(next) {
  view = next;
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== view);
  document.querySelectorAll('[data-view]').forEach(el => { el.classList.toggle('active', el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
}
function cancelPrep() { prepSource?.close(); prepSource = null; $('#prep').disabled = false; $('#prep-text').textContent = ''; }

let calendarMonth = today().slice(0, 7);
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
    return `<button type="button" class="calendar-day ${date === today() ? 'today' : ''} ${hasMeeting ? 'has-meeting' : ''} ${hasDeadline ? 'has-deadline' : ''}" data-calendar-date="${date}" ${date === today() ? 'aria-current="date"' : ''} aria-label="${date}${hasMeeting ? ', saved meeting' : ''}${hasDeadline ? ', action due' : ''}">${i+1}<span class="day-markers" aria-hidden="true">${hasMeeting ? '<i></i>' : ''}${hasDeadline ? '<i class="deadline-dot"></i>' : ''}</span></button>`;
  }).join('');
  const pending = items().filter(i => i.kind === 'action' && !i.completed).sort((a,b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0,3);
  $('#radar-list').innerHTML = pending.map(i => `<button class="radar-item" data-player="${escape(i.player_id)}">${icon(overdue(i) ? 'check' : 'people')}<span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small><em>${i.due_date ? `Due ${escape(i.due_date)}${overdue(i) ? ' · Overdue' : ''}` : 'No deadline set'}</em></span>${icon('chevron')}</button>`).join('') || '<p class="radar-empty">All caught up. New approved actions will appear here.</p>';
}
function newMeeting() {
  if (busy) return;
  current = {title:'', date:today(), meeting_type:'individual', attendees:[], note:''};
  draft = []; $('#title').value = ''; $('#date').value = current.date; $('#meeting-type').value = 'individual'; $('#note').value = '';
  $('#sample').selectedIndex = -1;
  document.querySelectorAll('[name="attendee"]').forEach(el => el.checked = false);
  updateAttendeeSummary(); $('.attendee-picker').open = true;
  renderReview(); switchView('desk'); $('#title').focus();
  notify('New meeting ready. Choose attendees and add your synthetic notes. Use live mode to extract custom notes.');
}
$('#new-meeting').addEventListener('click', newMeeting);
$('[data-new-meeting]').addEventListener('click', newMeeting);
for (const [id, offset] of [['calendar-prev', -1], ['calendar-next', 1]]) {
  $(`#${id}`).addEventListener('click', () => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    calendarMonth = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
    renderPlanning();
  });
}
$('#calendar').addEventListener('click', e => {
  const day = e.target.closest('[data-calendar-date]');
  if (!day) return;
  const date = day.dataset.calendarDate;
  const pending = items().filter(i => i.kind === 'action' && !i.completed && i.due_date === date);
  const saved = meetings.filter(m => m.date === date);
  notify(`${date}: ${saved.length} saved meeting${saved.length === 1 ? '' : 's'} and ${pending.length} open action${pending.length === 1 ? '' : 's'} due.`);
  if (pending.length || saved.length) {
    selectedPlayer = pending[0]?.player_id || saved[0].attendees[0];
    cancelPrep(); render(); switchView('players');
  }
});

$('#sample').addEventListener('change', e => { loadSample(e.target.value); notify('Sample loaded. Extract it to review the records.'); });
$('#meeting-form').addEventListener('input', () => { if (!busy) { capture(); invalidate(); } });
$('#meeting-type').addEventListener('change', () => {
  if ($('#meeting-type').value === 'team') document.querySelectorAll('[name="attendee"]').forEach(x => x.checked = true);
  capture(); invalidate();
});
$('#meeting-form').addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return;
  try {
    const meeting = capture(); validMeeting(meeting); busy = true; $('#extract').disabled = true; $('#extract').textContent = 'Extracting…'; notify('');
    $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = true); $('#sample').disabled = true; $('#mode').disabled = true;
    if (mode === 'demo') {
      draft = extractDemo(meeting, demo.samples); origin = 'demo';
    } else { const result = await api('/extract', {...meeting,mode:'live'}); draft = result.items; origin = result.origin; }
    renderReview(); notify(draft.length ? 'Review every extracted record before saving.' : 'No records were extracted. Revise the note and try again.');
  } catch (error) { notify(error.message, true); }
  finally { busy = false; $('#meeting-form').querySelectorAll('input,select,textarea').forEach(el => el.disabled = false); $('#sample').disabled = false; $('#mode').disabled = false; $('#extract').disabled = false; render(); }
});
$('#review').addEventListener('input', e => {
  if (e.target.id === 'approved') { $('#save').disabled = !e.target.checked; return; }
  if (e.target.dataset.field) {
    const field = e.target.dataset.field, i = draft[Number(e.target.dataset.index)]; i[field] = e.target.value || null;
    if (field === 'kind' && i.kind !== 'action') i.due_date = null;
    if (field === 'kind') renderReview();
    if ($('#approved')) { $('#approved').checked = false; $('#save').disabled = true; }
  }
});
$('#review').addEventListener('click', async e => {
  const remove = e.target.closest('[data-remove]');
  if (remove) { draft.splice(Number(remove.dataset.remove),1); renderReview(); return; }
  if (e.target.id !== 'save' || !$('#approved')?.checked || busy) return;
  try {
    validMeeting(current);
    if (draft.some(i => !current.attendees.includes(i.player_id) || !i.text?.trim() || !i.skill?.trim() || !current.note.includes(i.quote))) throw Error('Each record needs an attendee, text, skill area, and source quote from the note.');
    const body = {...clone(current), approved:true, origin, items:clone(draft)};
    busy = true; e.target.disabled = true;
    const meeting = await api('/meetings',body);
    meetings.unshift(meeting);
    draft = []; renderReview(); cancelPrep(); render(); notify('Meeting approved and saved. Its records are now in player timelines and the action board.');
  } catch (error) { notify(error.message,true); if ($('#save')) $('#save').disabled = false; }
  finally { busy = false; }
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
      switchView('players'); target = $('#player-heading');
    } else {
      $('#task-filter').value = destination; render(); switchView('tasks'); target = $('#tasks h2');
    }
    target.tabIndex = -1;
    target.focus({preventScroll: true});
    target.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
  }
  const tab = e.target.closest('[data-view]'); if (tab) switchView(tab.dataset.view);
  const targetPlayer = e.target.closest('[data-player],[data-open-player]');
  if (targetPlayer) { selectedPlayer = targetPlayer.dataset.player || targetPlayer.dataset.openPlayer; cancelPrep(); render(); switchView('players'); }
  const action = e.target.closest('[data-item]');
  if (action && !busy) {
    try {
      action.disabled = true; busy = true;
      const meeting = meetings.find(m => m.id === action.dataset.meeting), item = meeting.items.find(i => i.id === action.dataset.item);
      const updated = await api(`/meetings/${encodeURIComponent(meeting.id)}/items/${encodeURIComponent(item.id)}`,{completed:!item.completed},'PATCH');
      meetings = meetings.map(m => m.id === updated.id ? updated : m);
      cancelPrep(); render(); notify('Action status updated.');
    } catch (error) { action.disabled = false; notify(error.message,true); }
    finally { busy = false; }
  }
});
$('#task-filter').addEventListener('change',render);
$('#mode').addEventListener('change', e => {
  if (busy) { e.target.value = mode; return; }
  mode = e.target.value;
  const url = new URL(window.location.href); url.searchParams.set('mode', mode);
  window.history.replaceState(null, '', url);
  draft = []; cancelPrep(); renderReview(); render();
  if (!connected) { initializeNotebook(); return; }
  notify(`${mode === 'demo' ? 'Demo sample' : 'Live Aivana'} extraction selected. Your SQLite records stay the same.`);
});
$('#prep').addEventListener('click', () => {
  cancelPrep();
  const records = items().filter(i => i.player_id === selectedPlayer);
  if (!records.length) { notify('Save a reviewed meeting for this player first.',true); return; }
  if (mode === 'demo') {
    $('#prep-text').textContent = `DEMO · Application-generated checklist, not Aivana output.\n\n${records.map(i => `[${i.meeting.date}] ${i.kind.toUpperCase()}: ${i.text}${i.kind === 'action' ? ` (${i.completed ? 'complete' : 'open'}${i.due_date ? `; due ${i.due_date}`:''})`:''}`).join('\n\n')}\n\nSuggested discussion: Ask the player for an update on open actions.`;
    return;
  }
  $('#prep').disabled = true; $('#prep-text').textContent = 'Connecting to Aivana…'; let content = '';
  prepSource = new EventSource(`/api/players/${encodeURIComponent(selectedPlayer)}/prep`);
  prepSource.addEventListener('delta', e => { try { content += JSON.parse(e.data).text || ''; $('#prep-text').textContent = content; } catch { notify('Unreadable preparation event.',true); prepSource?.close(); $('#prep').disabled = false; } });
  prepSource.addEventListener('done', e => { const data = JSON.parse(e.data); prepSource?.close(); prepSource = null; $('#prep').disabled = false; if (data.finish_reason === 'length') notify('The brief was cut short. Treat this as an incomplete draft.',true); });
  prepSource.addEventListener('error', e => { let message = 'Preparation stream failed. Check your backend, key, balance, and connection.'; try { message = JSON.parse(e.data).message || message; } catch {} notify(message,true); prepSource?.close(); prepSource = null; $('#prep').disabled = false; $('#prep-text').textContent = content || 'No brief was generated.'; });
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
