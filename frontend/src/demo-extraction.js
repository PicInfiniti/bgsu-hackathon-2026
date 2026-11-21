// Fixture deadlines depend on the original meeting date, including relative dates.
export function extractDemo(meeting, samples) {
  const sample = samples.find(s => s.date === meeting.date && s.note === meeting.note && s.meeting_type === meeting.meeting_type && [...s.attendees].sort().join() === [...meeting.attendees].sort().join());
  if (!sample) throw Error('Demo extraction requires unchanged sample notes, date, type, and attendees. Load a sample, or switch to live mode for your own synthetic notes.');
  return structuredClone(sample.items);
}
