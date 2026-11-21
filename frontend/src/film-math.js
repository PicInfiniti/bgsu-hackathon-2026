// Pure helpers for the Film room (tested with node --test).
export const mmss = (s = 0) => { const t = Math.max(0, Math.floor(s)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export function parseTime(text) {
  const m = String(text || '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$|^(\d+)$/);
  if (!m) return null;
  if (m[4]) return Number(m[4]);
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Keyboard shortcuts must not fire while the coach types in a field. */
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select' || el.isContentEditable) return true;
  if (tag === 'input') return !['checkbox', 'radio', 'button', 'range'].includes((el.type || 'text').toLowerCase());
  return false;
}

/** Map a key to a player action (null = not a shortcut). */
export function filmKey(key, shift = false) {
  const map = { ' ': 'toggle', k: 'toggle', j: 'back5', l: 'fwd5', arrowleft: 'frameBack', arrowright: 'frameFwd', n: 'note', d: 'draw', g: 'grade', '[': 'markIn', ']': 'markOut', i: 'markIn', o: 'markOut' };
  const k = String(key || '').toLowerCase();
  if (shift && k === '8') return 'critical';
  return map[k] || null;
}

/** Client copy of the link rules (the server checks again). */
export function linkInfo(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return { ok: false, error: 'Paste a full link that starts with https://' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'Links must start with https://' };
  const host = u.hostname.toLowerCase();
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/) || [])[1];
    return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? { ok: true, kind: 'youtube', id } : { ok: false, error: 'That YouTube link has no video ID.' };
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const id = (u.pathname.match(/\/(\d{6,12})(?:\/|$)/) || [])[1];
    return id ? { ok: true, kind: 'vimeo', id } : { ok: false, error: 'That Vimeo link has no video number.' };
  }
  if (host === 'hudl.com' || host.endsWith('.hudl.com') || host === 'hudl.app.link') return { ok: true, kind: 'hudl', id: null };
  if (['drive.google.com', 'docs.google.com'].includes(host)) return { ok: true, kind: 'drive', id: null };
  return { ok: false, error: 'Only YouTube, Vimeo, Hudl and Google Drive links are allowed.' };
}

/** Percent of plays won per player; critical counts as a miss. Mirrors the backend. */
export function gradeSummary(rows, target = 80) {
  const plays = rows.length, won = rows.filter(r => r.result === 'won').length, critical = rows.filter(r => r.result === 'critical').length;
  const percent = plays ? Math.round(100 * won / plays) : null;
  return { plays, won, critical, percent, label: percent === null ? null : percent >= target ? 'On target' : 'Below target' };
}

/** The clip playing at time t (latest start wins). */
export function clipAt(clips, t) {
  return clips.filter(c => c.start_s <= t && t < c.end_s).sort((a, b) => b.start_s - a.start_s)[0] || null;
}

/** Grading cursor: move between players and clips with the keyboard. */
export function gradeCursor(state, action, players, clips) {
  const next = { ...state };
  if (action === 'down') next.player = Math.min(players.length - 1, state.player + 1);
  if (action === 'up') next.player = Math.max(0, state.player - 1);
  if (action === 'nextClip') { next.clip = Math.min(clips.length - 1, state.clip + 1); next.player = 0; }
  if (action === 'prevClip') { next.clip = Math.max(0, state.clip - 1); next.player = 0; }
  return next;
}

export const DISTANCE_LABELS = { short: 'Short (1–3)', medium: 'Medium (4–6)', long: 'Long (7+)' };
export const ZONE_LABELS = { own_20: 'Own 20', mid: 'Midfield', plus: 'Plus territory', red_zone: 'Red zone', goal_line: 'Goal line' };
export const PLAY_LABELS = { run: 'Run', pass: 'Pass', rpo: 'RPO', st: 'Special teams' };
export function clipTitle(c) {
  const bits = [];
  if (c.down) bits.push(`${['', '1st', '2nd', '3rd', '4th'][c.down]}${c.distance ? ` & ${c.distance}` : ''}`);
  if (c.play_type) bits.push(PLAY_LABELS[c.play_type] || c.play_type);
  if (c.formation) bits.push(c.formation);
  return c.label || bits.join(' · ') || `Clip ${mmss(c.start_s)}`;
}

export function tagsFromText(text) {
  return [...new Set(String(text || '').split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 10);
}
