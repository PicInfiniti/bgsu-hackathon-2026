import assert from 'node:assert/strict';
import test from 'node:test';
import {preparationMeetings,preparationChoices,consumePreparation} from '../src/preparation.js';
const item={id:'i',player_id:'p1',kind:'action',text:'Footwork task'};
const source={id:'old',title:'Film <review>',date:'2026-11-10',approved:true,attendees:['p1','p2'],items:[item,{...item,id:'other',player_id:'p2'},{...item,id:'sensitive',sensitive:true},{...item,id:'legacy',topic:'Health & Injury Follow-up'}]};

test('source choices exclude unapproved, unrelated, sensitive and note-only records without mutation',()=>{
  const meetings=[source,{...source,id:'draft',approved:false},{...source,id:'note',items:[]},{...source,id:'other',attendees:['p2']}],before=structuredClone(meetings);
  const choices=preparationMeetings(meetings,'p1');assert.equal(choices.length,1);assert.deepEqual(choices[0].items,[item]);assert.deepEqual(meetings,before);
  const html=preparationChoices(choices,new Set(['old']));assert.ok(html.includes('Film &lt;review&gt;'));assert.ok(html.includes('checked'));assert.ok(html.includes('1 record'));
  assert.ok(!preparationChoices(choices,new Set()).includes(' checked'));assert.ok(preparationChoices([]).includes('No approved'));
});

function response(frames,step=7){const data=new TextEncoder().encode(frames);return new Response(new ReadableStream({start(c){for(let i=0;i<data.length;i+=step)c.enqueue(data.slice(i,i+step));c.close();}}));}

test('POST stream consumer handles chunked UTF-8, CRLF, context, deltas and terminal done',async()=>{
  const events=[];const done=await consumePreparation(response('event: context\r\ndata: {"record_count":1}\r\n\r\nevent: delta\r\ndata: {"text":"Zoë 🏈"}\r\n\r\nevent: done\r\ndata: {"finish_reason":"stop"}\r\n\r\n',1),(e,p)=>events.push([e,p]));
  assert.equal(done.finish_reason,'stop');assert.equal(events[1][1].text,'Zoë 🏈');assert.deepEqual(events.map(e=>e[0]),['context','delta','done']);
});

test('HTTP errors, server error events, malformed events and early EOF fail explicitly',async()=>{
  await assert.rejects(()=>consumePreparation(new Response(JSON.stringify({detail:'Choose a source'}),{status:422}),()=>{}),/Choose a source/);
  await assert.rejects(()=>consumePreparation(response('event: error\ndata: {"message":"No balance"}\n\n'),()=>{}),/No balance/);
  await assert.rejects(()=>consumePreparation(response('event: delta\ndata: invalid\n\n'),()=>{}),/Unreadable/);
  await assert.rejects(()=>consumePreparation(response('event: delta\ndata: {"text":"partial"}\n\n'),()=>{}),/before completion/);
});
