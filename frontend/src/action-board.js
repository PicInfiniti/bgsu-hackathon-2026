export function filterActions(actions, players, {status = 'open', search = '', player = '', category = '', sort = 'due', showSensitive = false, sensitiveOnly = false, today} = {}) {
  const query = search.trim().toLowerCase();
  const names = new Map(players.map(p => [p.id, `${p.name} ${p.number} ${p.position}`]));
  const participants = item => item.player_ids?.length ? item.player_ids : [item.player_id];
  const label = item => participants(item).map(id => names.get(id) || '').join(' ');
  return actions.filter(item => {
    if (item.kind !== 'action' || (sensitiveOnly ? !item.sensitive : item.sensitive && !showSensitive)) return false;
    if (status === 'open' && item.completed || status === 'done' && !item.completed || status === 'overdue' && (item.completed || !item.due_date || item.due_date >= today)) return false;
    if (player && !participants(item).includes(player)) return false;
    if (category && item.skill !== category && item.topic !== category) return false;
    return !query || [item.text, item.skill, item.topic, item.meeting?.title, label(item)].join(' ').toLowerCase().includes(query);
  }).sort((a,b) => {
    if (sort === 'player') return label(a).localeCompare(label(b)) || (a.due_date || '9999').localeCompare(b.due_date || '9999');
    if (sort === 'recent') return (b.meeting?.date || '').localeCompare(a.meeting?.date || '');
    return (a.due_date || '9999').localeCompare(b.due_date || '9999') || label(a).localeCompare(label(b));
  });
}
