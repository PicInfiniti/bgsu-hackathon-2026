import './styles.scss';
import demo from '../../data/demo.json';
import { extractDemo } from './demo-extraction.js';

const $ = (s) => document.querySelector(s);
const escape = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = 'picinfiniti.coach.prototype.v1';
const clone = (x) => structuredClone(x);
let meetings;
try { meetings = JSON.parse(localStorage.getItem(key)) ?? clone(demo.meetings); if (!Array.isArray(meetings)) throw Error(); }
catch { meetings = clone(demo.meetings); }
let mode = 'demo', view = 'desk', draft = [], origin = 'demo', selectedPlayer = 'p01', busy = false, prepSource = null;
let current = clone(demo.samples[0]);
const player = (id) => demo.players.find(p => p.id === id);
const name = (id) => player(id)?.name ?? 'Unknown player';
const today = () => mode === 'demo' ? demo.reference_date : new Date().toLocaleDateString('en-CA');
const overdue = (x) => x.kind === 'action' && !x.completed && x.due_date && x.due_date < today();
const items = () => meetings.flatMap(m => m.items.map(i => ({...i, meeting:m})));
const persist = () => { try { localStorage.setItem(key, JSON.stringify(meetings)); } catch { notify('Browser storage is full or unavailable. These changes will not survive a reload.', true); } };

document.querySelector('#app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#"><span class="brand-mark">F<span>·</span></span><span>FALCON<small>FOLLOW-UP</small></span></a>
    <div class="workspace-label">COACHING WORKSPACE</div>
    <nav aria-label="Main navigation">
      <button data-view="desk" class="active"><span aria-hidden="true">▤</span> Meeting desk</button>
      <button data-view="players"><span aria-hidden="true">◉</span> Player timelines</button>
      <button data-view="tasks"><span aria-hidden="true">☑</span> Action board <b id="nav-count"></b></button>
    </nav>
    <div class="sidebar-bottom"><span class="team-avatar">pi</span><div>picInfiniti<small>Coach Meeting Tracker</small></div></div>
  </aside>
  <div class="shell">
    <header class="topbar"><span>ATHLETICS / <strong>COACH MEETINGS</strong></span><label class="mode-control">Workspace <select id="mode"><option value="demo">Demo · no API needed</option><option value="live">Live · local backend</option></select></label></header>
    <main>
      <div class="page-heading"><div><p class="eyebrow">LESS LOST IN THE NOTES. MORE FOLLOW-THROUGH.</p><h1>Good conversations.<br><span>Clear next steps.</span></h1><p class="intro">Turn the meeting into a plan. Keep the context, review the details,<br class="desktop"> and give every player a clear next step.</p></div><div class="heading-stamp"><span>COACH'S<br>PLAYBOOK</span><svg viewBox="0 0 100 70" aria-hidden="true"><path d="M12 56L38 15l22 41M26 36h25M70 16v40M61 25l9-9 9 9"/><circle cx="82" cy="52" r="7"/></svg></div></div>
      <div id="mode-note" class="notice"></div>
      <div id="message" role="status" aria-live="polite" hidden></div>
      <section class="stats" aria-label="Workspace summary"><a href="#recent-heading" data-stat="meetings"><span>Saved meetings</span><strong id="meeting-count">0</strong><small>Reviewed conversations</small></a><a href="#tasks" data-stat="open"><span>Open actions</span><strong id="open-count">0</strong><small>Clear next steps for your team</small></a><a href="#tasks" data-stat="overdue" class="urgent"><span>Needs follow-up</span><strong id="overdue-count">0</strong><small id="clock-note"></small></a><a href="#players" data-stat="players"><span>Players reached</span><strong id="players-count">0</strong><small>Of ${demo.players.length} fictional roster members</small></a></section>
      <section id="desk" class="view">
        <div class="section-heading"><div><p class="eyebrow">CAPTURE & CLARIFY</p><h2>The meeting desk</h2></div><label class="sample-control">Try a meeting <select id="sample">${demo.samples.map(s => `<option value="${s.id}">${escape(s.label)}</option>`).join('')}</select></label></div>
        <div class="desk-grid">
          <form id="meeting-form" class="panel note-panel">
            <div class="panel-heading"><span class="step">01</span><div><h3>Start with the conversation</h3><p>The original note stays with every record.</p></div></div>
            <label>Meeting title<input id="title" maxlength="160" required></label>
            <div class="form-row"><label>Date<input id="date" type="date" required></label><label>Meeting type<select id="meeting-type"><option value="individual">Individual</option><option value="group">Group</option><option value="team">Full team</option></select></label></div>
            <fieldset><legend>Attendees</legend><div id="attendees" class="attendees"></div></fieldset>
            <label>Meeting notes<textarea id="note" rows="7" maxlength="12000" required></textarea></label>
            <p class="field-help">Synthetic notes only. Capture what was said; avoid assumptions about character or attitude. For live team extraction, use a short section with only a few assignments. Keep the meeting date, attendees, and attribution context with each section; review and save each separately. If extraction is cut short, shorten the section and retry.</p>
            <button class="primary full" id="extract" type="submit">Extract sample records</button>
          </form>
          <section class="panel review-panel"><div class="panel-heading"><span class="step">02</span><div><h3>Review before it becomes a record</h3><p>You make the final call on every detail.</p></div></div><div id="review"></div></section>
        </div>
        <div id="recent-heading" class="section-heading recent-heading"><div><p class="eyebrow">THE RUNNING RECORD</p><h2>Recent conversations</h2></div><span class="muted">Newest meeting first</span></div><div id="recent" class="recent-list"></div>
      </section>
      <section id="players" class="view" hidden><div class="section-heading"><div><p class="eyebrow">CONTEXT THAT STAYS WITH THE PLAYER</p><h2>Player timelines</h2></div></div><div class="player-layout"><div class="panel roster" id="roster"></div><div class="panel"><div id="player-heading"></div><div id="timeline"></div><div class="prep-box"><h3>Prepare for the next conversation</h3><p>Build a brief from this player's approved records.</p><button id="prep" class="secondary">Build preparation brief</button><pre id="prep-text" aria-live="polite"></pre></div></div></div></section>
      <section id="tasks" class="view" hidden><div class="section-heading"><div><p class="eyebrow">MAKE THE FOLLOW-UP HAPPEN</p><h2>Action board</h2></div><label>Show <select id="task-filter"><option value="open">Open actions</option><option value="overdue">Overdue</option><option value="done">Completed</option><option value="all">All actions</option></select></label></div><div id="task-list"></div></section>
      <footer><span>FALCON FOLLOW-UP <b> / </b> picInfiniti</span><span>Original fictional demo data · Separate from Falcon Away</span></footer>
    </main>
  </div>`;

function notify(text, error = false) {
  $('#message').hidden = !text; $('#message').textContent = text; $('#message').className = error ? 'error' : 'success';
}
async function api(path, body, method = 'POST') {
  let res;
  try { res = await fetch(`/api${path}`, {method, headers:{'Content-Type':'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}); }
  catch { throw Error('Backend unavailable. Start FastAPI on port 8001 or switch to demo mode.'); }
  let data; try { data = await res.json(); } catch { throw Error('Backend unavailable or returned an invalid response. Start FastAPI on port 8001.'); }
  if (!res.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Request could not be completed. Check the meeting fields.');
  return data;
}
function capture() {
  current = {title:$('#title').value.trim(), date:$('#date').value, meeting_type:$('#meeting-type').value, attendees:[...document.querySelectorAll('[name="attendee"]:checked')].map(x => x.value), note:$('#note').value.trim()};
  return clone(current);
}
function validMeeting(m) {
  if (!m.title || !m.note || !m.date || !m.attendees.length) throw Error('Add a title, date, note, and at least one attendee.');
  if (m.meeting_type === 'individual' && m.attendees.length !== 1) throw Error('An individual meeting needs exactly one attendee.');
  if (m.meeting_type === 'group' && m.attendees.length < 2) throw Error('A group meeting needs at least two attendees.');
  if (m.meeting_type === 'team' && m.attendees.length !== demo.players.length) throw Error('Select the full fictional roster for a team meeting.');
}
function loadSample(id) {
  current = clone(demo.samples.find(x => x.id === id)); draft = [];
  $('#title').value = current.title; $('#date').value = current.date; $('#meeting-type').value = current.meeting_type; $('#note').value = current.note;
  $('#attendees').innerHTML = demo.players.map(p => `<label class="attendee"><input name="attendee" type="checkbox" value="${p.id}" ${current.attendees.includes(p.id) ? 'checked' : ''}><span>${escape(p.name.split(' ')[0])}</span></label>`).join('');
  renderReview();
}
function invalidate() { draft = []; renderReview(); }
function renderReview() {
  const review = $('#review');
  if (!draft.length) {
    review.innerHTML = `<div class="empty-review"><div class="paper-icon" aria-hidden="true">✓</div><h3>A little clarity goes a long way.</h3><p>Extract the note to review action items,<br>praise, and areas for improvement.</p><div class="legend"><span>Action items</span><span>Praise</span><span>Improvement</span></div></div>`;
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
  $('#clock-note').textContent = `As of ${today()}${mode === 'demo' ? ' · demo clock' : ''}`;
  $('#mode-note').textContent = mode === 'demo' ? 'DEMO WORKSPACE · Original fictional records. Sample extraction uses prepared fixtures, not AI. Changes stay in this browser. Dates use November 20, 2026 for repeatable comparison.' : 'LIVE WORKSPACE · Uses your local backend and Aivana account. Only approved records are saved to SQLite. Synthetic notes only.';
  $('#extract').textContent = mode === 'demo' ? 'Extract sample records' : 'Extract with Aivana';
  $('#recent').innerHTML = [...meetings].sort((a,b) => b.date.localeCompare(a.date)).map(m => `<button class="meeting-row" data-open-player="${escape(m.attendees[0])}"><span class="meeting-date"><b>${escape(m.date.slice(8))}</b>${escape(m.date.slice(0,7))}</span><span class="meeting-title"><strong>${escape(m.title)}</strong><small>${escape(m.meeting_type)} · ${m.attendees.length} attendee${m.attendees.length === 1 ? '':'s'} · ${m.items.length} records</small></span><span class="badge">${m.origin === 'demo' ? 'Demo fixture' : 'Reviewed'}</span></button>`).join('') || '<div class="panel empty">No meetings yet. Save your first reviewed extraction.</div>';
  $('#roster').innerHTML = `<p class="eyebrow">FICTIONAL TEAM ROSTER</p>${demo.players.map(p => `<button data-player="${p.id}" class="player-row ${p.id === selectedPlayer ? 'selected':''}"><span class="avatar">${p.number}</span><span><strong>${escape(p.name)}</strong><small>${escape(p.position)}</small></span></button>`).join('')}`;
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
    const meeting = mode === 'demo' ? {...body,id:crypto.randomUUID(),items:body.items.map(i => ({...i,id:crypto.randomUUID(),completed:false}))} : await api('/meetings',body);
    meetings.unshift(meeting); if (mode === 'demo') persist();
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
      if (mode === 'demo') { item.completed = !item.completed; persist(); }
      else { const updated = await api(`/meetings/${encodeURIComponent(meeting.id)}/items/${encodeURIComponent(item.id)}`,{completed:!item.completed},'PATCH'); meetings = meetings.map(m => m.id === updated.id ? updated : m); }
      cancelPrep(); render(); notify('Action status updated.');
    } catch (error) { action.disabled = false; notify(error.message,true); }
    finally { busy = false; }
  }
});
$('#task-filter').addEventListener('change',render);
$('#mode').addEventListener('change', async e => {
  if (busy) { e.target.value = mode; return; }
  const next = e.target.value, previous = mode;
  try {
    busy = true; e.target.disabled = true;
    let loaded;
    if (next === 'live') { const status = await api('/health', undefined, 'GET'); loaded = await api('/meetings', undefined, 'GET'); notify(status.aivana_configured ? 'Backend connected. Aivana mode is ready to test.' : 'Backend connected. Set AIVANA_API_KEY before extracting notes.', !status.aivana_configured); }
    else { try { loaded = JSON.parse(localStorage.getItem(key)) ?? clone(demo.meetings); } catch { loaded = clone(demo.meetings); } notify('Returned to the independent browser demo workspace.'); }
    mode = next; meetings = loaded; draft = []; cancelPrep(); renderReview(); render();
  } catch (error) { e.target.value = previous; notify(error.message,true); }
  finally { busy = false; e.target.disabled = false; }
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
loadSample('individual'); render(); switchView('desk');
