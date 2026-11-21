export function meetingTypeForAttendees(currentType, count, rosterSize) {
  if (!count) return currentType === 'team' ? 'individual' : currentType;
  if (count === 1) return 'individual';
  if (currentType === 'team' && count === rosterSize) return 'team';
  return 'group';
}
