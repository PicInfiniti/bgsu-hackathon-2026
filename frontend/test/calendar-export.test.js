import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCalendar, eligibleCalendarActions, calendarActionKey, exportChoicesMarkup } from '../src/calendar-export.js';
import { filterActions } from '../src/action-board.js';

const players = [{id:'p1',name:'Avery <Smith>',number:4,position:'QB'},{id:'p2',name:'Jordan',number:8,position:'DB'}];
const meeting = {id:'meeting/one',title:'Film, review; next steps',date:'2026-11-20',approved:true,attendees:['p1','p2'],note:'Full source note must not be exported.'};
const base = {id:'task1',meeting,kind:'action',player_id:'p1',text:'Review coverage clips',quote:'Raw source excerpt',due_date:'2026-11-23',completed:false,skill:'Decision-Making',topic:'Football Skills'};
const now = new Date('2026-11-21T16:30:00Z');
const unfold = value => value.replace(/\r\n /g,'');

test('only approved open dated roster actions can be exported; sensitive topics fail closed', () => {
  const actions = [base,{...base,id:'done',completed:true},{...base,id:'undated',due_date:null},
    {...base,id:'invalid',due_date:'2026-02-30'},{...base,id:'past-source',due_date:'2026-11-19'},
    {...base,id:'sensitive',sensitive:true},{...base,id:'legacy',sensitive:false,topic:'Health & Injury Follow-up'},
    {...base,id:'insurance',topic:'Insurance & Administration'},{...base,id:'praise',kind:'praise'},
    {...base,id:'draft',meeting:{...meeting,approved:false}},{...base,id:'other',player_id:'unknown'},
    {...base,id:'absent',meeting:{...meeting,attendees:['p2']}},{...base,id:'blank',text:''},
    {...base,id:'bad-source',meeting:{...meeting,date:'invalid'}},base];
  assert.deepEqual(eligibleCalendarActions(actions,players).map(e=>e.item.id),['task1']);
  const content=unfold(buildCalendar(actions,players,{now}).content);
  assert.equal((content.match(/BEGIN:VEVENT/g)||[]).length,1);
  assert.ok(!content.includes('Full source note'));
  assert.ok(!content.includes('Raw source excerpt'));
});

test('selected action identities include the source meeting and preserve independent player updates', () => {
  const group = [{...base,display_group:{id:'shared'}},{...base,id:'task2',player_id:'p2',completed:true},
    {...base,id:'task3',player_id:'p2'},{...base,meeting:{...meeting,id:'another'}}];
  const selectedKeys=[calendarActionKey(group[0]),calendarActionKey(group[3])];
  const result=buildCalendar(group,players,{now,selectedKeys});
  assert.equal(result.count,2);
  const all=buildCalendar(group,players,{now});
  assert.equal(all.count,3);
  const uids=unfold(all.content).split('\r\n').filter(l=>l.startsWith('UID:'));
  assert.equal(new Set(uids).size,3);
  assert.deepEqual(uids,unfold(buildCalendar(group,players,{now:new Date('2026-12-01T00:00:00Z')}).content).split('\r\n').filter(l=>l.startsWith('UID:')));
  assert.throws(()=>buildCalendar(group,players,{now,selectedKeys:[]}));
  assert.throws(()=>buildCalendar(group,players,{now,selectedKeys:['unknown']}));
});

test('all-day dates and exclusive end dates retain local due dates through leap/month/year boundaries', () => {
  for (const [due,end] of [['2026-11-23','20261124'],['2026-12-31','20270101'],['2028-02-29','20280301'],['2026-03-08','20260309']]) {
    const result=buildCalendar([{...base,due_date:due,meeting:{...meeting,date:'2020-01-01'}}],players,{now});
    assert.ok(result.content.includes(`DTSTART;VALUE=DATE:${due.replaceAll('-','')}`));
    assert.ok(result.content.includes(`DTEND;VALUE=DATE:${end}`));
    assert.ok(result.content.includes('DTSTAMP:20261121T163000Z'));
    assert.ok(!result.content.includes('TZID'));
  }
});

test('RFC text escaping, CRLF and UTF-8 line folding prevent injected components and preserve Unicode', () => {
  const text = 'Coverage, calls; paths\\reps\nBEGIN:VEVENT\r\nSUMMARY:injected\t\0' + '🏈é'.repeat(50);
  const result=buildCalendar([{...base,text}],players,{now});
  const expanded=unfold(result.content);
  assert.ok(expanded.includes('Coverage\\, calls\\; paths\\\\reps\\nBEGIN:VEVENT\\nSUMMARY:injected'));
  assert.ok(expanded.includes('🏈é'.repeat(50)));
  assert.equal(expanded.split('\r\n').filter(l=>l==='BEGIN:VEVENT').length,1);
  assert.ok(!/(?<!\r)\n/.test(result.content));
  assert.ok(!result.content.includes('\0'));
  assert.ok(result.content.endsWith('END:VCALENDAR\r\n'));
  for (const line of result.content.split('\r\n')) assert.ok(new TextEncoder().encode(line).length<=75);
  assert.ok(expanded.includes('CLASS:PRIVATE'));
  assert.ok(expanded.includes('TRANSP:TRANSPARENT'));
});

test('description identifies action/player/source; optional display alarm is explicit', () => {
  const result=buildCalendar([base],players,{now,reminder:'day-before'});
  const content=unfold(result.content);
  assert.ok(content.includes('Player: Avery <Smith>'));
  assert.ok(content.includes('Source meeting: Film\\, review\\; next steps'));
  assert.ok(content.includes('Meeting date: 2026-11-20'));
  assert.ok(content.includes('BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-P1D'));
  assert.ok(!buildCalendar([base],players,{now}).content.includes('VALARM'));
  assert.throws(()=>buildCalendar([base],players,{now,reminder:'invalid'}));
  assert.throws(()=>buildCalendar([base],players,{now:new Date('invalid')}));
});

test('board filters restrict preview/export and preview escapes action/source/roster text', () => {
  const actions=[base,{...base,id:'other',player_id:'p2'},{...base,id:'sensitive',sensitive:true}];
  const filtered=filterActions(actions,players,{status:'open',player:'p1',today:'2026-11-21'});
  assert.equal(buildCalendar(filtered,players,{now}).count,1);
  assert.equal(eligibleCalendarActions(filterActions(actions,players,{status:'done'}),players).length,0);
  const html=exportChoicesMarkup(eligibleCalendarActions([{...base,text:'Task <script>bad</script>'}],players));
  assert.ok(html.includes('Task &lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('Avery &lt;Smith&gt;'));
  assert.ok(html.includes('name="calendar-export-action"'));
  assert.ok(!html.includes('<script>'));
  assert.ok(exportChoicesMarkup([]).includes('No exportable actions match'));
  assert.deepEqual(actions,[base,{...base,id:'other',player_id:'p2'},{...base,id:'sensitive',sensitive:true}]);
});
