// Player page: header, 4 facts, an Overview with 3 cards, and tabs for the rest.
// Counts and dates are computed here from saved, checked records; nothing is scored.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ROOMS = { QB: 'Quarterbacks room', RB: 'Running backs room', WR: 'Receivers room', TE: 'Tight ends room', OL: 'Offensive line room', DL: 'Defensive line room', LB: 'Linebackers room', DB: 'Secondary room', ST: 'Special teams room' };
// Program standards (USA Football, "What do coaches want from their players"). Tags the coach sets; never scores.
export const STANDARD_TAGS = [['prepared', 'Prepared & on time'], ['effort', 'Effort'], ['communication', 'Communication'], ['ownership', 'Ownership'], ['attitude', 'Attitude'], ['respect', 'Respect']];
export const TABS = [['overview', 'Overview'], ['timeline', 'Timeline'], ['assignments', 'Assignments'], ['film', 'Film & diagrams'], ['development', 'Development']];
export const initialsOf = (name = '') => name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const applies = (i, id) => i.player_id === id || (i.player_ids || []).includes(id);
const short = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** "Wide receiver · Receivers room · Junior · 6'1", 185 lb · Games played 9 of 10" (missing parts left out). */
export function headerMeta(p, gamesPlayed = null) {
  const body = [p.height, p.weight ? `${p.weight} lb` : null].filter(Boolean).join(', ');
  return [p.position_label || p.position, ROOMS[p.position_group] || null, p.class_year || null, body || null,
    gamesPlayed && gamesPlayed.of ? `Games played ${gamesPlayed.played} of ${gamesPlayed.of}` : null,
    p.active === false ? 'Inactive' : null].filter(Boolean).join(' · ');
}

/** The player's checked, non-sensitive records, newest first. */
export function playerRecords(meetings, id, showSensitive = false) {
  return meetings.flatMap(m => m.items.filter(i => applies(i, id) && (showSensitive || !i.sensitive)).map(i => ({ ...i, meeting: m })))
    .sort((a, b) => b.meeting.date.localeCompare(a.meeting.date));
}

/** The 4 summary facts. */
export function playerFacts({ records, today, game }) {
  const actions = records.filter(i => i.kind === 'action');
  const open = actions.filter(i => !i.completed), late = open.filter(i => i.due_date && i.due_date < today);
  const focus = records.find(i => i.kind === 'improvement');
  const focusName = focus && [focus.skill, focus.topic].find(v => v && !/^(not applicable|not specified|other)$/i.test(v));
  const meeting = game?.next_one_on_one;
  return [
    { key: 'meeting', label: 'Next meeting', value: meeting ? short(meeting.date) : 'None planned', detail: meeting ? meeting.title : 'Plan a 1-on-1' },
    { key: 'assignments', label: 'Open assignments', value: `${open.length} open`, detail: late.length ? `${late.length} late` : 'None late', warn: late.length > 0 },
    { key: 'focus', label: 'Current focus', value: focus ? (focusName || 'Work-on') : 'Not set', detail: focus ? focus.text : 'From the latest work-on note' },
    { key: 'game', label: 'Next game', value: game?.event ? (game.opponent || game.event.title) : 'No game scheduled', detail: game?.event ? `${short(game.event.date)}${game.home_away ? ` · ${game.home_away === 'home' ? 'Home' : 'Away'}` : ''}` : '' },
  ];
}

/** The same line saved in two meetings shows once (newest). */
export const unique = (records) => { const seen = new Set(); return records.filter(i => { const k = `${i.kind}|${i.text.trim().toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; }); };

/** Strengths (praise) and work-ons (improvement), three each, newest first. */
export function strengthsAndWorkOns(records) {
  records = unique(records);
  return { strengths: records.filter(i => i.kind === 'praise').slice(0, 3), workOns: records.filter(i => i.kind === 'improvement').slice(0, 3) };
}

export const recentActivity = (records, n = 3) => unique(records).slice(0, n);

/** Goals and agreements are notes the coach tagged "goal" or "agreement". */
export const goalsAndAgreements = (records) => records.filter(i => (i.tags || []).some(t => /^(goal|goals|agreement|agreed)$/i.test(String(t).trim())));

const kindLabel = (i) => i.kind === 'action' ? 'Assignment' : i.kind === 'praise' ? 'Strength' : i.kind === 'improvement' ? 'Work-on' : i.kind;

export function headerMarkup(p, { status = '', gamesPlayed = null } = {}) {
  const first = p.name.split(' ')[0];
  return `<div class="pp-header">
    <span class="pp-photo">${p.photo ? `<img src="${p.photo}" alt="">` : esc(initialsOf(p.name))}</span>
    <div class="pp-ident"><h2>${esc(p.name)} <span class="pp-number">#${p.number}</span></h2><p class="pp-meta">${esc(headerMeta(p, gamesPlayed))}</p><p class="pp-status">${status}</p></div>
    <div class="pp-actions"><button class="secondary compact" type="button" data-ask-player="${p.id}">✦ Ask about ${esc(first)}</button><button class="secondary compact" type="button" data-pp-quick-note>✎ Quick note</button><button class="primary compact" type="button" data-plan-one="${p.id}">Plan 1-on-1</button><button class="text-button" type="button" data-edit-player="${p.id}">Edit player</button></div>
  </div>`;
}

export function factsMarkup(facts) {
  return facts.map(f => `<div class="pp-fact ${f.warn ? 'warn' : ''}" data-fact="${f.key}"><span>${esc(f.label)}</span><strong>${esc(f.value)}</strong><small>${esc(f.detail || '')}</small></div>`).join('');
}

const line = (i) => `<li><span class="pp-kind ${i.kind}">${esc(kindLabel(i))}</span> ${esc(i.text)} <small>${esc(short(i.meeting.date))}${i.skill && !/^(not applicable|not specified|other)$/i.test(i.skill) ? ` · ${esc(i.skill)}` : ''}</small></li>`;

/** The 3 Overview cards' contents. The prep button lives outside, so a refresh never cuts a brief off. */
export function overviewParts({ records, facts, game }) {
  const { strengths, workOns } = strengthsAndWorkOns(records);
  const open = unique(records.filter(i => i.kind === 'action' && !i.completed)).slice(0, 3);
  const meeting = facts.find(f => f.key === 'meeting');
  return {
    prep: `<p class="muted">${game?.next_one_on_one ? `${esc(meeting.value)} · ${esc(meeting.detail)}` : 'No 1-on-1 planned yet.'}</p><h4>Bring up</h4><ul class="pp-list">${[...open, ...workOns.slice(0, 1)].map(line).join('') || '<li class="muted">Nothing open. Ask how the last work-on is going.</li>'}</ul>`,
    strengths: `<h4>Strengths</h4><ul class="pp-list">${strengths.map(line).join('') || '<li class="muted">No strengths noted yet.</li>'}</ul><h4>Work-ons</h4><ul class="pp-list">${workOns.map(line).join('') || '<li class="muted">No work-ons noted yet.</li>'}</ul>`,
    recent: `<ul class="pp-list">${recentActivity(records).map(line).join('') || '<li class="muted">No checked notes yet.</li>'}</ul>`,
  };
}

/** Program standards are not scores: counts of tagged, approved notes (last 30 days) with links. */
export function standardsMarkup(result) {
  if (!result) return '';
  return `<section class="panel pp-card pp-standards"><h3>Program standards</h3><p class="muted">Approved notes you tagged with a standard since ${esc(short(result.since))}. Not a score. Add the tag (for example "effort") to a note line in review.</p>
    <ul class="standards-list">${result.standards.map(s => `<li><strong>${esc(s.label)}</strong><span class="std-count praise">${s.praise} praise</span><span class="std-count concern">${s.concern} concern</span>${s.notes.length ? `<details><summary>${s.notes.length} note${s.notes.length === 1 ? '' : 's'}</summary><ul>${s.notes.map(n => `<li><a href="#record-${esc(n.meeting_id)}-${esc(n.item_id)}" data-pp-record="record-${esc(n.meeting_id)}-${esc(n.item_id)}">${esc(short(n.date))} · ${esc(n.text)}</a></li>`).join('')}</ul></details>` : ''}</li>`).join('')}</ul></section>`;
}

export function goalsMarkup(records) {
  const goals = goalsAndAgreements(records);
  return `<section class="panel pp-card"><h3>Goals &amp; agreements</h3><ul class="pp-list">${goals.map(line).join('') || '<li class="muted">None yet. Tag a note line "goal" or "agreement" in review to keep it here.</li>'}</ul></section>`;
}
