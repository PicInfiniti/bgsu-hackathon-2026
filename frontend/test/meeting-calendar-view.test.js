import assert from 'node:assert/strict';
import test from 'node:test';
import {calendarDays,meetingCalendarMarkup,shiftCalendarDay} from '../src/meeting-calendar-view.js';
const base={id:'one',title:'Coverage <review>',date:'2026-11-21',meeting_type:'individual',items:[]};

test('month cells include neighboring dates, leap days and complete Monday-to-Sunday weeks',()=>{
  const november=calendarDays('2026-11');assert.equal(november.length,42);assert.equal(november[0],'2026-10-26');assert.equal(november.at(-1),'2026-12-06');
  const august=calendarDays('2026-08');assert.equal(august.length,42);assert.equal(august[0],'2026-07-27');assert.equal(august.at(-1),'2026-09-06');
  assert.ok(calendarDays('2028-02').includes('2028-02-29'));assert.ok(!calendarDays('2027-02').includes('2027-02-29'));
  assert.equal(shiftCalendarDay('2026-12-31',1),'2027-01-01');assert.equal(shiftCalendarDay('2026-11-01',7),'2026-11-08');
});

test('week view includes exactly the selected Monday-to-Sunday week across year boundaries',()=>{
  assert.deepEqual(calendarDays('2026-12','week','2026-12-31'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
});

test('colored meeting chips open exact IDs, escape titles and expose overflow without inventing times',()=>{
  const meetings=[base,{...base,id:'group',meeting_type:'group'},{...base,id:'team',meeting_type:'team'},{...base,id:'fourth',title:'Z extra meeting'}],before=structuredClone(meetings);
  const month=meetingCalendarMarkup(meetings,{month:'2026-11',today:'2026-11-21',selectedDate:'2026-11-21'});
  assert.ok(month.includes('event-individual'));assert.ok(month.includes('event-group'));
  assert.ok(month.includes('Coverage &lt;review&gt;'));assert.ok(!month.includes('<review>'));
  assert.ok(month.includes('+2 more meetings'));assert.equal((month.match(/data-open-meeting=/g)||[]).length,2);
  assert.ok(month.includes('is-today is-selected'));assert.ok(month.includes('aria-current="date"'));
  const week=meetingCalendarMarkup(meetings,{month:'2026-11',view:'week',anchor:'2026-11-21',today:'2026-11-21'});
  assert.ok(week.includes('event-team'));assert.equal((week.match(/data-open-meeting=/g)||[]).length,4);assert.ok(!week.includes('more meetings'));assert.ok(!week.includes(' AM'));assert.ok(!week.includes(' PM'));
  assert.deepEqual(meetings,before);
});

test('only open non-sensitive deadlines are shown and link to the correct day agenda',()=>{
  const items=[{kind:'action',due_date:'2026-11-25',completed:false},{kind:'action',due_date:'2026-11-25',completed:true},
    {kind:'action',due_date:'2026-11-26',sensitive:true},{kind:'action',due_date:'2026-11-27',topic:'Health & Injury Follow-up'},
    {kind:'praise',due_date:'2026-11-28'}];
  const html=meetingCalendarMarkup([{...base,items}],{month:'2026-11',today:'2026-11-21'});
  assert.ok(html.includes('1 open action due'));assert.equal((html.match(/class="meeting-calendar-due"/g)||[]).length,1);
  assert.ok(html.includes('data-large-calendar-date="2026-11-25"'));
  const empty=meetingCalendarMarkup([],{month:'2026-11',today:'2026-11-21'});assert.ok(!empty.includes('data-open-meeting='));assert.ok(empty.includes('data-large-calendar-date="2026-11-01"'));
});

test('day view keeps every meeting and year view links exact dates and months',()=>{
  const meetings=Array.from({length:5},(_,index)=>({...base,id:`day-${index}`}));
  meetings[0].items=[{kind:'action',due_date:'2026-12-01',completed:false}];
  const day=meetingCalendarMarkup(meetings,{month:'2026-11',today:'2026-11-21',view:'day',anchor:'2026-11-21'});
  assert.equal((day.match(/data-open-meeting=/g)||[]).length,5);
  assert.ok(day.includes('is-day-view'));assert.ok(!day.includes('more meeting'));
  assert.deepEqual(calendarDays('2026-11','day','2026-11-21'),['2026-11-21']);
  const year=meetingCalendarMarkup(meetings,{month:'2026-11',today:'2026-11-21',view:'year'});
  assert.equal((year.match(/class="meeting-mini-month"/g)||[]).length,12);
  assert.ok(year.includes('data-calendar-month="2026-12"'));
  assert.ok(year.includes('data-large-calendar-date="2026-12-01" class=" has-deadline'));
  assert.ok(year.includes('2026-11-21 · 5 meetings'));
  assert.ok(!year.includes('data-large-calendar-date="2026-02-29"'));
  const hidden=meetingCalendarMarkup(meetings,{month:'2026-11',today:'2026-11-21',view:'year',showDeadlines:false});
  assert.ok(!hidden.includes('has-deadline'));assert.ok(hidden.includes('2026-11-21 · 5 meetings'));
  const leap=meetingCalendarMarkup([],{month:'2028-02',today:'2028-02-01',view:'year'});
  assert.ok(leap.includes('data-large-calendar-date="2028-02-29"'));
});

test('deadline visibility leaves meeting chips intact and date steps clamp month ends',async()=>{
  const {addMonths}=await import('../src/calendar-math.js');
  assert.equal(addMonths('2026-01-31',1),'2026-02-28');
  assert.equal(addMonths('2028-01-31',1),'2028-02-29');
  assert.equal(addMonths('2026-12-01',1),'2027-01-01');
  const html=meetingCalendarMarkup([{...base,items:[{kind:'action',due_date:'2026-11-25'}]}],{month:'2026-11',today:'2026-11-21',showDeadlines:false});
  assert.ok(!html.includes('open action'));assert.ok(html.includes('data-open-meeting="one"'));
});
