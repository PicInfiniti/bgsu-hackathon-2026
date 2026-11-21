export function upcomingActions(meetings, today, limit = 5) {
  return meetings.flatMap(meeting => meeting.items.map(item => ({...item, meeting})))
    .filter(item => item.kind === 'action' && !item.completed && !item.sensitive && item.due_date && item.due_date >= today)
    .sort((a,b) => a.due_date.localeCompare(b.due_date))
    .slice(0,limit);
}
