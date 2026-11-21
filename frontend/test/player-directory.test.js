import assert from 'node:assert/strict';
import test from 'node:test';
import { filterPlayers, summarizePlayers } from '../src/player-directory.js';

const players = [
  {id:'p01', name:'Avery Brooks', nickname:'AB', number:4, position:'QB', position_label:'Quarterback', position_group:'QB'},
  {id:'p02', name:'Jordan Ellis', number:12, position:'CB', position_label:'Cornerback', position_group:'DB'},
  {id:'p03', name:'Charlie Wynn', number:24, position:'P', position_group:'ST'},
];
const meetings = [
  {id:'m1', date:'2026-11-19', attendees:['p01','p02'], items:[
    {player_id:'p01', kind:'action', completed:false, due_date:'2026-11-19', text:'Film review'},
    {player_id:'p01', kind:'action', completed:true, due_date:'2026-11-18', text:'Completed drill'},
    {player_id:'p01', kind:'praise', due_date:null, text:'Clear calls'},
  ]},
  {id:'m2', date:'2026-11-20', attendees:['p01'], items:[
    {player_id:'p01', kind:'action', completed:false, due_date:null, text:'No deadline'},
    {player_id:'p01', kind:'action', completed:false, due_date:'2026-11-20', text:'Due today'},
  ]},
];

test('player snapshot counts meetings once and excludes completed actions from open/overdue totals', () => {
  const summary = summarizePlayers(players, meetings, '2026-11-20');
  assert.equal(summary[0].meetingCount, 2);
  assert.equal(summary[0].openCount, 3);
  assert.equal(summary[0].overdueCount, 1);
  assert.equal(summary[0].latest.meeting.date, '2026-11-20');
  assert.equal(summary[1].meetingCount, 1);
  assert.equal(summary[1].openCount, 0);
  assert.equal(summary[2].meetingCount, 0);
  assert.equal(summary[2].unit, 'Special Teams');
});

test('roster filters combine search, football unit, group, and position', () => {
  const summary = summarizePlayers(players, meetings, '2026-11-20');
  assert.deepEqual(filterPlayers(summary, {search:'#12'}).map(p => p.id), ['p02']);
  assert.deepEqual(filterPlayers(summary, {search:' AB ', unit:'Offense', group:'QB', position:'QB'}).map(p => p.id), ['p01']);
  assert.deepEqual(filterPlayers(summary, {unit:'Defense', position:'QB'}), []);
  assert.equal(filterPlayers(summary, {search:'no such player'}).length, 0);
  assert.equal(filterPlayers(summary).length, players.length);
});
