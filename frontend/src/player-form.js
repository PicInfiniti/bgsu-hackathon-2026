// Add player / Edit player. No delete: "Mark inactive" keeps the history.
import { GROUPS, POSITIONS, CLASS_YEARS, roomFor, seasonOf, checkPlayer, isActive } from './roster-store.js';
import { smallPhoto } from './profile-menu.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opts = (list, selected) => list.map(([v, l]) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)} · ${esc(l)}</option>`).join('');

export function openPlayerForm({ api, notify, getAll, onSaved }, existing = null) {
  const dialog = document.createElement('dialog');
  dialog.className = 'player-form-dialog';
  const p = existing || {};
  const [first, ...rest] = (p.name || '').split(' ');
  let photo = p.photo || null;
  const season = seasonOf(p);
  dialog.innerHTML = `<form method="dialog" data-player-form novalidate>
    <div class="pf-head"><h2>${existing ? `Edit ${esc(p.name)}` : 'Add player'}</h2><button type="button" class="icon-button" data-pf-close aria-label="Close">✕</button></div>
    <div class="pf-grid">
      <label>First name<input name="first_name" required maxlength="40" value="${esc(first || '')}" autocomplete="off"></label>
      <label>Last name<input name="last_name" required maxlength="60" value="${esc(rest.join(' '))}" autocomplete="off"></label>
      <label>Jersey #<input name="number" type="number" min="0" max="99" required value="${p.number ?? ''}"></label>
      <label>Season<input name="season" inputmode="numeric" pattern="\\d{4}" maxlength="4" value="${esc(season)}"></label>
      <label>Position<select name="position" required><option value="">Choose…</option>${opts(POSITIONS, p.position)}</select></label>
      <label>Position room<select name="position_group" required><option value="">Choose…</option>${opts(GROUPS, p.position_group)}</select></label>
      <label>Class year <small>(optional)</small><select name="class_year"><option value="">—</option>${CLASS_YEARS.map(c => `<option ${c === p.class_year ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Height <small>(optional)</small><input name="height" maxlength="8" placeholder="6'1&quot;" value="${esc(p.height || '')}"></label>
      <label>Weight, lb <small>(optional)</small><input name="weight" inputmode="numeric" maxlength="3" placeholder="185" value="${esc(p.weight || '')}"></label>
      <label>Photo <small>(optional)</small><input name="photo" type="file" accept="image/png,image/jpeg"></label>
    </div>
    ${photo ? '<label class="check-line"><input type="checkbox" name="remove_photo"> Remove photo</label>' : ''}
    <p class="pf-errors late-word" role="alert" hidden></p><p class="pf-warnings amber-word" role="status" hidden></p>
    <div class="pf-actions">
      ${existing ? `<button type="button" class="secondary compact" data-pf-season>Copy to next season</button><button type="button" class="secondary compact" data-pf-active>${isActive(p) ? 'Mark inactive' : 'Make active again'}</button>` : ''}
      <span class="spacer"></span><button type="button" class="text-button" data-pf-close>Cancel</button><button type="submit" class="primary">${existing ? 'Save changes' : 'Add player'}</button>
    </div>
    ${existing ? '<p class="muted pf-note">Players are never deleted. Inactive players are hidden from pickers and the roster; their notes, homework and film stay linked.</p>' : ''}
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const close = () => { dialog.close(); dialog.remove(); };
  const values = () => Object.fromEntries(['first_name', 'last_name', 'number', 'season', 'position', 'position_group', 'class_year', 'height', 'weight'].map(k => [k, form.elements[k].value.trim()]));
  const show = (errors, warnings) => {
    const e = dialog.querySelector('.pf-errors'), w = dialog.querySelector('.pf-warnings');
    e.hidden = !errors.length; e.textContent = errors.join(' ');
    w.hidden = !warnings.length; w.textContent = warnings.join(' ');
  };
  form.elements.position.addEventListener('change', () => { if (!form.elements.position_group.value) form.elements.position_group.value = roomFor(form.elements.position.value); });
  form.elements.number.addEventListener('input', () => show([], checkPlayer(values(), getAll(), p.id).warnings));
  dialog.addEventListener('click', async (e) => {
    if (e.target.closest('[data-pf-close]')) close();
    if (e.target.closest('[data-pf-season]')) {
      if (!confirm(`Copy ${p.name} to the ${Number(season) + 1} season? Same player, so every old note stays linked.`)) return;
      try { const r = await api(`/players/${p.id}/next-season`, {}); close(); onSaved(r.player, r.warnings); notify(`${p.name} is on the ${r.player.season} roster.`); } catch (error) { show([error.message], []); }
    }
    if (e.target.closest('[data-pf-active]')) {
      const making = !isActive(p);
      if (!making && !confirm(`Mark ${p.name} inactive? Hidden from the roster and pickers. Notes, homework and film are kept.`)) return;
      try { const r = await api(`/players/${p.id}`, { active: making }, 'PATCH'); close(); onSaved(r.player, r.warnings); notify(making ? `${p.name} is active again.` : `${p.name} is inactive. Use "Show inactive" to find them.`); } catch (error) { show([error.message], []); }
    }
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = values();
    const { errors, warnings } = checkPlayer(body, getAll(), p.id);
    if (errors.length) { show(errors, warnings); return; }
    try {
      const file = form.elements.photo.files[0];
      if (file) photo = await smallPhoto(file);
      if (form.elements.remove_photo?.checked) photo = null;
      const payload = { ...body, number: Number(body.number), class_year: body.class_year || null, height: body.height || null, weight: body.weight || null, photo };
      const r = existing ? await api(`/players/${p.id}`, payload, 'PATCH') : await api('/players', payload);
      close(); onSaved(r.player, r.warnings);
      notify(`${r.player.name} ${existing ? 'saved' : 'added'}.${r.warnings.length ? ' ' + r.warnings.join(' ') : ''}`, false);
    } catch (error) { show([error.message], []); }
  });
  dialog.showModal();
  form.elements.first_name.focus();
  return dialog;
}
