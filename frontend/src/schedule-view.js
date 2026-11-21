// Schedule page (Day · Week · Month · Year), the year/month/day picker,
// the event side panel, and the mini calendar on Home.
import { iso, parse, addDays, addMonths, weekStart, weekDays, monthGrid, monthTitle, MONTHS, shortDate, clockLabel, dayLabel, HOURS, slotFor, searchItems, pad } from './calendar-math.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const TYPE_LABELS = { game: 'Official game', practice: 'Practice', scrimmage: 'Scrimmage', film: 'Film review', meeting: 'Meeting', lift: 'Lift', walkthrough: 'Walk-through', note: 'Note', todo: 'Assignment due', other: 'Other' };
export const EVENT_TYPES = ['game', 'practice', 'scrimmage', 'film', 'meeting', 'lift', 'walkthrough', 'note', 'other'];
const TITLE_IDEAS = ['Practice (pads)', 'Practice (shells)', 'Practice (helmets)', 'Walk-through', 'Lift', 'Film', 'Install', 'Scout team', 'Travel: bus leaves', 'Bye week', 'Off day', 'Position room', '1-on-1'];
const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
const today = () => new Date().toLocaleDateString('en-CA');
const nowIso = () => { const d = new Date(); return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function audienceLabel(audience, players) {
  if (!audience || audience === 'team') return 'Whole team';
  if (audience.startsWith('group:')) return `${audience.slice(6)} room`;
  const p = players.find(x => x.id === audience.slice(7));
  return p ? `#${p.number} ${p.name}` : 'One player';
}

/** Year → month → day picker popover. onPick(dateString). */
export function openPicker(anchor, current, onPick) {
  document.querySelector('.date-picker')?.remove();
  let year = Number(current.slice(0, 4)), month = null;
  const pop = document.createElement('div');
  pop.className = 'date-picker'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Jump to a date');
  const render = () => {
    pop.innerHTML = `<div class="picker-year"><button type="button" data-y="-1" aria-label="Previous year">◀</button><strong>${year}</strong><button type="button" data-y="1" aria-label="Next year">▶</button></div>
      <div class="picker-months">${MONTHS.map((m, i) => `<button type="button" data-m="${i + 1}" class="${month === i + 1 ? 'chosen' : ''} ${`${year}-${pad(i + 1)}` === today().slice(0, 7) ? 'this-month' : ''}">${m.slice(0, 3)}</button>`).join('')}</div>
      ${month ? `<div class="picker-days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span>${d}</span>`).join('')}${monthGrid(`${year}-${pad(month)}-01`).map(c => c.inMonth ? `<button type="button" data-d="${c.date}" class="${c.date === today() ? 'is-today' : ''}">${Number(c.date.slice(8))}</button>` : '<span></span>').join('')}</div>` : '<p class="picker-hint">Pick a month, then a day.</p>'}
      <div class="picker-foot"><button type="button" class="text-button" data-d="${today()}">Today</button>${month ? `<button type="button" class="text-button" data-d="${year}-${pad(month)}-01">Whole month</button>` : ''}</div>`;
  };
  render();
  const rect = anchor.getBoundingClientRect();
  pop.style.top = `${rect.bottom + window.scrollY + 6}px`; pop.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 300))}px`;
  document.body.append(pop);
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); };
  const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { close(); anchor.focus(); } };
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.y) { year += Number(b.dataset.y); render(); }
    else if (b.dataset.m) { month = Number(b.dataset.m); render(); }
    else if (b.dataset.d) { close(); onPick(b.dataset.d); }
  });
  setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', key, true); pop.querySelector('[data-m]')?.focus(); });
}

function chip(item, players) {
  const time = item.start_at ? `<time>${clockLabel(item.start_at).replace(':00', '')}</time> ` : '';
  const extra = item.notes_saved ? ' <span class="notes-saved">✓ notes saved</span>' : item.status === 'late' ? ' <span class="late-word">Late</span>' : item.completed ? ' <span class="done-word">Done</span>' : '';
  return `<button type="button" class="ev ev-${item.type}" data-occurrence="${esc(item.occurrence_id)}" title="${esc(`${TYPE_LABELS[item.type] || item.type}: ${item.title}${item.audience ? ' · ' + audienceLabel(item.audience, players) : ''}`)}">${time}<span>${esc(item.title)}</span>${extra}</button>`;
}

export function createSchedule(root, ctx) {
  const { api, notify, players, onOpenItem, getSettings, saveSettings, onChanged } = ctx;
  let view = 'week', focus = today(), items = [], showHomework = true, panelItem = null;
  root.innerHTML = `
  <div class="schedule-head">
    <div class="schedule-title"><button type="button" class="title-button" data-picker aria-haspopup="dialog"><span data-title></span> ▾</button><div class="nav-buttons"><button type="button" class="icon-button" data-step="-1" aria-label="Previous">◀</button><button type="button" class="icon-button" data-step="1" aria-label="Next">▶</button></div></div>
    <div class="quick-jumps"><button type="button" class="chip-button" data-jump="today">Today</button><button type="button" class="chip-button" data-jump="gameweek">This game week</button><button type="button" class="chip-button" data-jump="nextgame">Next game</button></div>
    <div class="view-switch" role="tablist" aria-label="View">${['day', 'week', 'month', 'year'].map(v => `<button type="button" role="tab" data-view-mode="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
  </div>
  <div class="schedule-tools">
    <label class="schedule-search"><span class="sr-only">Search the schedule</span><input type="search" data-search placeholder="Search: North, #4, film…" autocomplete="off"><div class="search-results" data-results hidden></div></label>
    <label class="toggle" title="Player assignments (homework) with a due date"><input type="checkbox" data-show-homework checked> Show assignment deadlines</label>
    <label class="game-day">Game day <select data-game-day><option value="saturday">Saturday</option><option value="friday">Friday</option></select></label>
    <a class="secondary compact export-link" href="/api/events/export.ics" download>Export to phone</a>
    <button type="button" class="primary" data-add-event>+ Add event</button>
  </div>
  <div class="schedule-legend">${[...EVENT_TYPES.filter(t => t !== 'other'), 'todo'].map(t => `<span class="legend-${t}">${TYPE_LABELS[t]}</span>`).join('')}</div>
  <div class="schedule-body" data-body></div>
  <aside class="event-panel" data-panel hidden aria-labelledby="event-panel-title"></aside>`;
  const $ = (s) => root.querySelector(s);

  function range() {
    if (view === 'day') return [focus, focus];
    if (view === 'week') return [weekStart(focus), addDays(weekStart(focus), 6)];
    if (view === 'month') { const g = monthGrid(focus); return [g[0].date, g[41].date]; }
    return [`${focus.slice(0, 4)}-01-01`, `${focus.slice(0, 4)}-12-31`];
  }
  async function load() {
    const [from, to] = range();
    try { items = (await api(`/events?from=${from}&to=${to}`, undefined, 'GET')).items; }
    catch (error) { notify(error.message, true); items = []; }
    render();
  }
  const visible = () => items.filter(i => showHomework || i.type !== 'todo');
  const onDay = (date) => visible().filter(i => i.date === date).sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''));

  function title() {
    if (view === 'day') return parse(focus).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (view === 'week') { const days = weekDays(focus); const game = items.find(i => i.type === 'game' && days.includes(i.date)); return `${monthTitle(days[0])} · Game week${game ? ` · ${game.title.replace(/^Game day · /, '')}` : ''}`; }
    if (view === 'year') return `${focus.slice(0, 4)} season`;
    return monthTitle(focus);
  }
  function labelFor(date) { const s = getSettings(); return dayLabel(date, s.game_day, s.day_labels); }

  function timeGrid(days) {
    const nowLine = days.includes(today()) ? (() => { const d = new Date(); const pos = d.getHours() + d.getMinutes() / 60 - 7; return pos >= 0 && pos <= 15 ? pos : null; })() : null;
    return `<div class="time-grid" style="--days:${days.length}">
      <div class="tg-head"><span></span>${days.map(d => `<div class="tg-day ${d === today() ? 'is-today' : ''}"><strong>${parse(d).toLocaleDateString('en-US', { weekday: 'short' })} ${Number(d.slice(8))}</strong><button type="button" class="day-label ${labelFor(d) === 'Game day' ? 'game' : ''}" data-edit-label="${d}" title="Edit this day's label">${esc(labelFor(d))}</button></div>`).join('')}</div>
      <div class="tg-allday"><span>All day</span>${days.map(d => `<div>${onDay(d).filter(i => !i.start_at).map(i => chip(i, players)).join('')}</div>`).join('')}</div>
      <div class="tg-body"><div class="tg-hours">${HOURS.map(h => `<span>${((h + 11) % 12) + 1} ${h >= 12 ? 'PM' : 'AM'}</span>`).join('')}</div>
      ${days.map(d => `<div class="tg-col ${d === today() ? 'is-today' : ''}" data-col="${d}">${HOURS.map(h => `<button type="button" class="slot" data-slot="${d}T${pad(h)}:00" aria-label="Add event ${shortDate(d)} ${((h + 11) % 12) + 1} ${h >= 12 ? 'PM' : 'AM'}"></button>`).join('')}
        ${onDay(d).filter(i => i.start_at).map(i => { const s = slotFor(i.start_at, i.duration_min || 60); return `<div class="tg-event" style="top:calc(${s.top} * var(--hour));height:calc(${s.height} * var(--hour))">${chip(i, players)}</div>`; }).join('')}
        ${d === today() && nowLine !== null ? `<i class="now-line" style="top:calc(${nowLine} * var(--hour))"></i>` : ''}</div>`).join('')}</div></div>`;
  }
  function monthView() {
    const cells = monthGrid(focus); const week = weekDays(today());
    return `<div class="month-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span class="mg-head">${d}</span>`).join('')}${cells.map(c => { const list = onDay(c.date); return `<div class="mg-cell ${c.inMonth ? '' : 'out'} ${c.date === today() ? 'is-today' : ''} ${week.includes(c.date) ? 'this-week' : ''}" data-cell="${c.date}"><button type="button" class="mg-date" data-goto-day="${c.date}">${Number(c.date.slice(8))}</button><small class="mg-label">${esc(labelFor(c.date))}</small>${list.slice(0, 3).map(i => chip(i, players)).join('')}${list.length > 3 ? `<button type="button" class="more" data-goto-day="${c.date}">+${list.length - 3} more</button>` : ''}</div>`; }).join('')}</div>`;
  }
  function yearView() {
    const year = focus.slice(0, 4);
    return `<div class="year-grid">${MONTHS.map((m, i) => { const first = `${year}-${pad(i + 1)}-01`; return `<section class="mini-month"><button type="button" class="mini-title" data-goto-month="${first}">${m}</button><div class="mini-days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="wd">${d}</span>`).join('')}${monthGrid(first).map(c => { if (!c.inMonth) return '<span></span>'; const list = onDay(c.date); const game = list.some(x => x.type === 'game'); return `<button type="button" data-goto-day="${c.date}" class="${game ? 'has-game' : list.length ? 'has-any' : ''} ${c.date === today() ? 'is-today' : ''}" aria-label="${c.date}${game ? ', game' : ''}">${Number(c.date.slice(8))}</button>`; }).join('')}</div></section>`; }).join('')}</div><p class="muted year-key"><span class="dot game"></span> Game day · <span class="dot any"></span> Something scheduled</p>`;
  }
  function render() {
    $('[data-title]').textContent = title();
    root.querySelectorAll('[data-view-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.viewMode === view)));
    $('[data-game-day]').value = getSettings().game_day;
    $('[data-body]').innerHTML = view === 'year' ? yearView() : view === 'month' ? monthView() : timeGrid(view === 'day' ? [focus] : weekDays(focus));
    if (view === 'week' || view === 'day') { const body = root.querySelector('.tg-body'); if (body && !body.dataset.scrolled) { body.scrollTop = 8 * 0; body.dataset.scrolled = '1'; } }
  }
  function go(date, nextView = view) { focus = date; view = nextView; load(); }

  // ---------- event panel ----------
  function openPanel(event = null, prefill = {}) {
    panelItem = event;
    const e = event || { type: 'practice', title: '', start_at: `${focus}T15:30`, duration_min: 60, audience: 'team', note: '', repeat_weekly: 0, ...prefill };
    const start = e.series_start || e.start_at;
    const aud = e.audience || 'team';
    const who = aud === 'team' ? 'team' : aud.startsWith('group:') ? 'group' : 'player';
    $('[data-panel]').hidden = false;
    $('[data-panel]').innerHTML = `<form class="event-form" data-event-form>
      <div class="panel-top"><h3 id="event-panel-title">${event ? 'Edit event' : 'Add event'}</h3><button type="button" class="icon-button" data-close-panel aria-label="Close">✕</button></div>
      ${event?.repeat_weekly ? '<p class="repeat-note">Repeats weekly. Changes apply to every week.</p>' : ''}
      <label>Type<select name="type" data-event-type>${EVENT_TYPES.map(t => `<option value="${t}" ${t === e.type ? 'selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}</select></label>
      <div class="game-fields" data-game-fields ${e.type === 'game' || e.type === 'scrimmage' ? '' : 'hidden'}><div class="form-row"><label>Opponent<input name="opponent" maxlength="80" value="${esc(e.opponent || '')}" placeholder="North"></label><label>Home or away<select name="home_away"><option value="">—</option>${['home', 'away', 'neutral'].map(v => `<option value="${v}" ${e.home_away === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label></div></div>
      <label data-focus-field ${['practice', 'walkthrough', 'lift', 'scrimmage'].includes(e.type) ? '' : 'hidden'}>Practice focus<input name="focus" maxlength="200" value="${esc(e.focus || '')}" placeholder="Red zone, 2-minute, pass pro"></label>
      <label>Location<input name="location" maxlength="120" value="${esc(e.location || '')}" placeholder="Main field, film room, away stadium"></label>
      <label>Title<input name="title" required maxlength="160" list="title-ideas" value="${esc(e.title)}" placeholder="Practice (pads)"><datalist id="title-ideas">${TITLE_IDEAS.map(t => `<option value="${t}">`).join('')}</datalist></label>
      <div class="form-row"><label>Date<input name="date" type="date" required value="${start.slice(0, 10)}"></label><label>Start time<input name="time" type="time" required value="${start.slice(11, 16)}"></label></div>
      <label>Length<select name="duration_min">${[15, 30, 45, 60, 90, 120, 150, 180, 240].map(m => `<option value="${m}" ${m === (e.duration_min || 60) ? 'selected' : ''}>${m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? '' : 's'}`}</option>`).join('')}</select></label>
      <fieldset class="who"><legend>Who</legend><label><input type="radio" name="who" value="team" ${who === 'team' ? 'checked' : ''}> Whole team</label><label><input type="radio" name="who" value="group" ${who === 'group' ? 'checked' : ''}> Position room <select name="group">${GROUPS.map(g => `<option ${aud === `group:${g}` ? 'selected' : ''}>${g}</option>`).join('')}</select></label><label><input type="radio" name="who" value="player" ${who === 'player' ? 'checked' : ''}> One player <select name="player">${players.map(p => `<option value="${p.id}" ${aud === `player:${p.id}` ? 'selected' : ''}>#${p.number} ${esc(p.name)}</option>`).join('')}</select></label></fieldset>
      <label>Note<textarea name="note" rows="3" maxlength="2000" placeholder="Bus at 8:30. Bring white jerseys.">${esc(e.note || '')}</textarea></label>
      <label class="check-line"><input type="checkbox" name="repeat_weekly" ${e.repeat_weekly ? 'checked' : ''}> Repeat weekly</label>
      <div class="panel-actions">${event ? '<button type="button" class="text-button danger" data-delete-event>Delete</button>' : ''}<span></span><button type="button" class="secondary" data-close-panel>Cancel</button><button type="submit" class="primary">${event ? 'Save changes' : 'Add event'}</button></div></form>`;
    $('[data-panel] [name="title"]').focus();
  }
  function closePanel() { $('[data-panel]').hidden = true; panelItem = null; }
  function formEvent(form) {
    const f = new FormData(form); const who = f.get('who');
    return { type: f.get('type'), title: f.get('title').trim(), start_at: `${f.get('date')}T${f.get('time')}`, duration_min: Number(f.get('duration_min')),
      audience: who === 'team' ? 'team' : who === 'group' ? `group:${f.get('group')}` : `player:${f.get('player')}`, note: f.get('note').trim() || null, repeat_weekly: f.get('repeat_weekly') === 'on',
      opponent: (f.get('opponent') || '').trim() || null, home_away: f.get('home_away') || null, location: (f.get('location') || '').trim() || null, focus: (f.get('focus') || '').trim() || null };
  }
  root.addEventListener('submit', async e => {
    if (!e.target.matches('[data-event-form]')) return;
    e.preventDefault();
    const data = formEvent(e.target);
    try {
      if (panelItem) await api(`/events/${panelItem.id}`, data, 'PATCH'); else await api('/events', data);
      notify(panelItem ? 'Event updated.' : `${data.title} added to the schedule.`);
      closePanel(); focus = data.start_at.slice(0, 10); await load(); onChanged?.();
    } catch (error) { notify(error.message, true); }
  });

  root.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-picker]')) { openPicker(t.closest('[data-picker]'), focus, d => go(d, view === 'year' ? 'month' : view)); return; }
    const step = t.closest('[data-step]');
    if (step) { const n = Number(step.dataset.step); go(view === 'day' ? addDays(focus, n) : view === 'week' ? addDays(focus, 7 * n) : view === 'month' ? addMonths(focus, n) : addMonths(focus, 12 * n)); return; }
    const jump = t.closest('[data-jump]')?.dataset.jump;
    if (jump === 'today') { go(today()); return; }
    if (jump === 'gameweek') { go(today(), 'week'); return; }
    if (jump === 'nextgame') {
      try { const next = (await api('/events/upcoming?limit=20', undefined, 'GET')).find(i => i.type === 'game'); if (next) go(next.date, 'week'); else notify('No game on the schedule yet. Add one with + Add event.'); } catch (error) { notify(error.message, true); }
      return;
    }
    const mode = t.closest('[data-view-mode]'); if (mode) { go(focus, mode.dataset.viewMode); return; }
    const gotoDay = t.closest('[data-goto-day]'); if (gotoDay) { go(gotoDay.dataset.gotoDay, 'day'); return; }
    const gotoMonth = t.closest('[data-goto-month]'); if (gotoMonth) { go(gotoMonth.dataset.gotoMonth, 'month'); return; }
    if (t.closest('[data-add-event]')) { openPanel(null, { start_at: `${focus}T15:30` }); return; }
    const slot = t.closest('[data-slot]'); if (slot) { openPanel(null, { start_at: slot.dataset.slot }); return; }
    if (t.closest('[data-close-panel]')) { closePanel(); return; }
    if (t.closest('[data-delete-event]') && panelItem) {
      if (!confirm(`Delete "${panelItem.title}"${panelItem.repeat_weekly ? ' (every week)' : ''}? Are you sure?`)) return;
      try { await api(`/events/${panelItem.id}`, undefined, 'DELETE'); notify('Event deleted.'); closePanel(); await load(); onChanged?.(); } catch (error) { notify(error.message, true); }
      return;
    }
    const label = t.closest('[data-edit-label]');
    if (label) {
      const value = prompt(`Label for ${shortDate(label.dataset.editLabel)} (Recovery, Install, Polish, Walk-through, Game day, Review, Bye week, Off day). Leave empty for the default.`, label.textContent);
      if (value !== null) { try { await saveSettings({ day_label: { date: label.dataset.editLabel, label: value } }); render(); } catch (error) { notify(error.message, true); } }
      return;
    }
    const item = t.closest("[data-occurrence]");
    if (item && root.contains(item)) {
      const found = items.find(i => i.occurrence_id === item.dataset.occurrence);
      if (!found) return;
      if (found.source === 'event') openPanel(found); else onOpenItem?.(found);
      return;
    }
    const result = t.closest('[data-result]');
    if (result) { $('[data-results]').hidden = true; go(result.dataset.result, 'day'); }
  });
  root.addEventListener('change', e => {
    if (!e.target.matches('[data-event-type]')) return;
    const type = e.target.value;
    root.querySelector('[data-game-fields]').hidden = !['game', 'scrimmage'].includes(type);
    root.querySelector('[data-focus-field]').hidden = !['practice', 'walkthrough', 'lift', 'scrimmage'].includes(type);
  });
  $('[data-show-homework]').addEventListener('change', e => { showHomework = e.target.checked; render(); });
  $('[data-game-day]').addEventListener('change', async e => { try { await saveSettings({ game_day: e.target.value }); render(); } catch (error) { notify(error.message, true); } });
  let searchTimer = null;
  $('[data-search]').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(async () => {
      const box = $('[data-results]');
      if (!q) { box.hidden = true; return; }
      try {
        const from = addDays(today(), -190), to = addDays(today(), 200); // the server serves at most ~400 days per request
        const [all, notes] = await Promise.all([api(`/events?from=${from}&to=${to}`, undefined, 'GET'), api(`/notes?search=${encodeURIComponent(q)}`, undefined, 'GET')]);
        const query = q.replace(/^#(\d+)$/, (m, n) => { const p = players.find(x => String(x.number) === n); return p ? p.name.split(' ')[0] : m; });
        const playerHit = players.find(p => p.name.toLowerCase().includes(query.toLowerCase()));
        const hits = searchItems(all.items.map(i => ({ ...i, audience: i.audience ? audienceLabel(i.audience, players) : '' })), playerHit ? playerHit.name.split(' ')[0] : query);
        const noteHits = notes.filter(n => !hits.some(h => h.source === 'note' && h.id === n.id)).map(n => ({ title: n.title, date: n.note_date, type: 'note' }));
        const list = [...hits, ...noteHits].sort((a, b) => Math.abs(parse(a.date) - parse(today())) - Math.abs(parse(b.date) - parse(today()))).slice(0, 8);
        box.hidden = false;
        box.innerHTML = list.length ? list.map(i => `<button type="button" data-result="${i.date}"><span class="dot ${i.type}"></span><strong>${esc(i.title)}</strong><small>${shortDate(i.date)}</small></button>`).join('') : '<p>No match. Try a player, opponent or "film".</p>';
      } catch (error) { notify(error.message, true); }
    }, 250);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('[data-panel]').hidden) closePanel(); });

  return { show(date = today(), nextView = 'week') { go(date, nextView); }, refresh: load, openAdd: (prefill) => openPanel(null, prefill), openEdit: openPanel };
}

/** Mini month calendar for Home: dots, ◀ ▶, month name opens the picker. */
export function createMiniCalendar(root, ctx) {
  const { api, onPickDay } = ctx;
  let month = today().slice(0, 7) + '-01', items = [];
  root.innerHTML = `<div class="mini-cal"><div class="mini-cal-head"><button type="button" class="icon-button" data-mini-step="-1" aria-label="Previous month">◀</button><button type="button" class="title-button small" data-mini-picker aria-haspopup="dialog"></button><button type="button" class="icon-button" data-mini-step="1" aria-label="Next month">▶</button></div><div class="mini-cal-grid" data-mini-grid></div><div class="mini-key"><span class="dot game"></span>Game <span class="dot practice"></span>Practice <span class="dot film"></span>Film <span class="dot meeting"></span>Meeting <span class="dot note"></span>Note <span class="dot todo"></span>Due</div></div>`;
  const $ = (s) => root.querySelector(s);
  async function load() {
    const g = monthGrid(month);
    try { items = (await api(`/events?from=${g[0].date}&to=${g[41].date}`, undefined, 'GET')).items; } catch { items = []; }
    render();
  }
  function render() {
    $('[data-mini-picker]').textContent = `${monthTitle(month)} ▾`;
    const week = weekDays(today());
    $('[data-mini-grid]').innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="wd">${d}</span>`).join('') + monthGrid(month).map(c => {
      const types = [...new Set(items.filter(i => i.date === c.date && !(i.type === 'todo' && i.completed)).map(i => i.type))].slice(0, 4);
      return `<button type="button" class="${c.inMonth ? '' : 'out'} ${c.date === today() ? 'is-today' : ''} ${week.includes(c.date) ? 'this-week' : ''}" data-mini-day="${c.date}" aria-label="${shortDate(c.date)}${types.length ? ': ' + types.map(t => TYPE_LABELS[t]).join(', ') : ''}">${Number(c.date.slice(8))}<span class="dots">${types.map(t => `<i class="dot ${t}"></i>`).join('')}</span></button>`;
    }).join('');
  }
  root.addEventListener('click', e => {
    const step = e.target.closest('[data-mini-step]'); if (step) { month = addMonths(month, Number(step.dataset.miniStep)); load(); return; }
    const picker = e.target.closest('[data-mini-picker]'); if (picker) { openPicker(picker, month, d => onPickDay(d)); return; }
    const day = e.target.closest('[data-mini-day]'); if (day) onPickDay(day.dataset.miniDay);
  });
  load();
  return { refresh: load };
}

export { nowIso };
