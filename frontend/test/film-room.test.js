import test from 'node:test';
import assert from 'node:assert/strict';
import { mmss, parseTime, isTypingTarget, filmKey, linkInfo, gradeSummary, clipAt, gradeCursor, clipTitle, tagsFromText } from '../src/film-math.js';
import { toBoard, flipObjects, formation, FORMATIONS, boardSvg, objectSvg, TEMPLATES } from '../src/whiteboard.js';
import { HistoryStack } from '../src/history-stack.js';
import { sparkline } from '../src/player-film.js';

test('film keys are ignored while typing in a text box', () => {
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTypingTarget(null), false);
});

test('keyboard map: Space/J/K/L, frame step, N/D/G and clip marks', () => {
  assert.deepEqual([' ', 'k', 'j', 'l', 'ArrowLeft', 'ArrowRight', 'n', 'd', 'g', '[', ']', 'i', 'o', 'x'].map(k => filmKey(k)),
    ['toggle', 'toggle', 'back5', 'fwd5', 'frameBack', 'frameFwd', 'note', 'draw', 'grade', 'markIn', 'markOut', 'markIn', 'markOut', null]);
  assert.equal(filmKey('8', true), 'critical');
});

test('notes capture the time as mm:ss and typed times parse back', () => {
  assert.equal(mmss(134.9), '02:14');
  assert.equal(mmss(0), '00:00');
  assert.equal(parseTime('02:14'), 134);
  assert.equal(parseTime('1:02:14'), 3734);
  assert.equal(parseTime('95'), 95);
  assert.equal(parseTime('soon'), null);
});

test('links: https only, YouTube/Vimeo play here, Hudl/Drive open out', () => {
  assert.deepEqual(linkInfo('https://youtu.be/dQw4w9WgXcQ'), { ok: true, kind: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.equal(linkInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=40').id, 'dQw4w9WgXcQ');
  assert.equal(linkInfo('https://vimeo.com/123456789').kind, 'vimeo');
  assert.equal(linkInfo('https://www.hudl.com/video/3/x').kind, 'hudl');
  assert.equal(linkInfo('http://youtu.be/dQw4w9WgXcQ').ok, false);
  assert.equal(linkInfo('https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ').ok, false);
  assert.equal(linkInfo('not a link').ok, false);
});

test('quick grade %, clip at a time and the grading cursor', () => {
  assert.deepEqual(gradeSummary([{ result: 'won' }, { result: 'won' }, { result: 'won' }, { result: 'won' }, { result: 'critical' }]), { plays: 5, won: 4, critical: 1, percent: 80, label: 'On target' });
  assert.equal(gradeSummary([{ result: 'lost' }]).label, 'Below target');
  const clips = [{ id: 1, start_s: 0, end_s: 5 }, { id: 2, start_s: 4, end_s: 9 }];
  assert.equal(clipAt(clips, 4.5).id, 2);
  assert.equal(clipAt(clips, 10), null);
  let s = { clip: 0, player: 0 };
  s = gradeCursor(s, 'down', ['a', 'b'], clips); s = gradeCursor(s, 'down', ['a', 'b'], clips);
  assert.deepEqual(s, { clip: 0, player: 1 });
  assert.deepEqual(gradeCursor(s, 'nextClip', ['a', 'b'], clips), { clip: 1, player: 0 });
  assert.equal(clipTitle({ down: 3, distance: 'long', play_type: 'pass', start_s: 0 }), '3rd & long · Pass');
  assert.deepEqual(tagsFromText(' Red Zone, any NEW tag ,red zone,'), ['red zone', 'any new tag']);
});

test('whiteboard coordinates do not depend on screen size', () => {
  const view = { x: 0, y: 0, w: 53.33, h: 30 };
  const small = toBoard(50 + 400 * 0.5, 20 + 225 * 0.25, { left: 50, top: 20, width: 400, height: 225 }, view);
  const large = toBoard(10 + 1600 * 0.5, 30 + 900 * 0.25, { left: 10, top: 30, width: 1600, height: 900 }, view);
  assert.deepEqual(small.map(v => v.toFixed(3)), large.map(v => v.toFixed(3)));
  assert.deepEqual(small.map(v => +v.toFixed(3)), [26.665, 7.5]);
});

test('formations place 11 editable markers; flip mirrors left/right', () => {
  for (const name of FORMATIONS) assert.equal(formation(name).length, 11, name);
  const proI = formation('Pro I (11)', 18, 26.67);
  assert.ok(proI.every(o => o.type === 'marker' && o.side === 'offense'));
  assert.equal(formation('Cover 3 shell').filter(o => o.label === 'FS').length, 1);
  const flipped = flipObjects([{ id: 'a', type: 'marker', x: 10, y: 5 }, { id: 'b', type: 'arrow', points: [[1, 1], [5, 9]] }, { id: 'c', type: 'scrimmage', x: 0, y: 18 }], 53.33);
  assert.deepEqual([flipped[0].x, flipped[1].points[0][0], flipped[2].x], [43.33, 52.33, 0]);
  assert.deepEqual(flipObjects(flipped, 53.33)[0].x, 10);
});

test('whiteboard undo/redo and serialize → restore gives the same drawing', () => {
  const objects = [{ id: 'a', type: 'marker', shape: 'circle', side: 'offense', label: 'QB', x: 26, y: 20, color: '#FFFFFF' }];
  const h = new HistoryStack(JSON.stringify([]));
  h.push(JSON.stringify(objects));
  const moved = structuredClone(objects); moved[0].x = 30; h.push(JSON.stringify(moved));
  const recolored = structuredClone(moved); recolored[0].color = '#2563EB'; h.push(JSON.stringify(recolored));
  h.push(JSON.stringify([]));
  assert.deepEqual(JSON.parse(h.undo()), recolored);
  assert.deepEqual(JSON.parse(h.undo()), moved);
  assert.deepEqual(JSON.parse(h.redo()), recolored);
  const restored = JSON.parse(JSON.stringify(recolored));
  assert.equal(boardSvg('play', restored), boardSvg('play', recolored));
});

test('drawings escape text and keep the shape + label meaning, not only color', () => {
  const svg = objectSvg({ id: 'x', type: 'text', x: 1, y: 1, text: '<img src=x onerror=alert(1)>', color: '#F58220' });
  assert.ok(!svg.includes('<img'));
  const def = objectSvg({ id: 'd', type: 'marker', side: 'defense', label: 'FS', x: 5, y: 5 });
  assert.ok(def.includes('>FS<') && def.includes('#F58220'));
  assert.ok(boardSvg('field', []).includes('viewBox="0 0 120 53.33"'));
  assert.deepEqual(Object.keys(TEMPLATES), ['play', 'field', 'frame', 'blank']);
});

test('skill check sparkline describes the scores for screen readers', () => {
  const svg = sparkline([{ score: 2 }, { score: 3 }, { score: 4 }]);
  assert.ok(svg.includes('Scores over time: 2, 3, 4'));
  assert.equal(sparkline([]), '');
});
