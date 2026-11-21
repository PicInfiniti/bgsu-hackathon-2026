import assert from 'node:assert/strict';
import test from 'node:test';
import { appliesTo, reviewIssues, reviewPriority, highlightSource } from '../src/review-state.js';

const meeting={attendees:['p01','p02'],date:'2026-11-20',note:'Avery: Review clips tomorrow.'};
const item={player_id:'p01',kind:'action',text:'Review clips.',quote:meeting.note,topic:'Football Skills',skill:'Decision-Making',confidence:'high'};

test('unmatched players, false evidence and invalid categories prevent approval',()=>{
  assert.deepEqual(reviewIssues(item,meeting),[]);
  assert.ok(reviewIssues({...item,player_id:null},meeting).length);
  assert.ok(reviewIssues({...item,quote:'Invented quote'},meeting).length);
  assert.ok(reviewIssues({...item,topic:'Invalid'},meeting).length);
  assert.ok(reviewIssues({...item,due_date:'2026-11-19'},meeting).length);
  assert.equal(reviewIssues({...item,confidence:'low'},meeting).length,0);
  assert.ok(reviewPriority({...item,player_id:null})<reviewPriority({...item,confidence:'low'}));
});

test('team feedback applies to each listed player, without inventing a single-player target',()=>{
  const shared={...item,kind:'praise',scope:'team',player_id:null,player_ids:['p01','p02']};
  assert.equal(appliesTo(shared,'p02'),true);
  assert.equal(appliesTo(shared,'p03'),false);
  assert.deepEqual(reviewIssues(shared,meeting),[]);
});

test('highlighting escapes the original source and marks only an exact supporting quote',()=>{
  assert.equal(highlightSource('<img src=x> Review clips.','Review clips.'),'&lt;img src=x&gt; <mark>Review clips.</mark>');
  assert.equal(highlightSource('Original note','Not here'),'Original note');
});
