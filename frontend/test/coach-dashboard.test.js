import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceButtonState, VOICE_TOOLTIP, formatTimer } from '../src/voice.js';
import { dayLabel, monthGrid, weekStart, slotFor, addMonths, searchItems, clockLabel } from '../src/calendar-math.js';
import { HistoryStack, changedWords } from '../src/history-stack.js';
import { chipsFor, trimHistory, MAX_TURNS } from '../src/ask-panel.js';
import { statusFor, matchPlayersInText, statusChip } from '../src/player-status.js';
import { highlightUncertain, recapMarkup } from '../src/notes-editor.js';
import { fitSize, isHeic } from '../src/image-utils.js';
import { inkBounds, strokeWidth } from '../src/pen-pad.js';
import demo from '../../data/demo.json' with { type: 'json' };

test('Voice button is hidden with a tooltip when speech recognition is unsupported', () => {
  assert.deepEqual(voiceButtonState({}), { supported: false, hidden: true, tooltip: VOICE_TOOLTIP });
  assert.equal(VOICE_TOOLTIP, 'Voice works in Chrome and Edge.');
  assert.equal(voiceButtonState({ webkitSpeechRecognition: function () {} }).hidden, false);
  assert.equal(voiceButtonState({ SpeechRecognition: function () {} }).supported, true);
  assert.equal(formatTimer(65400), '1:05');
});

test('game week labels follow the game day setting and coach overrides', () => {
  // 2026-11-21 is a Saturday.
  assert.deepEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map(d => dayLabel(d)),
    ['Recovery', 'Install', 'Install', 'Polish', 'Walk-through', 'Game day', 'Review']);
  assert.equal(dayLabel('2026-11-20', 'friday'), 'Game day');
  assert.equal(dayLabel('2026-11-21', 'friday'), 'Review');
  assert.equal(dayLabel('2026-11-18', 'saturday', { '2026-11-18': 'Bye week' }), 'Bye week');
});

test('month grid starts on Monday and covers six weeks; month math clamps the day', () => {
  const grid = monthGrid('2026-11-21');
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, '2026-10-26');
  assert.equal(grid.find(c => c.inMonth).date, '2026-11-01');
  assert.equal(weekStart('2026-11-22'), '2026-11-16');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-15', -12), '2025-11-15');
});

test('timed events are placed between 7 AM and 9 PM', () => {
  assert.deepEqual(slotFor('2026-11-24T15:30', 90), { top: 8.5, height: 1.5 });
  assert.equal(slotFor('2026-11-24T06:00', 60).top, 0);
  assert.equal(clockLabel('2026-11-24T15:30'), '3:30 PM');
  assert.equal(clockLabel('2026-11-24T00:05'), '12:05 AM');
});

test('schedule search matches every word and sorts by date', () => {
  const items = [{ title: 'Game day · vs. North', type: 'game', date: '2026-11-21' }, { title: 'DB coverage film', type: 'film', date: '2026-11-18' }, { title: 'Film: North install', type: 'film', date: '2026-11-16' }];
  assert.deepEqual(searchItems(items, 'north').map(i => i.date), ['2026-11-16', '2026-11-21']);
  assert.deepEqual(searchItems(items, 'film north').map(i => i.title), ['Film: North install']);
  assert.deepEqual(searchItems(items, '  '), []);
});

test('undo and redo walk the history; a new edit drops the redo branch', () => {
  const h = new HistoryStack('');
  h.push('a'); h.push('ab'); h.push('abc');
  assert.equal(h.undo(), 'ab'); assert.equal(h.undo(), 'a');
  assert.equal(h.redo(), 'ab');
  h.push('abX');
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(), 'ab');
  assert.equal(h.push('ab'), false);
});

test('changed words are highlighted between versions', () => {
  const words = changedWords('Avery run the slant', 'Avery #4 run the deep slant');
  assert.deepEqual(words.filter(w => w.changed).map(w => w.text), ['#4', 'deep']);
  assert.equal(words.map(w => w.text).join(''), 'Avery #4 run the deep slant');
});

test('Ask Aivana chips depend on the page and history keeps the last six turns', () => {
  assert.deepEqual(chipsFor('schedule'), ["What's on this week?", 'Add practice Tuesday 3:30', 'When is my next 1-on-1?']);
  assert.equal(chipsFor('note')[0], 'Recap this note');
  assert.equal(chipsFor('unknown'), chipsFor('home'));
  const turns = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `t${i}`, extra: 'x' }));
  const kept = trimHistory(turns);
  assert.equal(kept.length, MAX_TURNS);
  assert.deepEqual(kept.at(-1), { role: 'assistant', text: 't9' });
});

test('player status: red late, amber due soon or no 1-on-1, green done, always with a word', () => {
  const today = '2026-11-21';
  assert.deepEqual(statusFor([{ due_date: '2026-11-19', completed: false }], '2026-11-15', today), { color: 'red', label: 'Late' });
  assert.deepEqual(statusFor([{ due_date: '2026-11-23', completed: false }], '2026-11-15', today), { color: 'amber', label: 'Due Mon' });
  assert.deepEqual(statusFor([], '2026-10-01', today), { color: 'amber', label: 'No 1-on-1 in 21+ days' });
  assert.deepEqual(statusFor([{ due_date: '2026-11-19', completed: true }], '2026-11-15', today), { color: 'green', label: 'Done' });
  assert.match(statusChip({ color: 'red', label: 'Late' }), /status-chip red.*Late/);
});

test('players are found in a note by name, unique first name or jersey', () => {
  const ids = matchPlayersInText('Taylor Hayes ran well. Morgan needs film. #82 blocked.', demo.players);
  assert.deepEqual(ids.sort(), ['p03', 'p06', 'p08']);
});

test('uncertain words are highlighted and escaped for one-tap fixes', () => {
  const html = highlightUncertain('Mo <b> [?] slant', ['slant', '[?]']);
  assert.ok(html.includes('&lt;b&gt;'));
  assert.equal((html.match(/class="uncertain"/g) || []).length, 2);
  assert.ok(html.includes('data-start="11"'));
});

test('Recap card shows all six parts and escapes text', () => {
  const html = recapMarkup({ origin: 'aivana', summary: 'Film <x>', key_points: ['k'], decisions: ['d'], questions_to_follow_up: ['q'], players_mentioned: [{ name: 'Chris Walker', unknown_name: true }],
    to_dos: [{ player: 'Taylor Hayes', player_id: 'p06', task: 'Watch film', due_date: '2026-11-20', source_text: 'by Friday' }] });
  for (const part of ['Summary', 'Key points', 'Player homework', 'Decisions', 'Follow up', 'Send homework to review', 'Copy', 'Add to schedule', 'unknown name']) assert.ok(html.includes(part), part);
  assert.ok(html.includes('Film &lt;x&gt;'));
});

test('photos are resized to 1600 px and HEIC is refused; ink is trimmed', () => {
  assert.deepEqual(fitSize(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
  assert.equal(isHeic({ type: '', name: 'IMG_1.HEIC' }), true);
  assert.deepEqual(inkBounds([{ color: 'black', points: [[10, 20, 0, .5], [50, 80, 10, .5]] }, { color: 'eraser', points: [[0, 0, 0, 0]] }], 0), { x: 10, y: 20, width: 40, height: 60 });
  assert.equal(inkBounds([]), null);
  assert.ok(strokeWidth('pen', 1) > strokeWidth('pen', 0.1));
});
