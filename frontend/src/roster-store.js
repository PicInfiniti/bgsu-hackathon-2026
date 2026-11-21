// The roster comes from the backend (/api/players): the synthetic pack plus players the coach
// added or edited. Inactive players keep their history but are hidden from pickers.
export const roster = { all: [] };
export const isActive = (p) => p.active !== false;

export async function loadRoster(fetchFn = globalThis.fetch) {
  try {
    const response = await fetchFn('/api/players');
    if (response.ok) roster.all = await response.json();
  } catch { /* keep the bundled synthetic roster */ }
  return roster.all;
}

/** Puts the active players into `list` in place (every module holds this same array). */
export function applyRoster(list, all) {
  list.splice(0, list.length, ...all.filter(isActive));
  return list;
}

export const GROUPS = [['QB', 'Quarterbacks'], ['RB', 'Running backs'], ['WR', 'Receivers'], ['TE', 'Tight ends'], ['OL', 'Offensive line'], ['DL', 'Defensive line'], ['LB', 'Linebackers'], ['DB', 'Secondary'], ['ST', 'Special teams']];
export const POSITIONS = [['QB', 'Quarterback'], ['RB', 'Running back'], ['FB', 'Fullback'], ['WR', 'Wide receiver'], ['TE', 'Tight end'], ['OL', 'Offensive line'], ['LT', 'Left tackle'], ['LG', 'Left guard'], ['C', 'Center'], ['RG', 'Right guard'], ['RT', 'Right tackle'],
  ['DL', 'Defensive line'], ['DE', 'Defensive end'], ['DT', 'Defensive tackle'], ['NT', 'Nose tackle'], ['LB', 'Linebacker'], ['MLB', 'Middle linebacker'], ['OLB', 'Outside linebacker'], ['DB', 'Defensive back'], ['CB', 'Cornerback'], ['S', 'Safety'], ['FS', 'Free safety'], ['SS', 'Strong safety'],
  ['K', 'Kicker'], ['P', 'Punter'], ['LS', 'Long snapper'], ['KR', 'Kick returner']];
export const CLASS_YEARS = ['Freshman', 'Redshirt freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
const ROOM_OF = { QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL', DL: 'DL', DE: 'DL', DT: 'DL', NT: 'DL', LB: 'LB', MLB: 'LB', OLB: 'LB', DB: 'DB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', K: 'ST', P: 'ST', LS: 'ST', KR: 'ST' };
export const roomFor = (position) => ROOM_OF[position] || '';
export const seasonOf = (p, today = new Date()) => p.season || String(today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1);

/** Same checks as the server, shown before saving. Returns {errors, warnings}. */
export function checkPlayer(form, all, editingId = null) {
  const errors = [], warnings = [];
  const nameOk = (v) => /^[A-Za-zÀ-ÿ' .-]+$/.test(v || '');
  if (!form.first_name?.trim() || !form.last_name?.trim() || !nameOk(form.first_name.trim()) || !nameOk(form.last_name.trim())) errors.push('Enter a first and last name (letters only).');
  const n = Number(form.number);
  if (form.number === '' || form.number == null || !Number.isInteger(n) || n < 0 || n > 99) errors.push('Jersey number must be 0 to 99.');
  if (!form.position) errors.push('Choose a position.');
  if (!form.position_group) errors.push('Choose a position room.');
  if (!errors.length) {
    const season = form.season;
    all.filter(p => p.id !== editingId && isActive(p) && p.number === n && seasonOf(p) === season)
      .forEach(p => warnings.push(`#${n} is also worn by ${p.name} this season.`));
  }
  return { errors, warnings };
}
