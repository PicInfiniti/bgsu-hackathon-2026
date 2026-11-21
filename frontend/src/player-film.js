// Player page: Next game, Skill checks (1–5 over time) and film notes / drawings.
import { mmss } from './film-math.js';
import { openWhiteboard } from './whiteboard.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROOM = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', LB: 'LB', DB: 'DB', ST: 'ST' };

/** Tiny one-skill line chart (scores 1–5). */
export function sparkline(history, w = 120, h = 34) {
  if (!history.length) return '';
  const step = history.length > 1 ? (w - 8) / (history.length - 1) : 0;
  const pts = history.map((p, i) => [4 + i * step, h - 4 - (p.score - 1) / 4 * (h - 8)]);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Scores over time: ${history.map(p => p.score).join(', ')}"><path d="M${pts.map(p => p.join(' ')).join(' L')}" fill="none" stroke="#bd3b00" stroke-width="2"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="#bd3b00"/>`).join('')}</svg>`;
}

/** part: 'all' (default), 'film' (film notes + play diagrams) or 'skills' (skill checks + film grade, kept apart). */
export async function renderPlayerFilm(el, ctx, playerId, part = 'all') {
  const { api, notify, players, openFilm, openSchedule } = ctx;
  const p = players.find(x => x.id === playerId);
  if (!el || !p) return;
  el.innerHTML = '<p class="muted">Loading film and skill checks…</p>';
  let skills, checks, film, game;
  try {
    [skills, checks, film, game] = await Promise.all([api(`/position-skills/${ROOM[p.position_group] || 'ST'}`, undefined, 'GET'), api(`/players/${playerId}/skill-checks`, undefined, 'GET'), api(`/players/${playerId}/film-summary`, undefined, 'GET'), api(`/next-game?player_id=${playerId}`, undefined, 'GET')]);
  } catch (error) { el.innerHTML = `<p class="late-word">${esc(error.message)}</p>`; return; }
  const allSkills = [...new Set([...skills, ...Object.keys(checks.skills)])];
  const o = film.overall;
  const skillCard = `<section class="panel skill-card"><div class="section-heading"><h3>Skill checks</h3><span class="muted">Coach's 1–5 · no overall number</span></div>
      <ul class="skill-list">${allSkills.map(s => { const k = checks.skills[s]; return `<li><span class="skill-name">${esc(s)}</span>${k ? `<span class="skill-score">${k.latest.score}/5 <small>${esc(checks.scale[k.latest.score - 1])}</small></span><span class="trend" title="${esc(k.label)}">${k.arrow} ${esc(k.label)}</span>${sparkline(k.history)}<small class="why">“${esc(k.latest.why)}” · ${esc(k.latest.check_date)}</small>` : '<span class="muted">Not checked yet</span>'}</li>`; }).join('')}</ul>
      <form class="skill-form" data-skill-form><div class="form-row"><label>Skill<input name="skill" list="skill-ideas-${playerId}" required maxlength="60" placeholder="${esc(allSkills[0] || 'Skill')}"><datalist id="skill-ideas-${playerId}">${allSkills.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <label>From<select name="source_kind"><option value="film">Film</option><option value="practice">Practice</option><option value="meeting">Meeting</option><option value="game">Game</option></select></label></div>
        <fieldset class="score-pick"><legend>Score</legend>${checks.scale.map((m, i) => `<label><input type="radio" name="score" value="${i + 1}" ${i === 2 ? 'checked' : ''}><span><b>${i + 1}</b> ${esc(m)}</span></label>`).join('')}</fieldset>
        <label>Why<input name="why" required maxlength="500" placeholder="Read the safety late on 3 of 5 clips"></label>
        <button type="submit" class="secondary compact">Save skill check</button></form>
      <p class="muted">Quick grade (film): ${o.plays ? `${o.percent}% on ${o.plays} plays${o.critical ? ` · ${o.critical} critical` : ''} · ${esc(o.label)}` : 'not graded yet'}. Shown beside the checks, never mixed in.</p></section>`;
  const gameCard = `<section class="panel"><div class="section-heading"><h3>Next game</h3></div>${game.event ? `<p><strong>${esc(game.opponent || game.event.title)}</strong>${game.home_away ? ` · ${game.home_away === 'home' ? 'Home' : 'Away'}` : ''}<br><span class="muted">${esc(game.when)} · ${esc(game.event.date)} ${esc(game.event.start_at.slice(11))}</span></p>
      <h4>Before kickoff</h4><ul class="due-list">${game.homework_due.map(h => `<li>${h.due_date < new Date().toLocaleDateString('en-CA') ? '<span class="status-chip red"><i></i>Late</span>' : '<span class="status-chip amber"><i></i>Due</span>'} ${esc(h.text)} <small>${esc(h.due_date)}</small></li>`).join('') || '<li class="muted">No homework due.</li>'}${game.next_one_on_one ? `<li>1-on-1: ${esc(game.next_one_on_one.title)} <small>${esc(game.next_one_on_one.date)}</small></li>` : ''}</ul>` : '<p class="muted">No game on the schedule.</p>'}</section>`;
  const filmCard = `<section class="panel"><div class="section-heading"><h3>Film</h3><button type="button" class="text-button" data-new-player-drawing>✎ New play diagram</button></div>
      <ul class="film-links">${film.notes.map(n => `<li><button type="button" class="time-link" data-film-at="${n.film_id}:${n.t_seconds}">▶ ${mmss(n.t_seconds)}</button> ${esc(n.text)} <small>${esc(n.film_title)}</small></li>`).join('')}${film.diagrams.map(d => `<li><button type="button" class="time-link drawing" data-drawing="${d.id}">✎ ${esc(d.title)}</button>${d.t_seconds != null ? ` <small>at ${mmss(d.t_seconds)}</small>` : ''}</li>`).join('') || (film.notes.length ? '' : '<li class="muted">No film notes or drawings for this player yet.</li>')}</ul></section>`;
  const filmNotes = `<section class="panel"><div class="section-heading"><h3>Film notes</h3></div><ul class="film-links">${film.notes.map(n => `<li><button type="button" class="time-link" data-film-at="${n.film_id}:${n.t_seconds}">▶ ${mmss(n.t_seconds)}</button> ${esc(n.text)} <small>${esc(n.film_title)}</small></li>`).join('') || '<li class="muted">No film notes for this player yet.</li>'}</ul></section>`;
  const diagrams = `<section class="panel"><div class="section-heading"><h3>Play diagrams</h3><button type="button" class="text-button" data-new-player-drawing>✎ New play diagram</button></div><ul class="film-links">${film.diagrams.map(d => `<li><button type="button" class="time-link drawing" data-drawing="${d.id}">✎ ${esc(d.title)}</button>${d.t_seconds != null ? ` <small>at ${mmss(d.t_seconds)}</small>` : ''}</li>`).join('') || '<li class="muted">No play diagrams for this player yet.</li>'}</ul></section>`;
  el.innerHTML = `<div class="player-film-grid">${part === 'film' ? filmNotes + diagrams : part === 'skills' ? skillCard : skillCard + gameCard + filmCard}</div>`;
  el.onclick = (e) => {
    const at = e.target.closest('[data-film-at]'); if (at) { const [fid, t] = at.dataset.filmAt.split(':'); openFilm(Number(fid), Number(t)); }
    const d = e.target.closest('[data-drawing]'); if (d) openWhiteboard({ api, notify, players, onClose: () => renderPlayerFilm(el, ctx, playerId, part) }, { id: Number(d.dataset.drawing) });
    if (e.target.closest('[data-new-player-drawing]')) openWhiteboard({ api, notify, players, onClose: () => renderPlayerFilm(el, ctx, playerId, part) }, { template: 'play', player_ids: [playerId], title: `${p.name.split(' ')[0]} · play` });
  };
  const skillForm = el.querySelector('[data-skill-form]');
  if (skillForm) skillForm.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api(`/players/${playerId}/skill-checks`, { skill: f.get('skill'), score: Number(f.get('score')), why: f.get('why'), source_kind: f.get('source_kind') }); notify('Skill check saved.'); renderPlayerFilm(el, ctx, playerId, part); }
    catch (error) { notify(error.message, true); }
  };
}
