import assert from 'node:assert/strict';
import test from 'node:test';
import { meetingTypeForAttendees } from '../src/meeting-input.js';

test('adding a second attendee changes an individual meeting to group; removing back to one restores individual', () => {
  assert.equal(meetingTypeForAttendees('individual', 2, 25), 'group');
  assert.equal(meetingTypeForAttendees('individual', 4, 25), 'group');
  assert.equal(meetingTypeForAttendees('group', 1, 25), 'individual');
});

test('explicit full-team selection is preserved until an attendee is removed', () => {
  assert.equal(meetingTypeForAttendees('team', 25, 25), 'team');
  assert.equal(meetingTypeForAttendees('team', 24, 25), 'group');
  assert.equal(meetingTypeForAttendees('team', 1, 25), 'individual');
  assert.equal(meetingTypeForAttendees('individual', 0, 25), 'individual');
});
