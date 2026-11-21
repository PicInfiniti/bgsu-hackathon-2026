import test from 'node:test';
import assert from 'node:assert/strict';
import { filterActions } from '../src/action-board.js';
const players = [{id:'p1',name:'Jordan Ellis',number:12,position:'CB'},{id:'p2',name:'Avery Brooks',number:4,position:'QB'}];
const actions = [
  {id:'late',kind:'action',player_id:'p1',text:'Review coverage clips',skill:'Positioning',due_date:'2026-11-19',meeting:{title:'Film review',date:'2026-11-18'}},
  {id:'today',kind:'action',player_id:'p2',text:'Footwork reps',skill:'Footwork',topic:'Technique',due_date:'2026-11-21',meeting:{date:'2026-11-20'}},
  {id:'undated',kind:'action',player_id:'p1',text:'Ask coach',skill:'Communication'},
  {id:'done',kind:'action',player_id:'p1',text:'Complete drill',completed:true,due_date:'2026-11-18'},
  {id:'sensitive',kind:'action',player_id:'p2',text:'Private follow-up',sensitive:true},
  {id:'team',kind:'action',player_ids:['p1','p2'],text:'Team walkthrough',skill:'Communication',due_date:'2026-11-23'},
];
const select = options => filterActions(actions,players,{today:'2026-11-21',...options}).map(i=>i.id);
test('open deadlines are ascending, undated last, sensitive and completed hidden',()=> {
  assert.deepEqual(select({}),['late','today','team','undated']);
});
test('overdue excludes today, completed and undated actions',()=> {
  assert.deepEqual(select({status:'overdue'}),['late']);
  assert.deepEqual(select({status:'done'}),['done']);
});
test('search finds player, jersey, category and meeting; combined filters apply',()=> {
  assert.deepEqual(select({search:'12'}),['late','team','undated']);
  assert.deepEqual(select({search:'film review'}),['late']);
  assert.deepEqual(select({search:'technique'}),['today']);
  assert.deepEqual(select({player:'p2',category:'Communication'}),['team']);
  assert.deepEqual(select({search:'not found'}),[]);
});
test('sensitive actions require explicit reveal, player and recent sorting are deterministic',()=> {
  assert.equal(select({status:'all'}).includes('sensitive'),false);
  assert.equal(select({status:'all',showSensitive:true}).includes('sensitive'),true);
  assert.equal(select({sort:'player'})[0],'today');
  assert.equal(select({sort:'recent'})[0],'today');
});
