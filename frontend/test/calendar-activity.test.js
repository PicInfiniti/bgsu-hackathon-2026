import assert from 'node:assert/strict';
import test from 'node:test';
import { activityForDate } from '../src/calendar-activity.js';

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
  assert.deepEqual(activityForDate(meetings,'2026-12-01'),{meetings:[],actions:[],hiddenActionCount:0});
});
