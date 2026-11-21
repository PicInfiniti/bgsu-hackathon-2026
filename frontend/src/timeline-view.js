import { escapeText as esc, appliesTo } from './review-state.js';
import { meetingTypeLabel, meetingDisplayTitle } from './shared-groups.js';

export function timelineMeetings(meetings, playerId) {
  return meetings.filter(m => m.attendees.includes(playerId)).sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function playerMeetingHistory(meetings, playerId, players, showSensitive, renderRecord, today = new Date().toLocaleDateString('en-CA')) {
  const roster = new Map(players.map(p => [p.id,p.name]));
  return timelineMeetings(meetings,playerId).map(meeting => {
    const allRecords = meeting.items.filter(i => appliesTo(i,playerId));
    const visible = allRecords.filter(i => !i.sensitive || showSensitive);
    const hidden = allRecords.length - visible.length;
    const actions=visible.filter(i=>i.kind==='action'),open=actions.filter(i=>!i.completed),overdue=open.filter(i=>i.due_date&&i.due_date<today),completed=actions.length-open.length;
    const actionState=overdue.length?'has-overdue-actions':open.length?'has-open-actions':actions.length?'has-completed-actions':'';
    const actionLabel=overdue.length?`${open.length} open · ${overdue.length} overdue`:open.length?`${open.length} open action${open.length===1?'':'s'}`:completed?`${completed} completed action${completed===1?'':'s'}`:'';
    const dateState = meeting.date === today ? 'is-today-meeting' : meeting.date > today ? 'is-upcoming-meeting' : '';
    const names = meeting.attendees.map(id => esc(roster.get(id) || 'Unknown player')).join(' · ');
    const originalNote = meeting.items.some(i => i.sensitive) && !showSensitive
      ? '<p>Full note contains sensitive content. Enable sensitive records above to review it.</p>'
      : `<details><summary>Read original meeting note${meeting.note_only ? ' · unclassified' : ''}</summary><p class="original-note-text">${esc(meeting.note)}</p></details>`;
    const content = visible.length ? visible.map(i => renderRecord(i,meeting,showSensitive)).join('')
      : hidden ? '<p class="timeline-no-records">Enable sensitive records above to review this player’s entries.</p>'
      : `<p class="timeline-no-records">${meeting.note_only ? 'Original conversation saved without extracted feedback or tasks.' : 'This player attended. No separate player feedback or tasks were saved for them.'}</p>`;
    return `<section class="timeline-meeting-card compact-meeting ${actionState} ${dateState} ${meeting.meeting_type}-meeting-card" id="timeline-meeting-${esc(meeting.id)}" tabindex="-1" aria-label="${esc(meetingTypeLabel(meeting.meeting_type))}: ${esc(meetingDisplayTitle(meeting.title))}"><details data-meeting-disclosure="${esc(meeting.id)}"><summary class="timeline-compact-summary"><span class="badge meeting-type-badge">${esc(meetingTypeLabel(meeting.meeting_type))}</span><strong>${esc(meetingDisplayTitle(meeting.title))}</strong>${actionLabel ? `<span class="timeline-action-status">${esc(actionLabel)}</span>` : ''}<time datetime="${esc(meeting.date)}">${esc(meeting.date)}</time><small>${meeting.attendees.length} attendees · ${meeting.note_only ? 'Original note' : `${visible.length} record${visible.length===1?'':'s'}`}${hidden ? ` · ${hidden} sensitive record${hidden===1?'':'s'} hidden` : ''}</small><span class="timeline-expand-hint">View details</span></summary><div class="timeline-meeting-body">${hidden ? `<p class="sensitive-notice">${hidden} sensitive record${hidden===1?'':'s'} hidden.</p>` : ''}${content}<div class="timeline-original-note">${originalNote}<details class="timeline-attendees"><summary>Meeting attendees</summary><p>${names}</p></details></div></div></details><div class="timeline-meeting-prep"><button type="button" class="rail-link" data-prepare-meeting="${esc(meeting.id)}">Prepare for this meeting ↗</button></div></section>`;
  }).join('') || '<div class="empty">No saved meetings for this player yet.</div>';
}
