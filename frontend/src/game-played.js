// "Who played?" on an Official game. All boxes start unticked; only a saved list counts.
// Games played is computed from these lists (scrimmages never count).
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROOM_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];

/** Active players for the game's audience (one room, or everyone), grouped by room. */
export function playedChoices(players, audience = 'team') {
  const room = audience?.startsWith('group:') ? audience.slice(6) : null;
  const list = players.filter(p => p.active !== false && (!room || p.position_group === room));
  return ROOM_ORDER.map(r => [r, list.filter(p => p.position_group === r)]).filter(([, ps]) => ps.length);
}

export async function renderPlayed(el, { api, notify, players }, event) {
  if (!el) return;
  if (!event?.id || event.type !== 'game') { el.hidden = true; el.innerHTML = ''; return; }
  const day = (event.date || event.start_at).slice(0, 10);
  el.hidden = false; el.innerHTML = '<p class="muted">Loading who played…</p>';
  let saved;
  try { saved = await api(`/events/${event.id}/played?date=${day}`, undefined, 'GET'); } catch (error) { el.innerHTML = `<p class="late-word">${esc(error.message)}</p>`; return; }
  const ticked = new Set(saved.player_ids);
  el.innerHTML = `<form data-played-form><h4>Who played? <small class="muted">${saved.saved_at ? `saved · ${ticked.size} player${ticked.size === 1 ? '' : 's'}` : 'not saved yet'}</small></h4>
    <p class="muted">Tick each player who played in this official game. "Games played" on the player page counts only saved lists.</p>
    ${playedChoices(players, event.audience).map(([room, ps]) => `<fieldset><legend>${room}</legend>${ps.map(p => `<label class="check-line"><input type="checkbox" name="p" value="${p.id}" ${ticked.has(p.id) ? 'checked' : ''}> #${p.number} ${esc(p.name)}</label>`).join('')}</fieldset>`).join('')}
    <div class="panel-actions"><span></span><button type="submit" class="secondary compact">Save who played</button></div></form>`;
  el.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const ids = [...e.target.querySelectorAll('[name="p"]:checked')].map(b => b.value);
    try { await api(`/events/${event.id}/played`, { date: day, player_ids: ids }, 'PUT'); notify(`Saved: ${ids.length} played.`); renderPlayed(el, { api, notify, players }, event); }
    catch (error) { notify(error.message, true); }
  };
}
