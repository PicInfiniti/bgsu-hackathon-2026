import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractDemo } from '../src/demo-extraction.js';

const demo = JSON.parse(readFileSync(new URL('../../data/demo.json', import.meta.url)));
const relative = demo.samples.find(s => s.id === 'relative-date');

test('demo refuses a changed meeting date rather than returning a stale tomorrow deadline', () => {
  assert.equal(extractDemo(relative, demo.samples)[0].due_date, '2026-11-21');
  assert.throws(() => extractDemo({...relative, date: '2026-12-01'}, demo.samples), /date/);
});

test('editing an extracted fixture does not change later extractions', () => {
  const draft = extractDemo(relative, demo.samples);
  draft[0].text = 'Coach correction';
  assert.notEqual(extractDemo(relative, demo.samples)[0].text, draft[0].text);
});
