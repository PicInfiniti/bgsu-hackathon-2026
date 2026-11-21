import { escapeText as esc } from './review-state.js';

const DAY_MS = 86400000;
function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === value ? stamp / DAY_MS : null;
}

// Date-only arithmetic avoids daylight-saving changes. Future plans are not past check-ins.
export function checkInRecency(players, meetings, today, {days = 14, type = 'individual'} = {}) {
  const now = calendarDay(today);
  if (now === null || !Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Choose a valid date and check-in window.');
  if (!['', 'individual', 'group', 'team'].includes(type)) throw new Error('Choose a valid meeting type.');
  const latest = new Map();
  for (const meeting of meetings) {
    const day = calendarDay(meeting.date);
    if (meeting.approved !== true || day === null || day > now || type && meeting.meeting_type !== type) continue;
    for (const id of meeting.attendees) {
      if (!latest.has(id) || day > latest.get(id)) latest.set(id,day);
    }
  }
  const rows = players.map(p => {
    const last = latest.get(p.id), daysSince = last === undefined ? null : now - last;
    return {...p, lastDate:last === undefined ? null : new Date(last * DAY_MS).toISOString().slice(0,10), daysSince,
      needsCheckIn:daysSince === null || daysSince >= days};
  });
  const needing = rows.filter(p => p.needsCheckIn).sort((a,b) => (b.daysSince === null) - (a.daysSince === null) || (b.daysSince ?? 0) - (a.daysSince ?? 0) || a.name.localeCompare(b.name));
  return {players:needing, recentCount:rows.length - needing.length, total:rows.length, days, type, today,
    start:new Date((now - days + 1) * DAY_MS).toISOString().slice(0,10)};
}

export function checkInMarkup(summary) {
  const label = {individual:'individual', group:'group', team:'team', '':'matching'}[summary.type];
  return `<div class="checkin-summary"><strong>${summary.recentCount}<span> / ${summary.total}</span></strong><p>players have a saved ${label} meeting in the past ${summary.days} days.</p></div><progress max="${Math.max(summary.total,1)}" value="${summary.recentCount}" aria-label="Players with a recent saved ${label} meeting">${summary.recentCount} of ${summary.total}</progress>
    <p class="checkin-remaining" role="status">${summary.players.length} player${summary.players.length === 1 ? '' : 's'} without ${summary.type === 'individual' ? 'an' : 'a'} ${label} meeting dated ${esc(summary.start)} through ${esc(summary.today)}.</p>
    ${summary.players.length ? `<ul class="checkin-player-list">${summary.players.map(p => `<li><span class="checkin-player-number">${esc(p.number)}</span><div><strong>${esc(p.name)}</strong><small>${p.lastDate ? `Last saved: ${esc(p.lastDate)} · ${p.daysSince} days ago` : `No past ${label} meeting saved`}</small></div><button class="rail-link" type="button" data-open-player="${esc(p.id)}" aria-label="View ${esc(p.name)} timeline">View timeline ↗</button></li>`).join('')}</ul>` : '<p class="checkin-empty">Every player has a matching meeting recorded in this window.</p>'}
    <p class="checkin-date-note">Based on approved meeting dates through today. Future-dated meetings do not count as past check-ins.</p>`;
}
