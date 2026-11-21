// Home note editor: Type · Pen · Photo · Voice, Recap, replay bar and undo/redo.
import { PenPad, renderStrokesUpTo, PEN_COLORS } from './pen-pad.js';
import { resizePhoto, MAX_PHOTOS } from './image-utils.js';
import { voiceButtonState, startDictation, formatTimer } from './voice.js';
import { HistoryStack, changedWords } from './history-stack.js';

export const NOTEBOOK_LABELS = { personal: 'My notes', player_meetings: 'Player meetings', team_strategy: 'Game plan' };
export const NOTEBOOK_HINTS = { personal: 'Private', player_meetings: '1-on-1s and position rooms', team_strategy: 'Game plan and installs' };
const DRAFT_KEY = 'falcon.noteDraft.v1';
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function recapMarkup(recap) {
  if (!recap) return '';
  const list = (items) => items.length ? `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">Nothing here.</p>';
  const todos = recap.to_dos.length ? `<ul class="recap-todos">${recap.to_dos.map((t, n) => `<li><strong>${esc(t.player)}</strong>${t.unknown_name ? ' <span class="badge overdue">unknown name</span>' : ''} · ${esc(t.task)}${t.due_date ? ` <span class="due-chip">Due ${esc(t.due_date)}</span>` : t.due_phrase ? ` <span class="due-chip muted">“${esc(t.due_phrase)}” · set a date</span>` : ''}${t.source_text ? `<blockquote>${esc(t.source_text)}</blockquote>` : ''}${t.due_date ? `<button type="button" class="text-button" data-recap-calendar="${n}">Add to schedule</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted">No homework in this note.</p>';
  return `<div class="recap-card" aria-live="polite"><div class="recap-head"><h3>✦ Recap</h3><span class="recap-origin">${recap.origin === 'demo' ? 'Demo recap · made by code, not AI' : 'By Aivana · check it before you use it'}</span></div>
    <section><h4>Summary</h4><p>${esc(recap.summary || '—')}</p></section>
    <section><h4>Key points</h4>${list(recap.key_points)}</section>
    <section><h4>Player homework</h4>${todos}</section>
    <section><h4>Decisions</h4>${list(recap.decisions)}</section>
    <section><h4>Follow up</h4>${list(recap.questions_to_follow_up)}</section>
    ${recap.players_mentioned?.length ? `<p class="recap-players">Players mentioned: ${recap.players_mentioned.map(p => `${esc(p.name)}${p.unknown_name ? ' (unknown name)' : ''}`).join(', ')}</p>` : ''}
    ${recap.events?.length ? `<section class="recap-events"><h4>Schedule items found in this note</h4><p class="muted">Worked out by code from the note's date. Nothing is added until you press Add to Schedule and save.</p><ul>${recap.events.map((ev, n) => ev.draft ? `<li><strong>${esc(ev.draft.title)}</strong> · ${esc(new Date(ev.draft.start_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${ev.draft.opponent ? ` · ${ev.draft.home_away === 'away' ? 'Away' : 'Home'}` : ''}<blockquote>${esc(ev.source_text)}</blockquote><button type="button" class="secondary compact" data-recap-event="${n}">Add to Schedule</button></li>` : `<li class="muted">${esc(ev.message)}<blockquote>${esc(ev.source_text)}</blockquote></li>`).join('')}</ul></section>` : ''}
    <div class="recap-actions"><button type="button" class="secondary compact" data-recap-copy>Copy</button>${recap.to_dos.some(t => t.player_id) ? '<button type="button" class="secondary compact" data-recap-review>Send homework to review</button>' : '<span class="recap-none">No assignments found in this note.</span><button type="button" class="secondary compact" data-recap-manual>Add an assignment by hand</button>'}${recap.notebook && recap.notebook !== 'team_strategy' ? '<button type="button" class="text-button" data-recap-gameplan>Move this note to Game plan</button>' : recap.notebook === 'team_strategy' ? '<span class="recap-none">✓ Saved in Game plan</span>' : ''}</div></div>`;
}

/** Highlights uncertain words (and [?]) so the coach can fix them with one tap. */
export function highlightUncertain(text, words) {
  const set = [...new Set(words)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!set.length) return esc(text);
  const pattern = new RegExp(set.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  let out = '', last = 0, n = 0;
  for (const match of text.matchAll(pattern)) {
    out += esc(text.slice(last, match.index)) + `<mark class="uncertain" data-uncertain="${n++}" data-start="${match.index}" data-length="${match[0].length}" tabindex="0" title="Tap to fix">${esc(match[0])}</mark>`;
    last = match.index + match[0].length;
  }
  return out + esc(text.slice(last));
}

export function createNoteEditor(root, ctx) {
  const { api, notify, getMode, onSaved, sendToReview, addToSchedule, onContextChange } = ctx;
  const voice = voiceButtonState(window);
  let note = null; // saved note (server copy)
  let method = 'type', view = 'type', dirty = false, busy = false;
  let draftVersions = [], strokesForReplay = [];
  let photos = []; // {data_url}
  let inkDataUrl = null;
  let transcribed = null; // {text, uncertain_words, warnings, images}
  let cleanup = null; // {original, text, changes, accepted:Set}
  let stopVoice = null, voiceStarted = 0, voiceTimer = null, voiceText = '';
  let typingTimer = null, historyTimer = null;
  const history = new HistoryStack('');
  let replay = { kind: 'versions', items: [], index: -1, playing: null, speed: 1 };

  root.innerHTML = `
  <section class="panel note-editor" aria-labelledby="editor-heading">
    <div class="editor-top"><h2 id="editor-heading">New note</h2>
      <div class="input-switch" role="tablist" aria-label="How do you want to write?">
        <button type="button" role="tab" data-input="type" aria-selected="true">Type</button>
        <button type="button" role="tab" data-input="pen" aria-selected="false">Pen</button>
        <button type="button" role="tab" data-input="photo" aria-selected="false">Photo</button>
        <span class="voice-wrap" title="${esc(voice.tooltip)}">${voice.supported ? '<button type="button" role="tab" data-input="voice" aria-selected="false">Voice</button>' : '<span class="voice-unsupported" tabindex="0" aria-label="Voice works in Chrome and Edge.">Voice</span>'}</span>
      </div></div>
    <div class="editor-meta"><label>Title<input id="ne-title" maxlength="160" placeholder="Receivers check-in"></label><label>Date<input id="ne-date" type="date"></label><label>Notebook<select id="ne-notebook">${Object.entries(NOTEBOOK_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
    <div class="editor-toolbar" aria-label="Formatting">
      <span data-type-tools><button type="button" data-format="bold" title="Bold"><b>B</b></button><button type="button" data-format="italic" title="Italic"><i>I</i></button><button type="button" data-format="bullet" title="Bullet list">•</button><button type="button" data-format="check" title="Checklist">☐</button></span>
      <span data-pen-tools hidden><button type="button" data-pen-tool="pen" aria-pressed="true">Pen</button><button type="button" data-pen-tool="eraser" aria-pressed="false">Eraser</button>${Object.entries(PEN_COLORS).map(([k, v]) => `<button type="button" class="swatch" data-pen-color="${k}" aria-label="${k}" aria-pressed="${k === 'black'}" style="--swatch:${v}"></button>`).join('')}<button type="button" data-pen-clear>Clear</button></span>
      <span class="toolbar-gap"></span><button type="button" data-undo title="Undo (Ctrl+Z)">↶ Undo</button><button type="button" data-redo title="Redo (Ctrl+Y)">↷ Redo</button>
    </div>
    <div class="editor-page">
      <div data-pane="type"><label class="sr-only" for="ne-body">Note</label><textarea id="ne-body" class="lined-page" rows="12" maxlength="20000" placeholder="What happened? Who needs homework? Write it like you would on paper…"></textarea></div>
      <div data-pane="pen" hidden><canvas class="pen-canvas" aria-label="Handwriting area. Draw with a finger, mouse or pen."></canvas><div class="pane-actions"><span class="muted">Write with a finger, mouse, Apple Pencil or Surface pen.</span><button type="button" class="secondary compact" data-convert>Convert to text</button></div></div>
      <div data-pane="photo" hidden><label class="photo-drop"><input id="ne-photos" type="file" accept="image/png,image/jpeg" capture="environment" multiple><span>📷 Add photo</span><small>Paper notes, whiteboard or a film screenshot · up to ${MAX_PHOTOS} · PNG or JPEG</small></label><div class="photo-strip" id="ne-photo-strip"></div><div class="pane-actions"><span class="muted" id="ne-photo-count"></span><button type="button" class="secondary compact" data-read-photos disabled>Read photos</button></div></div>
      <div data-pane="voice" hidden><div class="voice-box"><button type="button" class="mic-button" data-mic aria-pressed="false"><span class="mic-dot"></span><span data-mic-label>Start talking</span></button><span class="recording" hidden><i></i> Recording <b data-voice-timer>0:00</b></span><p class="voice-live" data-voice-live aria-live="polite">Press the mic and talk. Your words show up here. Audio stays in this browser.</p></div></div>
      <div class="check-panel" data-check hidden></div>
    </div>
    <div class="replay-bar" data-replay hidden>
      <button type="button" data-replay-act="start" aria-label="Go to first">⏮</button><button type="button" data-replay-act="back" aria-label="Step back">◀</button><button type="button" data-replay-act="play" aria-label="Play">▶</button><button type="button" data-replay-act="fwd" aria-label="Step forward">▶▶</button><button type="button" data-replay-act="end" aria-label="Go to latest">⏭</button>
      <input type="range" min="0" max="0" value="0" data-replay-slider aria-label="Replay position"><button type="button" class="speed" data-replay-speed>1×</button><span class="replay-label" data-replay-label></span>
    </div>
    <div class="replay-preview" data-replay-preview hidden></div>
    <div class="editor-footer"><div><button type="button" class="secondary" data-recap>✦ Recap</button><p class="privacy-line">Your private note is sent to Aivana only for this recap or when you convert writing to text.</p></div><div class="footer-right"><button type="button" class="text-button" data-whiteboard>✎ Whiteboard</button><button type="button" class="text-button" data-find-homework hidden>Find homework</button><button type="button" class="text-button danger" data-delete hidden>Delete</button><button type="button" class="primary" data-save>Save note</button></div></div>
    <div data-recap-card></div>
  </section>`;
  const $ = (s) => root.querySelector(s);
  const body = $('#ne-body');
  const pad = new PenPad($('.pen-canvas'), { onChange: () => { dirty = true; inkDataUrl = null; if (!body.value.trim()) method = 'pen'; updateState(); loadReplay(); } });
  new ResizeObserver(() => { if (view === 'pen') pad.resize(); }).observe($('.pen-canvas'));

  function setView(next) {
    view = next;
    root.querySelectorAll('[data-input]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.input === next)));
    root.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== next);
    $('[data-type-tools]').hidden = next !== 'type'; $('[data-pen-tools]').hidden = next !== 'pen';
    if (next === 'pen') requestAnimationFrame(() => pad.resize());
    loadReplay();
  }
  function setBody(text, source) {
    body.value = text; history.push(text); dirty = true;
    if (source) recordVersion(source);
    updateState();
  }
  function insertText(text, source) {
    const current = body.value.trimEnd();
    setBody(current ? `${current}\n\n${text}` : text, source);
  }
  async function recordVersion(source) {
    const text = body.value;
    if (note) { try { await api(`/notes/${note.id}/versions`, { body: text, source }); note.version_count = (note.version_count || 0) + 1; } catch { /* the next save keeps the text */ } }
    else { if (draftVersions.at(-1)?.body !== text) draftVersions.push({ body: text, source, created_at: new Date().toISOString() }); if (draftVersions.length > 200) draftVersions.shift(); }
    loadReplay();
  }
  function snapshot() { return { title: $('#ne-title').value.trim(), note_date: $('#ne-date').value, notebook: $('#ne-notebook').value, body: body.value, input_method: method }; }
  function updateState() {
    $('#editor-heading').textContent = note ? (note.title || 'Note') : 'New note';
    $('[data-delete]').hidden = !note;
    $('[data-find-homework]').hidden = !note || $('#ne-notebook').value !== 'player_meetings';
    $('[data-recap]').disabled = busy || !body.value.trim();
    $('[data-save]').disabled = busy;
    $('[data-undo]').disabled = view === 'pen' ? !pad.strokes.length : !history.canUndo;
    $('[data-redo]').disabled = view === 'pen' ? !pad.redoStack.length : !history.canRedo;
    $('.privacy-line').hidden = $('#ne-notebook').value !== 'personal';
    onContextChange?.(note ? { page: 'note', selected_id: note.id } : { page: 'home', selected_id: null });
  }

  // ---------- Type ----------
  body.addEventListener('input', () => {
    dirty = true; updateState();
    clearTimeout(historyTimer); historyTimer = setTimeout(() => { history.push(body.value); updateState(); }, 400);
    clearTimeout(typingTimer); typingTimer = setTimeout(() => recordVersion('typing'), 3000);
  });
  root.addEventListener('input', e => { if (e.target.matches('#ne-title,#ne-date,#ne-notebook')) { dirty = true; updateState(); } });
  root.addEventListener('change', e => { if (e.target.id === 'ne-notebook') updateState(); });
  $('[data-type-tools]').addEventListener('click', e => {
    const kind = e.target.closest('[data-format]')?.dataset.format; if (!kind) return;
    const { selectionStart: a, selectionEnd: b, value } = body;
    const chosen = value.slice(a, b);
    let next, caret;
    if (kind === 'bold' || kind === 'italic') { const mark = kind === 'bold' ? '**' : '_'; next = value.slice(0, a) + mark + (chosen || 'text') + mark + value.slice(b); caret = a + mark.length + (chosen || 'text').length + mark.length; }
    else { const prefix = kind === 'bullet' ? '• ' : '☐ '; const lineStart = value.lastIndexOf('\n', a - 1) + 1; next = value.slice(0, lineStart) + prefix + value.slice(lineStart); caret = b + prefix.length; }
    setBody(next); body.focus(); body.setSelectionRange(caret, caret);
  });
  body.addEventListener('keydown', e => {
    if (e.key === 'Enter') { // continue bullets / checklists
      const lineStart = body.value.lastIndexOf('\n', body.selectionStart - 1) + 1;
      const prefix = body.value.slice(lineStart).match(/^(• |☐ |☑ )/)?.[1];
      if (prefix) { e.preventDefault(); const p = prefix === '☑ ' ? '☐ ' : prefix; const pos = body.selectionStart; setBody(body.value.slice(0, pos) + '\n' + p + body.value.slice(body.selectionEnd)); body.setSelectionRange(pos + 1 + p.length, pos + 1 + p.length); }
    }
  });
  body.addEventListener('click', () => { // tap a checkbox to tick it
    const pos = body.selectionStart; const lineStart = body.value.lastIndexOf('\n', pos - 1) + 1;
    if (pos - lineStart <= 1 && /^[☐☑]/.test(body.value.slice(lineStart))) { const ch = body.value[lineStart] === '☐' ? '☑' : '☐'; setBody(body.value.slice(0, lineStart) + ch + body.value.slice(lineStart + 1)); body.setSelectionRange(pos, pos); }
  });

  // ---------- Undo / redo ----------
  function undo() { if (view === 'pen') pad.undo(); else { clearTimeout(historyTimer); history.push(body.value); body.value = history.undo(); dirty = true; } updateState(); }
  function redo() { if (view === 'pen') pad.redo(); else { body.value = history.redo(); dirty = true; } updateState(); }
  $('[data-undo]').addEventListener('click', undo); $('[data-redo]').addEventListener('click', redo);
  root.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target.matches('input')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  // ---------- Pen ----------
  $('[data-pen-tools]').addEventListener('click', e => {
    const tool = e.target.closest('[data-pen-tool]'); const color = e.target.closest('[data-pen-color]');
    if (tool) { pad.tool = tool.dataset.penTool; root.querySelectorAll('[data-pen-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === tool))); }
    if (color) { pad.color = color.dataset.penColor; pad.tool = 'pen'; root.querySelectorAll('[data-pen-color]').forEach(b => b.setAttribute('aria-pressed', String(b === color))); root.querySelectorAll('[data-pen-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.penTool === 'pen'))); }
    if (e.target.closest('[data-pen-clear]')) pad.clear();
    updateState();
  });
  $('[data-convert]').addEventListener('click', async () => {
    if (pad.empty) { notify('Write something first.', true); return; }
    inkDataUrl = pad.toPNG();
    await transcribe([inkDataUrl], 'pen');
  });

  // ---------- Photo ----------
  function renderPhotos() {
    $('#ne-photo-strip').innerHTML = photos.map((p, n) => `<figure><img src="${p.data_url}" alt="Photo ${n + 1}"><button type="button" class="icon-button" data-remove-photo="${n}" aria-label="Remove photo ${n + 1}">×</button></figure>`).join('');
    $('#ne-photo-count').textContent = photos.length ? `${photos.length} of ${MAX_PHOTOS} photos` : '';
    $('[data-read-photos]').disabled = !photos.length || busy;
  }
  $('#ne-photos').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = '';
    for (const file of files) {
      if (photos.length >= MAX_PHOTOS) { notify(`Up to ${MAX_PHOTOS} photos per note.`, true); break; }
      try { photos.push({ data_url: await resizePhoto(file) }); dirty = true; } catch (error) { notify(error.message, true); }
    }
    renderPhotos();
  });
  $('#ne-photo-strip').addEventListener('click', e => { const b = e.target.closest('[data-remove-photo]'); if (b) { photos.splice(Number(b.dataset.removePhoto), 1); renderPhotos(); } });
  $('[data-read-photos]').addEventListener('click', () => transcribe(photos.map(p => p.data_url), 'photo'));

  // ---------- Transcribe check (pen + photo) ----------
  async function transcribe(images, from) {
    busy = true; updateState();
    const check = $('[data-check]'); check.hidden = false; check.innerHTML = '<p class="loading">Reading your writing…</p>';
    try {
      const result = await api('/notes/transcribe', { images, mode: getMode() });
      transcribed = { ...result, images, from };
      renderCheck();
    } catch (error) { check.innerHTML = `<p class="check-error">${esc(error.message)}</p><button type="button" class="text-button" data-close-check>Close</button>`; }
    finally { busy = false; updateState(); }
  }
  function renderCheck() {
    const t = transcribed; const check = $('[data-check]');
    check.innerHTML = `<div class="check-head"><h3>Check the text</h3><span class="muted">${t.uncertain_words.length ? `${t.uncertain_words.length} word${t.uncertain_words.length === 1 ? '' : 's'} to check, marked in yellow. Tap one to fix it.` : 'Looks clear. Fix anything you like.'}</span></div>
      <div class="check-grid"><div class="check-images">${t.images.map((src, n) => `<img src="${src}" alt="${t.from === 'pen' ? 'Your handwriting' : `Photo ${n + 1}`}">`).join('')}</div>
      <div class="check-text"><div class="check-highlight" data-check-highlight>${highlightUncertain(t.text, t.uncertain_words)}</div><label class="sr-only" for="ne-check-text">Text</label><textarea id="ne-check-text" rows="8">${esc(t.text)}</textarea>${t.warnings.length ? `<ul class="check-warnings">${t.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div></div>
      <div class="pane-actions"><button type="button" class="text-button" data-close-check>Cancel</button><button type="button" class="secondary compact" data-use-text>Use this text</button></div>`;
  }
  $('[data-check]').addEventListener('click', e => {
    const mark = e.target.closest('[data-uncertain]');
    if (mark) { const area = $('#ne-check-text'); const start = Number(mark.dataset.start); area.focus(); area.setSelectionRange(start, start + Number(mark.dataset.length)); return; }
    if (e.target.closest('[data-close-check]')) { $('[data-check]').hidden = true; transcribed = null; return; }
    if (e.target.closest('[data-use-text]')) {
      const text = $('#ne-check-text').value.trim();
      if (!text) { notify('There is no text to add.', true); return; }
      method = transcribed.from; strokesForReplay = method === 'pen' ? pad.serialize() : strokesForReplay;
      insertText(text, 'convert');
      $('[data-check]').hidden = true; transcribed = null; setView('type');
      notify(`Text added. ${method === 'pen' ? 'Your drawing' : 'The photos'} will be saved with the note.`);
    }
  });
  $('[data-check]').addEventListener('input', e => { if (e.target.id === 'ne-check-text' && transcribed) { transcribed.text = e.target.value; $('[data-check-highlight]').innerHTML = highlightUncertain(transcribed.text, transcribed.uncertain_words); } });

  // ---------- Voice ----------
  function stopRecording() { stopVoice?.(); stopVoice = null; clearInterval(voiceTimer); $('[data-mic]').setAttribute('aria-pressed', 'false'); $('[data-mic-label]').textContent = 'Start talking'; $('.recording').hidden = true; }
  $('[data-mic]').addEventListener('click', () => {
    if (stopVoice) { stopRecording(); return; }
    voiceText = ''; $('[data-voice-live]').textContent = 'Listening…';
    try {
      stopVoice = startDictation(window, {
        onText: (final, interim) => { voiceText = final; $('[data-voice-live]').innerHTML = `${esc(final)} <span class="interim">${esc(interim)}</span>`; },
        onEnd: (final) => { voiceText = final || voiceText; if (voiceText.trim()) cleanTranscript(voiceText.trim()); },
        onError: (message) => { notify(message, true); stopRecording(); },
      });
    } catch (error) { notify(error.message, true); return; }
    voiceStarted = Date.now(); $('.recording').hidden = false; $('[data-mic]').setAttribute('aria-pressed', 'true'); $('[data-mic-label]').textContent = 'Stop';
    voiceTimer = setInterval(() => { $('[data-voice-timer]').textContent = formatTimer(Date.now() - voiceStarted); }, 250);
  });
  async function cleanTranscript(text) {
    method = 'voice';
    insertText(text, 'convert');
    const check = $('[data-check]'); check.hidden = false; check.innerHTML = '<p class="loading">Aivana is tidying punctuation, jersey numbers and names…</p>';
    try {
      const result = await api('/notes/clean-transcript', { text, mode: getMode() });
      if (!result.changes.length || result.text === text) { check.hidden = true; notify('Voice note added. No fixes needed.'); return; }
      cleanup = { ...result, accepted: new Set(result.changes.map((_, n) => n)) };
      renderCleanup();
    } catch (error) { check.innerHTML = `<p class="check-error">${esc(error.message)} Your words were added as spoken.</p><button type="button" class="text-button" data-close-clean>Close</button>`; }
  }
  function applyChanges(original, changes, accepted) {
    let out = original;
    changes.forEach((c, n) => { if (accepted.has(n) && c.before && out.includes(c.before)) out = out.replace(c.before, c.after); });
    if (accepted.size === changes.length) return cleanup.text; // all accepted: use Aivana's full clean text
    changes.forEach((c, n) => { if (accepted.has(n) && !c.before) out += c.after; });
    return out;
  }
  function renderCleanup() {
    const c = cleanup;
    $('[data-check]').innerHTML = `<div class="check-head"><h3>Suggested fixes</h3><span class="muted">${c.origin === 'demo' ? 'Demo · fixed by code' : 'By Aivana'} · keep or undo each one</span></div><ul class="fix-list">${c.changes.map((ch, n) => `<li><label><input type="checkbox" data-fix="${n}" ${c.accepted.has(n) ? 'checked' : ''}> <del>${esc(ch.before || '∅')}</del> → <ins>${esc(ch.after)}</ins> <small>${esc(ch.reason)}</small></label></li>`).join('')}</ul><p class="fix-preview">${esc(applyChanges(c.original, c.changes, c.accepted))}</p><div class="pane-actions"><button type="button" class="text-button" data-close-clean>Keep my words</button><button type="button" class="secondary compact" data-apply-clean>Use fixed text</button></div>`;
  }
  $('[data-check]').addEventListener('change', e => { const box = e.target.closest('[data-fix]'); if (box && cleanup) { const n = Number(box.dataset.fix); box.checked ? cleanup.accepted.add(n) : cleanup.accepted.delete(n); renderCleanup(); } });
  $('[data-check]').addEventListener('click', e => {
    if (e.target.closest('[data-close-clean]')) { $('[data-check]').hidden = true; cleanup = null; setView('type'); }
    if (e.target.closest('[data-apply-clean]') && cleanup) {
      const fixed = applyChanges(cleanup.original, cleanup.changes, cleanup.accepted);
      const idx = body.value.lastIndexOf(cleanup.original);
      setBody(idx >= 0 ? body.value.slice(0, idx) + fixed + body.value.slice(idx + cleanup.original.length) : body.value, 'aivana_fix');
      $('[data-check]').hidden = true; cleanup = null; setView('type'); notify('Fixes applied. Undo brings your words back.');
    }
  });

  // ---------- Save / delete / recap ----------
  async function save({ quiet = false } = {}) {
    const data = snapshot();
    if (!data.body.trim() && pad.empty && !photos.length) { notify('Write something before saving.', true); return null; }
    busy = true; updateState();
    try {
      const extras = {};
      const pendingPhotos = photos.filter(p => !p.saved);
      if (pendingPhotos.length) extras.attachments = pendingPhotos.map(p => ({ kind: 'photo', data_url: p.data_url }));
      if (!pad.empty && (dirty || !note)) {
        const ink = inkDataUrl || pad.toPNG();
        extras.attachments = [...(extras.attachments || []), { kind: 'ink', data_url: ink }];
        extras.strokes = pad.serialize();
      }
      if (!note) note = await api('/notes', { ...data, ...extras, versions: draftVersions });
      else note = await api(`/notes/${note.id}`, { ...data, ...extras }, 'PATCH');
      photos.forEach(p => p.saved = true); draftVersions = []; dirty = false;
      localStorage.removeItem(DRAFT_KEY);
      if (!quiet) notify('Note saved.');
      onSaved?.(note);
      loadReplay();
      return note;
    } catch (error) { notify(error.message, true); return null; }
    finally { busy = false; updateState(); }
  }
  $('[data-save]').addEventListener('click', () => save());
  $('[data-delete]').addEventListener('click', async () => {
    if (!note || !confirm(`Delete "${note.title}"? Are you sure? This can't be undone.`)) return;
    try { await api(`/notes/${note.id}`, undefined, 'DELETE'); notify('Note deleted.'); const removed = note; reset(); onSaved?.(null, removed); } catch (error) { notify(error.message, true); }
  });
  $('[data-whiteboard]').addEventListener('click', async () => { const saved = (dirty || !note) ? await save({ quiet: true }) : note; if (saved) ctx.openWhiteboard?.(saved); });
  $('[data-find-homework]').addEventListener('click', async () => { const saved = dirty ? await save({ quiet: true }) : note; if (saved) ctx.findHomework?.(saved); });
  $('[data-recap]').addEventListener('click', async () => {
    const saved = (dirty || !note) ? await save({ quiet: true }) : note;
    if (!saved) return;
    busy = true; updateState(); $('[data-recap-card]').innerHTML = '<p class="loading">Writing the recap…</p>';
    try { note.summary = await api(`/notes/${note.id}/summarize`, { mode: getMode() }); $('[data-recap-card]').innerHTML = recapMarkup(note.summary); onSaved?.(note); }
    catch (error) { $('[data-recap-card]').innerHTML = ''; notify(error.message, true); }
    finally { busy = false; updateState(); }
  });
  $('[data-recap-card]').addEventListener('click', async e => {
    const recap = note?.summary; if (!recap) return;
    if (e.target.closest('[data-recap-copy]')) {
      const text = [`Recap: ${note.title}`, recap.summary, '', 'Key points:', ...recap.key_points.map(x => `- ${x}`), '', 'Player homework:', ...recap.to_dos.map(t => `- ${t.player}: ${t.task}${t.due_date ? ` (due ${t.due_date})` : ''}`), '', 'Decisions:', ...recap.decisions.map(x => `- ${x}`), '', 'Follow up:', ...recap.questions_to_follow_up.map(x => `- ${x}`)].join('\n');
      try { await navigator.clipboard.writeText(text); notify('Recap copied.'); } catch { notify('Copy was blocked by the browser.', true); }
    }
    if (e.target.closest('[data-recap-review]')) sendToReview?.(note, recap);
    if (e.target.closest('[data-recap-manual]')) ctx.findHomework?.(note);
    const ev = e.target.closest('[data-recap-event]'); if (ev) { const d = recap.events[Number(ev.dataset.recapEvent)].draft; addToSchedule?.({ ...d, note: `From note: ${note.title}` }); }
    if (e.target.closest('[data-recap-gameplan]')) { $('#ne-notebook').value = 'team_strategy'; const saved = await save({ quiet: true }); if (saved) { note.summary = { ...recap, notebook: 'team_strategy' }; $('[data-recap-card]').innerHTML = recapMarkup(note.summary); notify('Note moved to Game plan.'); } }
    const cal = e.target.closest('[data-recap-calendar]');
    if (cal) { const t = recap.to_dos[Number(cal.dataset.recapCalendar)]; addToSchedule?.({ type: 'other', title: `Homework due: ${t.player} – ${t.task}`.slice(0, 160), start_at: `${t.due_date}T08:00`, duration_min: 30, audience: t.player_id ? `player:${t.player_id}` : 'team' }); }
  });

  // ---------- Replay (versions or pen strokes) ----------
  async function loadReplay() {
    stopPlay();
    const bar = $('[data-replay]');
    if (view === 'pen' && (pad.strokes.length || note?.strokes?.length)) {
      replay.kind = 'strokes'; replay.items = pad.strokes.length ? pad.serialize() : note.strokes;
    } else {
      replay.kind = 'versions';
      replay.items = note ? await api(`/notes/${note.id}/versions`, undefined, 'GET').catch(() => []) : [...draftVersions];
    }
    bar.hidden = replay.items.length < 2;
    replay.index = replay.items.length; // live view
    syncReplay();
  }
  function syncReplay() {
    const n = replay.items.length, slider = $('[data-replay-slider]');
    slider.max = String(n); slider.value = String(replay.index);
    const preview = $('[data-replay-preview]');
    if (replay.kind === 'strokes') {
      $('[data-replay-label]').textContent = replay.index >= n ? `Live · ${n} strokes` : `Stroke ${replay.index} of ${n}`;
      if (view === 'pen') renderStrokesUpTo($('.pen-canvas'), replay.items, replay.index);
      preview.hidden = true;
      if (replay.index >= n && view === 'pen') pad.redraw();
      return;
    }
    if (replay.index >= n) { preview.hidden = true; $('[data-replay-label]').textContent = `Live · ${n} versions`; return; }
    const v = replay.items[replay.index], prev = replay.items[replay.index - 1];
    const when = new Date(v.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    $('[data-replay-label]').textContent = `Version ${replay.index + 1} of ${n} · ${v.source === 'save' ? 'saved' : v.source === 'convert' ? 'converted' : v.source === 'aivana_fix' ? 'Aivana fix' : v.source === 'restore' ? 'restored' : 'typing'} · ${when}`;
    preview.hidden = false;
    preview.innerHTML = `<div class="version-text">${changedWords(prev?.body || '', v.body).map(w => w.changed ? `<mark class="changed">${esc(w.text)}</mark>` : esc(w.text)).join('')}</div><button type="button" class="secondary compact" data-restore>Restore this version</button>`;
  }
  function stopPlay() { clearInterval(replay.playing); replay.playing = null; const b = root.querySelector('[data-replay-act="play"]'); if (b) { b.textContent = '▶'; b.setAttribute('aria-label', 'Play'); } }
  $('[data-replay]').addEventListener('click', e => {
    const act = e.target.closest('[data-replay-act]')?.dataset.replayAct;
    const n = replay.items.length;
    if (e.target.closest('[data-replay-speed]')) { replay.speed = replay.speed === 1 ? 2 : replay.speed === 2 ? 4 : 1; e.target.textContent = `${replay.speed}×`; if (replay.playing) { stopPlay(); play(); } return; }
    if (!act) return;
    if (act !== 'play') stopPlay();
    if (act === 'start') replay.index = replay.kind === 'strokes' ? 0 : 0;
    if (act === 'back') replay.index = Math.max(0, replay.index - 1);
    if (act === 'fwd') replay.index = Math.min(n, replay.index + 1);
    if (act === 'end') replay.index = n;
    if (act === 'play') { if (replay.playing) stopPlay(); else play(); return; }
    syncReplay();
  });
  function play() {
    const n = replay.items.length;
    if (replay.index >= n) replay.index = 0;
    const b = root.querySelector('[data-replay-act="play"]'); b.textContent = '⏸'; b.setAttribute('aria-label', 'Pause');
    syncReplay();
    replay.playing = setInterval(() => { replay.index++; syncReplay(); if (replay.index >= n) stopPlay(); }, (replay.kind === 'strokes' ? 350 : 1200) / replay.speed);
  }
  $('[data-replay-slider]').addEventListener('input', e => { stopPlay(); replay.index = Number(e.target.value); syncReplay(); });
  $('[data-replay-preview]').addEventListener('click', async e => {
    if (!e.target.closest('[data-restore]')) return;
    const v = replay.items[replay.index];
    if (note) { try { note = await api(`/notes/${note.id}/versions/${v.id}/restore`, {}); body.value = note.body; history.push(note.body); dirty = false; notify('Version restored. The restore is saved as a new version.'); onSaved?.(note); } catch (error) { notify(error.message, true); return; } }
    else { setBody(v.body, 'restore'); notify('Version restored.'); }
    loadReplay(); updateState();
  });

  // ---------- Load / reset / draft ----------
  function reset(prefill = {}) {
    stopRecording(); note = null; method = 'type'; dirty = false; draftVersions = []; photos = []; inkDataUrl = null; strokesForReplay = [];
    $('#ne-title').value = prefill.title || ''; $('#ne-date').value = prefill.note_date || new Date().toLocaleDateString('en-CA'); $('#ne-notebook').value = prefill.notebook || 'personal';
    body.value = prefill.body || ''; history.reset(body.value); pad.load([]); renderPhotos();
    $('[data-check]').hidden = true; $('[data-recap-card]').innerHTML = ''; setView('type'); updateState();
  }
  async function open(id) {
    if (dirty && !confirm('You have unsaved changes. Open another note anyway?')) return;
    try {
      const loaded = await api(`/notes/${id}`, undefined, 'GET');
      reset(); note = loaded; method = note.input_method;
      $('#ne-title').value = note.title; $('#ne-date').value = note.note_date; $('#ne-notebook').value = note.notebook;
      body.value = note.body; history.reset(note.body);
      pad.load(note.strokes || []); strokesForReplay = note.strokes || [];
      photos = note.attachments.filter(a => a.kind === 'photo').map(a => ({ data_url: `/api/notes/${note.id}/attachments/${a.id}`, saved: true }));
      renderPhotos();
      $('[data-recap-card]').innerHTML = recapMarkup(note.summary);
      setView(note.strokes?.length && (method === 'pen' || !note.body.trim()) ? 'pen' : 'type');
      dirty = false; updateState(); root.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    } catch (error) { notify(error.message, true); }
  }
  setInterval(() => { if (dirty) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...snapshot(), note_id: note?.id ?? null, saved_at: Date.now() })); } catch { /* storage full or blocked */ } } }, 5000);
  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!draft || !draft.body?.trim() || draft.note_id) return false;
      reset(draft); dirty = true; updateState(); return true;
    } catch { return false; }
  }

  root.addEventListener('click', e => { const tab = e.target.closest('[data-input]'); if (tab) setView(tab.dataset.input); });
  reset();
  return { open, reset, restoreDraft, get noteId() { return note?.id ?? null; }, applyText: (text) => { setBody(text, 'aivana_fix'); } , focus: () => body.focus() };
}
