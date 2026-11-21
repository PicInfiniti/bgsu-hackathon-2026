import assert from 'node:assert/strict';
import { assistantAnswerMarkup } from '../src/assistant-view.js';

const source = {source_id:'S1', date:'2026-11-20', title:'Film <review>', text:'Footwork <script>alert(1)</script>', kind:'action', skill:'Footwork & Agility', completed:false, due_date:'2026-11-23'};
const result = {origin:'aivana', statements:[{text:'Coach said <img src=x onerror=alert(1)>',source_ids:['S1','unknown']}], suggestions:['Ask <b>why</b>?'], sources:[source], context_count:1, matched_count:20, limited:true};
const html = assistantAnswerMarkup(result);
assert.ok(!html.includes('<script>'));
assert.ok(!html.includes('<img'));
assert.ok(html.includes('&lt;img'));
assert.ok(html.includes('data-assistant-source="S1"'));
assert.ok(!html.includes('data-assistant-source="unknown"'));
assert.ok(html.includes('2026-11-20 · S1'));
assert.ok(html.includes('data-assistant-record="S1"'));
assert.ok(html.includes('Context limited to 12'));
assert.ok(assistantAnswerMarkup({...result,origin:'demo'}).includes('not an AI answer'));
assert.ok(assistantAnswerMarkup({...result,statements:[],sources:[],suggestions:[],matched_count:0,context_count:0,limited:false}).includes('No answer was found'));

const groupHtml = assistantAnswerMarkup({...result, scope:'group', player_ids:['p01','p02'], covered_player_count:1,
  sources:[{...source,player_ids:['p01'],player_names:['Avery <test>']}]});
assert.ok(groupHtml.includes('Avery &lt;test&gt;'));
assert.ok(groupHtml.includes('1 of 2 selected players'));
assert.ok(groupHtml.includes('absence from this answer does not mean no history'));

const firstChat = assistantAnswerMarkup(result,{sourcePrefix:'ask-source-1'});
const secondChat = assistantAnswerMarkup(result,{sourcePrefix:'ask-source-2'});
assert.ok(firstChat.includes('id="ask-source-1-S1"'));
assert.ok(secondChat.includes('id="ask-source-2-S1"'));
assert.ok(!firstChat.includes('id="assistant-source-S1"'));
