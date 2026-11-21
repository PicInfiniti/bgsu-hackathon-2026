// Settings page: only settings that change how the app behaves.
import { smallPhoto } from './profile-menu.js';
import { KIND_LABELS } from './bell.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ROLES = ['Head coach', 'Offensive coordinator', 'Defensive coordinator', 'Special teams coordinator', 'Position coach', 'Graduate assistant', 'Analyst', 'Other'];

export function renderSettings(root, { getSettings, saveSettings, notify, onChanged }) {
  const s = getSettings();
  const p = s.profile || {}, team = s.team || {}, season = s.season || { start: '08-01', end: '01-31' }, cal = s.calendar || {}, privacy = s.privacy || {};
  let photo = p.photo || null;
  root.innerHTML = `<div class="section-heading"><div><p class="eyebrow">YOUR WORKSPACE</p><h2 id="settings-title" tabindex="-1">Settings</h2><p>Saved on this computer for the local demo.</p></div></div>
  <div class="settings-grid">
    <form class="panel settings-card" data-settings-form="profile"><h3>Profile</h3>
      <div class="settings-photo"><span class="pp-photo small">${photo ? `<img src="${photo}" alt="">` : esc((p.name || 'Coach').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span><label>Photo<input type="file" name="photo" accept="image/png,image/jpeg"></label>${photo ? '<label class="check-line"><input type="checkbox" name="remove"> Remove</label>' : ''}</div>
      <label>Name<input name="name" maxlength="80" value="${esc(p.name || '')}" placeholder="Coach Reed"></label>
      <label>Role<select name="role"><option value="">—</option>${ROLES.map(r => `<option ${r === p.role ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <p class="muted">Shown in the account menu.</p><button class="primary compact" type="submit">Save profile</button></form>
    <form class="panel settings-card" data-settings-form="team"><h3>Team &amp; season</h3>
      <label>Team name<input name="team" maxlength="80" value="${esc(team.name || '')}" placeholder="Falcons"></label>
      <div class="form-row"><label>Season starts<input name="start" pattern="\\d{2}-\\d{2}" value="${esc(season.start)}" placeholder="08-01"></label><label>Season ends<input name="end" pattern="\\d{2}-\\d{2}" value="${esc(season.end)}" placeholder="01-31"></label></div>
      <label>Game day<select name="game_day"><option value="saturday" ${s.game_day === 'saturday' ? 'selected' : ''}>Saturday</option><option value="friday" ${s.game_day === 'friday' ? 'selected' : ''}>Friday</option></select></label>
      <p class="muted">The season sets the default export range. Game day sets the day labels (Game day − 1…).</p><button class="primary compact" type="submit">Save team &amp; season</button></form>
    <form class="panel settings-card" data-settings-form="calendar"><h3>Calendar</h3>
      <label>Open the schedule in<select name="default_view">${['day', 'week', 'month'].map(v => `<option value="${v}" ${cal.default_view === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)} view</option>`).join('')}</select></label>
      <label class="check-line"><input type="checkbox" name="show_homework" ${cal.show_homework !== false ? 'checked' : ''}> Show assignment deadlines on the calendar</label>
      <button class="primary compact" type="submit">Save calendar</button></form>
    <form class="panel settings-card" data-settings-form="privacy"><h3>Privacy &amp; notifications</h3>
      <label class="check-line"><input type="checkbox" name="export_names" ${privacy.export_names ? 'checked' : ''}> Include player names in calendar exports</label>
      <p class="muted">Off by default, so a shared calendar shows "Assignment due" without names. You can still change it for one export.</p>
      <fieldset class="settings-kinds"><legend>Show on the bell</legend>${Object.entries(KIND_LABELS).map(([k, v]) => `<label class="check-line"><input type="checkbox" name="kind_${k}" ${s.notification_kinds?.[k] !== false ? 'checked' : ''}> ${esc(v)}</label>`).join('')}</fieldset>
      <button class="primary compact" type="submit">Save privacy &amp; notifications</button></form>
  </div>`;
  root.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form), which = form.dataset.settingsForm;
    try {
      if (which === 'profile') {
        const file = f.get('photo');
        if (f.get('remove')) photo = null; else if (file?.size) photo = await smallPhoto(file);
        await saveSettings({ profile: { name: f.get('name') || null, role: f.get('role') || null, photo } });
      } else if (which === 'team') {
        await saveSettings({ team: { name: f.get('team') || null }, season: { start: f.get('start'), end: f.get('end') }, game_day: f.get('game_day') });
      } else if (which === 'calendar') {
        await saveSettings({ calendar: { default_view: f.get('default_view'), show_homework: f.get('show_homework') === 'on' } });
      } else {
        await saveSettings({ privacy: { export_names: f.get('export_names') === 'on' }, notification_kinds: Object.fromEntries(Object.keys(KIND_LABELS).map(k => [k, f.get(`kind_${k}`) === 'on'])) });
      }
      notify('Settings saved.');
      onChanged?.();
      renderSettings(root, { getSettings, saveSettings, notify, onChanged });
    } catch (error) { notify(error.message, true); }
  };
}
