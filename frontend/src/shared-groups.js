// Grouping is a presentation over independently editable/completable records.
import { escapeText as esc } from './review-state.js';
const signature = item => JSON.stringify(['kind','text','skill','topic','quote','due_date','deadline_text','sensitive'].map(k => item[k] ?? null));
const key = item => item.display_group && item.display_group.player_ids.includes(item.player_id)
  ? JSON.stringify([item.meeting?.id ?? '', item.display_group.id, signature(item)]) : null;

export function groupRecords(records, allRecords = records) {
  const buckets = new Map();
  records.forEach((item, index) => {
    const groupKey = key(item) ?? `individual-${index}`;
    if (!buckets.has(groupKey)) buckets.set(groupKey, {item, members:[], allMembers:[], indexes:[], key:groupKey});
    const group = buckets.get(groupKey); group.members.push(item); group.indexes.push(index);
  });
  return [...buckets.values()].flatMap(group => {
    const candidates = key(group.item) ? allRecords.filter(i => key(i) === key(group.item)) : group.members;
    const ids = candidates.map(i => i.player_id);
    group.shared = candidates.length > 1 && ids.every(Boolean) && new Set(ids).size === ids.length;
    group.allMembers = group.shared ? candidates : group.members;
    group.label = group.item.display_group?.label;
    if (group.label === 'Full team' && candidates.length !== group.item.display_group.player_ids.length) group.label = 'Shared group';
    if (!group.shared && group.members.length > 1) return group.members.map((item, n) => ({item, members:[item], allMembers:[item], indexes:[group.indexes[n]], key:`individual-${group.indexes[n]}`, shared:false}));
    return [group];
  });
}

export const meetingTypeLabel = type => ({individual:'Individual meeting', group:'Group meeting', team:'Full team meeting'}[type] || 'Meeting');

export function meetingReviewFrame(content, meeting, players) {
  if (meeting.meeting_type === 'individual') return content;
  const names = meeting.attendees.map(id => players.find(p => p.id === id)?.name || 'Unknown player');
  return `<section class="meeting-scope-card ${meeting.meeting_type === 'team' ? 'team-scope-card' : 'group-scope-card'}"><header><span class="badge">${esc(meetingTypeLabel(meeting.meeting_type))}</span><h3>${esc(meeting.title)}</h3><p>${meeting.attendees.length} selected players · ${esc(meeting.date)}</p>${names.length > 5 ? `<details><summary>View all selected players</summary><p>${names.map(esc).join(' · ')}</p></details>` : `<p class="shared-player-names">${names.map(esc).join(' · ')}</p>`}<p class="shared-review-hint">Shared statements stay together below. Player-specific feedback and tasks remain independently editable.</p></header>${content}</section>`;
}
