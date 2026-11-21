// Handwriting pad: Pointer Events (finger, mouse, Apple Pencil, Surface pen).
// Every stroke keeps its points as [x, y, t_ms, pressure] so it can be replayed.
export const PEN_COLORS = { black: '#1f1a17', blue: '#1d5fbf', red: '#c62d1f' };
const ERASER = 'eraser';

export function strokeWidth(pointerType, pressure) {
  const p = pointerType === 'mouse' || !pressure ? 0.5 : pressure;
  return pointerType === 'touch' ? 3.2 : 1.4 + p * 3.2;
}

export function drawStroke(ctx, stroke, upto = Infinity) {
  const pts = stroke.points;
  if (!pts.length) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (stroke.color === ERASER) { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; }
  else ctx.strokeStyle = PEN_COLORS[stroke.color] || stroke.color;
  const count = Math.min(pts.length, upto);
  if (count === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], (stroke.color === ERASER ? 9 : strokeWidth(stroke.pointer, pts[0][3])) / 2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; if (stroke.color !== ERASER) ctx.fill(); ctx.restore(); return; }
  for (let i = 1; i < count; i++) {
    ctx.beginPath();
    ctx.lineWidth = stroke.color === ERASER ? 18 : strokeWidth(stroke.pointer, pts[i][3]);
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  }
  ctx.restore();
}

/** Bounding box of the ink (ignores eraser strokes) with padding. */
export function inkBounds(strokes, padding = 16) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) if (s.color !== ERASER) for (const [x, y] of s.points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  if (minX === Infinity) return null;
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
}

export class PenPad {
  constructor(canvas, { onChange } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.strokes = []; this.redoStack = []; this.color = 'black'; this.tool = 'pen'; this.onChange = onChange;
    this.active = null; this.startedAt = null;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(type, e => this.up(e));
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    if (!rect.width) return;
    this.canvas.width = rect.width * ratio; this.canvas.height = rect.height * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.redraw();
  }
  point(e) { const r = this.canvas.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10, Math.round(performance.now() - (this.startedAt ?? performance.now())), Math.round((e.pressure || 0.5) * 100) / 100]; }
  down(e) {
    if (e.button > 0 || this.active) return;
    this.pointerId = e.pointerId;
    e.preventDefault(); this.canvas.setPointerCapture?.(e.pointerId);
    this.startedAt ??= performance.now();
    this.active = { color: this.tool === 'eraser' ? ERASER : this.color, pointer: e.pointerType, points: [this.point(e)] };
    drawStroke(this.ctx, this.active);
  }
  move(e) {
    if (!this.active || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const events = coalesced.length ? coalesced : [e];
    for (const ev of events) this.active.points.push(this.point(ev));
    drawStroke(this.ctx, { ...this.active, points: this.active.points.slice(-events.length - 1) });
  }
  up(e) {
    if (!this.active || e && e.pointerId !== this.pointerId) return;
    this.strokes.push(this.active); this.active = null; this.redoStack = [];
    this.onChange?.();
  }
  redraw(strokes = this.strokes) {
    const r = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, r.width || this.canvas.width, r.height || this.canvas.height);
    for (const s of strokes) drawStroke(this.ctx, s);
  }
  undo() { if (this.strokes.length) { this.redoStack.push(this.strokes.pop()); this.redraw(); this.onChange?.(); } }
  redo() { if (this.redoStack.length) { this.strokes.push(this.redoStack.pop()); this.redraw(); this.onChange?.(); } }
  clear() { if (!this.strokes.length) return; this.redoStack = [...this.strokes].reverse(); this.strokes = []; this.redraw(); this.onChange?.(); }
  load(strokes) { this.strokes = strokes.map(s => ({ color: s.color, pointer: s.pointer || 'pen', points: s.points })); this.redoStack = []; this.redraw(); }
  get empty() { return !this.strokes.some(s => s.color !== ERASER); }
  /** PNG of the ink only: white background, trimmed, at most 1600 px wide or tall. */
  toPNG(max = 1600) {
    const box = inkBounds(this.strokes);
    if (!box) return null;
    const scale = Math.min(2, max / Math.max(box.width, box.height));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(box.width * scale)); out.height = Math.max(1, Math.round(box.height * scale));
    const ink = document.createElement('canvas'); ink.width = out.width; ink.height = out.height;
    const ictx = ink.getContext('2d'); ictx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
    for (const s of this.strokes) drawStroke(ictx, s);
    const ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); ctx.drawImage(ink, 0, 0);
    return out.toDataURL('image/png');
  }
  serialize() { return this.strokes.map(s => ({ color: s.color, points: s.points })); }
}

/** Replays strokes on a canvas context: frame(step) draws strokes [0, step). */
export function renderStrokesUpTo(canvas, strokes, step) {
  const ctx = canvas.getContext('2d');
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width || canvas.width, r.height || canvas.height);
  strokes.slice(0, step).forEach(s => drawStroke(ctx, s));
}
