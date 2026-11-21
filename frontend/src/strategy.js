import { escapeText as esc } from './review-state.js';
import { blankBoard, markerForPlayer, imaginaryMarker, formationMarkers, clone, uid, clamp, mirrorBoard, moveObject, resizeEndpoint, historyState, COLORS, TOOLS } from './strategy-model.js';
import { fieldSvg } from './strategy-field.js';

export function initializeStrategy(root,{players,api,notify,today}) {
  function startingBoard(){const value=blankBoard(today());value.markers=[...formationMarkers('shotgun','home',players),...formationMarkers('4-3','opponent',players)];return value;}
  let board=startingBoard(),boards=[],loaded=false,busy=false,selected=null,tool='select',color=COLORS[0],width=4,presentation=false;
  let clean=JSON.stringify(content(board)),gesture=null,focusBefore=null,pendingReplace=null;
  const history=historyState();
  const $=selector=>root.querySelector(selector);
  function content(value) { const {id,revision,updated_at,...rest}=value;return clone(rest); }
  function dirty(){return clean!==JSON.stringify(content(board));}
  function restore(value){const metadata={id:board.id,revision:board.revision,updated_at:board.updated_at};board={...clone(value),...metadata};}
  function commit(before){if(JSON.stringify(before)!==JSON.stringify(content(board)))history.push(before);render();}
  function edit(action){if(busy)return;const before=content(board);action();commit(before);}
  root.innerHTML=`<div class="strategy-heading"><div class="strategy-heading-brand"><img src="/assets/bgsu-falcon.png" alt="BGSU Falcons"><div><p class="eyebrow">THE FALCON PLAYBOOK</p><h2 tabindex="-1" id="st-title">Strategy room</h2><p>Plan the next game. Learn from the last one.</p></div></div><div class="strategy-save-actions"><span id="st-status" role="status"></span><button class="secondary" type="button" id="st-new">+ New board</button><button class="primary" type="button" id="st-save">Save board</button></div></div>
  <div class="strategy-library-bar"><label>Saved boards<select id="st-open"><option value="">Choose a saved board…</option></select></label><button class="rail-link" type="button" id="st-refresh">Refresh</button><button class="secondary" type="button" id="st-copy">Save a copy</button><span>Boards are coach-authored diagrams, separate from player feedback.</span></div>
  <div class="strategy-layout"><div class="strategy-main"><section class="strategy-pitch-panel"><div class="strategy-pitch-top"><div><span id="st-mode-badge"></span><h3 id="st-board-title"></h3><p id="st-board-subtitle"></p></div><div class="strategy-view-actions"><label class="sr-only" for="st-view">Field view</label><select id="st-view"><option value="full">Full field</option><option value="half">Half field / zoom</option></select><button type="button" id="st-present">Present</button><button type="button" id="st-png">Export PNG</button><button type="button" id="st-svg">SVG</button></div></div>
  <div class="strategy-editing-tools"><div class="strategy-tool-strip" role="group" aria-label="Field drawing tools">${TOOLS.map(([key,label])=>`<button type="button" data-st-tool="${key}" aria-pressed="${key==='select'}"><span aria-hidden="true">${({select:'↖',route:'↗',pass:'⇢',motion:'⇢',block:'⊣',zone:'◯',freehand:'∿',text:'T',los:'┊'})[key]}</span>${label}</button>`).join('')}</div><div class="strategy-brush"><label>Ink<select id="st-color">${COLORS.map((c,n)=>`<option value="${c}">${['Falcon orange','Gold','Sky blue','Chalk white','Violet','Rose'][n]}</option>`).join('')}</select></label><label>Stroke<select id="st-width"><option value="2">Fine</option><option value="4" selected>Medium</option><option value="6">Bold</option></select></label><label class="strategy-text-tool">Text label<input id="st-text" maxlength="300" placeholder="e.g. Cover this zone"></label><button type="button" id="st-undo" aria-label="Undo board change">↶ Undo</button><button type="button" id="st-redo" aria-label="Redo board change">↷ Redo</button></div></div>
  <div id="st-field" class="strategy-field-host" tabindex="0" aria-label="Interactive football field. Select a player or drawing; drag to move. Arrow keys move selected objects. Delete removes selected players or drawings."></div><div class="strategy-pitch-legend"><span><i class="home-dot"></i>Our team</span><span><i class="opponent-dot"></i>Imaginary opponents</span><span><i class="line-dot"></i>Line of scrimmage</span><p id="st-tool-hint">Drag players, opponents and the ball. Hover or tap a player for details.</p></div></section>
  <section class="panel strategy-roster-panel"><div class="section-heading"><div><p class="eyebrow">PERSONNEL & RESPONSIBILITIES</p><h3>Players on the board</h3></div><span id="st-player-count"></span></div><div class="strategy-personnel-tools"><label>Our formation<select id="st-home-formation"><option value="shotgun">Shotgun · 3 WR</option><option value="spread">Spread · 4 WR</option><option value="4-3">Defense · 4–3</option><option value="nickel">Defense · Nickel</option></select></label><button class="secondary" type="button" id="st-apply-home">Place our formation</button><label>Imaginary opponents<select id="st-opponent-formation"><option value="4-3">Defense · 4–3</option><option value="nickel">Defense · Nickel</option><option value="shotgun">Offense · Shotgun</option><option value="spread">Offense · Spread</option></select></label><button class="secondary" type="button" id="st-apply-opponents">Place opponents</button></div><p class="strategy-help">Formation templates replace that side only; missing roster positions become open slots. Assign players below. You can undo any board edit.</p><div class="strategy-add-player"><label>Add from roster<select id="st-add-roster"></select></label><button class="secondary" type="button" id="st-add-player">+ Our player</button><button class="secondary" type="button" id="st-add-opponent">+ Imaginary opponent</button><button class="rail-link" type="button" id="st-empty-home">Clear our side</button><button class="rail-link" type="button" id="st-empty-opponents">Clear opponents</button></div><div class="strategy-bench-heading"><span>Drag a roster player onto the field, or use the add controls.</span><button type="button" draggable="true" data-st-bench-opponent class="strategy-opponent-chip">+ Imaginary opponent</button></div><div id="st-bench" class="strategy-bench"></div><div id="st-personnel"></div></section></div>
  <aside class="strategy-side"><section class="panel strategy-inspector"><div class="section-heading"><h3>Selected on field</h3><button id="st-remove" class="text-button" type="button">Remove</button></div><div id="st-inspector"></div></section><section class="panel strategy-context"><h3>Game context</h3><label>Board title<input id="st-meta-title" maxlength="160"></label><label>Purpose<select id="st-meta-mode"><option value="plan">Future game plan</option><option value="review">Past game review</option></select></label><div class="form-row"><label>Game date<input id="st-meta-date" type="date"></label><label>Opponent<input id="st-meta-opponent" maxlength="120" placeholder="Team or scout unit"></label></div><label>Coach notes<textarea id="st-meta-notes" rows="6" maxlength="12000" placeholder="Situation, down & distance, what happened, or what to try next…"></textarea></label><label class="strategy-check"><input id="st-los" type="checkbox" checked> Show line of scrimmage</label><label class="strategy-check"><input id="st-snap" type="checkbox"> Snap to grid</label><div class="strategy-context-actions"><button class="secondary" type="button" id="st-mirror">Reverse direction</button><button class="rail-link" type="button" id="st-clear-drawings">Clear drawings</button></div><p class="strategy-help">Use game review notes for observations and game plan notes for intended assignments. This board does not infer player performance or alter approved meeting records.</p></section></aside></div>
  <dialog id="st-replace-dialog" class="strategy-replace-dialog" aria-labelledby="st-replace-title"><h3 id="st-replace-title">Keep your unsaved changes?</h3><p>Save this board before opening another one, or discard the unsaved edits.</p><div><button class="secondary" type="button" id="st-replace-cancel">Keep editing</button><button class="secondary" type="button" id="st-replace-discard">Discard edits</button><button class="primary" type="button" id="st-replace-save">Save & continue</button></div></dialog>`;
  const logoReady=fetch('/assets/bgsu-falcon.png').then(r=>{if(!r.ok)throw Error();return r.blob();}).then(blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);})).catch(()=>null);
  function nextOpponentNumber(){const used=new Set(board.markers.filter(m=>m.side==='opponent').map(m=>m.label));let number=1;while(used.has(String(number)))number++;return number;}
  function selectedObject(){return selected?.type==='marker'?board.markers.find(m=>m.id===selected.id):selected?.type==='drawing'?board.drawings.find(d=>d.id===selected.id):null;}
  function renderField(){ $('#st-field').innerHTML=fieldSvg(board,players,{selected,presentation}); }
  function chrome(){
    root.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=busy);
    const assignedLabel=$('[data-st-prop="label"]');if(assignedLabel&&selectedObject()?.player_id)assignedLabel.disabled=true;
    root.classList.toggle('strategy-presenting',presentation);
    $('#st-status').textContent=busy?'Working…':dirty()?'Unsaved changes':board.id?'Saved board':'New board';
    $('#st-status').classList.toggle('is-dirty',dirty());
    $('#st-mode-badge').textContent=board.mode==='review'?'GAME REVIEW':'GAME PLAN';
    $('#st-board-title').textContent=board.title||'Untitled board';
    $('#st-board-subtitle').textContent=[board.opponent&&`vs ${board.opponent}`,board.date].filter(Boolean).join(' · ');
    $('#st-present').textContent=presentation?'Exit presentation':'Present';
    $('#st-save').disabled=busy;$('#st-copy').disabled=busy;$('#st-new').disabled=busy;$('#st-open').disabled=busy;$('#st-refresh').disabled=busy;
    $('#st-undo').disabled=!history.canUndo||busy;$('#st-redo').disabled=!history.canRedo||busy;
    $('#st-view').value=board.field_view;$('#st-los').checked=board.show_los;$('#st-snap').checked=board.snap;
    const home=board.markers.filter(m=>m.side==='home').length,opponents=board.markers.length-home;
    $('#st-player-count').textContent=`${home} / 11 our team · ${opponents} / 11 opponents`;
    $('#st-add-player').disabled=busy||home>=11||!$('#st-add-roster').value;$('#st-add-opponent').disabled=busy||opponents>=11;
    root.querySelectorAll('[data-st-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stTool===tool)));
    $('#st-tool-hint').textContent=({select:'Drag players, opponents and the ball. Arrow keys move selection; Shift moves faster.',route:'Drag a route; follow your intended path to create bends.',pass:'Drag from passer to target to draw a passing arrow.',motion:'Drag the pre-snap motion path.',block:'Drag a blocking assignment; the bar marks the block.',zone:'Drag diagonally to draw a coverage zone. Select it to resize or rotate.',freehand:'Draw directly on the field with the pen.',text:'Type your label above, then click where it belongs.',los:'Click the field to move the line of scrimmage.'})[tool];
  }
  function renderInspector(){
    const object=selectedObject();$('#st-remove').hidden=!object;
    if(!object){$('#st-inspector').innerHTML=`<p class="strategy-help">${selected?.type==='ball'?'Football selected. Drag or use arrow keys to move it.':selected?.type==='los'?'Line of scrimmage selected. Drag or use left/right arrow keys.':'Select a player, imaginary opponent, route or zone on the field. Edit labels, direction and assignments here.'}</p>`;return;}
    if(selected.type==='marker'){
      const p=players.find(p=>p.id===object.player_id);
      $('#st-inspector').innerHTML=`<p class="strategy-selected-type">${object.side==='home'?'OUR TEAM':'IMAGINARY OPPONENT'}</p><h4>${esc(p?.name||object.name||'Open slot')}</h4>${object.side==='home'?`<label>Assign roster player<select data-st-roster><option value="">Open formation slot</option>${players.filter(p=>p.id===object.player_id||!board.markers.some(m=>m.player_id===p.id)).map(p=>`<option value="${p.id}" ${p.id===object.player_id?'selected':''}>#${p.number} ${esc(p.name)} · ${esc(p.position)}</option>`).join('')}</select></label>`:`<label>Opponent name<input data-st-prop="name" maxlength="100" value="${esc(object.name)}"></label>`}<div class="form-row"><label>Marker label<input data-st-prop="label" maxlength="12" value="${esc(p?p.number:object.label)}" ${p?'disabled':''}></label><label>Position / role<input data-st-prop="role" maxlength="30" value="${esc(object.role)}"></label></div><label>Facing direction<input data-st-prop="angle" type="range" min="-180" max="180" step="15" value="${object.angle}"></label><label>Coach assignment<textarea data-st-prop="assignment" maxlength="500" rows="3" placeholder="Route, matchup, responsibility, or review observation…">${esc(object.assignment)}</textarea></label>`;
    } else $('#st-inspector').innerHTML=`<p class="strategy-selected-type">${esc(object.kind.toUpperCase())}</p>${object.kind==='text'?`<label>Label<textarea data-st-prop="text" rows="2" maxlength="300">${esc(object.text)}</textarea></label>`:''}<label>Color<select data-st-prop="color">${COLORS.map((c,n)=>`<option value="${c}" ${c===object.color?'selected':''}>${['Orange','Gold','Blue','White','Violet','Rose'][n]}</option>`).join('')}</select></label><label>Stroke / text size<input data-st-prop="width" type="range" min="1" max="10" value="${object.width}"></label><label>Rotation<input data-st-prop="angle" type="range" min="-180" max="180" step="5" value="${object.angle}"></label><p class="strategy-help">Drag to move. Drag the white endpoint handles to resize a line or zone. Delete removes the selected object.</p>`;
  }
  function renderRoster(){
    const used=new Set(board.markers.map(m=>m.player_id));const previous=$('#st-add-roster').value;
    $('#st-add-roster').innerHTML=players.filter(p=>!used.has(p.id)).map(p=>`<option value="${p.id}">#${p.number} ${esc(p.name)} · ${esc(p.position)}</option>`).join('');
    if(players.some(p=>p.id===previous&&!used.has(p.id)))$('#st-add-roster').value=previous;
    $('#st-bench').innerHTML=players.filter(p=>!used.has(p.id)).map(p=>`<button type="button" draggable="true" data-st-bench-player="${p.id}" title="${esc(p.name+' · '+p.position)}"><b>#${p.number}</b><span>${esc(p.name)}</span><small>${esc(p.position)}</small></button>`).join('')||'<p class="strategy-help">All roster players are already placed.</p>';
    $('#st-personnel').innerHTML=`<div class="strategy-personnel-table"><table><caption class="sr-only">Players on the strategy board; select a row to edit their assignment.</caption><thead><tr><th>Side / player</th><th>Role</th><th>Coach assignment</th><th><span class="sr-only">Select player</span></th></tr></thead><tbody>${board.markers.map(m=>{const p=players.find(p=>p.id===m.player_id);return `<tr class="${selected?.id===m.id?'is-selected':''}"><td><span class="strategy-table-side ${m.side}">${m.side==='home'?'OUR':'OPP'}</span><strong>${esc(p?`#${p.number} ${p.name}`:m.name||m.label)}</strong>${!p&&m.side==='home'?'<small>Open slot · assign a roster player</small>':''}</td><td>${esc(m.role)}</td><td>${esc(m.assignment||'—')}</td><td><button type="button" class="rail-link" data-st-select="${esc(m.id)}">Select ↗</button></td></tr>`;}).join('')}</tbody></table>${!board.markers.length?'<p class="strategy-help">Choose a formation or add players to start the conversation.</p>':''}</div>`;
  }
  function metadata(){$('#st-open').value=board.id||'';for(const key of ['title','mode','date','opponent','notes'])$(`#st-meta-${key}`).value=board[key];}
  function render(){renderField();renderInspector();renderRoster();chrome();}
  function refreshOptions(){const value=$('#st-open').value;$('#st-open').innerHTML='<option value="">Choose a saved board…</option>'+boards.map(b=>`<option value="${esc(b.id)}">${esc(b.title)} · ${b.mode==='review'?'Review':'Plan'} · ${esc(b.date)}</option>`).join('');$('#st-open').value=board.id||value;}
  async function refresh(){try{boards=await api('/strategy-boards');loaded=true;refreshOptions();}catch(error){notify(error.message,true);}}
  async function save(copy=false){
    if(busy)return false;busy=true;chrome();
    try{const raw=copy?{...content(board),title:(board.title+' · copy').slice(0,160)}:board;const saved=await api(copy||!board.id?'/strategy-boards':`/strategy-boards/${encodeURIComponent(board.id)}`,raw,copy||!board.id?'POST':'PUT');board=saved;clean=JSON.stringify(content(board));history.reset();await refresh();metadata();render();notify(copy?'Strategy copy saved.':'Strategy board saved.');return true;}catch(error){notify(error.message,true);return false;}finally{busy=false;chrome();}
  }
  function replaceWith(action){if(busy)return;if(!dirty()){action();return;}pendingReplace=action;$('#st-replace-dialog').showModal();}
  function newBoard(){replaceWith(()=>{board=startingBoard();clean=JSON.stringify(content(board));history.reset();selected=null;metadata();render();});}
  function removeSelection(){if(!selectedObject())return;edit(()=>{if(selected.type==='marker')board.markers=board.markers.filter(m=>m.id!==selected.id);else board.drawings=board.drawings.filter(d=>d.id!==selected.id);selected=null;});}
  function snapSelection(){
    if(!board.snap||!selected)return;
    if(selected.type==='los'){board.los=clamp(Math.round(board.los/10)*10,40,1160);return;}
    const object=selected.type==='ball'?board.ball:selected.type==='marker'?selectedObject():null;
    if(object){object.x=clamp(Math.round(object.x/10)*10,40,1160);object.y=clamp(Math.round(object.y/10)*10,60,560);}
  }
  function point(event){const svg=$('#st-field svg');const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const mapped=p.matrixTransform(svg.getScreenCTM().inverse());const unit=board.snap?10:1;return {x:clamp(Math.round(mapped.x/unit)*unit,0,1200),y:clamp(Math.round(mapped.y/unit)*unit,0,620)};}
  root.addEventListener('dragstart',event=>{
    const source=event.target.closest('[data-st-bench-player],[data-st-bench-opponent]');
    if(!source||busy||presentation){event.preventDefault();return;}
    event.dataTransfer.setData('application/x-falcon-player',source.dataset.stBenchPlayer||'opponent');event.dataTransfer.effectAllowed='copy';
  });
  $('#st-field').addEventListener('dragover',event=>{if(!busy&&!presentation){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  $('#st-field').addEventListener('drop',event=>{
    event.preventDefault();if(busy||presentation)return;
    const id=event.dataTransfer.getData('application/x-falcon-player'),p=players.find(p=>p.id===id),position=point(event);
    const side=id==='opponent'?'opponent':'home',count=board.markers.filter(m=>m.side===side).length;
    if(count>=11){notify('There are already 11 players on that side. Remove a marker or assign an open slot.',true);return;}
    if(!p&&id!=='opponent'||p&&board.markers.some(m=>m.player_id===p.id))return;
    edit(()=>{const m=p?markerForPlayer(p,position):imaginaryMarker('opponent','DB',nextOpponentNumber(),position);m.x=clamp(m.x,40,1160);m.y=clamp(m.y,60,560);board.markers.push(m);selected={type:'marker',id:m.id};});
  });
  $('#st-field').addEventListener('pointerdown',event=>{
    if(busy||presentation||gesture||event.button!==0)return;event.preventDefault();$('#st-field').focus({preventScroll:true});const p=point(event),before=content(board);
    const handle=event.target.closest('[data-field-handle]');
    if(tool==='text'){const text=$('#st-text').value.trim();if(!text){notify('Type a label in the toolbar before placing it.',true);$('#st-text').focus();return;}if(board.drawings.length>=100){notify('This board already has 100 drawings.',true);return;}const d={id:uid(),kind:'text',color,width,angle:0,text,points:[[p.x,p.y]]};board.drawings.push(d);selected={type:'drawing',id:d.id};tool='select';commit(before);return;}
    if(tool==='los'){board.los=clamp(p.x,40,1160);board.show_los=true;selected={type:'los'};tool='select';commit(before);return;}
    if(tool!=='select'){
      if(board.drawings.length>=100){notify('This board already has 100 drawings.',true);return;}
      const drawing={id:uid(),kind:tool,color,width,angle:0,text:'',points:[[p.x,p.y],[p.x,p.y]]};board.drawings.push(drawing);selected={type:'drawing',id:drawing.id};gesture={kind:'draw',before,start:p,id:drawing.id};
    }else{
      const marker=event.target.closest('[data-field-marker]'),drawing=event.target.closest('[data-field-drawing]');
      if(handle&&selected?.type==='drawing')gesture={kind:'handle',before,start:p,index:Number(handle.dataset.fieldHandle),selection:clone(selected)};
      else{selected=marker?{type:'marker',id:marker.dataset.fieldMarker}:drawing?{type:'drawing',id:drawing.dataset.fieldDrawing}:event.target.closest('[data-field-ball]')?{type:'ball'}:event.target.closest('[data-field-los]')?{type:'los'}:null;if(selected)gesture={kind:'move',before,start:p,selection:clone(selected)};}
    }
    if(gesture){gesture.pointerId=event.pointerId;$('#st-field').setPointerCapture(event.pointerId);}renderField();renderInspector();renderRoster();chrome();
  });
  $('#st-field').addEventListener('pointermove',event=>{
    if(!gesture||gesture.pointerId!==event.pointerId)return;const p=point(event);
    if(gesture.kind==='move'){restore(gesture.before);moveObject(board,gesture.selection,p.x-gesture.start.x,p.y-gesture.start.y);snapSelection();}
    else if(gesture.kind==='handle'){restore(gesture.before);const d=board.drawings.find(d=>d.id===gesture.selection.id);if(d)resizeEndpoint(d,gesture.index,p);}
    else{const d=board.drawings.find(d=>d.id===gesture.id);if(['route','motion','freehand'].includes(d.kind)){const last=d.points.at(-1);if(Math.hypot(p.x-last[0],p.y-last[1])>6&&d.points.length<300)d.points.push([p.x,p.y]);}else d.points[1]=[p.x,p.y];}
    renderField();chrome();
  });
  function finishGesture(event,cancel=false){if(!gesture||event&&gesture.pointerId!==event.pointerId)return;const before=gesture.before;if(cancel)restore(before);else if(gesture.kind==='draw'){const d=board.drawings.find(d=>d.id===gesture.id);if(!d||Math.hypot(d.points.at(-1)[0]-gesture.start.x,d.points.at(-1)[1]-gesture.start.y)<3&&d.points.length<=2)board.drawings=board.drawings.filter(d=>d.id!==gesture.id);tool='select';}gesture=null;if(event&&$('#st-field').hasPointerCapture(event.pointerId))$('#st-field').releasePointerCapture(event.pointerId);if(cancel)render();else commit(before);}
  $('#st-field').addEventListener('pointerup',event=>finishGesture(event));$('#st-field').addEventListener('pointercancel',event=>finishGesture(event,true));
  $('#st-field').addEventListener('keydown',event=>{
    if(presentation||busy)return;
    if(event.key==='Escape'){if(gesture)finishGesture(null,true);selected=null;tool='select';render();return;}
    if(event.key==='Enter'||event.key===' '){const marker=event.target.closest('[data-field-marker]'),drawing=event.target.closest('[data-field-drawing]'),ball=event.target.closest('[data-field-ball]');if(marker||drawing||ball){event.preventDefault();selected=marker?{type:'marker',id:marker.dataset.fieldMarker}:drawing?{type:'drawing',id:drawing.dataset.fieldDrawing}:{type:'ball'};render();const control=$('#st-inspector input, #st-inspector select, #st-inspector textarea');(control||$('#st-field')).focus();}return;}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeSelection();return;}
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(delta&&selected){event.preventDefault();edit(()=>{const step=event.shiftKey?20:board.snap?10:5;moveObject(board,selected,delta[0]*step,delta[1]*step);snapSelection();});$('#st-field').focus({preventScroll:true});}
  });
  root.addEventListener('focusin',event=>{if(event.target.matches('[id^="st-meta-"], [data-st-prop], [data-st-roster]'))focusBefore=content(board);});
  root.addEventListener('input',event=>{
    const el=event.target;if(busy)return;
    if(el.id.startsWith('st-meta-')){board[el.id.slice(8)]=el.value;chrome();}
    else if(el.dataset.stProp){const object=selectedObject();if(!object)return;object[el.dataset.stProp]=['angle','width'].includes(el.dataset.stProp)?Number(el.value):el.value;renderField();chrome();}
  });
  root.addEventListener('change',event=>{
    const el=event.target;
    if(el.matches('[id^="st-meta-"], [data-st-prop], [data-st-roster]')){
      if(el.hasAttribute('data-st-roster')){const m=selectedObject(),p=players.find(p=>p.id===el.value);if(m){m.player_id=p?.id||null;if(p){m.name=p.name;m.label=String(p.number);}else{m.name=`Open ${m.role} slot`;m.label=m.role;}}}
      const before=focusBefore||content(board);focusBefore=null;commit(before);
    }
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-st-tool]');if(button){tool=button.dataset.stTool;chrome();return;}
    const bench=event.target.closest('[data-st-bench-player],[data-st-bench-opponent]');
    if(bench){if(bench.hasAttribute('data-st-bench-opponent'))$('#st-add-opponent').click();else{if(board.markers.filter(m=>m.side==='home').length>=11){notify('Our side already has 11 players. Select an open slot to assign this player, or remove a marker.',true);return;}$('#st-add-roster').value=bench.dataset.stBenchPlayer;$('#st-add-player').disabled=false;$('#st-add-player').click();}return;}
    const row=event.target.closest('[data-st-select]');if(row){selected={type:'marker',id:row.dataset.stSelect};tool='select';render();$('#st-inspector').scrollIntoView({block:'nearest'});}
  });
  $('#st-color').addEventListener('change',event=>color=event.target.value);$('#st-width').addEventListener('change',event=>width=Number(event.target.value));
  $('#st-view').addEventListener('change',event=>edit(()=>board.field_view=event.target.value));
  $('#st-los').addEventListener('change',event=>edit(()=>board.show_los=event.target.checked));$('#st-snap').addEventListener('change',event=>edit(()=>board.snap=event.target.checked));
  $('#st-undo').addEventListener('click',()=>{const value=history.undo(content(board));if(value){restore(value);selected=null;metadata();render();}});$('#st-redo').addEventListener('click',()=>{const value=history.redo(content(board));if(value){restore(value);selected=null;metadata();render();}});
  $('#st-remove').addEventListener('click',removeSelection);$('#st-clear-drawings').addEventListener('click',()=>edit(()=>{board.drawings=[];selected=null;}));
  $('#st-mirror').addEventListener('click',()=>edit(()=>mirrorBoard(board)));
  for(const side of ['home','opponents'])$(`#st-empty-${side}`).addEventListener('click',()=>edit(()=>{board.markers=board.markers.filter(m=>m.side!==(side==='home'?'home':'opponent'));selected=null;}));
  for(const [id,side,select] of [['st-apply-home','home','st-home-formation'],['st-apply-opponents','opponent','st-opponent-formation']])$(`#${id}`).addEventListener('click',()=>edit(()=>{board.markers=board.markers.filter(m=>m.side!==side).concat(formationMarkers($(`#${select}`).value,side,players));selected=null;}));
  $('#st-add-player').addEventListener('click',()=>{const p=players.find(p=>p.id===$('#st-add-roster').value);if(!p||board.markers.filter(m=>m.side==='home').length>=11)return;edit(()=>{const m=markerForPlayer(p,{x:460,y:150+board.markers.filter(m=>m.side==='home').length*32});board.markers.push(m);selected={type:'marker',id:m.id};});});
  $('#st-add-opponent').addEventListener('click',()=>{const count=board.markers.filter(m=>m.side==='opponent').length;if(count>=11)return;edit(()=>{const m=imaginaryMarker('opponent','DB',nextOpponentNumber(),{x:800,y:150+count*32});board.markers.push(m);selected={type:'marker',id:m.id};});});
  $('#st-add-roster').addEventListener('change',chrome);
  $('#st-save').addEventListener('click',()=>save());$('#st-copy').addEventListener('click',()=>save(true));$('#st-new').addEventListener('click',newBoard);$('#st-refresh').addEventListener('click',refresh);
  $('#st-open').addEventListener('change',()=>{const id=$('#st-open').value;if(!id)return;replaceWith(async()=>{busy=true;chrome();try{board=await api(`/strategy-boards/${encodeURIComponent(id)}`);clean=JSON.stringify(content(board));selected=null;history.reset();metadata();render();}catch(error){notify(error.message,true);}finally{busy=false;chrome();}});});
  $('#st-replace-cancel').addEventListener('click',()=>{$('#st-replace-dialog').close();pendingReplace=null;$('#st-open').value=board.id||'';});
  $('#st-replace-dialog').addEventListener('cancel',()=>{pendingReplace=null;$('#st-open').value=board.id||'';});
  $('#st-replace-discard').addEventListener('click',()=>{const next=pendingReplace;pendingReplace=null;$('#st-replace-dialog').close();next?.();});
  $('#st-replace-save').addEventListener('click',async()=>{if(await save()){const next=pendingReplace;pendingReplace=null;$('#st-replace-dialog').close();next?.();}});
  $('#st-present').addEventListener('click',()=>{presentation=!presentation;tool='select';selected=null;render();});
  document.addEventListener('keydown',event=>{if(!root.hidden&&event.key==='Escape'&&presentation){presentation=false;render();}});
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function exportField(kind){
    try{const logo=await logoReady;if(!logo)throw Error('The Falcons logo could not load. Refresh and retry the image export.');const svg=fieldSvg(board,players,{interactive:false,logo,presentation:true});const name=(board.title||'falcon-strategy').replace(/[^a-z0-9_-]+/gi,'-').slice(0,80);if(kind==='svg'){download(new Blob([svg],{type:'image/svg+xml'}),`${name}.svg`);return;}
      const blob=new Blob([svg],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),image=new Image();try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('The field image could not render. Try SVG export.'));image.src=url;});const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=Math.round(2400*(board.field_view==='half'?530/600:620/1200));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('PNG export failed. Try SVG export.');download(png,`${name}.png`);}finally{URL.revokeObjectURL(url);}
    }catch(error){notify(error.message,true);}
  }
  $('#st-png').addEventListener('click',()=>exportField('png'));$('#st-svg').addEventListener('click',()=>exportField('svg'));
  metadata();render();
  return {async show(){if(!loaded)await refresh();},isDirty:dirty};
}
