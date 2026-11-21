// Bell: notifications are built in code on the backend from saved data (no AI).
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const KIND_LABELS = { review: 'AI notes ready to check', late: 'Late homework', due_tomorrow: 'Homework due tomorrow', next_up: 'Next up in 1 hour', recap: 'Recap ready' };

export function timeAgo(isoString, now = new Date()) {
  const minutes = Math.round((now - new Date(isoString)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

export function createBell(button, ctx) {
  const { api, notify, openLink, getSettings, saveSettings } = ctx;
  let data = { items: [], unread: 0 }, settingsOpen = false;
  const pop = document.createElement('div');
  pop.className = 'bell-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Notifications');
  button.after(pop);
  async function refresh() {
    try { data = await api('/notifications', undefined, 'GET'); } catch { return; }
    const badge = button.querySelector('.bell-count');
    badge.hidden = !data.unread; badge.textContent = data.unread > 9 ? '9+' : String(data.unread);
    button.setAttribute('aria-label', `Notifications${data.unread ? `, ${data.unread} new` : ''}`);
    if (!pop.hidden) render();
  }
  function render() {
    const s = getSettings();
    pop.innerHTML = `<div class="bell-head"><strong>Notifications</strong><button type="button" class="text-button" data-read-all ${data.unread ? '' : 'disabled'}>Mark all read</button></div>
      ${settingsOpen ? `<div class="bell-settings"><p>Show these on the bell:</p>${Object.entries(KIND_LABELS).map(([k, v]) => `<label><input type="checkbox" data-kind="${k}" ${s.notification_kinds[k] !== false ? 'checked' : ''}> ${v}</label>`).join('')}</div>` : ''}
      <ul>${data.items.map(n => `<li class="${n.read_at ? 'read' : 'unread'} kind-${n.kind}"><button type="button" data-open="${n.id}"><span class="bell-dot"></span><span><strong>${esc(n.text)}</strong><small>${timeAgo(n.created_at)}</small></span></button></li>`).join('') || '<li class="empty">No new notifications. Late homework and notes to check also show on the Home Watch list.</li>'}</ul>
      <div class="bell-foot"><button type="button" class="text-button" data-settings>${settingsOpen ? 'Done' : 'Notification settings'}</button></div>`;
  }
  button.addEventListener('click', () => { pop.hidden = !pop.hidden; button.setAttribute('aria-expanded', String(!pop.hidden)); if (!pop.hidden) { render(); refresh(); } });
  pop.addEventListener('click', async e => {
    if (e.target.closest('[data-read-all]')) { await api('/notifications/read', {}); await refresh(); render(); return; }
    if (e.target.closest('[data-settings]')) { settingsOpen = !settingsOpen; render(); return; }
    const item = e.target.closest('[data-open]');
    if (item) {
      const n = data.items.find(x => String(x.id) === item.dataset.open);
      pop.hidden = true; button.setAttribute('aria-expanded', 'false');
      api('/notifications/read', { ids: [n.id] }).then(refresh).catch(() => {});
      openLink(n.link);
    }
  });
  pop.addEventListener('change', async e => {
    const box = e.target.closest('[data-kind]'); if (!box) return;
    try { await saveSettings({ notification_kinds: { [box.dataset.kind]: box.checked } }); await refresh(); render(); } catch (error) { notify(error.message, true); }
  });
  document.addEventListener('mousedown', e => { if (!pop.hidden && !pop.contains(e.target) && !button.contains(e.target)) { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { pop.hidden = true; button.focus(); } });
  refresh(); setInterval(refresh, 60000);
  return { refresh };
}
