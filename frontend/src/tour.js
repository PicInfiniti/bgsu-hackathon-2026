// Guided tours: a small popover next to the highlighted part of the page. No dark overlay,
// the page stays usable. Close ends the whole tour. Finished or closed tours are remembered in browser storage.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TOURS = {
  welcome: [
    { target: 'nav[aria-label="Main navigation"]', title: 'Your coaching workspace', text: 'Keep conversations, player history, follow-up actions and football strategy together. Your notebook is saved locally on this computer.' },
    { target: '#new-meeting', title: 'Start with a conversation', text: 'Choose a date and attendees, then type or dictate your notes. Review and approve every extracted record before it enters a player’s history.' },
    { target: '#mode', title: 'Choose Demo or Live', text: 'Demo extracts the prepared samples without an AI call. Live uses Aivana for your notes and preparation. Both modes share the same saved notebook.' },
    { target: '#header-ask', title: 'Ask without leaving the page', text: 'Open the side chat, choose a player, group or the whole team, and ask about approved records. Answers include sources you can open in the player’s timeline.' },
    { target: 'nav [data-view="meeting-library"]', title: 'Find a meeting', text: 'Browse Month, Week, Day, Year or List. Search and filter conversations, open a meeting chip, or choose a date to see its agenda and deadlines.' },
    { target: 'nav [data-view="players"]', title: 'Prepare with the player’s history', text: 'Open a player’s timeline to revisit the original notes, ask a source-cited question, and choose the conversations for a preparation brief.' },
    { target: 'nav [data-view="tasks"]', title: 'Follow through on actions', text: 'Filter open, overdue or completed actions. Check the original source, mark work complete, or export selected dated actions to your calendar.' },
    { target: 'nav [data-view="strategy"]', title: 'Plan the next play', text: 'Build football plays with your roster and imaginary opponents, draw routes and save your boards. Replay this introduction anytime with the Tour button at the top.' },
  ],
};

export const TOUR_STORAGE_KEY = 'picinfiniti.coach.tours.v1';
export function readTourSettings(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(TOUR_STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}
export function rememberTour(storage, id, state) {
  const saved = readTourSettings(storage);
  try { storage?.setItem(TOUR_STORAGE_KEY, JSON.stringify({ ...saved, tours: { ...saved.tours, [id]: state } })); } catch { /* Tour still works without browser storage. */ }
}

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
  const previousFocus = document.activeElement;
  const finish = (how) => { endTour(); onEnd?.(how); };
  const place = (scroll = false) => {
    const s = steps[state.index];
    const el = document.querySelector(s.target) || (s.fallback && document.querySelector(s.fallback));
    marked?.classList.remove('tour-target'); marked = el && el.getClientRects().length ? el : null;
    marked?.classList.add('tour-target');
    pop.innerHTML = `<p class="tour-count">${state.index + 1} of ${steps.length}</p><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
      <div class="tour-actions"><button type="button" class="text-button" data-tour="close">Close tour</button><span></span>
      <button type="button" class="secondary compact" data-tour="back" ${state.index ? '' : 'disabled'}>Back</button><button type="button" class="primary compact" data-tour="next">${state.index + 1 === steps.length ? 'Done' : 'Next'}</button></div>`;
    if (scroll) marked?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    position();
    pop.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  };
  const position = () => {
    const r = marked ? marked.getBoundingClientRect() : null, w = Math.min(320, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    if (!r) { pop.style.left = `${Math.max(12,(window.innerWidth - w) / 2)}px`; pop.style.top = '24px'; return; }
    const h = pop.offsetHeight || 170;
    let left = r.right + 12, top = r.top;
    if (left + w > window.innerWidth - 12) { left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12); top = r.bottom + 10; }
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 10);
    pop.style.left = `${left}px`; pop.style.top = `${Math.max(12, top)}px`;
  };
  pop.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    state = step(state, b.dataset.tour, steps.length);
    if (state.ended) finish(state.ended); else place(true);
  });
  const onKey = (e) => { if (e.key === 'Escape') finish('dismissed'); };
  const onResize = () => position();
  document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize); document.addEventListener('scroll', onResize, true);
  active = () => { marked?.classList.remove('tour-target'); pop.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); document.removeEventListener('scroll', onResize, true); if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true}); };
  place(true);
  pop.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}

export function endTour() { active?.(); active = null; }
export const tourActive = () => Boolean(active);
