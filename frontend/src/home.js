// Actual Home/Overview components from coach-dashboard-redesign, connected to the existing app.
import {createNoteEditor,NOTEBOOK_LABELS} from './notes-editor.js';
import {createSchedule,createMiniCalendar,audienceLabel} from './schedule-view.js';
import {shortDate,clockLabel} from './home-calendar-math.js';
import {SMART_VIEWS,notebookRows,viewCounts,DELETE_FOLDER_TEXT} from './notebook-views.js';
import {meetingTypeLabel} from './shared-groups.js';
import {openWhiteboard} from './whiteboard.js';
const escape=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createHome({api,notify,getMode,players,getMeetings,icon,switchView,openMeeting,openPlayer,reviewNote,openFilm}) {
const $=s=>document.querySelector(s),today=()=>new Date().toLocaleDateString('en-CA');
let notes=[],meetings=[],notebookFilter='all',folderFilter=null,folders=[],archivedFolders=[],filmNotes=[],playerStatuses={},upcomingEvents=[],watchReviewCount=0,nextGame=null,repeatFlags=[],filmTodo=[],settings={};
const notebookOf=n=>NOTEBOOK_LABELS[n]||n,name=id=>players.find(p=>p.id===id)?.name||'Unknown player';
const items=()=>getMeetings().flatMap(m=>m.items.map(i=>({...i,meeting:m}))),overdue=i=>i.kind==='action'&&!i.completed&&i.due_date&&i.due_date<today();
function renderHome() {
  meetings=getMeetings();
  playerStatuses=Object.fromEntries(players.map(p=>[p.id,{last_one_on_one:meetings.filter(m=>m.approved&&m.meeting_type==='individual'&&m.date<=today()&&m.attendees.includes(p.id)).map(m=>m.date).sort().at(-1)}]));
  if (!$('#notebook-list')) return;
  const counts = viewCounts({notes, meetings, filmNotes});
  $('#notebook-list').innerHTML = SMART_VIEWS.map(v => `<button type="button" class="notebook-card ${notebookFilter === v.key ? 'active' : ''}" data-notebook="${v.key}" aria-pressed="${notebookFilter === v.key}">${icon(v.key === 'player_meetings' ? 'people' : v.key === 'team_strategy' ? 'football' : v.key === 'film' ? 'check' : 'note')}<span><strong>${v.label}${v.key === 'personal' ? ' <small class="private-tag">private</small>' : ''}</strong><small>${v.hint}</small></span><b>${counts[v.key]}</b></button>`).join('');
  const noFolder = notes.filter(n => n.folder_id == null).length;
  $('#folder-list').innerHTML = `<div class="folder-head"><h3>Folders</h3><button type="button" class="text-button" data-new-folder>+ New folder</button></div>
    ${folders.map(f => `<div class="folder-row ${String(folderFilter) === String(f.id) ? 'active' : ''}"><button type="button" class="folder-pick" data-folder="${f.id}" aria-pressed="${String(folderFilter) === String(f.id)}">📁 ${escape(f.name)} <b>${f.note_count}</b></button><details class="folder-menu"><summary aria-label="Folder actions for ${escape(f.name)}">⋯</summary><div><button type="button" data-folder-rename="${f.id}">Rename</button><button type="button" data-folder-archive="${f.id}">Archive</button><button type="button" class="danger" data-folder-delete="${f.id}">Delete…</button></div></details></div>`).join('')}
    <div class="folder-row ${folderFilter === 'none' ? 'active' : ''}"><button type="button" class="folder-pick" data-folder="none" aria-pressed="${folderFilter === 'none'}">No folder <b>${noFolder}</b></button></div>
    ${folderFilter != null ? '<button type="button" class="text-button" data-folder="">Show every folder</button>' : ''}
    ${archivedFolders.length ? `<details class="archived-folders"><summary>Archived folders (${archivedFolders.length})</summary>${archivedFolders.map(f => `<div class="folder-row"><span>📁 ${escape(f.name)} <b>${f.note_count}</b></span><button type="button" class="text-button" data-folder-restore="${f.id}">Restore</button></div>`).join('')}</details>` : ''}`;
  const search = $('#notes-search').value;
  const rows = notebookRows({notes, meetings, filmNotes, view: notebookFilter, folder: folderFilter, search}).map(r => ({...r, html:
    r.kind === 'note' ? `<button type="button" class="meeting-row" data-open-note="${r.id}"><span class="meeting-date">${icon('note')}</span><span class="meeting-title"><strong>${escape(r.note.title)}</strong><small>${escape(shortDate(r.note.note_date))} · ${escape(notebookOf(r.note.notebook))}${r.note.folder_id != null ? ` · 📁 ${escape(folders.find(f => f.id === r.note.folder_id)?.name || archivedFolders.find(f => f.id === r.note.folder_id)?.name || '')}` : ''}${r.note.input_method !== 'type' ? ` · ${escape(r.note.input_method)}` : ''}${r.note.summary ? ' · Recap' : ''}</small></span></button>`
    : r.kind === 'meeting' ? `<button type="button" class="meeting-row" data-open-player="${escape(r.meeting.attendees[0])}"><span class="meeting-date">${icon('people')}</span><span class="meeting-title"><strong>${escape(r.meeting.title)}</strong><small>${escape(shortDate(r.meeting.date))} · ${escape(meetingTypeLabel(r.meeting.meeting_type))} · ${r.meeting.items.filter(i => i.kind === 'action').length} homework</small></span><span class="badge reviewed">✓ Checked</span></button>`
    : `<button type="button" class="meeting-row" data-open-film-note="${r.film.film_id}@${r.film.t_seconds}"><span class="meeting-date">${icon('check')}</span><span class="meeting-title"><strong>${escape(r.film.text.slice(0, 80))}</strong><small>${escape(shortDate(r.date))} · Film · ${escape(r.film.film_title)}</small></span></button>`}));
  $('#home-recent-heading').textContent = search.trim() ? 'Search results' : folderFilter != null ? 'In this folder' : 'Recent notes';
  $('#home-recent').innerHTML = rows.slice(0, 7).map(r => r.html).join('') || `<p class="radar-empty">${search.trim() ? 'No note matches. Search looks in every folder.' : folderFilter != null ? 'No notes here yet. Open a note and pick this folder.' : 'No notes yet. Write one in the middle and press Save note.'}</p>`;
  $('#recent-count').textContent = rows.length > 7 ? `7 of ${rows.length}` : '';
  const gameCard = nextGame?.event ? `<div class="next-game"><span class="ng-kicker">NEXT GAME · ${escape(nextGame.when.toUpperCase())}</span><strong>${escape(nextGame.opponent || nextGame.event.title)}</strong><small>${nextGame.home_away ? (nextGame.home_away === 'home' ? 'Home · ' : 'Away · ') : ''}${escape(shortDate(nextGame.event.date))} ${clockLabel(nextGame.event.start_at)}</small><small>Before kickoff: ${nextGame.homework_due_count} homework${filmTodo.length ? ` · ${filmTodo.length} film to break down` : ''}</small></div>` : '';
  const filmRows = filmTodo.slice(0, 2).map(f => `<button type="button" class="upcoming-item ev-row-film" data-open-film-home="${f.id}"><span class="upcoming-date">Film<small>${escape(f.status === 'in_progress' ? 'In progress' : 'To do')}</small></span><span><strong>Film to break down: ${escape(f.title)}</strong><small>${escape(f.assigned_to)}</small></span></button>`).join('');
  $('#next-up').innerHTML = gameCard + filmRows + upcomingEvents.map(e => `<button type="button" class="upcoming-item ev-row-${e.type}" data-schedule-date="${e.date}"><span class="upcoming-date">${e.date === today() ? 'Today' : escape(new Date(`${e.date}T12:00:00`).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}))}<small>${clockLabel(e.start_at)}</small></span><span><strong>${escape(e.title)}</strong><small>${escape(audienceLabel(e.audience, players))}</small></span></button>`).join('') || '<p class="radar-empty">Nothing on the schedule. Add a practice or game.</p>';
  const late = items().filter(i => i.kind === 'action' && !i.completed && !i.sensitive && overdue(i));
  const lateRows = late.slice(0, 4).map(i => `<button class="radar-item" data-player="${escape(i.player_id)}"><span class="status-dot red" aria-hidden="true"></span><span><strong>${escape(name(i.player_id))}</strong><small>${escape(i.text)}</small><em class="late-word">Late · was due ${escape(shortDate(i.due_date))}</em></span>${icon('chevron')}</button>`);
  const since = `${Number(today().slice(5,7)) >= 8 ? today().slice(0,4) : Number(today().slice(0,4)) - 1}-08-01`;
  const noOneOnOne = Object.keys(playerStatuses).length ? players.filter(p => !((playerStatuses[p.id]?.last_one_on_one || '') >= since)) : [];
  const review = watchReviewCount ? `<button class="radar-item" data-view="meetings"><span class="status-dot amber" aria-hidden="true"></span><span><strong>${watchReviewCount} AI note${watchReviewCount === 1 ? '' : 's'} to check</strong><small>Waiting in Find homework</small></span>${icon('chevron')}</button>` : '';
  const checkins = noOneOnOne.length ? `<button class="radar-item" data-ask-prompt="Who hasn't had a 1-on-1?"><span class="status-dot amber" aria-hidden="true"></span><span><strong>${noOneOnOne.length} player${noOneOnOne.length === 1 ? '' : 's'} with no 1-on-1</strong><small>This season · ${escape(noOneOnOne.slice(0,3).map(p => p.name.split(' ')[0]).join(', '))}${noOneOnOne.length > 3 ? '…' : ''}</small><em class="amber-word">Ask Aivana who</em></span>${icon('chevron')}</button>` : '';
  const repeatRows = repeatFlags.slice(0, 3).map(f => `<button class="radar-item" data-plan-one="${escape(f.player_id)}"><span class="status-dot amber" aria-hidden="true"></span><span><strong>Same correction ${f.weeks} weeks: ${escape(f.player_name)}</strong><small>${escape(f.tag)}</small><em class="amber-word">Plan a 1-on-1 →</em></span>${icon('chevron')}</button>`).join('');
  $('#watch-list').innerHTML = (review + repeatRows + lateRows.join('') + (late.length > 4 ? `<p class="watch-more">+${late.length - 4} more late</p>` : '') + checkins) || '<p class="radar-empty">All clear. Nobody is late on homework.</p>';
}

async function refreshHomeData() {
  try {
    const [n,allFolders,events,options,game,observations,films,repeats]=await Promise.all([api('/notes',undefined,'GET'),api('/folders?archived=true',undefined,'GET'),api('/events/upcoming?limit=3',undefined,'GET'),api('/settings',undefined,'GET'),api('/next-game',undefined,'GET'),api('/film-notes',undefined,'GET'),api('/films',undefined,'GET'),api('/watch-list/repeats',undefined,'GET')]);
    notes=n;folders=allFolders.filter(f=>!f.archived_at);archivedFolders=allFolders.filter(f=>f.archived_at);upcomingEvents=events;settings=options;nextGame=game;filmNotes=observations;filmTodo=films.filter(f=>f.status!=='done'&&f.assigned_to);repeatFlags=repeats;editor.refreshFolders();
    if(folderFilter!=null&&folderFilter!=='none'&&!folders.some(f=>String(f.id)===String(folderFilter)))folderFilter=null;
  }catch(error){notify(error.message,true);}
  renderHome();miniCalendar.refresh();
}
const editor=createNoteEditor($('#note-editor-root'),{api,notify,getMode,players,getFolders:()=>folders,
  onSaved:()=>refreshHomeData(),findHomework:reviewNote,sendToReview:note=>reviewNote(note),
  addToSchedule:event=>{showSchedule(event.start_at.slice(0,10),'week');schedule.openAdd(event);},
  openWhiteboard:(note,opts={})=>openWhiteboard({api,notify,players,onSaved:opts.onSaved,onClose:opts.onClose},opts.id?{id:opts.id}:{template:'play',note_id:note.id,title:note.title}),
});
const showSchedule=(date=today(),view='week')=>{switchView('home-schedule');schedule.show(date,view);};
const schedule=createSchedule($('#home-schedule-root'),{api,notify,players,getSettings:()=>settings,saveSettings:async change=>settings=await api('/settings',change,'PATCH'),onChanged:refreshHomeData,onOpenItem:item=>{
 if(item.source==='note'){switchView('home');editor.open(item.id);}else if(item.source==='meeting')openMeeting(item.id);else if(item.player_id)openPlayer(item.player_id);
}});
const miniCalendar=createMiniCalendar($('#mini-calendar'),{getMeetings,onPickDay:date=>showSchedule(date,'week')});
async function folderAction(run){try{const message=await run();if(message)notify(message);await refreshHomeData();}catch(error){notify(error.message,true);}}
$('#notes-search').addEventListener('input',renderHome);
$('#home').addEventListener('click',e=>{
 const nb=e.target.closest('[data-notebook]');if(nb){notebookFilter=nb.dataset.notebook;renderHome();}
 const fp=e.target.closest('[data-folder]');if(fp){folderFilter=fp.dataset.folder===''?null:fp.dataset.folder==='none'?'none':Number(fp.dataset.folder);renderHome();}
 const filmNote=e.target.closest('[data-open-film-note]');if(filmNote){const [id,time]=filmNote.dataset.openFilmNote.split('@');openFilm?.(Number(id),Number(time));}
 const filmHome=e.target.closest('[data-open-film-home]');if(filmHome)openFilm?.(Number(filmHome.dataset.openFilmHome));
 const plan=e.target.closest('[data-plan-one]');if(plan)openPlayer(plan.dataset.planOne);
 const note=e.target.closest('[data-open-note]');if(note)editor.open(Number(note.dataset.openNote));
 const day=e.target.closest('[data-schedule-date]');if(day)showSchedule(day.dataset.scheduleDate);
 if(e.target.closest('[data-ask-prompt]')){switchView('desk');$('#overview-checkins').scrollIntoView({block:'center'});}
 if(e.target.closest('[data-new-folder]'))folderAction(async()=>{const name=prompt('Folder name (for example "Week 12" or "Recruiting")');if(name?.trim()){const folder=await api('/folders',{name:name.trim()});folderFilter=folder.id;return `Folder "${folder.name}" created.`;}});
 for(const [attr,operation] of [['data-folder-rename','rename'],['data-folder-archive','archive'],['data-folder-restore','restore'],['data-folder-delete','delete']]){
  const button=e.target.closest(`[${attr}]`);if(!button)continue;
  const folder=[...folders,...archivedFolders].find(f=>f.id===Number(button.getAttribute(attr)));if(!folder)continue;
  folderAction(async()=>{
   if(operation==='rename'){const name=prompt('Rename folder',folder.name);if(name?.trim())await api(`/folders/${folder.id}`,{name:name.trim()},'PATCH');}
   else if(operation==='delete'){if(!confirm(DELETE_FOLDER_TEXT(folder.name,folder.note_count)))return;await api(`/folders/${folder.id}`,undefined,'DELETE');}
   else {if(operation==='archive'&&!confirm(`Archive "${folder.name}"? Its notes are kept.`))return;await api(`/folders/${folder.id}`,{archived:operation==='archive'},'PATCH');}
   return 'Folders updated.';
  });
 }
});
editor.restoreDraft();refreshHomeData();
return {render:()=>{renderHome();miniCalendar.refresh();},refresh:refreshHomeData,cancel:()=>editor.cancel(),get editor(){return editor;}};
}
