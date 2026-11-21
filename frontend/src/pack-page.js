// Read-only Film pack page for a player's phone: /pack/<token>. No login, no AI.
import { mmss, clipTitle } from './film-math.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function videoFor(clip) {
  const f = clip.film;
  if (f.source_type === 'upload' && f.playable) return `<video controls playsinline preload="metadata" src="/api/films/${f.id}/stream#t=${clip.start_s},${clip.end_s}"></video>`;
  if (f.link_kind === 'youtube') return `<iframe src="https://www.youtube-nocookie.com/embed/${esc(f.embed_id)}?start=${Math.floor(clip.start_s)}&end=${Math.ceil(clip.end_s)}&rel=0" title="${esc(clipTitle(clip))}" allow="fullscreen" loading="lazy"></iframe>`;
  if (f.link_kind === 'vimeo') return `<iframe src="https://player.vimeo.com/video/${esc(f.embed_id)}#t=${Math.floor(clip.start_s)}s" title="${esc(clipTitle(clip))}" allow="fullscreen" loading="lazy"></iframe>`;
  return f.link ? `<a class="pack-link" href="${esc(f.link)}" target="_blank" rel="noopener noreferrer">Open the film and go to ${mmss(clip.start_s)}</a>` : '<p>Ask your coach to show this clip.</p>';
}

export async function renderPack(root, token) {
  document.title = 'Film pack | Falcon Follow-up';
  root.className = 'pack-page';
  root.innerHTML = '<p class="pack-loading">Loading your film pack…</p>';
  let pack;
  try {
    const res = await fetch(`/api/pack/${encodeURIComponent(token)}`);
    pack = await res.json();
    if (!res.ok) throw Error(pack.detail || 'This film pack is not available.');
  } catch (error) {
    root.innerHTML = `<main class="pack-main"><h1>Film pack</h1><p class="pack-closed">${esc(error.message)}</p></main>`;
    return;
  }
  const clips = (list, heading) => list.length ? `<section><h2>${heading}</h2>${list.map((c, i) => `<article class="pack-clip"><h3>${i + 1}. ${esc(clipTitle(c))}</h3><p class="muted">${esc(c.film.title)} · ${mmss(c.start_s)}–${mmss(c.end_s)}</p>${videoFor(c)}</article>`).join('')}</section>` : '';
  root.innerHTML = `<main class="pack-main">
    <header><p class="pack-kicker">FALCON FOLLOW-UP · FILM PACK</p><h1>${esc(pack.title)}</h1><p>For ${esc(pack.audience)}${pack.due_date ? ` · watch by <strong>${esc(pack.due_date)}</strong>` : ''}</p></header>
    ${pack.homework.length ? `<section class="pack-homework"><h2>Actions</h2><ul>${pack.homework.map(h => `<li>${esc(h)}</li>`).join('')}</ul></section>` : ''}
    ${clips(pack.clips, 'Clips to study')}
    ${pack.notes.length ? `<section><h2>Coaching points</h2><ul class="pack-notes">${pack.notes.map(n => `<li><span class="pack-time">${mmss(n.t_seconds)}</span> ${esc(n.text)} <small>${esc(n.film.title)}</small></li>`).join('')}</ul></section>` : ''}
    ${pack.diagrams.length ? `<section><h2>Drawings</h2>${pack.diagrams.map(d => `<figure>${d.has_preview ? `<img src="/api/pack/${encodeURIComponent(token)}/diagrams/${d.id}.png" alt="${esc(d.alt_text || d.title)}">` : ''}<figcaption><strong>${esc(d.title)}</strong>${d.remember ? ` · ${esc(d.remember)}` : ''}</figcaption></figure>`).join('')}</section>` : ''}
    ${clips(pack.good_plays, 'Good plays')}
    ${pack.questions.length ? `<section><h2>Think about it</h2><ol>${pack.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol></section>` : ''}
    ${pack.film_grade ? `<section><h2>Your Quick grade</h2><p>${pack.film_grade.percent ?? '—'}% on ${pack.film_grade.plays} plays (target 80%).</p></section>` : ''}
    <footer class="pack-foot"><button type="button" class="pack-watched" data-watched ${pack.watched_at ? 'disabled' : ''}>${pack.watched_at ? '✓ You marked this as watched' : 'I watched it'}</button><button type="button" class="pack-print" data-print>Download PDF</button>
      <p class="muted">Read-only. This link works on this computer and local network only and closes ${esc(pack.expires_at.slice(0, 10))}.</p></footer></main>`;
  root.querySelector('[data-print]').addEventListener('click', () => window.print());
  root.querySelector('[data-watched]').addEventListener('click', async e => {
    e.target.disabled = true;
    const res = await fetch(`/api/pack/${encodeURIComponent(token)}/watched`, { method: 'POST' }).catch(() => null);
    e.target.textContent = res?.ok ? '✓ Thanks. Your coach can see you watched it.' : 'Could not save. Try again.';
    if (!res?.ok) e.target.disabled = false;
  });
}
