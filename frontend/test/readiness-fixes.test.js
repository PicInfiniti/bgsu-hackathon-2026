import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { giveToEveryone, canGiveToEveryone, visibleWarnings, alreadySentText, reviewIssues } from '../src/review-state.js';

const meeting = { title: 'WR check-in', date: '2026-11-21', meeting_type: 'group', attendees: ['p02', 'p03'], note: 'Both receivers review red-zone fades.' };
const shared = { id: 'x', schema_version: 2, player_id: null, scope: 'player', kind: 'action', text: 'review red-zone fades', quote: 'Both receivers review red-zone fades.', confidence: 'low', match_method: 'unmatched', mention: 'Both receivers', group_record_id: 'g1', warnings: ['Shared instruction'] };

test('F2: "Give to everyone" makes one item per attendee, each still checked before approval', () => {
  assert.equal(canGiveToEveryone(shared, meeting), true);
  assert.equal(canGiveToEveryone({ ...shared, player_id: 'p02' }, meeting), false);
  assert.equal(canGiveToEveryone(shared, { ...meeting, attendees: ['p02'] }), false);
  let n = 0;
  const items = giveToEveryone(shared, meeting.attendees, () => `id${n++}`);
  assert.deepEqual(items.map(i => [i.id, i.player_id, i.text, i.scope]), [['id0', 'p02', 'review red-zone fades', 'player'], ['id1', 'p03', 'review red-zone fades', 'player']]);
  assert.ok(items.every(i => reviewIssues(i, meeting).length === 0));
  assert.ok(items.every(i => i.warnings.some(w => /Check it before approving/.test(w))));
  assert.ok(items.every(i => i.group_record_id === undefined && i.match_method === 'team'));
});

test('F5: the "requires correction" banner clears once every card is valid; other notes stay', () => {
  const warnings = ['Record 3: unmatched player/group.', 'Some records require correction. Unmatched players and invalid source quotes cannot be saved.', 'The note was long; check the last items.'];
  assert.equal(visibleWarnings(warnings, [shared], meeting).length, 3);  // still unassigned
  const fixed = giveToEveryone(shared, meeting.attendees, () => 'y');
  assert.deepEqual(visibleWarnings(warnings, fixed, meeting), ['The note was long; check the last items.']);
  assert.equal(visibleWarnings(warnings, [], meeting).length, 3);
});

test('F1: the second send shows when the note was already sent', () => {
  assert.equal(alreadySentText({ saved_at: '2026-11-21T12:40:00', date: '2026-11-20' }), 'Already sent to review on 2026-11-21.');
  assert.equal(alreadySentText({ date: '2026-11-20' }), 'Already sent to review on 2026-11-20.');
});

test('Home says "Needs attention" once, and no visible "Watch list" is left', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const bell = readFileSync(new URL('../src/bell.js', import.meta.url), 'utf8');
  assert.equal((main.match(/<h2>Needs attention<\/h2>/g) || []).length, 1);
  assert.ok(!/Watch list/i.test(main.replace(/watch-list|watch-card|watch-more/g, '')));
  assert.ok(!/Watch list/i.test(bell));
});
