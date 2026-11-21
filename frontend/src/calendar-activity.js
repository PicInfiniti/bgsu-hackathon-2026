export function activityForDate(meetings, date) {
  const due = meetings.flatMap(meeting => meeting.items
    .filter(item => item.kind === 'action' && item.due_date === date)
    .map(item => ({...item, meeting})));
  return {
    meetings: meetings.filter(meeting => meeting.date === date),
    actions: due.filter(item => !item.sensitive),
    hiddenActionCount: due.filter(item => item.sensitive).length,
  };
}
