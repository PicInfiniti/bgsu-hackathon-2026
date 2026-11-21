export const COLORS = ['#ff7a32','#f5d56a','#70d6e8','#f4f3e8','#cf9aff','#ed7785'];
export const TOOLS = [['select','Select / drag'],['route','Run route'],['pass','Pass'],['motion','Motion'],['block','Block'],['zone','Coverage zone'],['freehand','Pen'],['text','Text'],['los','Set line']];
export const uid = () => crypto.randomUUID();
export const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
export const clone = value => structuredClone(value);
export const angle = value => ((value + 180) % 360 + 360) % 360 - 180;
export function blankBoard(date) {
  return {title:'New game plan',mode:'plan',date,opponent:'',notes:'',field_view:'full',show_los:true,snap:false,los:600,ball:{x:600,y:310},markers:[],drawings:[]};
}
export function markerForPlayer(player, point={x:480,y:310}) {
  return {id:uid(),side:'home',player_id:player.id,label:String(player.number),name:player.name,role:player.position,assignment:'',...point,angle:0};
}
export function imaginaryMarker(side='opponent',role='DB',number=1,point={x:760,y:310}) {
  return {id:uid(),side,player_id:null,label:side==='opponent'?String(number):role,name:side==='opponent'?`Imaginary opponent ${number}`:`Open ${role} slot`,role,assignment:'',...point,angle:side==='opponent'?-180:0};
}
const offense = {
  shotgun:[['LT', 'OL',560,220],['LG','OL',560,265],['C','OL',560,310],['RG','OL',560,355],['RT','OL',560,400],['QB','QB',465,310],['RB','RB',440,375],['WR','WR',560,110],['WR','WR',550,475],['WR','WR',520,185],['TE','TE',560,435]],
  spread:[['LT','OL',560,220],['LG','OL',560,265],['C','OL',560,310],['RG','OL',560,355],['RT','OL',560,400],['QB','QB',465,310],['RB','RB',425,310],['WR','WR',560,100],['WR','WR',520,175],['WR','WR',520,445],['WR','WR',560,520]],
  '4-3':[['DE','DL',635,205],['DT','DL',635,275],['DT','DL',635,345],['DE','DL',635,415],['LB','LB',710,225],['LB','LB',710,310],['LB','LB',710,395],['CB','DB',670,105],['CB','DB',670,515],['S','DB',805,240],['S','DB',805,380]],
  nickel:[['DE','DL',635,205],['DT','DL',635,275],['DT','DL',635,345],['DE','DL',635,415],['LB','LB',710,265],['LB','LB',710,355],['CB','DB',670,105],['CB','DB',670,515],['NB','DB',720,170],['S','DB',805,260],['S','DB',805,410]],
};
export function formationMarkers(name,side,players) {
  const used = new Set();
  return (offense[name] || []).map(([role,group,x,y],index) => {
    const point={x,y};
    if (side==='opponent') return imaginaryMarker(side,role,index+1,point);
    const player=players.find(p=>p.position===role && !used.has(p.id)) || players.find(p=>p.position_group===group && !used.has(p.id));
    if (!player) return imaginaryMarker('home',role,index+1,point);
    used.add(player.id); return {...markerForPlayer(player,point),role};
  });
}
export function moveObject(board, selection, dx, dy) {
  if (!selection) return;
  if (selection.type==='marker' || selection.type==='ball') {
    const object=selection.type==='ball'?board.ball:board.markers.find(m=>m.id===selection.id);
    if (object) { object.x=clamp(object.x+dx,40,1160); object.y=clamp(object.y+dy,60,560); }
  } else if (selection.type==='drawing') {
    const drawing=board.drawings.find(d=>d.id===selection.id); if (!drawing) return;
    dx=clamp(dx,-Math.min(...drawing.points.map(p=>p[0])),1200-Math.max(...drawing.points.map(p=>p[0])));
    dy=clamp(dy,-Math.min(...drawing.points.map(p=>p[1])),620-Math.max(...drawing.points.map(p=>p[1])));
    drawing.points=drawing.points.map(([x,y])=>[x+dx,y+dy]);
  } else if (selection.type==='los') board.los=clamp(board.los+dx,40,1160);
}
export function drawingCenter(drawing) {
  const xs=drawing.points.map(p=>p[0]),ys=drawing.points.map(p=>p[1]);
  return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
}
export function worldPoints(drawing) {
  const [cx,cy]=drawingCenter(drawing),r=drawing.angle*Math.PI/180;
  return drawing.points.map(([x,y])=>[cx+(x-cx)*Math.cos(r)-(y-cy)*Math.sin(r),cy+(x-cx)*Math.sin(r)+(y-cy)*Math.cos(r)]);
}
export function resizeEndpoint(drawing,index,point) {
  drawing.points=worldPoints(drawing).map(([x,y])=>[clamp(x,0,1200),clamp(y,0,620)]); drawing.angle=0;
  drawing.points[index]=[clamp(point.x,0,1200),clamp(point.y,0,620)];
}
export function mirrorBoard(board) {
  board.los=1200-board.los; board.ball.x=1200-board.ball.x;
  board.markers.forEach(m=>{m.x=1200-m.x;m.angle=angle(180-m.angle);});
  board.drawings.forEach(d=>{d.points=worldPoints(d).map(([x,y])=>[clamp(1200-x,0,1200),clamp(y,0,620)]);d.angle=0;});
}
export function historyState(initial) {
  let past=[],future=[];
  return {
    push(before){past.push(clone(before));if(past.length>60)past.shift();future=[];},
    undo(current){if(!past.length)return null;future.push(clone(current));return past.pop();},
    redo(current){if(!future.length)return null;past.push(clone(current));return future.pop();},
    reset(){past=[];future=[];},get canUndo(){return Boolean(past.length);},get canRedo(){return Boolean(future.length);},
  };
}
