export function playerUnit(player) {
  if (['QB', 'RB', 'WR', 'TE', 'OL'].includes(player.position_group)) return 'Offense';
  if (['DL', 'LB', 'DB'].includes(player.position_group)) return 'Defense';
  return player.position_group === 'ST' ? 'Special Teams' : 'Other';
}

export function summarizePlayers(players, meetings, today) {
  return players.map(player => {
    const attended = meetings.filter(m => m.attendees.includes(player.id));
    const records = meetings.flatMap(m => m.items.filter(i => i.player_id === player.id).map(i => ({...i, meeting: m})));
    const open = records.filter(i => i.kind === 'action' && !i.completed);
    const latest = [...records].sort((a, b) => b.meeting.date.localeCompare(a.meeting.date))[0];
    return {...player, unit: playerUnit(player), meetingCount: attended.length,
      openCount: open.length, overdueCount: open.filter(i => i.due_date && i.due_date < today).length,
      latest};
  });
}

export function filterPlayers(players, {search = '', unit = 'all', group = 'all', position = 'all'} = {}) {
  const query = search.trim().toLowerCase().replace(/^#/, '');
  return players.filter(p => (unit === 'all' || p.unit === unit) &&
    (group === 'all' || p.position_group === group) && (position === 'all' || p.position === position) &&
    (!query || `${p.name} ${p.nickname || ''} ${p.number} ${p.position} ${p.position_label || ''}`.toLowerCase().includes(query)));
}
