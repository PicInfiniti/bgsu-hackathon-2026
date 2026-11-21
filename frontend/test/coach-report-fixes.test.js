import test from 'node:test';
import assert from 'node:assert/strict';
import { createSender, composeVoiceText, answerSections, chipsFor, VOICE_FAILED } from '../src/ask-panel.js';
import { chip, TYPE_LABELS, EVENT_TYPES } from '../src/schedule-view.js';
import { quickNoteDefaults } from '../src/quick-note.js';
import { initialsOf } from '../src/profile-menu.js';
import { linkInfo } from '../src/film-math.js';
import demo from '../../data/demo.json' with { type: 'json' };

test('calendar regression: event chips never use data-item (the Homework "Mark done" hook)', () => {
  const html = chip({ type: 'game', title: 'Game day · vs. North', start_at: '2026-11-21T13:00', occurrence_id: '9@2026-11-21', audience: 'team' }, demo.players);
  assert.ok(!html.includes('data-item='));
  assert.ok(html.includes('data-occurrence="9@2026-11-21"'));
  const homework = chip({ type: 'todo', title: 'Avery: film', start_at: null, occurrence_id: 'hw-1', status: 'late' }, demo.players);
  assert.ok(homework.includes('Late'));
});

test('football event types have clear labels', () => {
  assert.deepEqual(EVENT_TYPES, ['game', 'practice', 'scrimmage', 'film', 'meeting', 'lift', 'walkthrough', 'note', 'other']);
  assert.equal(TYPE_LABELS.game, 'Official game');
  assert.equal(TYPE_LABELS.walkthrough, 'Walk-through');
  assert.equal(TYPE_LABELS.todo, 'Assignment due');
});

test('send guard: one message at a time, never empty, failures keep the text', async () => {
  let calls = 0, release;
  const send = createSender(() => { calls++; return new Promise(r => { release = r; }); });
  const first = send('What should I do next?');
  assert.deepEqual(await send('What should I do next?'), { sent: false, reason: 'busy' }); // double click / Enter + Send
  release({ reply: 'ok' });
  assert.equal((await first).sent, true);
  assert.equal(calls, 1);
  assert.deepEqual(await send('   '), { sent: false, reason: 'empty' });
  const failing = createSender(() => Promise.reject(Error('offline')));
  const out = await failing('Late homework');
  assert.equal(out.reason, 'failed');
  assert.equal(out.error.message, 'offline');
});

test('voice keeps typed text and builds one clean message', () => {
  assert.equal(composeVoiceText('For Morgan:', 'catch it high', 'and tuck'), 'For Morgan: catch it high and tuck');
  assert.equal(composeVoiceText('', 'number four', ''), 'number four');
  assert.equal(composeVoiceText('  ', '', ''), '');
  assert.equal(VOICE_FAILED, 'Voice transcription failed. Please try again or type your message.');
});

test('answers separate suggestions, facts and missing information, escaped', () => {
  const html = answerSections({ sections: { recommendations: [{ action: 'Follow up <b>now</b>', why: 'Late assignment', source_ids: ['S1'] }], facts: [{ text: 'Due 2026-11-19', source_ids: ['S1'] }], missing: ['No record says it was done.'] } });
  assert.ok(html.includes('Recommended next steps') && html.includes('suggestions'));
  assert.ok(html.includes('What the records say') && html.includes('known facts'));
  assert.ok(html.includes('Check before you act'));
  assert.ok(html.includes('&lt;b&gt;now&lt;/b&gt;'));
  assert.ok(html.includes('data-src="S1"'));
  assert.equal(answerSections({ reply: 'x' }), '');
  assert.ok(chipsFor('home').includes('What should I do next?'));
});

test('quick note suggests the page context; profile initials; Hudl share links', () => {
  assert.deepEqual(quickNoteDefaults({ page: 'players', player_id: 'p03' }), { notebook: 'player_meetings', player_id: 'p03', meeting_id: '' });
  assert.equal(quickNoteDefaults({ page: 'film' }).notebook, 'team_strategy');
  assert.equal(quickNoteDefaults({ page: 'desk' }).notebook, 'personal');
  assert.equal(initialsOf('Coach Dana Reed'), 'CD');
  assert.equal(initialsOf(''), 'C');
  assert.equal(linkInfo('https://app.hudl.com/video/3/1/abc').kind, 'hudl');
  assert.equal(linkInfo('https://hudl.app.link/xyz').kind, 'hudl');
  assert.equal(linkInfo('https://hudl.com.evil.io/v').ok, false);
});
