// Play whiteboard: SVG football field, objects stored in field coordinates (yards).
import { HistoryStack } from './history-stack.js';

export const TEMPLATES = { play: { w: 53.33, h: 30, label: 'Play diagram' }, field: { w: 120, h: 53.33, label: 'Full field' }, frame: { w: 100, h: 56.25, label: 'Film frame' }, blank: { w: 100, h: 56.25, label: 'Blank' } };
export const COLORS = ['#F58220', '#2563EB', '#DC3545', '#167347', '#20252B', '#FFFFFF'];
export const WIDTHS = { S: 0.25, M: 0.4, L: 0.65 };
export const LABELS = ['QB', 'RB', 'FB', 'HB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'DE', 'DT', 'NT', 'LB', 'MLB', 'OLB', 'CB', 'FS', 'SS', 'K', 'P'];
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let counter = 0;
export const newId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Screen point → board coordinates. Saved coordinates never depend on the screen size. */
export function toBoard(clientX, clientY, rect, view) {
  return [view.x + (clientX - rect.left) / rect.width * view.w, view.y + (clientY - rect.top) / rect.height * view.h];
}
export const round = (v) => Math.round(v * 100) / 100;

/** Mirror left/right around the field centre. */
export function flipObjects(objects, width) {
  return objects.map(o => {
    const c = structuredClone(o);
    if (c.points) c.points = c.points.map(p => [round(width - p[0]), p[1], ...p.slice(2)]);
    if (typeof c.x === 'number' && !['scrimmage', 'first_down'].includes(c.type)) c.x = round(width - c.x - (c.type === 'highlight' ? c.w || 0 : 0));
    return c;
  });
}

/** Formations place 11 editable markers relative to the line of scrimmage (y = los). */
export function formation(name, los = 18, cx = 26.67) {
  const O = (label, dx, dy) => ({ id: newId(), type: 'marker', shape: 'circle', side: 'offense', label, x: round(cx + dx), y: round(los + dy), color: '#FFFFFF', size: 1 });
  const D = (label, dx, dy) => ({ id: newId(), type: 'marker', shape: 'circle', side: 'defense', label, x: round(cx + dx), y: round(los - dy), color: '#F58220', size: 1 });
  const line = [O('LT', -4, 1.2), O('LG', -2, 1.2), O('C', 0, 1.2), O('RG', 2, 1.2), O('RT', 4, 1.2)];
  const sets = {
    'Pro I (11)': [...line, O('QB', 0, 2.6), O('FB', 0, 5), O('RB', 0, 7.2), O('TE', 6, 1.4), O('WR', -18, 1.4), O('WR', 18, 1.6)],
    'Shotgun 2x2': [...line, O('QB', 0, 5), O('RB', 2, 5.2), O('WR', -18, 1.4), O('WR', -12, 2.2), O('WR', 12, 2.2), O('WR', 18, 1.4)],
    Trips: [...line, O('QB', 0, 5), O('RB', -2, 5.2), O('WR', -18, 1.4), O('WR', 10, 2.2), O('WR', 14, 2.2), O('WR', 18, 1.4)],
    Empty: [...line, O('QB', 0, 5), O('WR', -18, 1.4), O('WR', -13, 2.2), O('WR', -8, 2.2), O('WR', 13, 2.2), O('WR', 18, 1.4)],
    '4-3 Over': [D('DE', -5, 1.2), D('DT', -1.5, 1.2), D('DT', 1.5, 1.2), D('DE', 5, 1.2), D('OLB', -5, 5), D('MLB', 0, 5), D('OLB', 5, 5), D('CB', -18, 6), D('CB', 18, 6), D('SS', 6, 10), D('FS', -6, 12)],
    '3-4': [D('DE', -3.5, 1.2), D('NT', 0, 1.2), D('DE', 3.5, 1.2), D('OLB', -7, 2.5), D('LB', -2.5, 5), D('LB', 2.5, 5), D('OLB', 7, 2.5), D('CB', -18, 6), D('CB', 18, 6), D('SS', 6, 10), D('FS', -6, 12)],
    'Cover 2 shell': [D('DE', -5, 1.2), D('DT', -1.5, 1.2), D('DT', 1.5, 1.2), D('DE', 5, 1.2), D('LB', -5, 5), D('MLB', 0, 5), D('LB', 5, 5), D('CB', -17, 3), D('CB', 17, 3), D('SS', 10, 12), D('FS', -10, 12)],
    'Cover 3 shell': [D('DE', -5, 1.2), D('DT', -1.5, 1.2), D('DT', 1.5, 1.2), D('DE', 5, 1.2), D('LB', -5, 5), D('MLB', 0, 5), D('SS', 8, 6), D('CB', -18, 8), D('CB', 18, 8), D('LB', 5, 5), D('FS', 0, 13)],
    Punt: [...line, O('P', 0, 13), O('PP', 0, 7), O('GN', -20, 1.4), O('GN', 20, 1.4), O('WG', -6, 2.4), O('WG', 6, 2.4)],
    Kickoff: [O('K', 0, 0), ...['-22', '-17', '-12', '-7', '-3', '3', '7', '12', '17', '22'].map(dx => O('KC', Number(dx), 0.5))],
  };
  return sets[name] || [];
}
export const FORMATIONS = ['Pro I (11)', 'Shotgun 2x2', 'Trips', 'Empty', '4-3 Over', '3-4', 'Cover 2 shell', 'Cover 3 shell', 'Punt', 'Kickoff'];

function fieldSvg(template) {
  const t = TEMPLATES[template];
  if (template === 'play') {
    let s = `<rect x="0" y="0" width="${t.w}" height="${t.h}" fill="#3d8b4f"/>`;
    for (let y = 0; y <= t.h; y += 5) s += `<line x1="0" x2="${t.w}" y1="${y}" y2="${y}" stroke="#ffffffb0" stroke-width="0.15"/>`;
    for (let y = 0; y <= t.h; y += 1) { s += `<line x1="${23.58}" x2="${24.08}" y1="${y}" y2="${y}" stroke="#ffffff90" stroke-width="0.1"/><line x1="${29.25}" x2="${29.75}" y1="${y}" y2="${y}" stroke="#ffffff90" stroke-width="0.1"/>`; }
    [[3, '40'], [13, '30'], [23, '20']].forEach(([y, n]) => { s += `<text x="4" y="${y + 0.7}" font-size="2" fill="#ffffffaa" font-weight="700">${n}</text><text x="${t.w - 4}" y="${y + 0.7}" font-size="2" fill="#ffffffaa" font-weight="700" text-anchor="end">${n}</text>`; });
    return s;
  }
  if (template === 'field') {
    let s = `<rect x="0" y="0" width="120" height="53.33" fill="#3d8b4f"/><rect x="0" y="0" width="10" height="53.33" fill="#2f7340"/><rect x="110" y="0" width="10" height="53.33" fill="#2f7340"/>`;
    for (let x = 10; x <= 110; x += 5) s += `<line x1="${x}" x2="${x}" y1="0" y2="53.33" stroke="#ffffffb0" stroke-width="${x === 60 ? 0.3 : 0.15}"/>`;
    for (let x = 11; x < 110; x += 1) s += `<line x1="${x}" x2="${x}" y1="23.58" y2="24.08" stroke="#ffffff80" stroke-width="0.1"/><line x1="${x}" x2="${x}" y1="29.25" y2="29.75" stroke="#ffffff80" stroke-width="0.1"/>`;
    for (let x = 20; x <= 100; x += 10) { const n = x <= 60 ? x - 10 : 110 - x; s += `<text x="${x}" y="8" font-size="2.6" fill="#ffffffaa" text-anchor="middle" font-weight="700">${n}</text><text x="${x}" y="47" font-size="2.6" fill="#ffffffaa" text-anchor="middle" font-weight="700">${n}</text>`; }
    return s;
  }
  if (template === 'blank') return `<rect x="0" y="0" width="${t.w}" height="${t.h}" fill="#ffffff"/>`;
  return '';
}

function pathFor(o) {
  const p = o.points;
  if (!p?.length) return '';
  if (o.type === 'pen') return `M${p.map(q => `${q[0]} ${q[1]}`).join(' L')}`;
  if (o.style === 'curved' && p.length > 2) {
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; d += ` Q${p[i][0]} ${p[i][1]} ${mx} ${my}`; }
    return d + ` L${p.at(-1)[0]} ${p.at(-1)[1]}`;
  }
  return `M${p[0][0]} ${p[0][1]} L${p.at(-1)[0]} ${p.at(-1)[1]}`;
}

export function objectSvg(o, selected = false, w = 53.33) {
  const sw = WIDTHS[o.width || 'M'];
  const sel = selected ? ' class="wb-selected"' : '';
  if (['pen', 'arrow', 'line'].includes(o.type)) {
    const end = o.type === 'arrow' || o.end === 'arrow' ? `marker-end="url(#wb-arrow-${o.color.slice(1)})"` : o.end === 'block' ? `marker-end="url(#wb-block-${o.color.slice(1)})"` : '';
    return `<g data-obj="${o.id}"${sel}><path d="${pathFor(o)}" fill="none" stroke="transparent" stroke-width="2"/><path d="${pathFor(o)}" fill="none" stroke="${o.color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${o.style === 'dashed' ? 'stroke-dasharray="1 0.8"' : ''} ${end}/></g>`;
  }
  if (o.type === 'marker') {
    const r = 1.1 * (o.size || 1), off = o.side !== 'defense';
    const fill = o.color && o.color !== '#FFFFFF' && o.color !== '#F58220' ? o.color : off ? '#FFFFFF' : '#F58220';
    const ink = fill === '#FFFFFF' ? '#20252B' : '#FFFFFF';
    let shape;
    if (o.shape === 'square') shape = `<rect x="${o.x - r}" y="${o.y - r}" width="${2 * r}" height="${2 * r}" fill="${fill}" stroke="#20252B" stroke-width="0.15"/>`;
    else if (o.shape === 'x') shape = `<circle cx="${o.x}" cy="${o.y}" r="${r}" fill="transparent"/><path d="M${o.x - r} ${o.y - r} L${o.x + r} ${o.y + r} M${o.x + r} ${o.y - r} L${o.x - r} ${o.y + r}" stroke="${fill === '#FFFFFF' ? '#20252B' : fill}" stroke-width="0.35"/>`;
    else if (o.shape === 'o') shape = `<circle cx="${o.x}" cy="${o.y}" r="${r}" fill="transparent" stroke="${fill === '#FFFFFF' ? '#20252B' : fill}" stroke-width="0.35"/>`;
    else shape = `<circle cx="${o.x}" cy="${o.y}" r="${r}" fill="${fill}" stroke="#20252B" stroke-width="0.15"/>`;
    const label = o.shape === 'x' || o.shape === 'o' ? `<text x="${o.x}" y="${o.y + r + 1.2}" font-size="1.1" text-anchor="middle" fill="#fff" font-weight="800">${esc(o.label)}</text>` : `<text x="${o.x}" y="${o.y + 0.38 * r}" font-size="${(o.label || '').length > 2 ? 0.75 * r : 0.95 * r}" text-anchor="middle" fill="${ink}" font-weight="800">${esc(o.label)}</text>`;
    return `<g data-obj="${o.id}"${sel}>${shape}${label}</g>`;
  }
  if (o.type === 'text') return `<g data-obj="${o.id}"${sel}><text x="${o.x}" y="${o.y}" font-size="${1.6 * ({ S: 0.8, M: 1, L: 1.4 }[o.width || 'M'])}" fill="${o.color}" font-weight="800" paint-order="stroke" stroke="${o.color === '#FFFFFF' ? '#20252B' : '#ffffff'}" stroke-width="0.25">${esc(o.text)}</text></g>`;
  if (o.type === 'highlight') return `<g data-obj="${o.id}"${sel}>${o.shape === 'box' ? `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="0.5" fill="${o.color}22" stroke="${o.color}" stroke-width="${sw}"/>` : `<ellipse cx="${o.x + o.w / 2}" cy="${o.y + o.h / 2}" rx="${Math.abs(o.w) / 2}" ry="${Math.abs(o.h) / 2}" fill="${o.color}22" stroke="${o.color}" stroke-width="${sw}"/>`}</g>`;
  if (o.type === 'scrimmage' || o.type === 'first_down') return `<g data-obj="${o.id}"${sel}><line x1="0" x2="${w}" y1="${o.y}" y2="${o.y}" stroke="${o.type === 'scrimmage' ? '#2563EB' : '#F5D020'}" stroke-width="0.35"/><rect x="0" y="${o.y - 0.8}" width="${w}" height="1.6" fill="transparent"/></g>`;
  return '';
}

function defs() {
  return `<defs>${COLORS.map(c => `<marker id="wb-arrow-${c.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker><marker id="wb-block-${c.slice(1)}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M5 0 L5 10" stroke="${c}" stroke-width="2.5"/></marker>`).join('')}</defs>`;
}

export function boardSvg(template, objects, { background = null, selected = new Set() } = {}) {
  const t = TEMPLATES[template];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t.w} ${t.h}" width="${t.w * 20}" height="${t.h * 20}">${defs()}${background ? `<image href="${background}" x="0" y="0" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/>` : ''}${fieldSvg(template)}${objects.map(o => objectSvg(o, selected.has(o.id), t.w)).join('')}</svg>`;
}

/** PNG preview from the SVG (background must be same-origin or a data URL). */
export function svgToPng(svgText, width = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    img.onload = () => { const ratio = img.height / img.width; const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * ratio); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/png')); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error('Could not make the picture of this drawing.')); };
    img.src = url;
  });
}

async function toDataUrl(src) {
  if (!src || src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}

/**
 * Opens the whiteboard as a full-screen panel.
 * ctx: {api, notify, players, onSaved}
 * opts: {id, template, background, film_id, t_seconds, meeting_id, note_id, player_ids, title}
 */
export function openWhiteboard(ctx, opts = {}) {
  const { api, notify, players } = ctx;
  let diagram = null, template = opts.template || 'play', background = opts.background || null;
  let objects = [], tool = 'pen', color = '#F58220', width = 'M', arrowStyle = 'solid', markerLabel = 'WR', markerSide = 'offense', markerShape = 'circle';
  let selected = new Set(), view = null, drag = null, dirty = false, saveTimer = null, saving = false, penSeen = false, status = 'Not saved';
  const history = new HistoryStack('[]');
  const panel = document.createElement('div');
  panel.className = 'wb-overlay'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Play whiteboard');
  panel.innerHTML = `<div class="wb-shell">
    <header class="wb-head"><strong>✎ Play whiteboard</strong><span class="wb-status" data-status aria-live="polite">Not saved</span><span class="wb-gap"></span>
      <label>Board <select data-template>${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
      <button type="button" class="secondary compact" data-export>PNG</button><button type="button" class="primary compact" data-save>Save</button><button type="button" class="icon-button" data-close aria-label="Close whiteboard">✕</button></header>
    <div class="wb-tools" role="toolbar" aria-label="Drawing tools">
      ${[['select', '⬚', 'Select / move (V)'], ['pen', '✎', 'Pen (P)'], ['arrow', '➚', 'Arrow (A)'], ['line', '╱', 'Line / block (L)'], ['marker', '◯', 'Player (M)'], ['text', 'T', 'Text (T)'], ['highlight', '▢', 'Highlight (H)'], ['eraser', '⌫', 'Eraser (E)'], ['pan', '✋', 'Move board (Space)']].map(([k, icon, tip]) => `<button type="button" data-tool="${k}" title="${tip}" aria-label="${tip}">${icon}</button>`).join('')}
      <span class="wb-sep"></span>${COLORS.map(c => `<button type="button" class="wb-swatch" data-color="${c}" style="--c:${c}" aria-label="Color ${c}" title="${c}"></button>`).join('')}
      <span class="wb-sep"></span>${Object.keys(WIDTHS).map(w => `<button type="button" data-width="${w}" title="Width ${w}">${w}</button>`).join('')}
      <span class="wb-sep"></span><select data-arrow-style title="Arrow style"><option value="solid">Solid</option><option value="dashed">Dashed (motion)</option><option value="curved">Curved</option></select>
      <select data-line-end title="Line end"><option value="none">Plain line</option><option value="block">Block (T)</option></select>
      <select data-marker-label title="Player label">${LABELS.map(l => `<option ${l === 'WR' ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select data-marker-side title="Side"><option value="offense">Offense</option><option value="defense">Defense</option></select>
      <select data-marker-shape title="Shape"><option value="circle">○ Circle</option><option value="x">X</option><option value="o">O</option><option value="square">□ Square</option></select>
      <select data-formation title="Quick formation"><option value="">Formation…</option>${FORMATIONS.map(f => `<option>${f}</option>`).join('')}</select>
      <span class="wb-sep"></span><button type="button" data-undo title="Undo (Ctrl+Z)">↶</button><button type="button" data-redo title="Redo (Ctrl+Shift+Z)">↷</button>
      <button type="button" data-flip title="Flip left/right">⇋</button><button type="button" data-dup title="Duplicate (Ctrl+D)">⧉</button><button type="button" data-delete title="Delete (Del)">🗑</button>
      <button type="button" data-zoom="-1" title="Zoom out">−</button><button type="button" data-zoom="1" title="Zoom in">+</button><button type="button" data-zoom="0" title="Fit">Fit</button>
      <button type="button" data-replay title="Replay the drawing">▶</button>
    </div>
    <div class="wb-main"><div class="wb-board" data-board></div>
      <aside class="wb-side">
        <label>Name<input data-title maxlength="120" placeholder="Cover 3 recognition"></label>
        <label>Players<select data-players multiple size="5">${players.map(p => `<option value="${p.id}">#${p.number} ${esc(p.name)}</option>`).join('')}</select></label>
        <p class="wb-link" data-link></p>
        <label>What to remember<textarea data-remember rows="3" maxlength="2000" placeholder="Read the deep safety. If he rotates down, throw the curl."></textarea></label>
        <label>Tags<input data-tags placeholder="cover 3, third down"></label>
        <label>Picture description (for screen readers)<textarea data-alt rows="2" maxlength="500"></textarea></label>
        <div class="wb-thumbs" data-thumbs></div>
        <p class="wb-help">Pen draws, a finger moves the board when a pen is used. Coordinates are saved in yards, so drawings stay in place on any screen.</p>
      </aside></div></div>`;
  document.body.append(panel);
  document.body.classList.add('wb-open');
  const $ = (s) => panel.querySelector(s);
  const board = $('[data-board]');

  function setStatus(text) { status = text; $('[data-status]').textContent = text; $('[data-status]').dataset.state = text.startsWith('Save failed') ? 'error' : text === 'Saved' ? 'ok' : 'idle'; }
  function fit() { const t = TEMPLATES[template]; view = { x: 0, y: 0, w: t.w, h: t.h }; }
  function render() {
    const t = TEMPLATES[template];
    board.innerHTML = boardSvg(template, objects, { background, selected }).replace(/viewBox="[^"]+"/, `viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid meet"`).replace(/ width="[\d.]+" height="[\d.]+"/, '');
    board.style.aspectRatio = `${t.w} / ${t.h}`;
    panel.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    panel.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
    panel.querySelectorAll('[data-width]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.width === width)));
    $('[data-undo]').disabled = !history.canUndo; $('[data-redo]').disabled = !history.canRedo;
    $('[data-template]').value = template;
  }
  function commit() {
    history.push(JSON.stringify(objects)); dirty = true; setStatus(diagram ? 'Saving…' : 'Not saved');
    clearTimeout(saveTimer); if (diagram) saveTimer = setTimeout(() => save(true), 2000);
    render();
  }
  function svgEl() { return board.querySelector('svg'); }
  function point(e) { return toBoard(e.clientX, e.clientY, svgEl().getBoundingClientRect(), view).map(round); }
  const find = (id) => objects.find(o => o.id === id);

  board.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (e.pointerType === 'pen') penSeen = true;
    const usePan = tool === 'pan' || (penSeen && e.pointerType === 'touch') || e.button === 1 || spaceDown;
    board.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    if (usePan) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: { ...view } }; return; }
    const hit = e.target.closest('[data-obj]')?.dataset.obj;
    if (tool === 'eraser') { if (hit) { objects = objects.filter(o => o.id !== hit); commit(); } return; }
    if (tool === 'select') {
      if (hit) {
        if (!selected.has(hit)) { selected = e.shiftKey ? new Set([...selected, hit]) : new Set([hit]); }
        drag = { kind: 'move', from: [x, y], start: structuredClone(objects.filter(o => selected.has(o.id))) };
      } else { selected = new Set(); drag = { kind: 'box', from: [x, y], to: [x, y] }; }
      render(); return;
    }
    if (tool === 'marker') { const o = { id: newId(), type: 'marker', shape: markerShape, side: markerSide, label: markerLabel, x, y, color: markerSide === 'defense' ? '#F58220' : '#FFFFFF', size: 1 }; objects.push(o); selected = new Set([o.id]); commit(); return; }
    if (tool === 'text') {
      const text = prompt('Label (for example: Cover 3, Blitz, 3rd & 7)');
      if (text?.trim()) { objects.push({ id: newId(), type: 'text', x, y, text: text.trim().slice(0, 200), color: color === '#FFFFFF' ? '#FFFFFF' : color, width }); commit(); }
      return;
    }
    const o = tool === 'highlight' ? { id: newId(), type: 'highlight', shape: e.altKey ? 'box' : 'circle', x, y, w: 0.1, h: 0.1, color, width } :
      { id: newId(), type: tool, points: [[x, y, Math.round(e.pressure * 100) / 100]], color, width, style: tool === 'arrow' ? arrowStyle : 'solid', end: tool === 'line' ? $('[data-line-end]').value : tool === 'arrow' ? 'arrow' : 'none' };
    objects.push(o); drag = { kind: 'draw', obj: o, from: [x, y] };
    render();
  });
  board.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.kind === 'pan') { const r = svgEl().getBoundingClientRect(); view.x = drag.view.x - (e.clientX - drag.sx) / r.width * view.w; view.y = drag.view.y - (e.clientY - drag.sy) / r.height * view.h; render(); return; }
    const [x, y] = point(e);
    if (drag.kind === 'move') {
      const dx = x - drag.from[0], dy = y - drag.from[1];
      drag.start.forEach(orig => { const o = find(orig.id); if (!o) return; if (orig.points) o.points = orig.points.map(p => [round(p[0] + dx), round(p[1] + dy), ...p.slice(2)]); if (typeof orig.x === 'number') { o.x = orig.type === 'scrimmage' || orig.type === 'first_down' ? 0 : round(orig.x + dx); o.y = round(orig.y + dy); } });
      render(); return;
    }
    if (drag.kind === 'box') { drag.to = [x, y]; const [x1, x2] = [drag.from[0], x].sort((a, b) => a - b), [y1, y2] = [drag.from[1], y].sort((a, b) => a - b); selected = new Set(objects.filter(o => { const px = o.points ? o.points[0][0] : o.x, py = o.points ? o.points[0][1] : o.y; return px >= x1 && px <= x2 && py >= y1 && py <= y2; }).map(o => o.id)); render(); return; }
    const o = drag.obj;
    if (o.type === 'highlight') { o.w = round(x - o.x); o.h = round(y - o.y); }
    else if (o.type === 'pen' || (o.type === 'arrow' && o.style === 'curved')) { const last = o.points.at(-1); if (Math.hypot(x - last[0], y - last[1]) > (o.type === 'pen' ? 0.15 : 1.2)) o.points.push([x, y, Math.round(e.pressure * 100) / 100]); }
    else o.points = [o.points[0], [x, y]];
    render();
  });
  const end = () => {
    if (!drag) return;
    if (drag.kind === 'draw') {
      const o = drag.obj;
      if (o.type === 'highlight') { if (o.w < 0) { o.x += o.w; o.w = -o.w; } if (o.h < 0) { o.y += o.h; o.h = -o.h; } if (o.w < 0.5 && o.h < 0.5) { o.x -= 2; o.y -= 2; o.w = 4; o.h = 4; } }
      else if (o.points.length < 2 && o.type !== 'pen') objects = objects.filter(x => x !== o);
      commit();
    } else if (drag.kind === 'move') commit();
    drag = null;
  };
  board.addEventListener('pointerup', end); board.addEventListener('pointercancel', end);
  board.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  board.addEventListener('dblclick', e => {
    const id = e.target.closest('[data-obj]')?.dataset.obj; const o = id && find(id);
    if (o?.type === 'marker') { const label = prompt('Player label (QB, WR, 22…). Add a roster # to link a player, like WR #23.', o.label); if (label !== null) { const num = label.match(/#(\d{1,2})/); o.label = label.replace(/#\d{1,2}/, '').trim().slice(0, 12) || o.label; if (num) { const p = players.find(x => String(x.number) === num[1]); o.player_id = p?.id || null; } commit(); } }
    if (o?.type === 'text') { const text = prompt('Edit label', o.text); if (text?.trim()) { o.text = text.trim().slice(0, 200); commit(); } }
  });
  function zoom(dir) {
    const t = TEMPLATES[template];
    if (dir === 0) { fit(); render(); return; }
    const f = dir > 0 ? 0.8 : 1.25; const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    view.w = Math.min(t.w * 2, Math.max(t.w / 6, view.w * f)); view.h = view.w * t.h / t.w; view.x = cx - view.w / 2; view.y = cy - view.h / 2; render();
  }
  let spaceDown = false;
  function keys(e) {
    if (e.target.closest('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { spaceDown = e.type === 'keydown'; e.preventDefault(); return; }
    if (e.type !== 'keydown') return;
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (k === 'delete' || k === 'backspace') { removeSelected(); return; }
    if (k === 'escape') { if (selected.size) { selected = new Set(); render(); } else close(); return; }
    const map = { v: 'select', p: 'pen', a: 'arrow', l: 'line', m: 'marker', t: 'text', h: 'highlight', e: 'eraser' };
    if (map[k] && !e.ctrlKey && !e.metaKey) { tool = map[k]; render(); }
  }
  document.addEventListener('keydown', keys); document.addEventListener('keyup', keys);
  function undo() { objects = JSON.parse(history.undo()); selected = new Set(); dirty = true; render(); scheduleSave(); }
  function redo() { objects = JSON.parse(history.redo()); dirty = true; render(); scheduleSave(); }
  function scheduleSave() { clearTimeout(saveTimer); if (diagram) { setStatus('Saving…'); saveTimer = setTimeout(() => save(true), 2000); } else setStatus('Not saved'); }
  function removeSelected() { if (!selected.size) return; objects = objects.filter(o => !selected.has(o.id)); selected = new Set(); commit(); }
  function duplicate() { const copies = objects.filter(o => selected.has(o.id)).map(o => { const c = structuredClone(o); c.id = newId(); if (c.points) c.points = c.points.map(p => [round(p[0] + 1.5), round(p[1] + 1.5), ...p.slice(2)]); if (typeof c.x === 'number' && c.type !== 'scrimmage' && c.type !== 'first_down') { c.x = round(c.x + 1.5); c.y = round(c.y + 1.5); } return c; }); if (!copies.length) return; objects.push(...copies); selected = new Set(copies.map(c => c.id)); commit(); }

  panel.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) { tool = b.dataset.tool; render(); }
    if (b.dataset.color) { color = b.dataset.color; if (selected.size) { objects.forEach(o => { if (selected.has(o.id) && o.type !== 'scrimmage' && o.type !== 'first_down') o.color = color; }); commit(); } else render(); }
    if (b.dataset.width) { width = b.dataset.width; if (selected.size) { objects.forEach(o => { if (selected.has(o.id)) o.width = width; }); commit(); } else render(); }
    if (b.dataset.zoom !== undefined) zoom(Number(b.dataset.zoom));
    if (b.hasAttribute('data-undo')) undo();
    if (b.hasAttribute('data-redo')) redo();
    if (b.hasAttribute('data-flip')) { objects = flipObjects(objects, TEMPLATES[template].w); commit(); }
    if (b.hasAttribute('data-dup')) duplicate();
    if (b.hasAttribute('data-delete')) removeSelected();
    if (b.hasAttribute('data-replay')) replay();
    if (b.hasAttribute('data-save')) save(false);
    if (b.hasAttribute('data-export')) { try { const png = await svgToPng(boardSvg(template, objects, { background: await toDataUrl(background) })); const a = document.createElement('a'); a.href = png; a.download = `${($('[data-title]').value || 'play').replace(/[^\w-]+/g, '-')}.png`; a.click(); } catch (error) { notify(error.message, true); } }
    if (b.hasAttribute('data-close')) close();
    const thumb = b.closest('[data-open-diagram]'); if (thumb) { if (dirty && !confirm('This drawing has unsaved changes. Open another one anyway?')) return; load(Number(thumb.dataset.openDiagram)); }
  });
  panel.addEventListener('change', e => {
    if (e.target.matches('[data-template]')) { if (objects.length && !confirm('Change the board? Your drawing stays, but positions may not match the new field.')) { e.target.value = template; return; } template = e.target.value; if (template !== 'frame') background = null; ensureLines(); fit(); commit(); }
    if (e.target.matches('[data-arrow-style]')) arrowStyle = e.target.value;
    if (e.target.matches('[data-marker-label]')) { markerLabel = e.target.value; tool = 'marker'; render(); }
    if (e.target.matches('[data-marker-side]')) { markerSide = e.target.value; tool = 'marker'; render(); }
    if (e.target.matches('[data-marker-shape]')) { markerShape = e.target.value; tool = 'marker'; render(); }
    if (e.target.matches('[data-formation]') && e.target.value) {
      const los = objects.find(o => o.type === 'scrimmage')?.y ?? (template === 'field' ? 26.67 : TEMPLATES[template].h * 0.6);
      const placed = template === 'field' ? formation(e.target.value, 0, 0).map(o => ({ ...o, x: round(60 + (o.y - 0) * 1), y: round(26.67 + (o.x - 0)) })) : formation(e.target.value, los, TEMPLATES[template].w / 2);
      objects.push(...placed); selected = new Set(placed.map(o => o.id)); e.target.value = ''; commit();
    }
    if (e.target.closest('.wb-side')) { dirty = true; scheduleSave(); }
  });
  panel.addEventListener('input', e => { if (e.target.closest('.wb-side') && e.target.tagName !== 'SELECT') { dirty = true; scheduleSave(); } });

  function ensureLines() {
    objects = objects.filter(o => !(['scrimmage', 'first_down'].includes(o.type) && template !== 'play'));
    if (template === 'play' && !objects.some(o => o.type === 'scrimmage')) objects.unshift({ id: newId(), type: 'scrimmage', x: 0, y: 18, color: '#2563EB' }, { id: newId(), type: 'first_down', x: 0, y: 8, color: '#F5D020' });
  }
  function replay() {
    const all = objects; let i = 0; selected = new Set();
    const tick = () => { objects = all.slice(0, i); render(); if (i++ < all.length) setTimeout(tick, 300); else objects = all; };
    tick();
  }
  function payload() {
    return { title: $('[data-title]').value.trim() || 'Untitled play', template, objects, player_ids: [...$('[data-players]').selectedOptions].map(o => o.value),
      remember: $('[data-remember]').value, alt_text: $('[data-alt]').value, tags: $('[data-tags]').value.split(',').map(t => t.trim()).filter(Boolean),
      film_id: opts.film_id ?? diagram?.film_id ?? null, t_seconds: opts.t_seconds ?? diagram?.t_seconds ?? null, meeting_id: opts.meeting_id ?? diagram?.meeting_id ?? null, note_id: opts.note_id ?? diagram?.note_id ?? null };
  }
  async function save(auto) {
    if (saving) { scheduleSave(); return; }
    saving = true; setStatus('Saving…');
    try {
      const body = payload();
      try { body.preview = await svgToPng(boardSvg(template, objects, { background: await toDataUrl(background) }), 900); } catch { /* the drawing still saves */ }
      if (!diagram && template === 'frame' && background?.startsWith('data:')) body.background = background;
      if (diagram) body.base_updated_at = diagram.updated_at;
      diagram = diagram ? await api(`/diagrams/${diagram.id}`, body, 'PUT') : await api('/diagrams', body);
      dirty = false; setStatus('Saved'); ctx.onSaved?.(diagram); loadThumbs();
      if (!auto) notify('Drawing saved.');
    } catch (error) { setStatus('Save failed – retry'); if (!auto) notify(error.message, true); }
    finally { saving = false; }
  }
  async function loadThumbs() {
    const q = opts.film_id ? `film_id=${opts.film_id}` : opts.meeting_id ? `meeting_id=${encodeURIComponent(opts.meeting_id)}` : opts.note_id ? `note_id=${opts.note_id}` : '';
    try {
      const list = await api(`/diagrams${q ? `?${q}` : ''}`, undefined, 'GET');
      $('[data-thumbs]').innerHTML = `<p>${q ? 'Drawings here' : 'All drawings'} · ${list.length}</p>` + list.slice(0, 12).map(d => `<button type="button" data-open-diagram="${d.id}" class="${d.id === diagram?.id ? 'current' : ''}">${d.has_preview ? `<img src="/api/diagrams/${d.id}/preview.png?v=${encodeURIComponent(d.updated_at)}" alt="">` : ''}<span>${esc(d.title)}</span></button>`).join('');
    } catch { /* thumbnails are optional */ }
  }
  async function load(id) {
    try {
      diagram = await api(`/diagrams/${id}`, undefined, 'GET');
      template = diagram.template; objects = diagram.objects; background = diagram.has_background ? `/api/diagrams/${id}/background.png` : null;
      $('[data-title]').value = diagram.title; $('[data-remember]').value = diagram.remember || ''; $('[data-alt]').value = diagram.alt_text || ''; $('[data-tags]').value = diagram.tags.join(', ');
      [...$('[data-players]').options].forEach(o => o.selected = diagram.player_ids.includes(o.value));
      history.reset(JSON.stringify(objects)); selected = new Set(); dirty = false; fit(); render(); setStatus('Saved'); linkLine(); loadThumbs();
    } catch (error) { notify(error.message, true); }
  }
  function linkLine() {
    const film = opts.film_id ?? diagram?.film_id, t = opts.t_seconds ?? diagram?.t_seconds;
    $('[data-link]').textContent = film ? `Linked to film${t != null ? ` at ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}` : ''}` : opts.meeting_id || diagram?.meeting_id ? 'Linked to a player meeting' : opts.note_id || diagram?.note_id ? 'Linked to a note' : 'Playbook drawing';
  }
  function onUnload(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
  window.addEventListener('beforeunload', onUnload);
  function close() {
    if (dirty && !confirm('This drawing has unsaved changes. Close anyway?')) return;
    clearTimeout(saveTimer); document.removeEventListener('keydown', keys); document.removeEventListener('keyup', keys); window.removeEventListener('beforeunload', onUnload);
    panel.remove(); document.body.classList.remove('wb-open'); ctx.onClose?.();
  }

  if (opts.id) load(opts.id);
  else {
    $('[data-title]').value = opts.title || '';
    [...$('[data-players]').options].forEach(o => o.selected = (opts.player_ids || []).includes(o.value));
    ensureLines(); history.reset(JSON.stringify(objects)); fit(); render(); linkLine(); loadThumbs();
  }
  return { close, get state() { return { template, objects, status, dirty }; } };
}
