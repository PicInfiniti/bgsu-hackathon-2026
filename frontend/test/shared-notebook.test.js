import assert from 'node:assert/strict';
import test from 'node:test';
import { isDemoLogin, workspaceMode } from '../src/access.js';
import { loadSharedNotebook } from '../src/shared-notebook.js';

test('demo/demo opens Demo; other credentials are not accepted as demo access', () => {
  assert.equal(isDemoLogin('demo', 'demo'), true);
  assert.equal(isDemoLogin('demo', 'wrong'), false);
  assert.equal(isDemoLogin('coach@example.com', 'demo'), false);
  assert.equal(workspaceMode('?mode=demo'), 'demo');
  assert.equal(workspaceMode('?mode=live'), 'live');
  assert.equal(workspaceMode(''), 'live');
});

test('load shared SQLite data after migrating legacy browser history without replacing it', async () => {
  const history = [{id:'old-browser-note'}], saved = [{id:'sqlite-note'}];
  const calls = [];
  const api = async (path, body) => {
    calls.push({path, body});
    if (path === '/health') return {aivana_configured:true};
    if (path === '/meetings/import') return {imported:1};
    return saved;
  };
  const result = await loadSharedNotebook(api, {getItem: () => JSON.stringify(history)});
  assert.equal(result.meetings, saved);
  assert.equal(result.migrationError, '');
  assert.deepEqual(calls.find(c => c.path === '/meetings/import').body, {meetings:history});
});

test('failed legacy import still loads SQLite and reports that browser history is preserved', async () => {
  const saved = [{id:'sqlite-note'}];
  const api = async (path) => {
    if (path === '/health') return {};
    if (path === '/meetings/import') throw Error('Invalid legacy record');
    return saved;
  };
  const result = await loadSharedNotebook(api, {getItem: () => '[{"id":"old-note"}]'});
  assert.equal(result.meetings, saved);
  assert.match(result.migrationError, /preserved/);
});

test('backend failure is surfaced, never replaced with a different demo dataset', async () => {
  await assert.rejects(() => loadSharedNotebook(async () => { throw Error('Backend unavailable'); }), /Backend unavailable/);
});
