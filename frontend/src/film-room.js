// Film room: library, player screen, notes at a time, clips, Quick grade,
// cut-ups / Teach list, drawings on a frame, and Film packs.
import { mmss, parseTime, isTypingTarget, filmKey, linkInfo, clipAt, clipTitle, tagsFromText, DISTANCE_LABELS, ZONE_LABELS, PLAY_LABELS } from './film-math.js';
import { openWhiteboard } from './whiteboard.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('en-CA');
const REASONS = ['Alignment', 'Assignment', 'Technique', 'Effort'];
const ROOMS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
const KIND_LABEL = { game: 'Game', practice: 'Practice', other: 'Other' };
const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

let ytReady = null;
function loadScript(src) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(Error('Could not load the video player. Check the internet connection.')); document.head.append(s); }); }
function youtubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  ytReady ??= new Promise((resolve, reject) => { window.onYouTubeIframeAPIReady = () => resolve(window.YT); loadScript('https://www.youtube.com/iframe_api').catch(reject); });
  return ytReady;
}

/** One small adapter so uploads, YouTube and Vimeo share the same controls. */
async function makePlayer(host, film, onTime) {
  host.innerHTML = '';
  if (film.source_type === 'upload' && film.playable) {
    const v = document.createElement('video');
    v.src = `/api/films/${film.id}/stream`; v.preload = 'metadata'; v.playsInline = true; v.className = 'film-video'; v.crossOrigin = 'anonymous';
    host.append(v);
    v.addEventListener('timeupdate', () => onTime(v.currentTime));
    v.addEventListener('error', () => { host.insertAdjacentHTML('beforeend', '<p class="film-error">This video format can\'t play in the browser. Convert it to MP4 to watch it here.</p>'); });
    return { kind: 'upload', el: v, time: () => v.currentTime, duration: () => (Number.isFinite(v.duration) ? v.duration : 0), seek: t => { v.currentTime = Math.max(0, t); onTime(v.currentTime); }, play: () => v.play(), pause: () => v.pause(), paused: () => v.paused, rate: r => { v.playbackRate = r; }, frame: d => { v.pause(); v.currentTime = Math.max(0, v.currentTime + d / 30); onTime(v.currentTime); }, canFrame: true,
      capture: () => { const c = document.createElement('canvas'); c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.9); }, destroy: () => { v.pause(); v.removeAttribute('src'); v.load(); } };
  }
  if (film.link_kind === 'youtube') {
    const div = document.createElement('div'); host.append(div);
    const YT = await youtubeApi();
    let player; await new Promise(resolve => { player = new YT.Player(div, { videoId: film.embed_id, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 }, events: { onReady: resolve } }); });
    const timer = setInterval(() => { try { onTime(player.getCurrentTime()); } catch { /* not ready */ } }, 250);
    return { kind: 'youtube', time: () => player.getCurrentTime() || 0, duration: () => player.getDuration() || 0, seek: t => player.seekTo(Math.max(0, t), true), play: () => player.playVideo(), pause: () => player.pauseVideo(), paused: () => player.getPlayerState() !== 1, rate: r => player.setPlaybackRate(r), frame: d => player.seekTo(Math.max(0, player.getCurrentTime() + d), true), canFrame: false, capture: null, destroy: () => { clearInterval(timer); player.destroy(); } };
  }
  if (film.link_kind === 'vimeo') {
    if (!window.Vimeo?.Player) await loadScript('https://player.vimeo.com/api/player.js');
    const div = document.createElement('div'); div.className = 'vimeo-host'; host.append(div);
    const player = new window.Vimeo.Player(div, { id: Number(film.embed_id), responsive: true });
    let now = 0, paused = true, length = 0;
    player.on('timeupdate', d => { now = d.seconds; length = d.duration; onTime(now); });
    player.on('play', () => { paused = false; }); player.on('pause', () => { paused = true; });
    return { kind: 'vimeo', time: () => now, duration: () => length, seek: t => player.setCurrentTime(Math.max(0, t)), play: () => player.play(), pause: () => player.pause(), paused: () => paused, rate: r => player.setPlaybackRate(r).catch(() => {}), frame: d => player.setCurrentTime(Math.max(0, now + d)), canFrame: false, capture: null, destroy: () => player.destroy() };
  }
  // Hudl, Drive, or a file the browser cannot play: open-out, times are references.
  let manual = 0;
  const label = film.link_kind === 'hudl' ? 'Hudl' : film.link_kind === 'drive' ? 'Google Drive' : null;
  host.innerHTML = film.needs_convert
    ? `<div class="film-openout"><p>This video format (${esc(film.file_ext || 'unknown')}) can't play in the browser. Convert it to MP4 to watch it here.</p><button type="button" class="secondary" data-convert>Make it playable</button><p class="muted">Needs ffmpeg on this computer. The original file is kept.</p></div>`
    : `<div class="film-openout"><p>${label} does not allow its videos to play inside other apps, so this film opens in a new tab. Notes keep the time as a reference.</p><a class="secondary" href="${esc(film.source_ref)}" target="_blank" rel="noopener noreferrer">Open in ${label} ↗</a><p class="muted">${label} may ask you to sign in. If you see "access denied" or "video unavailable", the video is private to another team or account; ask its owner to share it with you.</p><p class="muted link-line">${esc(film.source_ref)}</p></div>`;
  host.insertAdjacentHTML('beforeend', '<label class="manual-time">Time in the film <input data-manual-time placeholder="02:14" inputmode="numeric"></label>');
  host.querySelector('[data-manual-time]').addEventListener('input', e => { manual = parseTime(e.target.value) ?? manual; onTime(manual); });
  return { kind: 'openout', time: () => manual, duration: () => 0, seek: t => { manual = t; const i = host.querySelector('[data-manual-time]'); if (i) i.value = mmss(t); onTime(t); }, play() {}, pause() {}, paused: () => true, rate() {}, frame: d => { manual = Math.max(0, manual + d); onTime(manual); }, canFrame: false, capture: null, destroy() {} };
}

export function createFilmRoom(root, ctx) {
  const { api, notify, players, getMode, openReviewDraft, openPlayer, onChanged } = ctx;
  const nameOf = (id) => players.find(p => p.id === id)?.name ?? 'Unknown player';
  const shortName = (id) => { const p = players.find(x => x.id === id); return p ? `#${p.number} ${p.name.split(' ')[0]}` : id; };
  let tab = 'films', films = [], film = null, player = null, clips = [], notes = [], grades = [], drawings = [], summary = {};
  let filmRevision=0;
  let side = 'notes', now = 0, markIn = null, markOut = null, loopClip = false, gradeState = { clip: 0, player: 0 }, recap = null, filters = { kind: '', room: '', search: '', mine: false };

  root.innerHTML = `<p class="film-about">For coaches and staff. <strong>Films</strong>: game and practice video with notes at a time, clips and Quick grades. <strong>Cut-ups &amp; Teach list</strong>: clips picked by filters (a cut-up) or a hand-picked teaching order (Teach list, up to 15). <strong>Film packs</strong>: a read-only page for one player or position room with chosen clips, notes, drawings and actions. <strong>Playbook</strong>: play diagrams drawn on the Playboard (routes, coverages), not video.</p><div class="film-tabs" role="tablist">${[['films', 'Films'], ['cutups', 'Cut-ups & Teach list'], ['packs', 'Film packs'], ['playbook', 'Playbook']].map(([k, v]) => `<button type="button" role="tab" data-film-tab="${k}">${v}</button>`).join('')}</div><div data-film-body></div><aside class="event-panel film-panel" data-film-panel hidden></aside>`;
  const $ = (s) => root.querySelector(s);
  const body = () => $('[data-film-body]');

  // ---------- library ----------
  async function loadFilms() {
    const q = new URLSearchParams();
    if (filters.kind) q.set('kind', filters.kind);
    if (filters.room) q.set('room', filters.room);
    if (filters.search) q.set('search', filters.search);
    if (filters.mine && ctx.coachName) q.set('assigned_to', ctx.coachName);
    films = await api(`/films?${q}`, undefined, 'GET');
  }
  async function showLibrary() {
    filmRevision++;
    film = null; player?.destroy(); player = null;
    try { await loadFilms(); } catch (error) { notify(error.message, true); }
    body().innerHTML = `<div class="film-lib-head"><div class="film-filters">
        ${['', 'game', 'practice', 'other'].map(k => `<button type="button" class="chip-button ${filters.kind === k ? 'on' : ''}" data-kind="${k}">${k ? KIND_LABEL[k] : 'All'}</button>`).join('')}
        <select data-room aria-label="Position room"><option value="">All position rooms</option>${ROOMS.map(r => `<option ${filters.room === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <label class="toggle"><input type="checkbox" data-mine ${filters.mine ? 'checked' : ''}> Assigned to me</label>
        <input type="search" data-film-search placeholder="Search title, opponent, player, tag or note" value="${esc(filters.search)}"></div>
        <button type="button" class="primary" data-add-film>+ Add film</button></div>
      <div class="film-grid">${films.map(f => `<button type="button" class="film-card" data-open-film="${f.id}"><span class="film-thumb ${f.link_kind}">${f.link_kind === 'youtube' ? `<img src="https://i.ytimg.com/vi/${esc(f.embed_id)}/mqdefault.jpg" alt="" loading="lazy">` : f.source_type === 'upload' ? '▶' : f.link_kind === 'hudl' ? 'Hudl' : f.link_kind === 'drive' ? 'Drive' : '▶'}</span>
        <span class="film-card-body"><strong>${esc(f.title)}</strong><small>${esc(f.film_date)} · ${KIND_LABEL[f.kind]}${f.opponent ? ` · ${esc(f.opponent)}` : ''}</small>
        <small>${f.clip_count} clips · ${f.note_count} notes · ${f.graded_clips} graded</small>
        <span class="film-card-foot"><span class="status-pill ${f.status}">${STATUS_LABEL[f.status]}</span>${f.assigned_to ? `<span class="muted">→ ${esc(f.assigned_to)}</span>` : ''}${f.needs_convert ? '<span class="late-word">Needs MP4</span>' : ''}</span></span></button>`).join('') || '<p class="radar-empty">No film yet. Press + Add film to upload a video or paste a YouTube, Vimeo, Hudl or Google Drive link.</p>'}</div>`;
  }
  function addFilmPanel() {
    const panel = $('[data-film-panel]'); panel.hidden = false;
    panel.innerHTML = `<form class="event-form" data-add-film-form><div class="panel-top"><h3>Add film</h3><button type="button" class="icon-button" data-close-film-panel aria-label="Close">✕</button></div>
      <label>Title<input name="title" required maxlength="160" placeholder="Week 12 vs. North – offense"></label>
      <fieldset class="who"><legend>Source</legend><label><input type="radio" name="source_type" value="upload" checked> Upload a video file</label><label><input type="radio" name="source_type" value="link"> Paste a link (YouTube, Vimeo, Hudl, Google Drive)</label></fieldset>
      <label data-src="upload">Video file<input type="file" name="file" accept="video/*,.mkv,.avi,.wmv,.flv,.mts,.m2ts,.ts,.mpg,.mpeg,.3gp,.m4v,.mov"></label>
      <label data-src="link" hidden>Link<input name="url" type="url" placeholder="https://www.youtube.com/watch?v=…"><small data-link-check class="muted"></small></label>
      <div class="form-row"><label>Date<input name="film_date" type="date" required value="${today()}"></label><label>Kind<select name="kind"><option value="game">Game</option><option value="practice">Practice</option><option value="other">Other</option></select></label></div>
      <label>Opponent<input name="opponent" maxlength="80" placeholder="North"></label>
      <label>Players in this film<select name="player_ids" multiple size="5">${players.map(p => `<option value="${p.id}">#${p.number} ${esc(p.name)} · ${p.position}</option>`).join('')}</select></label>
      <label>Coach breaking this film down <small>(staff, not a player)</small><input name="assigned_to" maxlength="80" placeholder="Coach Reed"></label>
      <label>Description<textarea name="description" rows="2" maxlength="2000"></textarea></label>
      <p class="upload-progress" data-progress hidden></p>
      <div class="panel-actions"><span></span><button type="button" class="secondary" data-close-film-panel>Cancel</button><button type="submit" class="primary">Add film</button></div></form>`;
  }
  function uploadFile(filmId, file, progress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/films/${filmId}/upload`);
      xhr.setRequestHeader('X-Filename', file.name.replace(/[^\x20-\x7e]/g, '_'));
      xhr.upload.onprogress = e => { if (e.lengthComputable) progress(Math.round(100 * e.loaded / e.total)); };
      xhr.onload = () => { let data = {}; try { data = JSON.parse(xhr.responseText); } catch { /* empty */ } xhr.status < 300 ? resolve(data) : reject(Error(data.detail || 'Upload failed.')); };
      xhr.onerror = () => reject(Error('Upload failed. Check the backend is running.'));
      xhr.send(file);
    });
  }

  // ---------- workspace ----------
  async function openFilm(id, at = null) {
    const revision=++filmRevision;
    try{player?.destroy();}catch{}player=null;film=null;
    tab = 'films'; syncTabs();
    let selectedFilm;
    try {
      selectedFilm=await api(`/films/${id}`,undefined,'GET');
      const [nextClips,nextNotes,nextDrawings,nextSummary]=await Promise.all([api(`/films/${id}/clips`,undefined,'GET'),api(`/films/${id}/notes`,undefined,'GET'),api(`/diagrams?film_id=${id}`,undefined,'GET'),api(`/films/${id}/grade-summary`,undefined,'GET')]);
      const nextGrades=(await Promise.all(nextClips.map(c=>api(`/clips/${c.id}/grades`,undefined,'GET')))).flat();
      if(revision!==filmRevision)return;
      film=selectedFilm;clips=nextClips;notes=nextNotes;drawings=nextDrawings;summary=nextSummary;grades=nextGrades;
    }catch(error){if(revision===filmRevision)notify(error.message,true);return;}
    markIn = null; markOut = null; recap = null; gradeState = { clip: 0, player: 0 };
    body().innerHTML = `<div class="film-ws">
      <div class="film-ws-head"><button type="button" class="text-button" data-back>← Film library</button><h2>${esc(film.title)}</h2><span class="muted">${esc(film.film_date)} · ${KIND_LABEL[film.kind]}${film.opponent ? ` · vs. ${esc(film.opponent)}` : ''}</span>
        <span class="wb-gap"></span><label class="assign" title="The coach responsible for breaking down this film">Breakdown coach <input data-assign value="${esc(film.assigned_to || '')}" maxlength="80" placeholder="Coach"></label>
        <select data-status-select aria-label="Breakdown status">${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${film.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button type="button" class="text-button danger" data-delete-film>Delete</button></div>
      <div class="film-ws-grid"><div class="film-left">
        <div class="film-stage" data-stage></div>
        <div class="film-bar" data-bar aria-label="Film timeline"><div class="film-bar-fill" data-fill></div><div data-marks></div></div>
        <div class="film-controls">
          <button type="button" data-act="toggle" title="Play/pause (Space, K)">⏯</button><button type="button" data-act="back5" title="Back 5 s (J)">−5s</button><button type="button" data-act="frameBack" data-frame title="Back one frame (←)">◀|</button><button type="button" data-act="frameFwd" data-frame title="Forward one frame (→)">|▶</button><button type="button" data-act="fwd5" title="Forward 5 s (L)">+5s</button>
          <select data-rate aria-label="Speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
          <label class="toggle"><input type="checkbox" data-loop> Loop clip</label><button type="button" data-act="full" title="Full screen">⛶</button>
          <span class="film-time" data-time>00:00</span>
          <button type="button" class="secondary compact" data-act="note">＋ Note at <span data-note-time>00:00</span></button>
          <button type="button" class="secondary compact" data-act="draw" title="Draw on this frame (D)">✎ Draw</button>
        </div>
        <p class="key-help">Keys: Space/K play · J/L ∓5 s · ←/→ frame · N note · D draw · G grade · [ or I mark in · ] or O mark out. Keys pause while you type.</p>
      </div>
      <div class="film-right"><div class="film-side-tabs" role="tablist">${[['notes', 'Notes'], ['clips', 'Clips'], ['grade', 'Quick grade'], ['summary', 'Summary']].map(([k, v]) => `<button type="button" role="tab" data-side="${k}">${v}</button>`).join('')}</div><div data-side-body></div></div></div></div>`;
    const installed=await makePlayer($('[data-stage]'),selectedFilm,onTime).catch(error=>{
      if(revision!==filmRevision)return null;
      notify(error.message,true);return makePlayer($('[data-stage]'),{...selectedFilm,link_kind:'hudl'},onTime);
    });
    if(revision!==filmRevision){installed?.destroy();return;}
    if(!installed)return;player=installed;
    root.querySelectorAll('[data-frame]').forEach(b => { b.disabled = !player.canFrame; b.title = player.canFrame ? b.title : 'Frame step works on uploaded video only'; });
    if (at != null) player.seek(at);
    renderMarks(); renderSide(); onTime(player.time());
  }
  function onTime(t) {
    now = t || 0;
    const d = player?.duration() || Math.max(60, ...clips.map(c => c.end_s), ...notes.map(n => n.t_seconds + 10));
    const time = $('[data-time]'); if (time) time.textContent = `${mmss(now)}${player?.duration() ? ` / ${mmss(d)}` : ''}`;
    const nt = $('[data-note-time]'); if (nt) nt.textContent = mmss(now);
    const fill = $('[data-fill]'); if (fill) fill.style.width = `${Math.min(100, 100 * now / d)}%`;
    if (loopClip && player && !player.paused()) { const c = clips[gradeState.clip]; if (c && now >= c.end_s) player.seek(c.start_s); }
  }
  function duration() { return player?.duration() || Math.max(60, ...clips.map(c => c.end_s), ...notes.map(n => n.t_seconds + 10)); }
  function renderMarks() {
    const d = duration(), gradedClips = new Set(grades.map(g => g.clip_id));
    $('[data-marks]').innerHTML = [
      ...clips.map(c => `<i class="mark clip ${gradedClips.has(c.id) ? 'graded' : ''}" style="left:${100 * c.start_s / d}%;width:${Math.max(0.4, 100 * (c.end_s - c.start_s) / d)}%" title="${esc(clipTitle(c))}" data-seek="${c.start_s}"></i>`),
      ...notes.map(n => `<i class="mark note" style="left:${100 * n.t_seconds / d}%" title="${mmss(n.t_seconds)} ${esc(n.text.slice(0, 60))}" data-seek="${n.t_seconds}"></i>`),
      ...drawings.filter(x => x.t_seconds != null).map(x => `<i class="mark drawing" style="left:${100 * x.t_seconds / d}%" title="✎ ${esc(x.title)}" data-seek="${x.t_seconds}"></i>`),
      ...(markIn != null ? [`<i class="mark in" style="left:${100 * markIn / d}%" title="Mark in"></i>`] : []),
    ].join('');
  }
  function playerSelect(name, selectedIds = [], size = 5) {
    const ordered = [...players].sort((a, b) => (film?.player_ids.includes(b.id) - film?.player_ids.includes(a.id)) || a.number - b.number);
    return `<select name="${name}" multiple size="${size}">${ordered.map(p => `<option value="${p.id}" ${selectedIds.includes(p.id) ? 'selected' : ''}>#${p.number} ${esc(p.name)} · ${p.position}</option>`).join('')}</select>`;
  }
  function renderSide() {
    root.querySelectorAll('[data-side]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.side === side)));
    const el = $('[data-side-body]');
    if (side === 'notes') {
      el.innerHTML = `<div class="side-actions"><button type="button" class="secondary compact" data-recap>✦ Recap this film</button></div>
        ${recap ? `<div class="recap-card film-recap"><div class="recap-head"><h3>Film recap</h3><span class="recap-origin">${esc(recap.label)}${recap.origin === 'demo' ? ' · Demo, made by code' : ' · Aivana'}</span></div><p>${esc(recap.summary)}</p>${recap.per_player.map(p => `<h4>${esc(p.player)}</h4><ul>${p.points.map(x => `<li>${esc(x)}</li>`).join('')}${p.homework.map(x => `<li><strong>Action:</strong> ${esc(x)}</li>`).join('')}</ul>`).join('')}<p><strong>This week work on:</strong> ${esc(recap.this_week_work_on || '—')}</p></div>` : ''}
        <ol class="film-notes">${notes.map(n => `<li class="tone-${n.tone || 'none'}"><button type="button" class="time-link" data-seek="${n.t_seconds}">▶ ${mmss(n.t_seconds)}</button><div><p>${esc(n.text)}</p><small>${n.player_ids.map(shortName).map(esc).join(', ') || 'No player'}${n.tags.length ? ` · ${n.tags.map(esc).join(', ')}` : ''}${n.tone ? ` · ${n.tone === 'improve' ? 'Improve' : n.tone === 'praise' ? 'Praise' : 'Observation'}` : ''}${n.show_in_pack ? ' · In film pack' : ''}</small>
          <div class="note-actions"><input type="date" data-hw-date="${n.id}" min="${today()}" aria-label="Action due date"><button type="button" class="text-button" data-homework="${n.id}" ${n.player_ids.length ? '' : 'disabled title="Pick a player first"'}>Create action</button><button type="button" class="text-button" data-pack-toggle="${n.id}">${n.show_in_pack ? 'Remove from pack' : 'Show in film pack'}</button><button type="button" class="text-button danger" data-del-note="${n.id}">Delete</button></div></div></li>`).join('') || '<li class="radar-empty">No notes yet. Pause on a play and press N or ＋ Note.</li>'}</ol>`;
    }
    if (side === 'clips') {
      el.innerHTML = `<div class="clip-marker"><button type="button" class="secondary compact" data-act="markIn">[ Mark in <b>${markIn != null ? mmss(markIn) : '—'}</b></button><button type="button" class="secondary compact" data-act="markOut">] Mark out <b>${markOut != null ? mmss(markOut) : '—'}</b></button></div>
        <form class="clip-form" data-clip-form>
          <div class="form-row"><label>Label<input name="label" maxlength="120" placeholder="Mesh vs. Cover 3"></label><label>Formation<input name="formation" maxlength="60" list="formation-ideas" placeholder="Shotgun 2x2"><datalist id="formation-ideas">${['Pro I', 'Shotgun 2x2', 'Trips', 'Empty', 'Pistol', 'Wing', 'Bunch', '4-3 Over', '3-4', 'Nickel'].map(f => `<option value="${f}">`).join('')}</datalist></label></div>
          <div class="form-row four"><label>Qtr<select name="quarter"><option value=""></option>${['1', '2', '3', '4', 'OT'].map(q => `<option>${q}</option>`).join('')}</select></label><label>Down<select name="down"><option value=""></option>${[1, 2, 3, 4].map(d => `<option>${d}</option>`).join('')}</select></label><label>Distance<input name="distance" list="distance-ideas" maxlength="40" placeholder="long"></label><label>Hash<select name="hash"><option value=""></option><option>L</option><option>M</option><option>R</option></select></label></div>
          <div class="form-row"><label>Field zone<input name="field_zone" list="zone-ideas" maxlength="40" placeholder="red_zone or any words"></label><label>Play type<input name="play_type" list="play-ideas" maxlength="40" placeholder="pass, screen, trick play…"></label></div>
          <datalist id="distance-ideas">${Object.keys(DISTANCE_LABELS).map(k => `<option value="${k}">`).join('')}</datalist><datalist id="zone-ideas">${Object.keys(ZONE_LABELS).map(k => `<option value="${k}">`).join('')}</datalist><datalist id="play-ideas">${Object.keys(PLAY_LABELS).map(k => `<option value="${k}">`).join('')}<option value="screen"><option value="draw"><option value="play action"><option value="trick play"></datalist>
          <div class="form-row"><label>Result<input name="result" maxlength="120" placeholder="+7, first down"></label><label>Tags<input name="tags" placeholder="third down, red zone"></label></div>
          <label>Players in this clip${playerSelect('player_ids', film.player_ids, 4)}</label>
          <button type="submit" class="secondary compact">Save clip</button></form>
        <ol class="clip-list">${clips.map((c, i) => `<li class="${i === gradeState.clip ? 'current' : ''}"><button type="button" class="time-link" data-play-clip="${i}">▶ ${mmss(c.start_s)}–${mmss(c.end_s)}</button><div><strong>${esc(clipTitle(c))}</strong><small>${[c.quarter && `Q${c.quarter}`, c.field_zone && (ZONE_LABELS[c.field_zone] || c.field_zone), c.hash && `${c.hash} hash`, c.result].filter(Boolean).map(esc).join(' · ')}${c.tags.length ? ` · ${c.tags.map(esc).join(', ')}` : ''}</small><small>${c.player_ids.map(shortName).map(esc).join(', ')}</small></div><button type="button" class="text-button" data-teach="${c.id}" title="Add to the Teach list">＋ Teach</button><button type="button" class="text-button danger" data-del-clip="${c.id}" aria-label="Delete clip">✕</button></li>`).join('') || '<li class="radar-empty">No clips yet. Mark in and out, then Save clip. The next clip starts where the last one ended.</li>'}</ol>`;
    }
    if (side === 'grade') renderGrade(el);
    if (side === 'summary') renderSummary(el);
  }
  function clipPlayers(c) { return c ? (c.player_ids.length ? c.player_ids : film.player_ids) : []; }
  function renderGrade(el) {
    const c = clips[gradeState.clip];
    if (!c) { el.innerHTML = '<p class="radar-empty">Make clips first (Clips tab). Quick grade works one clip at a time.</p>'; return; }
    const list = clipPlayers(c);
    el.innerHTML = `<div class="grade-head"><button type="button" class="icon-button" data-grade-clip="-1" aria-label="Previous clip">◀</button><div><strong>${esc(clipTitle(c))}</strong><small>Clip ${gradeState.clip + 1} of ${clips.length} · ${mmss(c.start_s)}–${mmss(c.end_s)}</small></div><button type="button" class="icon-button" data-grade-clip="1" aria-label="Next clip">▶</button></div>
      <button type="button" class="secondary compact" data-bulk>Everyone did his job</button>
      <p class="key-help">↑/↓ player · 1 ✓ did the job · 0 ✗ missed · Shift+8 ✗* critical · Enter next clip</p>
      <ul class="grade-rows">${list.map((pid, i) => { const g = grades.find(x => x.clip_id === c.id && x.player_id === pid); return `<li class="${i === gradeState.player ? 'cursor' : ''} ${g ? `g-${g.result}` : ''}" data-grade-row="${i}"><span class="who">${esc(shortName(pid))}</span>
        <span class="grade-buttons">${[['won', '✓', 'Did the job'], ['lost', '✗', 'Missed'], ['critical', '✗*', 'Critical mistake']].map(([r, s, t]) => `<button type="button" data-grade="${r}" data-pid="${pid}" aria-pressed="${g?.result === r}" title="${t}">${s}</button>`).join('')}</span>
        <span class="marks"><button type="button" data-mark="technique" data-pid="${pid}" aria-pressed="${g?.technique === 1}" title="Technique +">T${g?.technique === 0 ? '−' : '+'}</button><button type="button" data-mark="effort" data-pid="${pid}" aria-pressed="${g?.effort === 1}" title="Effort +">E${g?.effort === 0 ? '−' : '+'}</button></span>
        <input list="reasons" data-reason="${pid}" value="${esc(g?.reason || '')}" placeholder="Reason" maxlength="140"></li>`; }).join('') || '<li class="radar-empty">Tag players on this clip (Clips tab) or add players to the film.</li>'}</ul>
      <datalist id="reasons">${REASONS.map(r => `<option value="${r}">`).join('')}</datalist>`;
  }
  async function renderSummary(el) {
    try { summary = await api(`/films/${film.id}/grade-summary`, undefined, 'GET'); } catch (error) { notify(error.message, true); }
    const ids = Object.keys(summary);
    el.innerHTML = ids.length ? `<table class="grade-table"><thead><tr><th>Player</th><th>Plays</th><th>%</th><th>Critical</th><th>Target 80%</th></tr></thead><tbody>${ids.map(pid => { const s = summary[pid]; return `<tr><td><button type="button" class="text-button" data-open-player="${pid}">${esc(shortName(pid))}</button></td><td>${s.plays}</td><td>${s.percent ?? '—'}</td><td class="${s.critical ? 'late-word' : ''}">${s.critical}</td><td>${s.label ? `<span class="status-chip ${s.label === 'On target' ? 'green' : 'red'}"><i></i>${s.label}</span>` : ''}</td></tr>`; }).join('')}</tbody></table>
      <h4>Player film summary</h4><select data-sum-player>${ids.map(pid => `<option value="${pid}">${esc(nameOf(pid))}</option>`).join('')}</select>
      <div data-sum-form></div>` : '<p class="radar-empty">Grade a few clips first. % is worked out by code: plays won ÷ plays graded. Aivana never grades.</p>';
    if (ids.length) summaryForm(ids[0]);
  }
  function summaryForm(pid) {
    const w = summary[pid]?.written || {};
    $('[data-sum-form]').innerHTML = `<form data-written="${pid}" class="written-summary"><label>Coaching points<textarea name="coaching_points" rows="3" maxlength="2000">${esc(w.coaching_points || '')}</textarea></label><label>This week work on<textarea name="work_on" rows="2" maxlength="2000">${esc(w.work_on || '')}</textarea></label><label>Summary<textarea name="summary" rows="2" maxlength="2000">${esc(w.summary || '')}</textarea></label><div class="panel-actions"><button type="button" class="text-button" data-draft-summary="${pid}">✦ Draft from my notes</button><span></span><button type="submit" class="secondary compact">Save summary</button></div></form>`;
  }
  async function refreshFilmData() {
    [clips, notes, drawings] = await Promise.all([api(`/films/${film.id}/clips`, undefined, 'GET'), api(`/films/${film.id}/notes`, undefined, 'GET'), api(`/diagrams?film_id=${film.id}`, undefined, 'GET')]);
    grades = (await Promise.all(clips.map(c => api(`/clips/${c.id}/grades`, undefined, 'GET')))).flat();
    renderMarks(); renderSide(); onChanged?.();
  }
  function noteDialog() {
    if (!film) return;
    player.pause();
    const t = player.time();
    const panel = $('[data-film-panel]'); panel.hidden = false;
    const c = clipAt(clips, t);
    panel.innerHTML = `<form class="event-form" data-note-form data-t="${t}"><div class="panel-top"><h3>Note at ${mmss(t)}</h3><button type="button" class="icon-button" data-close-film-panel aria-label="Close">✕</button></div>
      <label>Players${playerSelect('player_ids', c ? c.player_ids : [], 6)}</label>
      <label>Note<textarea name="text" rows="4" required maxlength="2000" placeholder="Eyes inside on the slant. Read the safety first."></textarea></label>
      <label>Tags<input name="tags" placeholder="footwork, cover 3 (any words)"></label>
      <label>Tone<select name="tone"><option value="">—</option><option value="praise">Praise</option><option value="improve">Improve</option><option value="observation">Observation</option></select></label>
      <label class="check-line"><input type="checkbox" name="show_in_pack"> Show in film pack</label>
      <div class="panel-actions"><span></span><button type="button" class="secondary" data-close-film-panel>Cancel</button><button type="submit" class="primary">Save note</button></div></form>`;
    panel.querySelector('textarea').focus();
  }
  async function drawFrame() {
    if (!film) return;
    player.pause();
    const t = player.time();
    let background = null;
    if (player.capture) { try { background = player.capture(); } catch { background = null; } }
    if (!background) {
      const file = await new Promise(resolve => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg'; i.onchange = () => resolve(i.files[0]); i.click(); });
      if (!file) { notify('Embedded film cannot be captured. Upload a screenshot, or draw on the Play diagram.'); return; }
      background = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
    }
    openWhiteboard({ api, notify, players, onSaved: () => refreshFilmData() }, { template: 'frame', background, film_id: film.id, t_seconds: t, title: `${film.title} · ${mmss(t)}`, player_ids: clipAt(clips, t)?.player_ids || [] });
  }
  async function grade(pid, result) {
    const c = clips[gradeState.clip]; if (!c) return;
    const row = grades.find(x => x.clip_id === c.id && x.player_id === pid);
    const reason = root.querySelector(`[data-reason="${pid}"]`)?.value || null;
    try { const fresh = await api(`/clips/${c.id}/grades/${pid}`, { result, technique: row?.technique ?? null, effort: row?.effort ?? null, reason }, 'PUT'); grades = grades.filter(x => x.clip_id !== c.id).concat(fresh); renderSide(); renderMarks(); }
    catch (error) { notify(error.message, true); }
  }

  // ---------- keyboard ----------
  document.addEventListener('keydown', e => {
    if (!film || root.closest('.view')?.hidden || document.querySelector('.wb-overlay') || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (side === 'grade' && ['ArrowUp', 'ArrowDown', '1', '0', 'Enter'].includes(e.key) || (side === 'grade' && e.shiftKey && e.key === '*')) {
      const c = clips[gradeState.clip]; const list = clipPlayers(c);
      e.preventDefault();
      if (e.key === 'ArrowDown') gradeState.player = Math.min(list.length - 1, gradeState.player + 1);
      if (e.key === 'ArrowUp') gradeState.player = Math.max(0, gradeState.player - 1);
      if (e.key === 'Enter') { gradeState = { clip: Math.min(clips.length - 1, gradeState.clip + 1), player: 0 }; if (clips[gradeState.clip]) player.seek(clips[gradeState.clip].start_s); }
      if (e.key === '1' && list[gradeState.player]) grade(list[gradeState.player], 'won');
      if (e.key === '0' && list[gradeState.player]) grade(list[gradeState.player], 'lost');
      if (e.key === '*' && list[gradeState.player]) grade(list[gradeState.player], 'critical');
      renderSide(); return;
    }
    const act = filmKey(e.key, e.shiftKey);
    if (!act) return;
    e.preventDefault(); run(act);
  });
  function run(act) {
    if (!player) return;
    if (act === 'toggle') player.paused() ? player.play() : player.pause();
    if (act === 'back5') player.seek(player.time() - 5);
    if (act === 'fwd5') player.seek(player.time() + 5);
    if (act === 'frameBack') player.frame(-1);
    if (act === 'frameFwd') player.frame(1);
    if (act === 'note') noteDialog();
    if (act === 'draw') drawFrame();
    if (act === 'grade') { side = 'grade'; const c = clipAt(clips, player.time()); if (c) gradeState = { clip: clips.indexOf(c), player: 0 }; renderSide(); }
    if (act === 'markIn') { markIn = player.time(); side = 'clips'; renderSide(); renderMarks(); }
    if (act === 'markOut') { markOut = player.time(); side = 'clips'; renderSide(); }
    if (act === 'full') { const stage = $('[data-stage]'); (stage.requestFullscreen || stage.webkitRequestFullscreen)?.call(stage); }
  }

  // ---------- cut-ups, Teach list ----------
  async function showCutups() {
    const pls = await api('/playlists', undefined, 'GET').catch(() => []);
    body().innerHTML = `<div class="cutup-layout"><section class="panel"><h3>Build a cut-up</h3><form data-cutup-form class="cutup-filters">
        <label>Position room<select name="position"><option value="">Any</option>${ROOMS.map(r => `<option>${r}</option>`).join('')}</select></label>
        <label>Player<select name="player_id"><option value="">Any</option>${players.map(p => `<option value="${p.id}">#${p.number} ${esc(p.name)}</option>`).join('')}</select></label>
        <label>Down<select name="down"><option value="">Any</option>${[1, 2, 3, 4].map(d => `<option>${d}</option>`).join('')}</select></label>
        <label>Distance<input name="distance" list="distance-ideas-f" placeholder="Any"><datalist id="distance-ideas-f">${Object.keys(DISTANCE_LABELS).map(k => `<option value="${k}">`).join('')}</datalist></label>
        <label>Field zone<input name="field_zone" list="zone-ideas-f" placeholder="Any"><datalist id="zone-ideas-f">${Object.keys(ZONE_LABELS).map(k => `<option value="${k}">`).join('')}</datalist></label>
        <label>Play type<input name="play_type" list="play-ideas-f" placeholder="Any"><datalist id="play-ideas-f">${Object.keys(PLAY_LABELS).map(k => `<option value="${k}">`).join('')}</datalist></label>
        <label>Tag<input name="tag" placeholder="red zone"></label><label class="check-line"><input type="checkbox" name="ungraded"> Not graded yet</label></form>
        <div data-cutup-results></div></section>
      <section class="panel"><h3>Playlists & Teach list</h3><ul class="playlist-list">${pls.map(p => `<li><strong>${esc(p.title)}</strong><small>${p.kind === 'teach' ? 'Teach list' : p.kind === 'good_plays' ? 'Good plays' : 'Cut-up'} · ${p.clip_ids.length} clips</small><button type="button" class="text-button" data-play-list="${p.id}">Play</button><button type="button" class="text-button danger" data-del-list="${p.id}">Delete</button></li>`).join('') || '<li class="radar-empty">No playlists yet. Filter clips, then save them as a cut-up or a Teach list (up to 15).</li>'}</ul><div data-list-player></div></section></div>`;
    runCutup();
  }
  let cutupClips = [];
  async function runCutup() {
    const form = root.querySelector('[data-cutup-form]'); if (!form) return;
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v).map(([k, v]) => [k, k === 'ungraded' ? '1' : v]));
    cutupClips = await api(`/clips?${q}`, undefined, 'GET').catch(() => []);
    const active = [...new FormData(form)].filter(([, v]) => v).map(([k, v]) => `${({ position: 'Position room', player_id: 'Player', down: 'Down', distance: 'Distance', field_zone: 'Field zone', play_type: 'Play type', tag: 'Tag', ungraded: 'Not graded' })[k] || k}: ${k === 'player_id' ? nameOf(v) : k === 'ungraded' ? 'yes' : v}`);
    $('[data-cutup-results]').innerHTML = `<p class="muted">${cutupClips.length} clip${cutupClips.length === 1 ? '' : 's'} match${active.length ? ` · filters: ${active.map(esc).join(' · ')} <button type="button" class="text-button" data-clear-cutup>Clear filters</button>` : ''}</p>${!cutupClips.length ? `<p class="radar-empty">${active.length ? 'No clips match these filters. Clear one or more filters, or tag more clips in a film.' : 'No clips yet. Open a film and mark clips (I and O), then tag the players, down and play type.'}</p>` : ''}<ol class="clip-list">${cutupClips.map(c => `<li><label class="check-line"><input type="checkbox" data-pick="${c.id}" checked></label><div><strong>${esc(clipTitle(c))}</strong><small>${esc(c.film_title)} · ${mmss(c.start_s)}–${mmss(c.end_s)}</small><small>${c.player_ids.map(shortName).map(esc).join(', ')}</small></div><button type="button" class="time-link" data-open-clip="${c.film_id}:${c.start_s}">▶ Open</button></li>`).join('')}</ol>
      ${cutupClips.length ? `<div class="panel-actions"><input data-list-title placeholder="WR 3rd downs" maxlength="120"><button type="button" class="secondary compact" data-save-list="cutup">Save cut-up</button><button type="button" class="secondary compact" data-save-list="teach">Save as Teach list</button><button type="button" class="text-button" data-save-list="good_plays">Save as Good plays</button></div>` : ''}`;
  }
  async function playList(id) {
    const list = (await api('/playlists', undefined, 'GET')).find(p => p.id === id); if (!list) return;
    const all = await api('/clips', undefined, 'GET'); const items = list.clip_ids.map(cid => all.find(c => c.id === cid)).filter(Boolean);
    $('[data-list-player]').innerHTML = `<h4>${esc(list.title)}</h4><ol class="clip-list">${items.map((c, i) => `<li><span class="teach-n">${i + 1}</span><div><strong>${esc(clipTitle(c))}</strong><small>${esc(c.film_title)} · ${mmss(c.start_s)}</small></div><button type="button" class="time-link" data-open-clip="${c.film_id}:${c.start_s}">▶ Play</button></li>`).join('')}</ol>`;
  }

  // ---------- film packs ----------
  async function showPacks() {
    const [packs, allClips, allNotes, diagrams] = await Promise.all([api('/film-packs', undefined, 'GET'), api('/clips', undefined, 'GET'), api('/film-notes', undefined, 'GET'), api('/diagrams', undefined, 'GET')]).catch(error => { notify(error.message, true); return [[], [], [], []]; });
    const packNotes = allNotes.filter(n => n.show_in_pack);
    body().innerHTML = `<div class="cutup-layout"><section class="panel"><h3>New film pack</h3><form data-pack-form class="pack-form">
      <div class="form-row"><label>For<select name="audience">${players.map(p => `<option value="player:${p.id}">#${p.number} ${esc(p.name)}</option>`).join('')}${ROOMS.map(r => `<option value="room:${r}">${r} position room</option>`).join('')}</select></label><label>Due<input type="date" name="due_date" min="${today()}"></label></div>
      <label>Title<input name="title" required maxlength="120" placeholder="Red zone reads before Saturday"></label>
      <fieldset><legend>Clips (up to 15)</legend><div class="pick-list">${allClips.map(c => `<label><input type="checkbox" name="clip" value="${c.id}"> ${esc(clipTitle(c))} <small>${esc(c.film_title)} · ${mmss(c.start_s)}</small></label>`).join('') || '<p class="muted">No clips yet.</p>'}</div></fieldset>
      <fieldset><legend>Good plays (optional)</legend><div class="pick-list">${allClips.map(c => `<label><input type="checkbox" name="good" value="${c.id}"> ${esc(clipTitle(c))} <small>${mmss(c.start_s)}</small></label>`).join('')}</div></fieldset>
      <fieldset><legend>Notes marked "Show in film pack"</legend><div class="pick-list">${packNotes.map(n => `<label><input type="checkbox" name="note" value="${n.id}" checked> ${mmss(n.t_seconds)} ${esc(n.text.slice(0, 80))} <small>${esc(n.film_title)}</small></label>`).join('') || '<p class="muted">Mark notes "Show in film pack" in the Film room first.</p>'}</div></fieldset>
      <fieldset><legend>Drawings (up to 3)</legend><div class="pick-list">${diagrams.map(d => `<label><input type="checkbox" name="diagram" value="${d.id}"> ${esc(d.title)}</label>`).join('') || '<p class="muted">No drawings yet.</p>'}</div></fieldset>
      <label>Questions (1–3, one per line)<textarea name="questions" rows="3" placeholder="What did the safety do before the snap?"></textarea></label>
      <label>Actions (one per line)<textarea name="homework" rows="2" placeholder="Watch these clips twice before Thursday"></textarea></label>
      <label class="check-line"><input type="checkbox" name="include_scores"> Show his Quick grade % (off by default)</label>
      <p class="muted">Health and insurance notes are never included. The link works on this computer and local network only.</p>
      <button type="submit" class="primary">Make film pack</button></form></section>
      <section class="panel"><h3>Film packs</h3><ul class="pack-list">${packs.map(p => `<li class="state-${p.state}"><div><strong>${esc(p.title)}</strong><small>${p.audience_kind === 'player' ? esc(nameOf(p.audience_ref)) : `${esc(p.audience_ref)} room`}${p.due_date ? ` · due ${esc(p.due_date)}` : ''}</small>
        <small>${p.state === 'ready' ? 'Link ready to send' : p.state === 'revoked' ? 'Closed' : 'Expired'}${p.first_opened_at ? ` · Opened ${esc(p.first_opened_at.slice(0, 16).replace('T', ' '))}` : ' · Not opened yet'}${p.watched_at ? ` · "I watched it" ${esc(p.watched_at.slice(0, 16).replace('T', ' '))}` : ''}</small></div>
        ${p.state === 'ready' ? `<button type="button" class="text-button" data-copy-pack="${esc(p.token)}">Copy link</button><a class="text-button" href="/pack/${esc(p.token)}" target="_blank" rel="noopener">Open</a><button type="button" class="text-button danger" data-revoke="${p.id}">Revoke</button>` : ''}</li>`).join('') || '<li class="radar-empty">No film packs yet.</li>'}</ul>
      <p class="muted">"Opened" and "I watched it" are recorded by the pack page on this computer. They are not delivery receipts.</p></section></div>`;
  }

  // ---------- playbook ----------
  async function showPlaybook() {
    const diagrams = await api('/diagrams', undefined, 'GET').catch(() => []);
    body().innerHTML = `<div class="film-lib-head"><p class="muted">Every play diagram drawn on the Playboard, from notes, meetings and film.</p><button type="button" class="primary" data-new-drawing>+ New play diagram</button></div>
      <div class="film-grid">${diagrams.map(d => `<button type="button" class="film-card" data-open-drawing="${d.id}"><span class="film-thumb">${d.has_preview ? `<img src="/api/diagrams/${d.id}/preview.png?v=${encodeURIComponent(d.updated_at)}" alt="${esc(d.alt_text || d.title)}">` : '✎'}</span><span class="film-card-body"><strong>${esc(d.title)}</strong><small>${esc(d.updated_at.slice(0, 10))}${d.film_id ? ` · film ${mmss(d.t_seconds || 0)}` : ''}</small><small>${d.player_ids.map(shortName).map(esc).join(', ')}</small></span></button>`).join('') || '<p class="radar-empty">No drawings yet.</p>'}</div>`;
  }

  function syncTabs() { root.querySelectorAll('[data-film-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.filmTab === tab))); }
  async function showTab(next) { filmRevision++; tab = next; syncTabs(); player?.destroy(); player = null; film = null; if (tab === 'films') await showLibrary(); if (tab === 'cutups') await showCutups(); if (tab === 'packs') await showPacks(); if (tab === 'playbook') await showPlaybook(); }

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const t = e.target;
    const tabBtn = t.closest('[data-film-tab]'); if (tabBtn) { showTab(tabBtn.dataset.filmTab); return; }
    const kind = t.closest('[data-kind]'); if (kind) { filters.kind = kind.dataset.kind; showLibrary(); return; }
    if (t.closest('[data-add-film]')) { addFilmPanel(); return; }
    if (t.closest('[data-close-film-panel]')) { $('[data-film-panel]').hidden = true; return; }
    const open = t.closest('[data-open-film]'); if (open) { openFilm(Number(open.dataset.openFilm)); return; }
    if (t.closest('[data-back]')) { showLibrary(); return; }
    const sideBtn = t.closest('[data-side]'); if (sideBtn) { side = sideBtn.dataset.side; renderSide(); return; }
    const act = t.closest('[data-act]'); if (act) { run(act.dataset.act); return; }
    const seek = t.closest('[data-seek]'); if (seek && player) { player.seek(Number(seek.dataset.seek)); return; }
    const bar = t.closest('[data-bar]'); if (bar && player) { const r = bar.getBoundingClientRect(); player.seek((e.clientX - r.left) / r.width * duration()); return; }
    if (t.closest('[data-convert]')) { try { await api(`/films/${film.id}/convert`, {}); notify('Converted to MP4.'); openFilm(film.id); } catch (error) { notify(error.message, true); } return; }
    if (t.closest('[data-delete-film]')) { if (!confirm(`Delete "${film.title}" and its clips, notes and grades? Are you sure?`)) return; try { await api(`/films/${film.id}`, undefined, 'DELETE'); notify('Film deleted.'); showLibrary(); onChanged?.(); } catch (error) { notify(error.message, true); } return; }
    const playClip = t.closest('[data-play-clip]'); if (playClip) { gradeState = { clip: Number(playClip.dataset.playClip), player: 0 }; player.seek(clips[gradeState.clip].start_s); player.play(); renderSide(); return; }
    const delClip = t.closest('[data-del-clip]'); if (delClip) { if (!confirm('Delete this clip and its grades?')) return; await api(`/clips/${delClip.dataset.delClip}`, undefined, 'DELETE'); refreshFilmData(); return; }
    const teach = t.closest('[data-teach]');
    if (teach) {
      const lists = await api('/playlists', undefined, 'GET'); let list = lists.find(l => l.kind === 'teach');
      const ids = [...new Set([...(list?.clip_ids || []), Number(teach.dataset.teach)])];
      try { list ? await api(`/playlists/${list.id}`, { title: list.title, kind: 'teach', clip_ids: ids }, 'PUT') : await api('/playlists', { title: 'Teach list', kind: 'teach', clip_ids: ids }); notify(`Added to the Teach list (${ids.length} of 15).`); } catch (error) { notify(error.message, true); }
      return;
    }
    const gc = t.closest('[data-grade-clip]'); if (gc) { gradeState = { clip: Math.max(0, Math.min(clips.length - 1, gradeState.clip + Number(gc.dataset.gradeClip))), player: 0 }; if (clips[gradeState.clip]) player.seek(clips[gradeState.clip].start_s); renderSide(); return; }
    const g = t.closest('[data-grade]'); if (g) { grade(g.dataset.pid, g.dataset.grade); return; }
    const mark = t.closest('[data-mark]');
    if (mark) {
      const c = clips[gradeState.clip]; const row = grades.find(x => x.clip_id === c.id && x.player_id === mark.dataset.pid);
      if (!row) { notify('Tap ✓, ✗ or ✗* first.', true); return; }
      const key = mark.dataset.mark; const value = row[key] === 1 ? 0 : row[key] === 0 ? null : 1;
      const fresh = await api(`/clips/${c.id}/grades/${row.player_id}`, { result: row.result, technique: key === 'technique' ? value : row.technique, effort: key === 'effort' ? value : row.effort, reason: row.reason }, 'PUT').catch(error => { notify(error.message, true); return null; });
      if (fresh) { grades = grades.filter(x => x.clip_id !== c.id).concat(fresh); renderSide(); }
      return;
    }
    if (t.closest('[data-bulk]')) { const c = clips[gradeState.clip]; try { const fresh = await api(`/clips/${c.id}/grades/bulk`, { player_ids: clipPlayers(c), keep_existing: true }); grades = grades.filter(x => x.clip_id !== c.id).concat(fresh); renderSide(); renderMarks(); notify('Everyone marked ✓. Change the few who missed.'); } catch (error) { notify(error.message, true); } return; }
    const hw = t.closest('[data-homework]');
    if (hw) {
      const due = root.querySelector(`[data-hw-date="${hw.dataset.homework}"]`)?.value || null;
      try { const draft = await api(`/film-notes/${hw.dataset.homework}/homework`, { due_date: due }); openReviewDraft(draft); } catch (error) { notify(error.message, true); }
      return;
    }
    const packToggle = t.closest('[data-pack-toggle]'); if (packToggle) { const n = notes.find(x => x.id === Number(packToggle.dataset.packToggle)); await api(`/film-notes/${n.id}`, { show_in_pack: !n.show_in_pack }, 'PATCH').catch(error => notify(error.message, true)); refreshFilmData(); return; }
    const delNote = t.closest('[data-del-note]'); if (delNote) { if (!confirm('Delete this note?')) return; await api(`/film-notes/${delNote.dataset.delNote}`, undefined, 'DELETE'); refreshFilmData(); return; }
    if(t.closest('[data-recap]')) {
      const revision=filmRevision,id=film.id,selectedMode=getMode(),btn=t.closest('[data-recap]');btn.disabled=true;btn.textContent='Reading your notes…';
      try{const result=await api(`/films/${id}/recap`,{mode:selectedMode});if(revision===filmRevision&&getMode()===selectedMode)recap=result;}
      catch(error){if(revision===filmRevision)notify(error.message,true);}
      if(revision===filmRevision)renderSide();return;
    }
    const draftSum = t.closest('[data-draft-summary]');
    if (draftSum) {
      try {
        const r = recap || await api(`/films/${film.id}/recap`, { mode: getMode() }); recap = r;
        const mine = r.per_player.find(p => p.player_id === draftSum.dataset.draftSummary);
        const form = root.querySelector('[data-written]');
        form.coaching_points.value ||= (mine?.points || []).join('\n'); form.work_on.value ||= r.this_week_work_on || ''; form.summary.value ||= r.summary || '';
        notify('Draft added from your notes. Edit it, then Save summary.');
      } catch (error) { notify(error.message, true); }
      return;
    }
    const openPlayerBtn = t.closest('[data-open-player]'); if (openPlayerBtn) { openPlayer(openPlayerBtn.dataset.openPlayer); return; }
    const saveList = t.closest('[data-save-list]');
    if (saveList) {
      const ids = [...root.querySelectorAll('[data-pick]:checked')].map(b => Number(b.dataset.pick));
      const title = root.querySelector('[data-list-title]').value.trim() || (saveList.dataset.saveList === 'teach' ? 'Teach list' : 'Cut-up');
      try { await api('/playlists', { title, kind: saveList.dataset.saveList, clip_ids: ids, filter: Object.fromEntries(new FormData(root.querySelector('[data-cutup-form]'))) }); notify('Saved.'); showCutups(); } catch (error) { notify(error.message, true); }
      return;
    }
    if (t.closest('[data-clear-cutup]')) { root.querySelector('[data-cutup-form]').reset(); runCutup(); return; }
    const playListBtn = t.closest('[data-play-list]'); if (playListBtn) { playList(Number(playListBtn.dataset.playList)); return; }
    const delList = t.closest('[data-del-list]'); if (delList) { if (!confirm('Delete this playlist? The clips stay.')) return; await api(`/playlists/${delList.dataset.delList}`, undefined, 'DELETE'); showCutups(); return; }
    const openClip = t.closest('[data-open-clip]'); if (openClip) { const [fid, start] = openClip.dataset.openClip.split(':'); openFilm(Number(fid), Number(start)); return; }
    const copy = t.closest('[data-copy-pack]'); if (copy) { const url = `${location.origin}/pack/${copy.dataset.copyPack}`; try { await navigator.clipboard.writeText(url); notify('Link copied. It works on this computer and local network only.'); } catch { prompt('Copy this link', url); } return; }
    const revoke = t.closest('[data-revoke]'); if (revoke) { if (!confirm('Close this film pack? The link will stop working.')) return; await api(`/film-packs/${revoke.dataset.revoke}/revoke`, {}).catch(error => notify(error.message, true)); showPacks(); onChanged?.(); return; }
    if (t.closest('[data-new-drawing]')) { openWhiteboard({ api, notify, players, onSaved: () => {}, onClose: () => showPlaybook() }, { template: 'play' }); return; }
    const od = t.closest('[data-open-drawing]'); if (od) { openWhiteboard({ api, notify, players, onSaved: () => {}, onClose: () => showPlaybook() }, { id: Number(od.dataset.openDrawing) }); }
  });
  root.addEventListener('change', async e => {
    const t = e.target;
    if (t.matches('[data-room]')) { filters.room = t.value; showLibrary(); }
    if (t.matches('[data-mine]')) { filters.mine = t.checked; if (t.checked && !ctx.coachName) { const n = prompt('Your coach name (as used in Assigned to)'); if (n) ctx.coachName = n.trim(); } showLibrary(); }
    if (t.matches('[data-rate]')) player?.rate(Number(t.value));
    if (t.matches('[data-loop]')) loopClip = t.checked;
    if (t.matches('[data-status-select]')) { film = await api(`/films/${film.id}`, { status: t.value }, 'PATCH').catch(error => { notify(error.message, true); return film; }); onChanged?.(); }
    if (t.matches('[data-assign]')) { film = await api(`/films/${film.id}`, { assigned_to: t.value || null }, 'PATCH').catch(error => { notify(error.message, true); return film; }); onChanged?.(); }
    if (t.matches('[name="source_type"]')) { const link = t.value === 'link'; root.querySelector('[data-src="upload"]').hidden = link; root.querySelector('[data-src="link"]').hidden = !link; }
    if (t.closest('[data-cutup-form]')) runCutup();
    if (t.matches('[data-sum-player]')) summaryForm(t.value);
    const reason = t.closest('[data-reason]'); if (reason) { const c = clips[gradeState.clip]; const row = grades.find(x => x.clip_id === c.id && x.player_id === reason.dataset.reason); if (row) { await api(`/clips/${c.id}/grades/${row.player_id}`, { result: row.result, technique: row.technique, effort: row.effort, reason: reason.value || null }, 'PUT').catch(error => notify(error.message, true)); } }
  });
  let searchTimer;
  root.addEventListener('input', e => {
    if (e.target.matches('[data-film-search]')) { clearTimeout(searchTimer); searchTimer = setTimeout(() => { filters.search = e.target.value.trim(); showLibrary().then(() => { const s = root.querySelector('[data-film-search]'); s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); }); }, 300); }
    if (e.target.matches('[name="url"]')) { const info = linkInfo(e.target.value); root.querySelector('[data-link-check]').textContent = !e.target.value ? '' : info.ok ? (['youtube', 'vimeo'].includes(info.kind) ? `✓ ${info.kind === 'youtube' ? 'YouTube' : 'Vimeo'}: plays here, times can be clicked` : `✓ ${info.kind === 'hudl' ? 'Hudl' : 'Google Drive'}: opens in a new tab, times are saved as references`) : info.error; }
    if (e.target.closest('[data-cutup-form]') && ['tag', 'distance', 'field_zone', 'play_type'].includes(e.target.name)) { clearTimeout(searchTimer); searchTimer = setTimeout(runCutup, 300); }
  });
  root.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    if (form.matches('[data-add-film-form]')) {
      const source = f.get('source_type');
      const data = { title: f.get('title'), source_type: source, film_date: f.get('film_date'), kind: f.get('kind'), opponent: f.get('opponent') || null, assigned_to: f.get('assigned_to') || null, description: f.get('description') || null, player_ids: f.getAll('player_ids') };
      const file = f.get('file');
      if (source === 'link') { const info = linkInfo(f.get('url')); if (!info.ok) { notify(info.error, true); return; } data.url = f.get('url'); }
      else if (!file?.size) { notify('Choose a video file.', true); return; }
      form.querySelector('[type="submit"]').disabled = true;
      try {
        let created = await api('/films', data);
        if (source === 'upload') {
          const progress = form.querySelector('[data-progress]'); progress.hidden = false;
          try { created = await uploadFile(created.id, file, p => { progress.textContent = `Uploading… ${p}%`; }); }
          catch (error) { await api(`/films/${created.id}`, undefined, 'DELETE').catch(() => {}); throw error; }
        }
        $('[data-film-panel]').hidden = true; notify('Film added.'); onChanged?.(); openFilm(created.id);
      } catch (error) {
        const progress=form.querySelector('[data-progress]');progress.hidden=false;progress.classList.add('film-error');progress.textContent=error.message;
        notify(error.message,true);form.querySelector('[type="submit"]').disabled=false;
      }
    }
    if (form.matches('[data-note-form]')) {
      try {
        await api(`/films/${film.id}/notes`, { t_seconds: Number(form.dataset.t), text: f.get('text'), player_ids: f.getAll('player_ids'), tags: tagsFromText(f.get('tags')), tone: f.get('tone') || null, show_in_pack: f.get('show_in_pack') === 'on', clip_id: clipAt(clips, Number(form.dataset.t))?.id ?? null });
        $('[data-film-panel]').hidden = true; side = 'notes'; await refreshFilmData(); notify(`Note saved at ${mmss(Number(form.dataset.t))}.`);
      } catch (error) { notify(error.message, true); }
    }
    if (form.matches('[data-clip-form]')) {
      const start = markIn ?? 0, endT = markOut ?? player.time();
      if (endT <= start) { notify('Mark out must be after mark in.', true); return; }
      const data = { start_s: start, end_s: endT, label: f.get('label') || null, formation: f.get('formation') || null, result: f.get('result') || null, quarter: f.get('quarter') || null, down: f.get('down') ? Number(f.get('down')) : null, distance: f.get('distance') || null, field_zone: f.get('field_zone') || null, hash: f.get('hash') || null, play_type: f.get('play_type') || null, tags: tagsFromText(f.get('tags')), player_ids: f.getAll('player_ids') };
      try { await api(`/films/${film.id}/clips`, data); markIn = endT; markOut = null; await refreshFilmData(); gradeState.clip = clips.length - 1; notify(`Clip saved. Next clip starts at ${mmss(endT)}.`); } catch (error) { notify(error.message, true); }
    }
    if (form.matches('[data-written]')) { try { await api(`/films/${film.id}/summary/${form.dataset.written}`, Object.fromEntries(f), 'PUT'); notify('Summary saved.'); } catch (error) { notify(error.message, true); } }
    if (form.matches('[data-pack-form]')) {
      const [kind, ref] = f.get('audience').split(':');
      const data = { title: f.get('title'), audience_kind: kind, audience_ref: ref, due_date: f.get('due_date') || null, clip_ids: f.getAll('clip').map(Number), good_clip_ids: f.getAll('good').map(Number), note_ids: f.getAll('note').map(Number), diagram_ids: f.getAll('diagram').map(Number), questions: f.get('questions').split('\n').map(x => x.trim()).filter(Boolean), homework: f.get('homework').split('\n').map(x => x.trim()).filter(Boolean), include_scores: f.get('include_scores') === 'on' };
      if (data.diagram_ids.length > 3) { notify('Pick up to 3 drawings.', true); return; }
      try { const pack = await api('/film-packs', data); await showPacks(); notify('Local film-pack link created.'); try { await navigator.clipboard.writeText(`${location.origin}/pack/${pack.token}`); } catch { /* copy button still works */ } } catch (error) { notify(error.message, true); }
    }
  });

  return {
    show: () => { if (!film) showTab(tab); },
    openFilm,
    hide:()=>{filmRevision++;try{const pending=player?.pause();pending?.catch?.(()=>{});}catch{}},
    cancelPending:()=>{filmRevision++;recap=null;if(film&&$('[data-side-body]'))renderSide();},
    openTab: showTab,
    get context() { return film ? { page: 'film', selected_id: film.id } : { page: 'film', selected_id: null }; },
  };
}
