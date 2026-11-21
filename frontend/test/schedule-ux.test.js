import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMessage, exportRange, matchesKind, KIND_CHIPS, chip } from '../src/schedule-view.js';
import demo from '../../data/demo.json' with { type: 'json' };

const result = (dates) => ({ upcoming: dates.filter(d => d >= '2026-11-21').map(date => ({ date })), past: dates.filter(d => d < '2026-11-21').map(date => ({ date })) });

test('two empty states: nothing anywhere vs. matches in other weeks', () => {
  assert.deepEqual(searchMessage('zzz', result([]), '2026-11-16', '2026-11-22'), { tone: 'none', text: 'No games, practices, meetings or assignments match "zzz".' });
  assert.deepEqual(searchMessage('Lakeside', result(['2026-11-28', '2026-12-05', '2026-12-12']), '2026-11-16', '2026-11-22'), { tone: 'elsewhere', text: 'Nothing matches in this week. 3 matches in other weeks.' });
  assert.equal(searchMessage('north', result(['2026-11-21', '2026-10-31']), '2026-11-16', '2026-11-22').text, '1 in this week · 2 in total');
  assert.equal(searchMessage('x', result(['2026-12-28']), '2026-11-01', '2026-11-30', 'month').text, 'Nothing matches in this month. 1 match in other months.');
});

test('type chips: games include scrimmages, assignments include coach to-dos', () => {
  assert.deepEqual(KIND_CHIPS.map(k => k[1]), ['All', 'Games', 'Practices', 'Film', 'Meetings', 'Assignments']);
  assert.ok(matchesKind({ type: 'scrimmage' }, 'games'));
  assert.ok(!matchesKind({ type: 'practice' }, 'games'));
  assert.ok(matchesKind({ type: 'walkthrough' }, 'practices'));
  assert.ok(matchesKind({ type: 'todo' }, 'assignments') && matchesKind({ type: 'coach_todo' }, 'assignments'));
  assert.ok(matchesKind({ type: 'note' }, 'all'));
});

test('export ranges: week, month, football season (Aug 1 – Jan 31) and custom', () => {
  assert.deepEqual(exportRange('week', '2026-11-21'), ['2026-11-16', '2026-11-22']);
  assert.deepEqual(exportRange('month', '2026-11-21'), ['2026-11-01', '2026-11-30']);
  assert.deepEqual(exportRange('season', '2026-11-21'), ['2026-08-01', '2027-01-31']);
  assert.deepEqual(exportRange('season', '2027-01-15'), ['2026-08-01', '2027-01-31']);
  assert.deepEqual(exportRange('season', '2026-04-10', { start: '03-01', end: '05-31' }), ['2026-03-01', '2026-05-31']);
  assert.deepEqual(exportRange('custom', '2026-11-21', undefined, { from: '2026-09-01', to: '2026-12-01' }), ['2026-09-01', '2026-12-01']);
});

test('coach to-dos show as a check item on the calendar, struck when done', () => {
  const open = chip({ type: 'coach_todo', title: 'Confirm bus time', occurrence_id: '5@2026-11-21', done: false }, demo.players);
  const done = chip({ type: 'coach_todo', title: 'Confirm bus time', occurrence_id: '5@2026-11-21', done: true }, demo.players);
  assert.ok(open.includes('☐ Confirm bus time') && !open.includes('data-item='));
  assert.ok(done.includes('☑') && done.includes('class="ev ev-coach_todo done"'));
});
