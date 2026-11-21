// Grouping is a presentation over independently editable/completable records.
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
