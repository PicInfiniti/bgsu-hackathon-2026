import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {blankBoard,formationMarkers,markerForPlayer,imaginaryMarker,moveObject,mirrorBoard,resizeEndpoint,worldPoints,historyState,clone} from '../src/strategy-model.js';
import {fieldSvg} from '../src/strategy-field.js';
const players=JSON.parse(fs.readFileSync(new URL('../../data/demo.json',import.meta.url))).players;

test('formations place 11 unique roster or explicit open slots without inventing roster players',()=>{
  for(const name of ['shotgun','spread','4-3','nickel']){
    const home=formationMarkers(name,'home',players),opponents=formationMarkers(name,'opponent',players);
    assert.equal(home.length,11);assert.equal(opponents.length,11);
    const ids=home.map(m=>m.player_id).filter(Boolean);assert.equal(ids.length,new Set(ids).size);
    assert.ok(home.every(m=>!m.player_id||players.some(p=>p.id===m.player_id)));
    assert.ok(home.every(m=>m.x>=40&&m.x<=1160&&m.y>=60&&m.y<=560));
    assert.ok(opponents.every(m=>m.side==='opponent'&&m.player_id===null&&m.name.startsWith('Imaginary opponent')));
  }
  const rt=formationMarkers('shotgun','home',players).find(m=>m.role==='RT');
  assert.equal(rt.player_id,null);assert.equal(rt.name,'Open RT slot');
});

test('player, opponent, ball and line dragging respects field bounds',()=>{
  const b=blankBoard('2026-11-21');b.markers=[markerForPlayer(players[0]),imaginaryMarker()];
  moveObject(b,{type:'marker',id:b.markers[0].id},5000,-5000);
  assert.deepEqual([b.markers[0].x,b.markers[0].y],[1160,60]);
  moveObject(b,{type:'ball'},-5000,5000);assert.deepEqual(b.ball,{x:40,y:560});
  moveObject(b,{type:'los'},5000,0);assert.equal(b.los,1160);
  moveObject(b,{type:'marker',id:b.markers[1].id},-20,20);assert.equal(b.markers[1].x,740);
});

test('drawing movement and endpoint resizing preserve geometry and normalize rotation',()=>{
  const b=blankBoard('2026-11-21'),d={id:'line',kind:'route',angle:0,points:[[100,100],[200,200]]};b.drawings=[d];
  moveObject(b,{type:'drawing',id:'line'},-1000,1000);
  assert.deepEqual(d.points,[[0,520],[100,620]]);
  const rotated={...d,angle:90,points:[[100,100],[200,100]]};
  assert.deepEqual(worldPoints(rotated).map(p=>p.map(Math.round)),[[150,50],[150,150]]);
  resizeEndpoint(rotated,1,{x:300,y:220});assert.equal(rotated.angle,0);assert.deepEqual(rotated.points[1],[300,220]);
});

test('mirror twice returns marker/ball/line positions; undo and redo retain distinct snapshots',()=>{
  const b=blankBoard('2026-11-21');b.markers=[markerForPlayer(players[0])];b.los=550;
  const initial=clone(b);mirrorBoard(b);assert.equal(b.markers[0].x,720);assert.equal(b.los,650);mirrorBoard(b);
  assert.equal(b.markers[0].x,initial.markers[0].x);assert.equal(b.los,initial.los);
  const h=historyState();h.push(initial);b.title='Edited';const undone=h.undo(b);assert.equal(undone.title,'New game plan');undone.title='Mutated return';
  const redone=h.redo(undone);assert.equal(redone.title,'Edited');h.push(redone);assert.equal(h.canRedo,false);h.reset();assert.equal(h.canUndo,false);
});

test('field renders both teams, hover names, role labels, ball and interactive handles with escaped content',()=>{
  const b=blankBoard('2026-11-21');b.title='Plan <script>bad</script>';b.markers=[markerForPlayer({...players[0],name:'Name <b>x</b>'}),imaginaryMarker()];
  b.drawings=[{id:'d1',kind:'zone',color:'#70d6e8',width:4,angle:0,text:'',points:[[600,150],[800,300]]},
    {id:'d2',kind:'text',color:'#f5d56a',width:4,angle:0,text:'Read <script>bad</script>',points:[[700,120]]}];
  const html=fieldSvg(b,[{...players[0],name:'Name <b>x</b>'}],{selected:{type:'drawing',id:'d1'}});
  assert.ok(html.includes('Name &lt;b&gt;x&lt;/b&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('data-field-marker'));
  assert.ok(html.includes('Imaginary opponent'));assert.ok(html.includes('data-field-ball'));assert.ok(html.includes('data-field-los'));assert.ok(html.includes('data-field-handle="1"'));
  assert.ok(html.includes('/assets/bgsu-falcon.png'));assert.ok(html.includes('role="group"'));
  const exported=fieldSvg(b,players,{interactive:false,logo:'data:image/png;base64,AA=='});
  assert.ok(exported.includes('data:image/png;base64,AA=='));assert.ok(!exported.includes('data-field-marker'));assert.ok(!exported.includes('data-field-handle'));assert.ok(exported.includes('role="img"'));
  b.field_view='half';assert.ok(fieldSvg(b,players).includes('viewBox="300 45 600 530"'));
});
