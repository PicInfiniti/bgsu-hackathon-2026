import assert from 'node:assert/strict';
import test from 'node:test';
import { upcomingActions } from '../src/upcoming.js';

test('upcoming is ordered by date and excludes past, completed, undated, and sensitive actions',()=>{
  const meetings=[{items:[
    {id:'later',kind:'action',due_date:'2026-11-24'},
    {id:'past',kind:'action',due_date:'2026-11-20'},
    {id:'today',kind:'action',due_date:'2026-11-21'},
    {id:'done',kind:'action',due_date:'2026-11-22',completed:true},
    {id:'private',kind:'action',due_date:'2026-11-22',sensitive:true},
    {id:'undated',kind:'action',due_date:null},
    {id:'praise',kind:'praise',due_date:null},
  ]}];
  assert.deepEqual(upcomingActions(meetings,'2026-11-21').map(i=>i.id),['today','later']);
  assert.equal(upcomingActions(meetings,'2026-11-21',1)[0].id,'today');
  assert.deepEqual(upcomingActions(meetings,'2026-12-01'),[]);
});
