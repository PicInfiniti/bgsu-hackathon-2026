import { escapeText as esc } from './review-state.js';
import { groupRecords, meetingTypeLabel, meetingDisplayTitle } from './shared-groups.js';

export function actionRows(filtered, available, players, {today, busy = false, showSensitive = false}) {
  const roster = new Map(players.map(p => [p.id,p]));
  const late = i => !i.completed && i.due_date && i.due_date < today;
  const dateLabel = date => date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'No deadline';
  const badge = i => `<span class="task-state ${i.completed ? 'is-complete' : late(i) ? 'is-overdue' : 'is-open'}">${i.completed ? 'Complete' : late(i) ? 'Overdue' : 'Open'}</span>`;
  const playerLink = id => `<button type="button" class="action-owner" data-player="${esc(id)}">${esc(roster.get(id)?.name || 'Unknown player')}<span>#${esc(roster.get(id)?.number ?? '')}</span></button>`;
  const complete = i => `<button type="button" class="task-complete ${i.completed ? 'is-done' : ''}" data-meeting="${esc(i.meeting.id)}" data-item="${esc(i.id)}" aria-label="${i.completed ? 'Reopen' : 'Complete'} action for ${esc(roster.get(i.player_id)?.name || 'player')}: ${esc(i.text)}" ${busy ? 'disabled' : ''}>${i.completed ? 'Reopen' : 'Complete'}</button>`;
  const groups = groupRecords(filtered, available);
  const sections = new Map();
  groups.forEach(group => {
    const meeting = group.item.meeting;
    if (!sections.has(meeting.id)) sections.set(meeting.id,{meeting,groups:[]});
    sections.get(meeting.id).groups.push(group);
  });
  const titleFor = item => {
    const assigned = roster.get(item.player_id)?.name;
    return assigned && item.text.toLowerCase().startsWith(`${assigned.toLowerCase()}:`) ? item.text.slice(assigned.length+1).trim() : item.text;
  };
  const rows = [...sections.values()].map(({meeting:m,groups:assignments}) => {
    const meetingActions = available.filter(i => i.meeting.id === m.id);
    const attendeeIds = m.attendees || [...new Set(meetingActions.map(i => i.player_id).filter(Boolean))];
    const dates = assignments.flatMap(g => g.members.filter(i => !i.completed && i.due_date).map(i => i.due_date)).sort();
    const nextDue = dates[0];
    const isLate = nextDue && nextDue < today;
    const taskMarkup = assignments.map(group => {
      const i = group.item;
      const done = group.allMembers.filter(item => item.completed).length;
      const state = {completed:done === group.allMembers.length, due_date:i.due_date};
      const sourceNote = m.items.some(item => item.sensitive) && !showSensitive ? 'Full note contains sensitive content. Enable sensitive actions to view it.' : m.note;
      const key = `${m.id}-${group.shared ? i.display_group.id : i.id}`;
      return `<article class="action-task ${group.shared ? 'is-shared-task' : ''}" data-action-key="${esc(key)}"><div class="action-task-heading"><h4>${esc(titleFor(i))}</h4>${badge(state)}</div><div class="action-task-meta"><span class="task-due ${late(i) ? 'is-overdue' : ''}">${i.due_date ? `Due ${esc(dateLabel(i.due_date))}` : 'No deadline'}</span><span>${esc(i.skill || 'Uncategorized')}</span>${i.sensitive ? '<span class="badge sensitive">Sensitive</span>' : ''}</div>
        <div class="action-task-owner">${group.shared ? `<div><strong>${esc(meetingDisplayTitle(group.label))} · ${group.allMembers.length} players</strong><small>${done} / ${group.allMembers.length} completed</small></div>` : playerLink(i.player_id)}${group.shared ? '' : complete(i)}</div>
        ${group.shared ? `<details class="shared-player-controls"><summary>Player updates <span>${done} / ${group.allMembers.length}</span></summary><p>${group.members.length} of ${group.allMembers.length} players match filters</p><div class="shared-action-members">${group.members.map(item => `<div class="shared-action-member">${playerLink(item.player_id)}${badge(item)}${complete(item)}</div>`).join('')}</div></details>` : ''}
        <details class="action-task-source"><summary>View source note</summary><blockquote>${esc(i.quote)}</blockquote><details><summary>Full meeting note</summary><p>${esc(sourceNote)}</p></details></details></article>`;
    }).join('');
    const icon = m.meeting_type === 'team' ? 'T' : m.meeting_type === 'group' ? 'G' : '1';
    const preview = assignments.slice(0,2).map(group => `<p><span class="task-preview-dot"></span>${esc(titleFor(group.item))}</p>`).join('');
    return `<article class="action-meeting-card ${esc(m.meeting_type || 'individual')}-action-meeting ${isLate ? 'has-overdue' : ''}" data-meeting-card="${esc(m.id)}"><header class="action-card-heading"><span class="meeting-card-icon" aria-hidden="true">${icon}</span><div><span class="action-card-type">${esc(meetingTypeLabel(m.meeting_type))}</span><h3>${esc(meetingDisplayTitle(m.title))}</h3><p>${esc(dateLabel(m.date))} · ${attendeeIds.length} ${attendeeIds.length === 1 ? 'player' : 'players'}</p></div>${isLate ? '<span class="task-state is-overdue">Needs follow-up</span>' : ''}</header>
      <div class="action-card-preview">${preview}${assignments.length > 2 ? `<small>+${assignments.length-2} more assignments</small>` : ''}</div>
      <div class="action-card-summary"><span>${assignments.length} assignment${assignments.length === 1 ? '' : 's'}</span><span class="${isLate ? 'is-overdue' : ''}">${nextDue ? `Next due ${esc(dateLabel(nextDue))}` : meetingActions.every(i => i.completed) ? 'All completed' : 'No dated open tasks'}</span></div>
      <details class="action-card-assignments" data-meeting-expansion><summary>View assignments <span aria-hidden="true">↗</span></summary><div class="action-card-task-list">${taskMarkup}</div><details class="action-card-attendees"><summary>Meeting attendees · ${attendeeIds.length}</summary><p>${attendeeIds.map(id => esc(roster.get(id)?.name || 'Unknown player')).join(' · ')}</p></details></details></article>`;
  }).join('');
  return {rows:rows || '<div class="action-empty"><h3>You’re all caught up here.</h3><p>No assignments match these filters. Try another player or reset the filters.</p></div>',count:groups.length,meetingCount:sections.size};
}
