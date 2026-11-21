import assert from 'node:assert/strict';
import test from 'node:test';
import { checkInRecency, checkInMarkup } from '../src/check-in-recency.js';

const players = [
  {id:'p1',name:'Avery <Smith>',number:4}, {id:'p2',name:'Jordan',number:8},
  {id:'p3',name:'Morgan',number:10}, {id:'p4',name:'Casey',number:11},
];
const note = (id,date,attendees,extra={}) => ({id,date,attendees,approved:true,meeting_type:'individual',items:[],note_only:true,...extra});

test('inclusive recent window separates today, last included day, boundary and never-recorded players', () => {
  const meetings=[note('today','2026-11-21',['p1']), note('included','2026-11-08',['p2']), note('boundary','2026-11-07',['p3'])];
  const result=checkInRecency(players,meetings,'2026-11-21');
  assert.equal(result.start,'2026-11-08');
  assert.equal(result.recentCount,2);
  assert.deepEqual(result.players.map(p=>[p.id,p.lastDate,p.daysSince]),[['p4',null,null],['p3','2026-11-07',14]]);
  assert.equal(result.total,4);
});

test('future plans, unapproved notes and invalid dates cannot hide players needing a check-in', () => {
  const meetings=[note('old','2026-10-01',['p1']),note('future','2026-11-26',['p1','p2']),
    note('draft','2026-11-21',['p2'],{approved:false}),note('legacy','2026-11-21',['p3'],{approved:undefined}),
    note('invalid','2026-02-30',['p4'])];
  const before=structuredClone({players,meetings});
  const result=checkInRecency(players,meetings,'2026-11-21');
  assert.equal(result.recentCount,0);
  assert.deepEqual(result.players.map(p=>p.id),['p4','p2','p3','p1']);
  assert.equal(result.players.at(-1).lastDate,'2026-10-01');
  assert.deepEqual({players,meetings},before);
});

test('meeting type filters count only actual selected attendees including note-only group and team dates', () => {
  const meetings=[note('one','2026-11-20',['p1']),note('group','2026-11-20',['p2'],{meeting_type:'group'}),
    note('team','2026-11-20',['p2','p3'],{meeting_type:'team'})];
  assert.equal(checkInRecency(players,meetings,'2026-11-21').recentCount,1);
  assert.equal(checkInRecency(players,meetings,'2026-11-21',{type:''}).recentCount,3);
  assert.equal(checkInRecency(players,meetings,'2026-11-21',{type:'group'}).recentCount,1);
  assert.equal(checkInRecency(players,meetings,'2026-11-21',{type:'team'}).recentCount,2);
  assert.equal(checkInRecency(players,[note('old','2026-10-25',['p1'])],'2026-11-21',{days:30}).recentCount,1);
});

test('latest date is used regardless of input order; calendar days handle DST, leap days and year rollover', () => {
  assert.equal(checkInRecency(players,[note('new','2026-11-01',['p1']),note('old','2026-10-20',['p1'])],'2026-11-08',{days:7}).players.find(p=>p.id==='p1').daysSince,7);
  assert.equal(checkInRecency(players,[note('leap','2024-02-29',['p1'])],'2024-03-01',{days:1}).players.find(p=>p.id==='p1').daysSince,1);
  assert.equal(checkInRecency(players,[],'2027-01-01',{days:7}).start,'2026-12-26');
  const result=checkInRecency(players,[note('old','2026-10-01',['p1']),note('new','2026-10-03',['p1']),note('older','2026-09-01',['p2'])],'2026-11-21');
  assert.deepEqual(result.players.map(p=>p.id),['p4','p3','p2','p1']);
});

test('empty/all-recent rosters and invalid configuration are handled explicitly', () => {
  assert.equal(checkInRecency([],[],'2026-11-21').total,0);
  const all=checkInRecency(players,[note('today','2026-11-21',players.map(p=>p.id))],'2026-11-21');
  assert.equal(all.players.length,0);
  assert.ok(checkInMarkup(all).includes('Every player has a matching meeting recorded'));
  for (const options of [{days:0},{days:-1},{days:1.5},{days:Infinity},{type:'unknown'}]) assert.throws(()=>checkInRecency(players,[],'2026-11-21',options));
  assert.throws(()=>checkInRecency(players,[],'2026-02-30'));
});

test('rendered list links to timelines, escapes roster text and never includes sensitive meeting text', () => {
  const result=checkInRecency(players,[note('private','2026-10-01',['p1'],{note:'Secret trainer details',items:[{sensitive:true,text:'Private task'}]})],'2026-11-21');
  const html=checkInMarkup(result);
  assert.ok(html.includes('Avery &lt;Smith&gt;'));
  assert.ok(html.includes('data-open-player="p1"'));
  assert.ok(html.includes('Last saved: 2026-10-01'));
  assert.ok(html.includes('No past individual meeting saved'));
  assert.ok(!html.includes('Secret trainer details'));
  assert.ok(!html.includes('Private task'));
});
