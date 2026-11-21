// Coach's notebook on Home: built-in smart views (computed from what a note is, never edited)
// plus the coach's own folders. Search covers every folder unless a folder is picked.
export const SMART_VIEWS = [
  { key: 'all', label: 'All notes', hint: 'Everything in one place' },
  { key: 'personal', label: 'Private', hint: 'Personal coaching notes' },
  { key: 'player_meetings', label: 'Player meetings', hint: '1-on-1s and checked meetings' },
  { key: 'team_strategy', label: 'Game plans', hint: 'Plays, opponents, practice' },
  { key: 'film', label: 'Film observations', hint: 'Notes from the Film room' },
];

const has = (text, words) => text.toLowerCase().includes(words);

/**
 * Rows for the list. view: a SMART_VIEWS key. folder: null (any), 'none' or a folder id.
 * Meetings and film notes live outside folders, so a folder filter shows notebook notes only.
 */
export function notebookRows({ notes = [], meetings = [], filmNotes = [], view = 'all', folder = null, search = '' }) {
  const words = search.trim().toLowerCase();
  const inFolder = (n) => folder == null || (folder === 'none' ? n.folder_id == null : String(n.folder_id) === String(folder));
  const rows = [];
  if (view !== 'film') {
    notes.filter(n => (view === 'all' || n.notebook === view) && inFolder(n) && (!words || has(`${n.title} ${n.body}`, words)))
      .forEach(n => rows.push({ kind: 'note', id: n.id, date: n.note_date, stamp: n.updated_at, title: n.title, note: n }));
  }
  if (folder == null && (view === 'all' || view === 'player_meetings')) {
    meetings.filter(m => !words || has(`${m.title} ${m.note} ${m.items.map(i => i.text).join(' ')}`, words))
      .forEach(m => rows.push({ kind: 'meeting', id: m.id, date: m.date, stamp: m.date, title: m.title, meeting: m }));
  }
  if (folder == null && (view === 'all' || view === 'film')) {
    filmNotes.filter(f => !words || has(`${f.text} ${f.film_title} ${(f.tags || []).join(' ')}`, words))
      .forEach(f => rows.push({ kind: 'film', id: f.id, date: (f.created_at || '').slice(0, 10), stamp: f.created_at, title: f.text, film: f }));
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || String(b.stamp).localeCompare(String(a.stamp)));
}

export function viewCounts({ notes = [], meetings = [], filmNotes = [] }) {
  const count = (k) => notes.filter(n => n.notebook === k).length;
  return { all: notes.length + meetings.length + filmNotes.length, personal: count('personal'), player_meetings: count('player_meetings') + meetings.length, team_strategy: count('team_strategy'), film: filmNotes.length };
}

export const DELETE_FOLDER_TEXT = (name, count) => `Delete the folder "${name}"? ${count ? `Its ${count} note${count === 1 ? '' : 's'} move${count === 1 ? 's' : ''} to No folder. ` : ''}No note is deleted.`;
