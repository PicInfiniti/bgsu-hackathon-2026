import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { formation, boardSvg } from '../src/whiteboard.js';

const src = new URL('../src/', import.meta.url);

test('no visible "Whiteboard" anywhere: the coach-facing name is Playboard', () => {
  for (const file of readdirSync(src).filter(f => /\.(js|scss)$/.test(f))) {
    const text = readFileSync(new URL(file, src), 'utf8').replace(/openWhiteboard|\.\/whiteboard\.js|data-whiteboard/g, '');
    assert.ok(!/whiteboard/i.test(text), `${file} still says whiteboard`);
  }
  const editor = readFileSync(new URL('notes-editor.js', src), 'utf8');
  assert.ok(editor.includes('✎ Playboard'));
  assert.ok(editor.includes('Add text, a drawing or a photo before saving.'));
  assert.ok(!editor.includes('Write something before saving'));
  assert.ok(readFileSync(new URL('whiteboard.js', src), 'utf8').includes('Add a player or a route before saving.'));
});

test('a play with QB, WR, RB and OL markers plus routes renders without any text', () => {
  const objects = [...formation('Pro I (11)', 18, 26.67), { id: 'r1', type: 'arrow', points: [[8.67, 19.6], [14, 8]], color: '#F58220', style: 'solid', end: 'arrow' }];
  const svg = boardSvg('play', objects);
  for (const label of ['>QB<', '>RB<', '>WR<', '>LT<', '>C<']) assert.ok(svg.includes(label), label);
  assert.ok(svg.includes('marker-end="url(#wb-arrow-F58220)"'));
});
