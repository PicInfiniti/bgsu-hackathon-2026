import { escapeText as esc } from './review-state.js';
import { meetingTypeLabel, meetingDisplayTitle } from './shared-groups.js';

export function noteOnlyReview(meeting, players) {
  const names = meeting.attendees.map(id => players.find(p => p.id === id)?.name || 'Unknown player');
  return `<div class="note-only-review"><h3>Review your meeting.</h3><p>No tasks or player feedback are required. Your agenda or original note, date, and attendees will be saved.</p><p class="record-origin">${esc(meetingTypeLabel(meeting.meeting_type))} · ${esc(meeting.date)}</p><h4>${esc(meetingDisplayTitle(meeting.title))}</h4><p>${names.map(esc).join(' · ')}</p><blockquote>${esc(meeting.note)}</blockquote><p class="shared-review-hint">Original note only. No player feedback or action items will be created. This unclassified note is excluded from AI answers and preparation.</p></div><div class="review-footer"><label class="approval"><input id="approved" type="checkbox">I reviewed the original note, date, and attendees.</label><button id="save" class="primary full" disabled>Approve & save meeting</button><button class="text-button" type="button" data-cancel-note-only>Back to extraction</button></div>`;
}

export function noteOnlyHistory(meetings, playerId) {
  return meetings.filter(m => m.note_only && m.attendees.includes(playerId) && m.items.length === 0);
}

export function noteOnlyTimelineCard(meeting) {
  return `<article class="record note-only-record" id="meeting-note-${esc(meeting.id)}" tabindex="-1"><span class="badge">Original note</span><h4>${esc(meetingDisplayTitle(meeting.title))}</h4><p class="record-origin">${esc(meetingTypeLabel(meeting.meeting_type))} · ${esc(meeting.date)} · ${meeting.attendees.length} attendee${meeting.attendees.length === 1 ? '' : 's'}</p><p>No extracted player records or tasks.</p><details><summary>Read original meeting note · unclassified</summary><p class="original-note-text">${esc(meeting.note)}</p></details></article>`;
}
