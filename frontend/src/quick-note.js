// Quick Note: a small side panel on every page. Saves into the existing notebook,
// suggesting the player or meeting from the page you are on.
import { NOTEBOOK_LABELS } from './notes-editor.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Which notebook and player to suggest for the page the coach is on. */
export function quickNoteDefaults(context) {
  const notebook = context.page === 'film' || context.page === 'playbook' || context.page === 'schedule' ? 'team_strategy' : context.player_id ? 'player_meetings' : 'personal';
  return { notebook, player_id: context.player_id || '', meeting_id: context.meeting_id || '' };
}

export function createQuickNote(ctx) {
  const { api, notify, players, getContext, getMeetings, onSaved } = ctx;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'quick-note-fab'; button.title = 'Quick note'; button.setAttribute('aria-label', 'Quick note');
  button.innerHTML = '✎<span>Quick note</span>';
  const panel = document.createElement('aside');
  panel.className = 'quick-note'; panel.hidden = true; panel.setAttribute('aria-label', 'Quick note');
  document.body.append(button, panel);
  function open() {
    const d = quickNoteDefaults(getContext());
    const meetings = getMeetings().slice(0, 12);
    panel.innerHTML = `<form data-qn><div class="qn-head"><h3>Quick note</h3><button type="button" class="icon-button" data-qn-close aria-label="Close quick note">✕</button></div>
      <label>Title<input name="title" maxlength="160" placeholder="After practice"></label>
      <label>Note<textarea name="body" rows="5" maxlength="20000" required placeholder="What do you want to remember?"></textarea></label>
      <label>Notebook<select name="notebook">${Object.entries(NOTEBOOK_LABELS).map(([k, v]) => `<option value="${k}" ${k === d.notebook ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Related player <small>(optional)</small><select name="player_id"><option value="">None</option>${players.map(p => `<option value="${p.id}" ${p.id === d.player_id ? 'selected' : ''}>#${p.number} ${esc(p.name)}</option>`).join('')}</select></label>
      <label>Related meeting <small>(optional)</small><select name="meeting_id"><option value="">None</option>${meetings.map(m => `<option value="${esc(m.id)}" ${m.id === d.meeting_id ? 'selected' : ''}>${esc(m.date)} · ${esc(m.title)}</option>`).join('')}</select></label>
      <p class="muted">Saved in the Coach's notebook. Nothing is sent to Aivana.</p>
      <div class="qn-actions"><button type="button" class="text-button" data-qn-close>Cancel</button><button type="submit" class="primary compact">Save note</button></div></form>`;
    panel.hidden = false; panel.querySelector('textarea').focus();
  }
  function close() { panel.hidden = true; button.focus(); }
  button.addEventListener('click', () => panel.hidden ? open() : close());
  panel.addEventListener('click', e => { if (e.target.closest('[data-qn-close]')) close(); });
  panel.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const submitButton = e.target.querySelector('[type="submit"]'); submitButton.disabled = true;
    try {
      const player = players.find(p => p.id === f.get('player_id'));
      await api('/notes', { notebook: f.get('notebook'), title: f.get('title') || (player ? `Note on ${player.name}` : 'Quick note'), body: f.get('body'), input_method: 'type', player_id: f.get('player_id') || null, meeting_id: f.get('meeting_id') || null });
      notify(`Saved in ${NOTEBOOK_LABELS[f.get('notebook')]}.`); close(); onSaved?.();
    } catch (error) { notify(error.message, true); submitButton.disabled = false; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
  return { open, close };
}
