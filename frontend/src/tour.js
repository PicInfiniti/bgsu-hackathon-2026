// Guided tours: a small popover next to the highlighted part of the page. No dark overlay,
// the page stays usable. Close ends the whole tour. Finished or closed tours are remembered in Settings.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TOURS = {
  welcome: [
    { target: 'nav[aria-label="Main navigation"]', title: 'Your pages', text: 'Home, Schedule, Coach\'s notebook, Film room, Players and Homework. Everything is saved on this computer.' },
    { target: '#new-note', title: 'Write a note', text: 'Type, draw with a pen, add a photo or talk. Notes go in a notebook and, if you like, in one of your folders.' },
    { target: '#open-ask', title: 'Ask Aivana', text: 'Ask about a player, a note or the week. Answers link to your saved notes, and nothing is saved without your OK.' },
    { target: '#profile-button', title: 'Settings and help', text: 'Your profile, Settings, and Help & Q&A, where you can replay this tour or email support.' },
  ],
  film: [
    { target: '[data-add-film]', title: 'Add video', text: 'Upload a file or paste a YouTube, Hudl, Vimeo or Google Drive link.' },
    { target: '.film-right', fallback: '.film-grid', title: 'The panel on the right', text: 'Open a film: the right side holds Notes, Clips, Quick grade and Summary for that film.' },
    { target: '[data-note-form]', fallback: '.film-grid', title: 'Comments at a time', text: 'Pause and write a note. It keeps the video time, so ▶ jumps straight back to that moment.' },
    { target: '[data-homework]', fallback: '[data-film-tab="cutups"]', title: 'Clips become assignments', text: 'Mark a clip, then "Make homework" on a note. It goes to review and becomes the player\'s assignment once you approve it.' },
    { target: '[data-film-tab="packs"]', title: 'Film packs', text: 'Share a read-only page with chosen clips, notes and drawings for one player or room. You can turn the link off at any time.' },
  ],
  playboard: [
    { target: '.wb-tools', title: 'Drawing tools', text: 'Pen, arrows, blocks, player markers and text. Undo with Ctrl+Z.' },
    { target: '.wb-head [data-template]', title: 'Pick the board', text: 'A play diagram, the full field or a blank board. Drawings are saved in yards, so they look the same on any screen.' },
    { target: '.wb-side', title: 'Name and players', text: 'Name the play and pick players, so it shows on each player\'s page under Film & diagrams.' },
    { target: '.wb-head [data-save]', title: 'Save', text: 'Save keeps the diagram. Use PNG to download a picture of it.' },
  ],
};

/** Pure state machine, for tests: returns the next state or null when the tour ends. */
export function step(state, action, total) {
  if (action === 'close') return { ...state, ended: 'dismissed' };
  if (action === 'back') return { ...state, index: Math.max(0, state.index - 1) };
  if (action === 'next') return state.index + 1 >= total ? { ...state, ended: 'done' } : { ...state, index: state.index + 1 };
  return state;
}

export const shouldStart = (settings, id) => !settings?.tours?.[id];

let active = null;

export function startTour(id, { onEnd } = {}) {
  endTour();
  const steps = TOURS[id];
  if (!steps) return;
  const pop = document.createElement('div');
  pop.className = 'tour-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-live', 'polite'); pop.setAttribute('aria-label', 'Guided tour');
  document.body.append(pop);
  let state = { index: 0 };
  let marked = null;
  const finish = (how) => { endTour(); onEnd?.(how); };
  const place = () => {
    const s = steps[state.index];
    const el = document.querySelector(s.target) || (s.fallback && document.querySelector(s.fallback));
    marked?.classList.remove('tour-target'); marked = el && el.getClientRects().length ? el : null;
    marked?.classList.add('tour-target');
    pop.innerHTML = `<p class="tour-count">${state.index + 1} of ${steps.length}</p><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
      <div class="tour-actions"><button type="button" class="text-button" data-tour="close">Close tour</button><span></span>
      <button type="button" class="secondary compact" data-tour="back" ${state.index ? '' : 'disabled'}>Back</button><button type="button" class="primary compact" data-tour="next">${state.index + 1 === steps.length ? 'Done' : 'Next'}</button></div>`;
    marked?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    const r = marked ? marked.getBoundingClientRect() : null, w = Math.min(320, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    if (!r) { pop.style.left = `${(window.innerWidth - w) / 2}px`; pop.style.top = '90px'; return; }
    const h = pop.offsetHeight || 170;
    let left = r.right + 12, top = r.top;
    if (left + w > window.innerWidth - 12) { left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12); top = r.bottom + 10; }
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10);
    pop.style.left = `${left}px`; pop.style.top = `${Math.max(12, top)}px`;
  };
  pop.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    state = step(state, b.dataset.tour, steps.length);
    if (state.ended) finish(state.ended); else place();
  });
  const onKey = (e) => { if (e.key === 'Escape') finish('dismissed'); };
  const onResize = () => place();
  document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
  active = () => { marked?.classList.remove('tour-target'); pop.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  place();
  pop.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}

export function endTour() { active?.(); active = null; }
export const tourActive = () => Boolean(active);
