import { escapeText as esc, appliesTo } from './review-state.js';
import { meetingTypeLabel, meetingDisplayTitle } from './shared-groups.js';

export function timelineMeetings(meetings, playerId) {
  return meetings.filter(m => m.attendees.includes(playerId)).sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function playerMeetingHistory(meetings, playerId, players, showSensitive, renderRecord) {
  const roster = new Map(players.map(p => [p.id,p.name]));
  return timelineMeetings(meetings,playerId).map(meeting => {
    const allRecords = meeting.items.filter(i => appliesTo(i,playerId));
    const visible = allRecords.filter(i => !i.sensitive || showSensitive);
    const hidden = allRecords.length - visible.length;
    const names = meeting.attendees.map(id => esc(roster.get(id) || 'Unknown player')).join(' · ');
    const originalNote = meeting.items.some(i => i.sensitive) && !showSensitive
      ? '<p>Full note contains sensitive content. Enable sensitive records above to review it.</p>'
      : `<details><summary>Read original meeting note${meeting.note_only ? ' · unclassified' : ''}</summary><p class="original-note-text">${esc(meeting.note)}</p></details>`;
    const content = visible.length ? visible.map(i => renderRecord(i,meeting,showSensitive)).join('')
      : hidden ? '<p class="timeline-no-records">Enable sensitive records above to review this player’s entries.</p>'
      : `<p class="timeline-no-records">${meeting.note_only ? 'Original conversation saved without extracted feedback or tasks.' : 'This player attended. No separate player feedback or tasks were saved for them.'}</p>`;
    return `<section class="timeline-meeting-card ${meeting.meeting_type}-meeting-card" id="timeline-meeting-${esc(meeting.id)}" tabindex="-1" aria-label="${esc(meetingTypeLabel(meeting.meeting_type))}: ${esc(meetingDisplayTitle(meeting.title))}"><header><div class="timeline-meeting-top"><span class="badge meeting-type-badge">${esc(meetingTypeLabel(meeting.meeting_type))}</span><time datetime="${esc(meeting.date)}">${esc(meeting.date)}</time></div><h3>${esc(meetingDisplayTitle(meeting.title))}</h3><p>${meeting.attendees.length} attendee${meeting.attendees.length === 1 ? '' : 's'} · ${meeting.note_only ? 'Original note' : `${visible.length} record${visible.length===1?'':'s'}`}</p>${hidden ? `<p class="sensitive-notice">${hidden} sensitive record${hidden === 1 ? '' : 's'} hidden.</p>` : ''}</header>${content}<div class="timeline-original-note">${originalNote}<details class="timeline-attendees"><summary>Meeting attendees</summary><p>${names}</p></details></div></section>`;
  }).join('') || '<div class="empty">No saved meetings for this player yet.</div>';
}
