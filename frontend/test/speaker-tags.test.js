import test from 'node:test';
import assert from 'node:assert/strict';
import { speaker, addLine, relabel, splitLine, labelledText, speakerCount, UNKNOWN } from '../src/speaker-tags.js';
import { startDictation } from '../src/voice.js';

const coach = speaker('Coach'), alex = speaker('Alex Carter', 'p01'), marcus = speaker('Marcus Lee', 'p03');

test('no tap means no speaker lines (behaviour unchanged)', () => {
  assert.deepEqual(addLine([], null, 'Alex what happened?', 1000), []);
});

test('lines follow the speaker the coach tapped, with times, marked "tagged by coach"', () => {
  let lines = addLine([], coach, 'Alex, what happened on third down?', 3000);
  lines = addLine(lines, alex, 'I missed the safety rotation.', 7000);
  lines = addLine(lines, coach, 'Marcus, what happened with your route?', 11000);
  lines = addLine(lines, marcus, 'I ran it too deep.', 15000);
  lines = addLine(lines, marcus, 'Like fifteen yards.', 17000); // same speaker soon after: same line
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map(l => [l.speaker_label, l.player_id, l.source]), [['Coach', null, 'coach_tag'], ['Alex Carter', 'p01', 'coach_tag'], ['Coach', null, 'coach_tag'], ['Marcus Lee', 'p03', 'coach_tag']]);
  assert.equal(lines[3].text, 'I ran it too deep. Like fifteen yards.');
  assert.equal(labelledText(lines).split('\n')[1], '[00:07] Alex Carter: I missed the safety rotation.');
  assert.equal(speakerCount(lines), 3);
});

test('relabel, mark Unknown (never linked to a player) and split a line', () => {
  let lines = addLine([], alex, 'I missed it. Coach said watch the safety.', 4000);
  lines = relabel(lines, 0, speaker(UNKNOWN, 'p01'));
  assert.deepEqual([lines[0].speaker_label, lines[0].player_id], [UNKNOWN, null]);
  assert.equal(speakerCount(lines), 0);
  lines = relabel(lines, 0, alex);
  lines = splitLine(lines, 0, 'I missed it.'.length);
  assert.deepEqual(lines.map(l => l.text), ['I missed it.', 'Coach said watch the safety.']);
  lines = relabel(lines, 1, coach);
  assert.deepEqual(lines.map(l => l.speaker_label), ['Alex Carter', 'Coach']);
  assert.equal(splitLine(lines, 0, 0), lines); // nothing to split
});

test('the speech recogniser only reports text: finished pieces come through onFinal, without speakers', () => {
  let instance;
  class FakeRecognition { constructor() { instance = this; } start() {} stop() { this.onend?.(); } }
  const pieces = [], texts = [];
  const stop = startDictation({ SpeechRecognition: FakeRecognition }, { onText: (f) => texts.push(f), onFinal: (p) => pieces.push(p), onEnd: () => {} });
  const result = (t, final) => Object.assign([{ transcript: t }], { isFinal: final });
  instance.onresult({ resultIndex: 0, results: [result('Alex what happened', true)] });
  instance.onresult({ resultIndex: 1, results: [result('Alex what happened', true), result('I missed', false)] });
  assert.deepEqual(pieces, ['Alex what happened']);
  assert.ok(!('speaker' in instance)); // nothing about who spoke exists in the browser result
  stop();
});
