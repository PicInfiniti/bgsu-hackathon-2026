import test from 'node:test';
import assert from 'node:assert/strict';
import { headerMeta, playerFacts, playerRecords, strengthsAndWorkOns, recentActivity, goalsAndAgreements, overviewParts, TABS } from '../src/player-page.js';
import { notebookRows, viewCounts, DELETE_FOLDER_TEXT, SMART_VIEWS } from '../src/notebook-views.js';
import { supportMailto, SUPPORT_TO, SUPPORT_SUBJECT, SUPPORT_BODY, QA } from '../src/help-page.js';
import { step, shouldStart, TOURS } from '../src/tour.js';
import { checkPlayer, applyRoster, roomFor } from '../src/roster-store.js';
import { playedChoices } from '../src/game-played.js';
import { LOCAL_ACCOUNT_NOTE } from '../src/profile-menu.js';

const jordan = { id: 'p02', name: 'Jordan Ellis', number: 12, position: 'WR', position_label: 'Wide receiver', position_group: 'WR', class_year: 'Junior', height: '6\'1"', weight: '185' };
const meetings = [
  { id: 'm2', date: '2026-11-18', title: 'Film', note: 'n', items: [
    { id: 'a', kind: 'action', text: 'Watch three coverage clips', player_id: 'p02', due_date: '2026-11-17', completed: false },
    { id: 'b', kind: 'improvement', text: 'Get off press faster', skill: 'Release', player_id: 'p02' },
    { id: 'c', kind: 'praise', text: 'Great effort on blocks', player_id: 'p02', tags: ['effort', 'goal'] },
    { id: 's', kind: 'improvement', text: 'Health item', player_id: 'p02', sensitive: true }] },
  { id: 'm1', date: '2026-11-10', title: 'Old', note: 'n', items: [
    { id: 'd', kind: 'praise', text: 'Great effort on blocks', player_id: 'p02' },
    { id: 'e', kind: 'action', text: 'Ran the dig', player_ids: ['p02', 'p03'], completed: true }] },
];

test('header meta line: position, room, facts and games played only when a list was saved', () => {
  assert.equal(headerMeta(jordan), 'Wide receiver · Receivers room · Junior · 6\'1", 185 lb');
  assert.equal(headerMeta(jordan, { played: 9, of: 10 }), 'Wide receiver · Receivers room · Junior · 6\'1", 185 lb · Games played 9 of 10');
  assert.ok(!headerMeta(jordan, null).includes('Games played'));  // no list: nothing shown, not 0
  assert.equal(headerMeta({ ...jordan, class_year: null, height: null, weight: null, active: false }), 'Wide receiver · Receivers room · Inactive');
});

test('4 facts, 3 overview cards, tabs; sensitive notes stay out; repeated lines show once', () => {
  const records = playerRecords(meetings, 'p02');
  assert.ok(!records.some(r => r.sensitive));
  const game = { event: { date: '2026-11-21' }, opponent: 'North', home_away: 'home', next_one_on_one: { date: '2026-11-24', title: '1-on-1: Jordan Ellis' } };
  const facts = playerFacts({ records, today: '2026-11-21', game });
  assert.deepEqual(facts.map(f => f.key), ['meeting', 'assignments', 'focus', 'game']);
  assert.equal(facts[1].value, '1 open'); assert.equal(facts[1].detail, '1 late');
  assert.equal(facts[2].value, 'Release'); assert.equal(facts[3].value, 'North');
  assert.equal(playerFacts({ records: [], today: '2026-11-21', game: null })[0].value, 'None planned');
  assert.equal(strengthsAndWorkOns(records).strengths.length, 1);  // same praise in two meetings: once
  assert.equal(recentActivity(records).length, 3);
  assert.deepEqual(goalsAndAgreements(records).map(r => r.id), ['c']);
  assert.deepEqual(Object.keys(overviewParts({ records, facts, game })), ['prep', 'strengths', 'recent']);
  assert.deepEqual(TABS.map(t => t[1]), ['Overview', 'Timeline', 'Assignments', 'Film & diagrams', 'Development']);
});

test('player form checks: name, number, duplicate number warning in the same season only', () => {
  const all = [{ id: 'p01', name: 'Avery Brooks', number: 4, season: '2026' }, { id: 'p09', name: 'Old Player', number: 7, season: '2026', active: false }];
  const base = { first_name: 'Sam', last_name: 'Ortiz', number: '4', position: 'WR', position_group: 'WR', season: '2026' };
  assert.deepEqual(checkPlayer(base, all).warnings, ['#4 is also worn by Avery Brooks this season.']);
  assert.deepEqual(checkPlayer({ ...base, season: '2027' }, all).warnings, []);
  assert.deepEqual(checkPlayer({ ...base, number: '7' }, all).warnings, []);  // inactive players don't count
  assert.deepEqual(checkPlayer(base, all, 'p01').warnings, []);  // editing yourself
  for (const bad of [{ first_name: '' }, { last_name: 'R2' }, { number: '100' }, { number: '' }, { number: '4.5' }, { position: '' }])
    assert.ok(checkPlayer({ ...base, ...bad }, all).errors.length, JSON.stringify(bad));
  assert.equal(roomFor('CB'), 'DB');
  const list = [{ id: 'x' }];
  applyRoster(list, [{ id: 'a' }, { id: 'b', active: false }]);
  assert.deepEqual(list.map(p => p.id), ['a']);  // pickers get active players only, same array
});

test('folders: smart views are computed, folder filter and search combine, search covers all folders', () => {
  const notes = [{ id: 1, notebook: 'personal', title: 'Blitz idea', body: 'zero pressure', note_date: '2026-11-20', updated_at: '1', folder_id: 5 },
    { id: 2, notebook: 'team_strategy', title: 'Red zone', body: 'fade', note_date: '2026-11-19', updated_at: '1', folder_id: null }];
  const filmNotes = [{ id: 9, text: 'Read the safety', film_title: 'North', created_at: '2026-11-18T10:00', tags: [] }];
  const ids = (o) => notebookRows({ notes, meetings, filmNotes, ...o }).map(r => `${r.kind}:${r.id}`);
  assert.deepEqual(ids({}), ['note:1', 'note:2', 'film:9', 'meeting:m2', 'meeting:m1']);
  assert.deepEqual(ids({ view: 'personal' }), ['note:1']);
  assert.deepEqual(ids({ view: 'film' }), ['film:9']);
  assert.deepEqual(ids({ folder: 5 }), ['note:1']);
  assert.deepEqual(ids({ folder: 'none' }), ['note:2']);
  assert.deepEqual(ids({ search: 'fade' }), ['note:2']);  // search finds it in any folder
  assert.deepEqual(ids({ search: 'fade', folder: 5 }), []);  // filter + search combine
  assert.equal(viewCounts({ notes, meetings, filmNotes }).all, 5);
  assert.deepEqual(SMART_VIEWS.map(v => v.label), ['All notes', 'Private', 'Player meetings', 'Game plans', 'Film observations']);
  assert.match(DELETE_FOLDER_TEXT('Week 12', 3), /3 notes move to No folder\. No note is deleted\./);
});

test('support email: fixed recipients and subject, blank template, never app data', () => {
  const link = supportMailto();
  assert.ok(link.startsWith(`mailto:${SUPPORT_TO.join(',')}?subject=`));
  assert.deepEqual(SUPPORT_TO, ['salmah@bgsu.edu', 'moghadm@bgsu.edu']);
  assert.equal(decodeURIComponent(link.split('subject=')[1].split('&')[0]), SUPPORT_SUBJECT);
  const body = decodeURIComponent(link.split('body=')[1]);
  for (const words of ['Page', 'step by step', 'expected', 'happened instead']) assert.ok(body.includes(words), words);
  assert.equal(body, SUPPORT_BODY);  // a constant: nothing from the notebook can get in
  assert.equal(supportMailto.length, 0);
  assert.ok(QA.length >= 10);
});

test('tours: Back, Next, Close ends everything; finished or closed tours do not start again', () => {
  assert.equal(TOURS.welcome.length, 4); assert.equal(TOURS.film.length, 5); assert.ok(TOURS.playboard.length >= 3);
  let s = { index: 0 };
  s = step(s, 'back', 4); assert.equal(s.index, 0);
  s = step(step(s, 'next', 4), 'next', 4); assert.equal(s.index, 2);
  assert.equal(step(s, 'close', 4).ended, 'dismissed');
  assert.equal(step({ index: 3 }, 'next', 4).ended, 'done');
  assert.equal(shouldStart({ tours: {} }, 'welcome'), true);
  assert.equal(shouldStart({ tours: { welcome: 'dismissed' } }, 'welcome'), false);
  assert.equal(shouldStart({ tours: { welcome: 'done' } }, 'film'), true);
});

test('who played: active players of the game audience, grouped by room', () => {
  const players = [{ id: 'a', position_group: 'WR' }, { id: 'b', position_group: 'QB' }, { id: 'c', position_group: 'WR', active: false }];
  assert.deepEqual(playedChoices(players, 'team').map(([r, ps]) => [r, ps.map(p => p.id)]), [['QB', ['b']], ['WR', ['a']]]);
  assert.deepEqual(playedChoices(players, 'group:WR').map(([r]) => r), ['WR']);
});

test('no Sign out without real accounts: the menu says it is a local demo', () => {
  assert.equal(LOCAL_ACCOUNT_NOTE, 'Local demo · one coach on this computer');
});
