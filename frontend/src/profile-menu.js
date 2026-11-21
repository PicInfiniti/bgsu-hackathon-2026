// Profile menu (top right). There are no real accounts yet, so there is no Sign out:
// the demo login is a local convenience. The name and picture are saved in Settings.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const initialsOf = (name) => (name || 'Coach').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');

function smallPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) { reject(Error('Use a PNG or JPEG picture.')); return; }
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { const size = 160; const c = document.createElement('canvas'); c.width = size; c.height = size; const s = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error('That picture could not be opened.')); };
    img.src = url;
  });
}

export function createProfileMenu(anchor, ctx) {
  const { getSettings, saveSettings, notify, openSettings } = ctx;
  const pop = document.createElement('div'); pop.className = 'profile-pop'; pop.hidden = true; pop.setAttribute('role', 'menu');
  anchor.after(pop);
  function avatar() {
    const p = getSettings().profile || {};
    anchor.innerHTML = p.photo ? `<img src="${p.photo}" alt="">` : `<span>${esc(initialsOf(p.name))}</span>`;
    anchor.setAttribute('aria-label', `Profile: ${p.name || 'Coach'}`);
  }
  function render(editing = false) {
    const p = getSettings().profile || {};
    pop.innerHTML = `<div class="pp-head"><span class="pp-avatar">${p.photo ? `<img src="${p.photo}" alt="">` : esc(initialsOf(p.name))}</span><div><strong>${esc(p.name || 'Coach')}</strong><small>Falcon Follow-up · this computer</small></div></div>
      ${editing ? `<form data-profile-form class="pp-form"><label>Name<input name="name" maxlength="80" value="${esc(p.name || '')}" placeholder="Coach Reed"></label><label>Picture<input name="photo" type="file" accept="image/png,image/jpeg"></label>${p.photo ? '<label class="check-line"><input type="checkbox" name="remove"> Remove picture</label>' : ''}<div class="pp-actions"><button type="button" class="text-button" data-pp-cancel>Cancel</button><button type="submit" class="primary compact">Save</button></div></form>`
      : `<button type="button" role="menuitem" data-pp="profile">My profile</button><button type="button" role="menuitem" data-pp="picture">Change picture</button><button type="button" role="menuitem" data-pp="settings">Settings</button>
      <p class="pp-note">No Sign out yet: this demo has no user accounts (demo/demo just opens the workspace). Real sign-in needs accounts, password hashing, sessions and a per-coach database. See docs/app-guide.md.</p>`}`;
  }
  anchor.addEventListener('click', (e) => { e.preventDefault(); pop.hidden = !pop.hidden; if (!pop.hidden) render(); });
  pop.addEventListener('click', e => {
    const b = e.target.closest('[data-pp]');
    if (b?.dataset.pp === 'profile' || b?.dataset.pp === 'picture') { render(true); if (b.dataset.pp === 'picture') pop.querySelector('[name="photo"]').click(); }
    if (b?.dataset.pp === 'settings') { pop.hidden = true; openSettings?.(); }
    if (e.target.closest('[data-pp-cancel]')) render();
  });
  pop.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target); const p = getSettings().profile || {};
    try {
      const file = f.get('photo');
      const photo = f.get('remove') ? null : file?.size ? await smallPhoto(file) : p.photo || null;
      await saveSettings({ profile: { name: f.get('name') || null, photo } });
      avatar(); render(); notify('Profile saved.');
    } catch (error) { notify(error.message, true); }
  });
  document.addEventListener('mousedown', e => { if (!pop.hidden && !pop.contains(e.target) && !anchor.contains(e.target)) pop.hidden = true; });
  avatar();
  return { refresh: avatar };
}
