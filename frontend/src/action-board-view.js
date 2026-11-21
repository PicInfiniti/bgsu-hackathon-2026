import { escapeText as esc } from './review-state.js';
import { groupRecords, meetingTypeLabel } from './shared-groups.js';

export function actionRows(filtered, available, players, {today, busy = false, showSensitive = false}) {
  const roster = new Map(players.map(p => [p.id,p]));
  const late = i => !i.completed && i.due_date && i.due_date < today;
  const badge = i => `<span class="badge ${i.completed ? 'completed' : late(i) ? 'overdue' : 'action'}">${i.completed ? 'Done' : late(i) ? 'Late' : 'Open'}</span>`;
  const playerLink = id => `<button type="button" class="action-player-link" data-player="${esc(id)}">${esc(roster.get(id)?.name || 'Unknown player')}<small>#${esc(roster.get(id)?.number ?? '')} · ${esc(roster.get(id)?.position || '')}</small></button>`;
  const complete = i => `<button type="button" class="secondary compact" data-meeting="${esc(i.meeting.id)}" data-item="${esc(i.id)}" aria-label="${i.completed ? 'Reopen' : 'Complete'} action for ${esc(roster.get(i.player_id)?.name || 'player')}: ${esc(i.text)}" ${busy ? 'disabled' : ''}>${i.completed ? 'Reopen' : 'Mark done'}</button>`;
  const groups = groupRecords(filtered, available);
  const rows = groups.map(group => {
    const i = group.item, m = i.meeting;
    const sourceNote = m.items.some(item => item.sensitive) && !showSensitive ? 'Full note contains sensitive content. Turn on sensitive homework to see it.' : m.note;
    const source = `<div class="action-source"><strong>${esc(m.title)}</strong><p>${esc(meetingTypeLabel(m.meeting_type))} · ${esc(m.date)}${m.id.startsWith('m-seed-') ? ' · Earlier practice pack' : ''}</p><blockquote>${esc(i.quote)}</blockquote><details><summary>Full meeting note</summary><p class="action-note">${esc(sourceNote)}</p></details></div>`;
    const count = group.allMembers.filter(item => item.completed).length;
    const summaryStatus = {kind:'action', completed:group.allMembers.every(item => item.completed), due_date:i.due_date};
    const members = group.shared ? `<div class="shared-action-members"><h4>Player updates · ${group.members.length} of ${group.allMembers.length} players match filters</h4>${group.members.map(item => `<div class="shared-action-member">${playerLink(item.player_id)}${badge(item)}${complete(item)}</div>`).join('')}</div>` : '';
    const key = `${m.id}-${group.shared ? i.display_group.id : i.id}`;
    return `<tr class="${group.shared ? 'shared-action-row' : ''}" data-action-key="${esc(key)}"><td class="action-description"><details><summary>${esc(i.text)}</summary>${members}${source}</details><p class="record-origin">${esc(meetingTypeLabel(m.meeting_type))} · ${esc(m.title)}</p>${i.sensitive ? '<span class="badge sensitive">Sensitive</span>' : ''}</td>
      <td><div class="action-players">${group.shared ? `<strong class="shared-action-label">${esc(group.label)}</strong><span>${group.allMembers.length} players</span><small>${group.allMembers.map(item => esc(roster.get(item.player_id)?.name || 'Unknown player')).join(' · ')}</small>` : (i.player_ids?.length ? i.player_ids : [i.player_id]).map(playerLink).join('')}</div></td>
      <td><span class="action-category">${esc(i.skill || 'Uncategorized')}</span>${i.topic && i.topic !== i.skill ? `<small class="action-topic">${esc(i.topic)}</small>` : ''}</td>
      <td class="action-deadline ${late(i) ? 'late' : ''}">${i.due_date ? `<time datetime="${esc(i.due_date)}">${esc(new Date(i.due_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}</time>${i.due_date === today && !i.completed ? '<small>Today</small>' : ''}` : '<span class="undated">No deadline</span>'}</td>
      <td>${badge(summaryStatus)}${group.shared ? `<small class="shared-completion-count">${count} / ${group.allMembers.length} completed</small>` : ''}</td><td>${group.shared ? '<button type="button" class="secondary compact" data-expand-action>Player updates</button>' : complete(i)}</td></tr>`;
  }).join('');
  return {rows: rows || '<tr><td colspan="6" class="empty">No matching homework. Try another search or reset the filters.</td></tr>', count:groups.length};
}
