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
assert.ok(html.includes('Limited to 12'));
assert.ok(assistantAnswerMarkup({...result,origin:'demo'}).includes('not an AI answer'));
assert.ok(assistantAnswerMarkup({...result,statements:[],sources:[],suggestions:[],matched_count:0,context_count:0,limited:false}).includes("couldn't find that in your notes"));
