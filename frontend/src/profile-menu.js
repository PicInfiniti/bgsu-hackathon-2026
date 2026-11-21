// Account menu (top right): My profile, Settings, Help & Q&A. There are no real accounts,
// so there is no Sign out; the menu says so instead of pretending to sign anyone out.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const initialsOf = (name) => (name || 'Coach').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');

export function smallPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) { reject(Error('Use a PNG or JPEG picture.')); return; }
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { const size = 160; const c = document.createElement('canvas'); c.width = size; c.height = size; const s = Math.min(img.width, img.height); c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error('That picture could not be opened.')); };
    img.src = url;
  });
}

export const LOCAL_ACCOUNT_NOTE = 'Local demo · one coach on this computer';

export function createProfileMenu(anchor, ctx) {
  const { getSettings, openSettings, openHelp } = ctx;
  const pop = document.createElement('div'); pop.className = 'profile-pop'; pop.hidden = true; pop.setAttribute('role', 'menu');
  anchor.after(pop);
  function avatar() {
    const p = getSettings().profile || {};
    anchor.innerHTML = p.photo ? `<img src="${p.photo}" alt="">` : `<span>${esc(initialsOf(p.name))}</span>`;
    anchor.setAttribute('aria-label', `Account: ${p.name || 'Coach'}`);
  }
  function render() {
    const s = getSettings(), p = s.profile || {};
    pop.innerHTML = `<div class="pp-head"><span class="pp-avatar">${p.photo ? `<img src="${p.photo}" alt="">` : esc(initialsOf(p.name))}</span><div><strong>${esc(p.name || 'Coach')}</strong><small>${esc([p.role, s.team?.name].filter(Boolean).join(' · ') || 'Falcon Follow-up')}</small></div></div>
      <button type="button" role="menuitem" data-pp="profile">My profile</button><button type="button" role="menuitem" data-pp="settings">Settings</button><button type="button" role="menuitem" data-pp="help">Help &amp; Q&amp;A</button>
      <p class="pp-note"><strong>${LOCAL_ACCOUNT_NOTE}.</strong> There are no accounts yet, so there is no Sign out. Anyone who can open the app on this computer can see the notebook.</p>`;
  }
  anchor.addEventListener('click', (e) => { e.preventDefault(); pop.hidden = !pop.hidden; if (!pop.hidden) render(); });
  pop.addEventListener('click', e => {
    const b = e.target.closest('[data-pp]'); if (!b) return;
    pop.hidden = true;
    if (b.dataset.pp === 'help') openHelp?.(); else openSettings?.(b.dataset.pp === 'profile' ? 'profile' : null);
  });
  document.addEventListener('mousedown', e => { if (!pop.hidden && !pop.contains(e.target) && !anchor.contains(e.target)) pop.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { pop.hidden = true; anchor.focus(); } });
  avatar();
  return { refresh: avatar };
}
