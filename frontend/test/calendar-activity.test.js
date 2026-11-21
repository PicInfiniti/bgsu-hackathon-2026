import assert from 'node:assert/strict';
import test from 'node:test';
import { activityForDate, calendarGrid, calendarMeetings, playerCalendarMeetings } from '../src/calendar-activity.js';

test('selected date includes its meetings and actions due that day, including completed tasks',()=>{
  const meetings=[{id:'m1',date:'2026-11-20',items:[
    {kind:'action',due_date:'2026-11-21',completed:false},
    {kind:'action',due_date:'2026-11-21',completed:true},
    {kind:'action',due_date:'2026-11-22',completed:false},
    {kind:'praise',due_date:null},
    {kind:'action',due_date:'2026-11-21',sensitive:true},
  ]},{id:'m2',date:'2026-11-21',items:[]}];
  const result=activityForDate(meetings,'2026-11-21');
  assert.deepEqual(result.meetings.map(m=>m.id),['m2']);
  assert.equal(result.actions.length,2);
  assert.equal(result.actions[1].completed,true);
  assert.equal(result.hiddenActionCount,1);
  const revealed=activityForDate(meetings,'2026-11-21',{showSensitive:true});
  assert.equal(revealed.actions.length,3);
  assert.equal(revealed.hiddenActionCount,0);
  assert.deepEqual(activityForDate(meetings,'2026-12-01'),{meetings:[],actions:[],hiddenActionCount:0});
});

test('overview uses simple markers while action calendar filters meeting types and deadlines',()=>{
  const meetings=[
    {id:'g',date:'2026-11-21',meeting_type:'group',attendees:['p1','p2'],items:[{kind:'action',player_id:'p1',due_date:'2026-11-24'}]},
    {id:'t',date:'2026-11-21',meeting_type:'team',attendees:['p1','p2'],items:[]},
    {id:'i',date:'2026-11-20',meeting_type:'individual',attendees:['p2'],items:[{kind:'action',player_id:'p2',due_date:'2026-11-25'}]},
  ];
  const overview=calendarGrid(meetings,'2026-11','2026-11-21',null);
  assert.ok(overview.includes('class="meeting-dot"'));
  assert.ok(!overview.includes('class="meeting-group"'));
  assert.ok(overview.includes('2 saved meetings'));
  const typed=calendarGrid(meetings,'2026-11','2026-11-21','2026-11-21',true);
  assert.ok(typed.includes('class="meeting-group"'));
  assert.ok(typed.includes('class="meeting-team"'));
  assert.ok(typed.includes('1 group meeting, 1 full team meeting'));
  const groupOnly=calendarMeetings(meetings,'group');
  assert.deepEqual(groupOnly.map(m=>m.id),['g']);
  const grid=calendarGrid(groupOnly,'2026-11','2026-11-21',null,true);
  assert.ok(grid.includes('2026-11-24, open action due'));
  assert.ok(!grid.includes('2026-11-25, open action due'));
  const personal=playerCalendarMeetings(meetings,'p1');
  assert.deepEqual(personal.map(m=>m.id),['g','t']);
  assert.ok(!calendarGrid(personal,'2026-11','2026-11-21',null,true).includes('2026-11-25, open action due'));
  const p2=playerCalendarMeetings(meetings,'p2');
  assert.equal(p2.find(m=>m.id==='g').items.length,0);
  assert.equal(meetings[0].items.length,1);
});
