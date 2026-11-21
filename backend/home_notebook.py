"""Coach's notebook (notes, versions, ink, attachments), schedule events and
settings. Standard library only; dates and counts are computed here, never by AI."""
import base64
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

NOTEBOOKS = ('personal', 'player_meetings', 'team_strategy')
INPUT_METHODS = ('type', 'pen', 'photo', 'voice')
EVENT_TYPES = ('game', 'practice', 'scrimmage', 'film', 'meeting', 'lift', 'walkthrough', 'note', 'other')
EVENT_LABELS = {'game': 'Official game', 'practice': 'Practice', 'scrimmage': 'Scrimmage', 'film': 'Film review', 'meeting': 'Meeting',
                'lift': 'Lift', 'walkthrough': 'Walk-through', 'note': 'Note', 'other': 'Other'}
EVENT_EXTRA = ('opponent', 'home_away', 'location', 'focus', 'todo', 'done_at')
VERSION_SOURCES = ('typing', 'save', 'convert', 'aivana_fix', 'restore')
MAX_VERSIONS = 200
MAX_ATTACHMENTS = 5
MAX_IMAGE_BYTES = 8 * 1024 * 1024
DATA_URL = re.compile(r'^data:(image/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$')
NOTIFICATION_KINDS = ('review', 'late', 'due_tomorrow', 'next_up', 'recap')
DEFAULT_SETTINGS = {'game_day': 'saturday', 'day_labels': {}, 'notification_kinds': {k: True for k in NOTIFICATION_KINDS},
                    'team': {'name': None}, 'calendar': {'default_view': 'week', 'show_homework': True},
                    'privacy': {'export_names': False}, 'tours': {}}
ROLES = ('Head coach', 'Offensive coordinator', 'Defensive coordinator', 'Special teams coordinator', 'Position coach', 'Graduate assistant', 'Analyst', 'Other')
CALENDAR_VIEWS = ('day', 'week', 'month')
TOURS = ('welcome', 'film', 'playboard')
TOUR_STATES = ('done', 'dismissed')
# Smart views are computed from what a note is; they are never stored or edited.
SMART_VIEWS = {'all': None, 'private': ('personal',), 'player_meetings': ('player_meetings',), 'game_plans': ('team_strategy',)}


def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def clean_text(value, name, limit, required=False):
    if value is None and not required:
        return None
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise ValueError(f'{name} must be text of at most {limit} characters.')
    return value.strip() if required else value


def parse_data_url(value):
    from .note_media import parse_image
    return parse_image(value)


def parse_start(value):
    if not isinstance(value, str):
        raise ValueError('Start must look like 2026-11-24T15:30.')
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise ValueError('Start must look like 2026-11-24T15:30.') from None
    return parsed.replace(second=0, microsecond=0, tzinfo=None).isoformat(timespec='minutes')


def validate_segments(raw):
    """Voice lines labelled by the coach ("Who's talking?"). Never produced by speech detection."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > 500:
        raise ValueError('Up to 500 voice lines per note.')
    out = []
    for seg in raw:
        if not isinstance(seg, dict):
            raise ValueError('Each voice line must be an object.')
        label = clean_text(seg.get('speaker_label') or 'Unknown', 'Speaker', 40, required=True)
        player_id = seg.get('player_id') or None
        if player_id is not None and (not isinstance(player_id, str) or not re.fullmatch(r'p\d{2}', player_id)):
            raise ValueError('Speaker must be a roster player, Coach, Other or Unknown.')
        if label.lower() in ('unknown', 'coach', 'other'):
            player_id = None  # only a named player line is linked to a player
        start = seg.get('start_ms', 0)
        if not isinstance(start, int) or isinstance(start, bool) or not 0 <= start <= 6 * 3600 * 1000:
            raise ValueError('Line times must be milliseconds from the start of the recording.')
        if seg.get('source', 'coach_tag') != 'coach_tag':
            raise ValueError('Speaker labels can only come from the coach.')
        out.append({'speaker_label': label, 'player_id': player_id, 'start_ms': start,
                    'text': clean_text(seg.get('text'), 'Line', 2000, required=True), 'source': 'coach_tag'})
    return out


def validate_audience(value):
    if value in (None, ''):
        return 'team'
    if not isinstance(value, str) or not re.fullmatch(r'team|group:[A-Za-z]{1,4}|player:p\d{2}', value):
        raise ValueError("Who must be the whole team, a position room (group:WR) or one player (player:p07).")
    return value


def validate_event(raw, partial=False):
    if not isinstance(raw, dict):
        raise ValueError('Event must be an object.')
    event = {}
    if not partial or 'type' in raw:
        if raw.get('type') not in EVENT_TYPES:
            raise ValueError('Choose Official game, Practice, Scrimmage, Film review, Meeting, Lift, Walk-through, Note or Other.')
        event['type'] = raw['type']
    if not partial or 'title' in raw:
        event['title'] = clean_text(raw.get('title'), 'Title', 160, required=True)
    if not partial or 'start_at' in raw:
        event['start_at'] = parse_start(raw.get('start_at'))
    if not partial or 'duration_min' in raw:
        duration = raw.get('duration_min', 60)
        if not isinstance(duration, int) or isinstance(duration, bool) or not 5 <= duration <= 24 * 60:
            raise ValueError('Length must be between 5 minutes and 24 hours.')
        event['duration_min'] = duration
    if not partial or 'audience' in raw:
        event['audience'] = validate_audience(raw.get('audience'))
    if not partial or 'note' in raw:
        event['note'] = clean_text(raw.get('note') or None, 'Note', 2000)
    if not partial or 'repeat_weekly' in raw:
        repeat = raw.get('repeat_weekly', False)
        if repeat not in (True, False, 0, 1):
            raise ValueError('Repeat weekly must be true or false.')
        event['repeat_weekly'] = int(bool(repeat))
    if 'repeat_until' in raw:
        until = raw.get('repeat_until')
        if until:
            date.fromisoformat(until)
        event['repeat_until'] = until or None
    for key, limit in (('opponent', 80), ('location', 120), ('focus', 200)):
        if key in raw or not partial:
            event[key] = clean_text(raw.get(key) or None, key.capitalize(), limit)
    if 'todo' in raw:
        event['todo'] = 1 if raw.get('todo') else 0
    if 'done' in raw:
        if raw['done'] not in (True, False):
            raise ValueError('Done must be true or false.')
        event['done_at'] = now_iso() if raw['done'] else None
    if 'home_away' in raw or not partial:
        value = raw.get('home_away') or None
        if value not in (None, 'home', 'away', 'neutral'):
            raise ValueError('Home or away must be home, away or neutral.')
        event['home_away'] = value
    if 'meeting_id' in raw:
        meeting_id = raw.get('meeting_id')
        if meeting_id is not None and (not isinstance(meeting_id, str) or len(meeting_id) > 100):
            raise ValueError('Invalid meeting link.')
        event['meeting_id'] = meeting_id
    return event


def expand_events(events, start, end):
    """Occurrences overlapping [start, end] (dates, inclusive). Weekly repeats are
    expanded here in code, so the browser and the AI never do date math."""
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if last < first:
        raise ValueError('The end date must be on or after the start date.')
    if (last - first).days > 400:
        raise ValueError('Ask for at most about a year of events at a time.')
    occurrences = []
    for event in events:
        begin = datetime.fromisoformat(event['start_at'])
        if not event.get('repeat_weekly'):
            dates = [begin.date()] if first <= begin.date() <= last else []
        else:
            until = date.fromisoformat(event['repeat_until']) if event.get('repeat_until') else last
            cursor = begin.date()
            if cursor < first:
                weeks = -(-(first - cursor).days // 7)  # round up to the first week inside the range
                cursor += timedelta(days=7 * weeks)
            dates = []
            while cursor <= min(last, until):
                dates.append(cursor)
                cursor += timedelta(days=7)
        for day in dates:
            start_at = datetime.combine(day, begin.time()).isoformat(timespec='minutes')
            occurrences.append({**event, 'occurrence_id': f"{event['id']}@{day.isoformat()}", 'start_at': start_at,
                                'series_start': event['start_at'], 'date': day.isoformat()})
    return sorted(occurrences, key=lambda e: (e['start_at'], e['id']))


def ics_escape(value):
    return str(value or '').replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def ics_fold(line):
    out, raw = [], line.encode('utf-8')
    while len(raw) > 74:
        cut = 74
        while (raw[cut] & 0xC0) == 0x80:
            cut -= 1
        out.append(raw[:cut].decode('utf-8'))
        raw = b' ' + raw[cut:]
    out.append(raw.decode('utf-8'))
    return '\r\n'.join(out)


def build_ics(events, homework, stamp=None):
    """RFC 5545 calendar of events (weekly RRULE kept) plus homework due dates."""
    stamp = stamp or datetime.now().strftime('%Y%m%dT%H%M%S')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Falcon Follow-up//Coach Schedule//EN', 'CALSCALE:GREGORIAN',
             'METHOD:PUBLISH', 'X-WR-CALNAME:Falcon Follow-up schedule']
    for event in events:
        begin = datetime.fromisoformat(event['start_at'])
        finish = begin + timedelta(minutes=event.get('duration_min') or 60)
        lines += ['BEGIN:VEVENT', f"UID:event-{event['id']}@falcon-follow-up", f'DTSTAMP:{stamp}',
                  f"DTSTART:{begin.strftime('%Y%m%dT%H%M%S')}", f"DTEND:{finish.strftime('%Y%m%dT%H%M%S')}",
                  f"SUMMARY:{ics_escape(event['title'])}", f"CATEGORIES:{ics_escape(event['type'].upper())}"]
        if event.get('note'):
            lines.append(f"DESCRIPTION:{ics_escape(event['note'])}")
        if event.get('repeat_weekly'):
            until = f";UNTIL={event['repeat_until'].replace('-', '')}T235959" if event.get('repeat_until') else ''
            lines.append(f'RRULE:FREQ=WEEKLY{until}')
        lines.append('END:VEVENT')
    for item in homework:
        day = date.fromisoformat(item['due_date'])
        lines += ['BEGIN:VEVENT', f"UID:homework-{item['id']}@falcon-follow-up", f'DTSTAMP:{stamp}',
                  f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{(day + timedelta(days=1)).strftime('%Y%m%d')}",
                  f"SUMMARY:{ics_escape('Homework due: ' + item['player_name'] + ' – ' + item['text'])}", 'CATEGORIES:HOMEWORK', 'END:VEVENT']
    lines.append('END:VCALENDAR')
    return '\r\n'.join(ics_fold(line) for line in lines) + '\r\n'


class Notebook:
    def __init__(self, path):
        self.path = str(path)
        self.files = Path(self.path).with_name(Path(self.path).stem + '_files')
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS notes (
              id INTEGER PRIMARY KEY,
              notebook TEXT CHECK(notebook IN ('personal','player_meetings','team_strategy')),
              title TEXT, body TEXT,
              input_method TEXT CHECK(input_method IN ('type','pen','photo','voice')),
              meeting_id TEXT NULL, summary_json TEXT NULL, note_date TEXT,
              created_at TEXT, updated_at TEXT);
            CREATE TABLE IF NOT EXISTS note_attachments (
              id INTEGER PRIMARY KEY, note_id INTEGER REFERENCES notes(id),
              kind TEXT CHECK(kind IN ('ink','photo')), path TEXT, created_at TEXT);
            CREATE TABLE IF NOT EXISTS note_versions (
              id INTEGER PRIMARY KEY, note_id INTEGER REFERENCES notes(id), body TEXT, created_at TEXT,
              source TEXT CHECK(source IN ('typing','save','convert','aivana_fix','restore')));
            CREATE TABLE IF NOT EXISTS ink_strokes (
              id INTEGER PRIMARY KEY, note_id INTEGER REFERENCES notes(id), seq INTEGER, color TEXT, points_json TEXT);
            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY,
              type TEXT CHECK(type IN ('game','practice','scrimmage','film','meeting','lift','walkthrough','note','other')),
              title TEXT NOT NULL, start_at TEXT NOT NULL, duration_min INTEGER DEFAULT 60,
              audience TEXT, note TEXT, repeat_weekly INTEGER DEFAULT 0, repeat_until TEXT NULL,
              meeting_id TEXT NULL, created_at TEXT);
            CREATE TABLE IF NOT EXISTS notifications (
              id INTEGER PRIMARY KEY, key TEXT UNIQUE, kind TEXT, text TEXT, link TEXT, created_at TEXT, read_at TEXT NULL);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived_at TEXT NULL, created_at TEXT);
            CREATE TABLE IF NOT EXISTS game_lists (event_id INTEGER, game_date TEXT, saved_at TEXT, PRIMARY KEY (event_id, game_date));
            CREATE TABLE IF NOT EXISTS game_players (event_id INTEGER, game_date TEXT, player_id TEXT, PRIMARY KEY (event_id, game_date, player_id));
            ''')
            self._migrate_events(db)
            note_columns = {r[1] for r in db.execute('PRAGMA table_info(notes)')}
            if 'player_id' not in note_columns:
                db.execute('ALTER TABLE notes ADD COLUMN player_id TEXT NULL')  # Quick Note: related player
            if 'segments_json' not in note_columns:
                db.execute('ALTER TABLE notes ADD COLUMN segments_json TEXT NULL')  # voice lines tagged by the coach
            if 'folder_id' not in note_columns:
                db.execute('ALTER TABLE notes ADD COLUMN folder_id INTEGER NULL')  # one optional personal folder

    @staticmethod
    def _migrate_events(db):
        """Add football event types (scrimmage, lift, walk-through) and game/practice fields. Keeps all rows."""
        sql = db.execute("SELECT sql FROM sqlite_master WHERE name = 'events'").fetchone()[0]
        columns = {r[1] for r in db.execute('PRAGMA table_info(events)')}
        if 'scrimmage' not in sql:
            db.execute('ALTER TABLE events RENAME TO events_old')
            db.execute("""CREATE TABLE events (id INTEGER PRIMARY KEY,
              type TEXT CHECK(type IN ('game','practice','scrimmage','film','meeting','lift','walkthrough','note','other')),
              title TEXT NOT NULL, start_at TEXT NOT NULL, duration_min INTEGER DEFAULT 60, audience TEXT, note TEXT,
              repeat_weekly INTEGER DEFAULT 0, repeat_until TEXT NULL, meeting_id TEXT NULL, created_at TEXT)""")
            db.execute('INSERT INTO events (id, type, title, start_at, duration_min, audience, note, repeat_weekly, repeat_until, meeting_id, created_at) '
                       'SELECT id, type, title, start_at, duration_min, audience, note, repeat_weekly, repeat_until, meeting_id, created_at FROM events_old')
            db.execute('DROP TABLE events_old')
            db.execute("UPDATE events SET type = 'lift' WHERE type = 'other' AND lower(title) LIKE 'lift%'")
            db.execute("UPDATE events SET type = 'walkthrough' WHERE type = 'practice' AND lower(title) LIKE 'walk%'")
            columns = {r[1] for r in db.execute('PRAGMA table_info(events)')}
        for column in EVENT_EXTRA:
            if column not in columns:
                db.execute(f"ALTER TABLE events ADD COLUMN {column} {'INTEGER DEFAULT 0' if column == 'todo' else 'TEXT'}")
        for row in db.execute("SELECT id, title FROM events WHERE type = 'game' AND opponent IS NULL").fetchall():
            match = re.search(r'\b(vs\.?|at|@)\s+(.+)$', row[1])
            if match:
                db.execute('UPDATE events SET opponent = ?, home_away = ? WHERE id = ?', (match.group(2).strip()[:80], 'away' if match.group(1) in ('at', '@') else 'home', row[0]))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    # ---------- settings ----------
    def settings(self):
        with self.connect() as db:
            stored = {row['key']: json.loads(row['value']) for row in db.execute('SELECT key, value FROM settings')}
        result = json.loads(json.dumps(DEFAULT_SETTINGS))
        result['profile'] = {'name': None, 'photo': None, 'role': None, **stored.get('profile', {})}
        for key in ('team', 'calendar', 'privacy', 'tours'):
            result[key] = {**result[key], **stored.get(key, {})}
        result['season'] = stored.get('season', {'start': '08-01', 'end': '01-31'})
        for key in ('game_day', 'day_labels'):
            if key in stored:
                result[key] = stored[key]
        result['notification_kinds'].update(stored.get('notification_kinds', {}))
        return result

    def update_settings(self, raw):
        if not isinstance(raw, dict):
            raise ValueError('Settings must be an object.')
        changes = {}
        if 'profile' in raw:
            profile = raw['profile']
            if not isinstance(profile, dict):
                raise ValueError('Profile must be an object.')
            name = clean_text(profile.get('name') or None, 'Name', 80)
            photo = profile.get('photo') or None
            if photo is not None:
                parse_data_url(photo)
                if len(photo) > 400_000:
                    raise ValueError('Use a smaller picture.')
            role = profile.get('role', self.settings()['profile'].get('role')) or None
            if role is not None and role not in ROLES:
                raise ValueError('Choose a role from the list.')
            changes['profile'] = {'name': (name or '').strip() or None, 'photo': photo, 'role': role}
        if 'team' in raw:
            team = raw['team']
            if not isinstance(team, dict):
                raise ValueError('Team must be an object.')
            changes['team'] = {'name': (clean_text(team.get('name') or None, 'Team name', 80) or '').strip() or None}
        if 'calendar' in raw:
            cal = raw['calendar']
            current = self.settings()['calendar']
            if not isinstance(cal, dict) or cal.get('default_view', current['default_view']) not in CALENDAR_VIEWS or not isinstance(cal.get('show_homework', current['show_homework']), bool):
                raise ValueError('Calendar view is day, week or month; deadlines are on or off.')
            changes['calendar'] = {**current, **{k: cal[k] for k in ('default_view', 'show_homework') if k in cal}}
        if 'privacy' in raw:
            privacy = raw['privacy']
            if not isinstance(privacy, dict) or not isinstance(privacy.get('export_names'), bool):
                raise ValueError('Choose whether exports show player names.')
            changes['privacy'] = {'export_names': privacy['export_names']}
        if 'tour' in raw:
            tour = raw['tour']
            if not isinstance(tour, dict) or tour.get('id') not in TOURS or tour.get('state') not in (*TOUR_STATES, None):
                raise ValueError('Unknown tour.')
            tours = dict(self.settings()['tours'])
            if tour['state'] is None:
                tours.pop(tour['id'], None)  # Replay
            else:
                tours[tour['id']] = tour['state']
            changes['tours'] = tours
        if 'season' in raw:
            season = raw['season']
            if not isinstance(season, dict) or not all(re.fullmatch(r'\d{2}-\d{2}', str(season.get(k, ''))) for k in ('start', 'end')):
                raise ValueError('Season dates look like 08-01 and 01-31.')
            for k in ('start', 'end'):
                date.fromisoformat(f"2024-{season[k]}")
            changes['season'] = {'start': season['start'], 'end': season['end']}
        if 'game_day' in raw:
            if raw['game_day'] not in ('saturday', 'friday'):
                raise ValueError('Game day is Saturday or Friday.')
            changes['game_day'] = raw['game_day']
        if 'day_label' in raw:
            entry = raw['day_label']
            if not isinstance(entry, dict):
                raise ValueError('Day label must name a date and a label.')
            day = entry.get('date')
            date.fromisoformat(day)
            labels = self.settings()['day_labels']
            label = (entry.get('label') or '').strip()
            if len(label) > 40:
                raise ValueError('Keep day labels short.')
            if label:
                labels[day] = label
            else:
                labels.pop(day, None)
            changes['day_labels'] = labels
        if 'notification_kinds' in raw:
            kinds = raw['notification_kinds']
            if not isinstance(kinds, dict) or any(k not in NOTIFICATION_KINDS or not isinstance(v, bool) for k, v in kinds.items()):
                raise ValueError('Unknown notification type.')
            changes['notification_kinds'] = {**self.settings()['notification_kinds'], **kinds}
        with self.connect() as db:
            for key, value in changes.items():
                db.execute('INSERT OR REPLACE INTO settings VALUES (?, ?)', (key, json.dumps(value)))
        return self.settings()

    # ---------- notes ----------
    def _note(self, db, note_id, full=True):
        row = db.execute('SELECT * FROM notes WHERE id = ?', (note_id,)).fetchone()
        if not row:
            raise KeyError('Note not found.')
        note = dict(row)
        note['summary'] = json.loads(note.pop('summary_json')) if note.get('summary_json') else None
        note['segments'] = json.loads(note.pop('segments_json')) if note.get('segments_json') else []
        if full:
            note['attachments'] = [dict(a) for a in db.execute('SELECT id, kind, created_at FROM note_attachments WHERE note_id = ? ORDER BY id', (note_id,))]
            note['strokes'] = [{'seq': s['seq'], 'color': s['color'], 'points': json.loads(s['points_json'])}
                               for s in db.execute('SELECT * FROM ink_strokes WHERE note_id = ? ORDER BY seq', (note_id,))]
            note['version_count'] = db.execute('SELECT COUNT(*) FROM note_versions WHERE note_id = ?', (note_id,)).fetchone()[0]
        return note

    def list_notes(self, notebook=None, search=None, folder=None):
        query, args, where = 'SELECT id FROM notes', [], []
        if notebook:
            if notebook not in NOTEBOOKS:
                raise ValueError('Unknown notebook.')
            where.append('notebook = ?')
            args.append(notebook)
        if folder not in (None, '', 'any'):
            if folder == 'none':
                where.append('folder_id IS NULL')
            else:
                try:
                    where.append('folder_id = ?')
                    args.append(int(folder))
                except (TypeError, ValueError):
                    raise ValueError('Unknown folder.') from None
        if where:
            query += ' WHERE ' + ' AND '.join(where)
        query += ' ORDER BY updated_at DESC, id DESC'
        with self.connect() as db:
            notes = [self._note(db, row['id'], full=False) for row in db.execute(query, args).fetchall()]
            counts = dict(db.execute('SELECT note_id, COUNT(*) FROM note_attachments GROUP BY note_id').fetchall())
        for note in notes:
            note['attachment_count'] = counts.get(note['id'], 0)
        if search:
            words = search.casefold()
            notes = [n for n in notes if words in f"{n['title']} {n['body']}".casefold()]
        return notes

    # ---------- folders (personal, optional; built-in views are computed) ----------
    def _folder_id(self, value):
        if value in (None, '', 'none'):
            return None
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError('Unknown folder.')
        with self.connect() as db:
            row = db.execute('SELECT archived_at FROM folders WHERE id = ?', (value,)).fetchone()
        if not row:
            raise ValueError('Unknown folder.')
        if row['archived_at']:
            raise ValueError('That folder is archived. Restore it first.')
        return value

    def folders(self, include_archived=False):
        with self.connect() as db:
            counts = dict(db.execute('SELECT folder_id, COUNT(*) FROM notes WHERE folder_id IS NOT NULL GROUP BY folder_id').fetchall())
            rows = [dict(r) for r in db.execute('SELECT * FROM folders ORDER BY lower(name)')]
        return [{**r, 'note_count': counts.get(r['id'], 0)} for r in rows if include_archived or not r['archived_at']]

    def _folder_name(self, raw, skip_id=None):
        name = (clean_text((raw or {}).get('name') if isinstance(raw, dict) else None, 'Folder name', 40, required=True) or '').strip()
        if any(f['name'].casefold() == name.casefold() and f['id'] != skip_id for f in self.folders(include_archived=True)):
            raise ValueError('You already have a folder with that name.')
        if name.casefold() in ('all notes', 'private', 'player meetings', 'game plans', 'film observations', 'no folder'):
            raise ValueError('That name is used by a built-in view.')
        return name

    def create_folder(self, raw):
        name = self._folder_name(raw)
        with self.connect() as db:
            folder_id = db.execute('INSERT INTO folders (name, created_at) VALUES (?, ?)', (name, now_iso())).lastrowid
        return self.get_folder(folder_id)

    def get_folder(self, folder_id):
        folder = next((f for f in self.folders(include_archived=True) if f['id'] == folder_id), None)
        if not folder:
            raise KeyError('Folder not found.')
        return folder

    def update_folder(self, folder_id, raw):
        self.get_folder(folder_id)
        if not isinstance(raw, dict):
            raise ValueError('Folder must be an object.')
        with self.connect() as db:
            if 'name' in raw:
                db.execute('UPDATE folders SET name = ? WHERE id = ?', (self._folder_name(raw, folder_id), folder_id))
            if 'archived' in raw:
                if not isinstance(raw['archived'], bool):
                    raise ValueError('Archived is true or false.')
                db.execute('UPDATE folders SET archived_at = ? WHERE id = ?', (now_iso() if raw['archived'] else None, folder_id))
        return self.get_folder(folder_id)

    def delete_folder(self, folder_id):
        """Deleting a folder never deletes notes: they move to No folder."""
        self.get_folder(folder_id)
        with self.connect() as db:
            moved = db.execute('UPDATE notes SET folder_id = NULL WHERE folder_id = ?', (folder_id,)).rowcount
            db.execute('DELETE FROM folders WHERE id = ?', (folder_id,))
        return {'moved_to_no_folder': moved}

    def move_note(self, note_id, folder_id):
        """Changes only folder_id: links, dates, versions and the note itself stay as they are."""
        folder_id = self._folder_id(folder_id)
        with self.connect() as db:
            self._note(db, note_id, full=False)
            db.execute('UPDATE notes SET folder_id = ? WHERE id = ?', (folder_id, note_id))
            return self._note(db, note_id)

    # ---------- who played (official games only; counts are computed here) ----------
    def game_list(self, event_id, game_date):
        event = self.get_event(event_id)
        if event['type'] != 'game':
            raise ValueError('Only official games keep a played list.')
        date.fromisoformat(game_date)
        with self.connect() as db:
            saved = db.execute('SELECT saved_at FROM game_lists WHERE event_id = ? AND game_date = ?', (event_id, game_date)).fetchone()
            ids = [r[0] for r in db.execute('SELECT player_id FROM game_players WHERE event_id = ? AND game_date = ? ORDER BY player_id', (event_id, game_date))]
        return {'event_id': event_id, 'game_date': game_date, 'saved_at': saved['saved_at'] if saved else None, 'player_ids': ids}

    def save_game_list(self, event_id, game_date, player_ids, roster_ids):
        self.game_list(event_id, game_date)
        if not isinstance(player_ids, list) or any(p not in roster_ids for p in player_ids):
            raise ValueError('Tick players from the roster.')
        with self.connect() as db:
            db.execute('DELETE FROM game_players WHERE event_id = ? AND game_date = ?', (event_id, game_date))
            db.executemany('INSERT INTO game_players VALUES (?, ?, ?)', [(event_id, game_date, p) for p in dict.fromkeys(player_ids)])
            db.execute('INSERT OR REPLACE INTO game_lists VALUES (?, ?, ?)', (event_id, game_date, now_iso()))
        return self.game_list(event_id, game_date)

    def games_played(self, player_id, active_since=None):
        """'Games played N of M' over official games with a saved list. None when no list was saved."""
        with self.connect() as db:
            lists = db.execute("SELECT l.event_id, l.game_date FROM game_lists l JOIN events e ON e.id = l.event_id WHERE e.type = 'game'").fetchall()
            played = {(r[0], r[1]) for r in db.execute('SELECT event_id, game_date FROM game_players WHERE player_id = ?', (player_id,))}
        if active_since:
            lists = [r for r in lists if r[1] >= active_since]
        if not lists:
            return None
        return {'played': sum(1 for r in lists if (r[0], r[1]) in played), 'of': len(lists)}

    def get_note(self, note_id):
        with self.connect() as db:
            return self._note(db, note_id)

    def _validate_note(self, raw, partial=False):
        if not isinstance(raw, dict):
            raise ValueError('Note must be an object.')
        note = {}
        if not partial or 'notebook' in raw:
            if raw.get('notebook') not in NOTEBOOKS:
                raise ValueError("Choose My notes, Player meetings or Game plan.")
            note['notebook'] = raw['notebook']
        if not partial or 'title' in raw:
            note['title'] = (clean_text(raw.get('title') or '', 'Title', 160) or '').strip() or 'Untitled note'
        if not partial or 'body' in raw:
            note['body'] = clean_text(raw.get('body') or '', 'Note', 20000)
        if not partial or 'input_method' in raw:
            method = raw.get('input_method', 'type')
            if method not in INPUT_METHODS:
                raise ValueError('Choose type, pen, photo or voice.')
            note['input_method'] = method
        if not partial or 'note_date' in raw:
            day = raw.get('note_date') or date.today().isoformat()
            date.fromisoformat(day)
            note['note_date'] = day
        if 'meeting_id' in raw:
            meeting_id = raw.get('meeting_id') or None
            if meeting_id is not None and (not isinstance(meeting_id, str) or len(meeting_id) > 100):
                raise ValueError('Invalid meeting link.')
            note['meeting_id'] = meeting_id
        if 'segments' in raw:
            note['segments_json'] = json.dumps(validate_segments(raw.get('segments')))
        if 'folder_id' in raw:
            note['folder_id'] = self._folder_id(raw.get('folder_id'))
        if 'player_id' in raw:
            player_id = raw.get('player_id') or None
            if player_id is not None and (not isinstance(player_id, str) or not re.fullmatch(r'p\d{2}', player_id)):
                raise ValueError('Choose a player from the roster.')
            note['player_id'] = player_id
        return note

    def _add_version(self, db, note_id, body, source, created_at=None):
        if source not in VERSION_SOURCES:
            raise ValueError('Unknown version source.')
        last = db.execute('SELECT body FROM note_versions WHERE note_id = ? ORDER BY id DESC LIMIT 1', (note_id,)).fetchone()
        if last and last['body'] == body and source == 'typing':
            return None
        cursor = db.execute('INSERT INTO note_versions (note_id, body, created_at, source) VALUES (?, ?, ?, ?)',
                            (note_id, body, created_at or now_iso(), source))
        self._prune_versions(db, note_id)
        return cursor.lastrowid

    @staticmethod
    def _prune_versions(db, note_id):
        total = db.execute('SELECT COUNT(*) FROM note_versions WHERE note_id = ?', (note_id,)).fetchone()[0]
        extra = total - MAX_VERSIONS
        if extra <= 0:
            return
        # Oldest typing versions go first, then other non-save versions. Saves stay.
        for source_filter in ("source = 'typing'", "source NOT IN ('typing', 'save')"):
            ids = [r[0] for r in db.execute(f'SELECT id FROM note_versions WHERE note_id = ? AND {source_filter} ORDER BY id LIMIT ?', (note_id, extra))]
            db.executemany('DELETE FROM note_versions WHERE id = ?', [(i,) for i in ids])
            extra -= len(ids)
            if extra <= 0:
                return

    def _store_extras(self, db, note_id, raw):
        attachments = raw.get('attachments') or []
        if not isinstance(attachments, list):
            raise ValueError('Attachments must be a list.')
        existing = db.execute('SELECT COUNT(*) FROM note_attachments WHERE note_id = ? AND kind = ?', (note_id, 'photo')).fetchone()[0]
        if existing + sum(1 for a in attachments if isinstance(a, dict) and a.get('kind') == 'photo') > MAX_ATTACHMENTS:
            raise ValueError('Up to 5 photos per note.')
        for attachment in attachments:
            if not isinstance(attachment, dict) or attachment.get('kind') not in ('ink', 'photo'):
                raise ValueError('Attachments are ink drawings or photos.')
            mime, data = parse_data_url(attachment.get('data_url'))
            folder = self.files / str(note_id)
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / f"{uuid.uuid4().hex}.{'png' if mime == 'image/png' else 'jpg'}"
            path.write_bytes(data)
            if attachment['kind'] == 'ink':
                old = db.execute("SELECT id, path FROM note_attachments WHERE note_id = ? AND kind = 'ink'", (note_id,)).fetchall()
                for row in old:
                    Path(row['path']).unlink(missing_ok=True)
                db.execute("DELETE FROM note_attachments WHERE note_id = ? AND kind = 'ink'", (note_id,))
            db.execute('INSERT INTO note_attachments (note_id, kind, path, created_at) VALUES (?, ?, ?, ?)',
                       (note_id, attachment['kind'], str(path), now_iso()))
        if 'strokes' in raw:
            strokes = raw['strokes']
            if not isinstance(strokes, list) or len(strokes) > 5000:
                raise ValueError('Too many pen strokes.')
            db.execute('DELETE FROM ink_strokes WHERE note_id = ?', (note_id,))
            for seq, stroke in enumerate(strokes):
                points = stroke.get('points') if isinstance(stroke, dict) else None
                color = stroke.get('color') if isinstance(stroke, dict) else None
                if not isinstance(points, list) or not isinstance(color, str) or len(color) > 20 or len(points) > 5000:
                    raise ValueError('Invalid pen stroke.')
                if any(not isinstance(p, list) or len(p) != 4 or not all(isinstance(v, (int, float)) for v in p) for p in points):
                    raise ValueError('Pen points are [x, y, time_ms, pressure].')
                db.execute('INSERT INTO ink_strokes (note_id, seq, color, points_json) VALUES (?, ?, ?, ?)',
                           (note_id, seq, color, json.dumps(points)))
        versions = raw.get('versions') or []
        if not isinstance(versions, list) or len(versions) > MAX_VERSIONS:
            raise ValueError('Too many draft versions.')
        for version in versions:
            if not isinstance(version, dict) or not isinstance(version.get('body'), str):
                raise ValueError('Invalid draft version.')
            self._add_version(db, note_id, version['body'][:20000], version.get('source', 'typing'))

    def create_note(self, raw):
        note = self._validate_note(raw)
        stamp = now_iso()
        with self.connect() as db:
            cursor = db.execute('INSERT INTO notes (notebook, title, body, input_method, meeting_id, note_date, created_at, updated_at, player_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                (note['notebook'], note['title'], note['body'], note['input_method'], note.get('meeting_id'), note['note_date'], stamp, stamp, note.get('player_id')))
            note_id = cursor.lastrowid
            if note.get('segments_json'):
                db.execute('UPDATE notes SET segments_json = ? WHERE id = ?', (note['segments_json'], note_id))
            if note.get('folder_id'):
                db.execute('UPDATE notes SET folder_id = ? WHERE id = ?', (note['folder_id'], note_id))
            self._store_extras(db, note_id, raw)
            self._add_version(db, note_id, note['body'], 'save')
            return self._note(db, note_id)

    def update_note(self, note_id, raw):
        changes = self._validate_note(raw, partial=True)
        with self.connect() as db:
            before = self._note(db, note_id, full=False)
            if changes:
                columns = ', '.join(f'{k} = ?' for k in changes)
                db.execute(f'UPDATE notes SET {columns}, updated_at = ? WHERE id = ?', (*changes.values(), now_iso(), note_id))
            self._store_extras(db, note_id, raw)
            if 'body' in changes and changes['body'] != before['body'] or raw.get('save_version'):
                self._add_version(db, note_id, changes.get('body', before['body']), 'save')
            return self._note(db, note_id)

    def delete_note(self, note_id):
        with self.connect() as db:
            self._note(db, note_id, full=False)
            for row in db.execute('SELECT path FROM note_attachments WHERE note_id = ?', (note_id,)).fetchall():
                Path(row['path']).unlink(missing_ok=True)
            for table in ('note_attachments', 'note_versions', 'ink_strokes'):
                db.execute(f'DELETE FROM {table} WHERE note_id = ?', (note_id,))
            db.execute('DELETE FROM notes WHERE id = ?', (note_id,))

    def attachment_path(self, note_id, attachment_id):
        with self.connect() as db:
            row = db.execute('SELECT path FROM note_attachments WHERE id = ? AND note_id = ?', (attachment_id, note_id)).fetchone()
        if not row or not Path(row['path']).is_file():
            raise KeyError('Attachment not found.')
        return Path(row['path'])

    def versions(self, note_id):
        with self.connect() as db:
            self._note(db, note_id, full=False)
            return [dict(r) for r in db.execute('SELECT id, body, created_at, source FROM note_versions WHERE note_id = ? ORDER BY id', (note_id,))]

    def add_version(self, note_id, raw):
        if not isinstance(raw, dict) or not isinstance(raw.get('body'), str) or len(raw['body']) > 20000:
            raise ValueError('A version needs the note text.')
        with self.connect() as db:
            self._note(db, note_id, full=False)
            version_id = self._add_version(db, note_id, raw['body'], raw.get('source', 'typing'))
        return {'id': version_id}

    def restore_version(self, note_id, version_id):
        with self.connect() as db:
            row = db.execute('SELECT body FROM note_versions WHERE id = ? AND note_id = ?', (version_id, note_id)).fetchone()
            if not row:
                raise KeyError('Version not found.')
            db.execute('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?', (row['body'], now_iso(), note_id))
            self._add_version(db, note_id, row['body'], 'restore')
            return self._note(db, note_id)

    def set_summary(self, note_id, summary):
        with self.connect() as db:
            self._note(db, note_id, full=False)
            db.execute('UPDATE notes SET summary_json = ? WHERE id = ?', (json.dumps(summary), note_id))

    # ---------- events ----------
    def list_events(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT * FROM events ORDER BY start_at, id')]

    def get_event(self, event_id):
        with self.connect() as db:
            row = db.execute('SELECT * FROM events WHERE id = ?', (event_id,)).fetchone()
        if not row:
            raise KeyError('Event not found.')
        return dict(row)

    def create_event(self, raw):
        event = validate_event(raw)
        if event['type'] == 'game' and not event.get('opponent'):
            match = re.search(r'\b(?:vs\.?|at|@)\s+(.+)$', event['title'])
            event['opponent'] = match.group(1).strip()[:80] if match else None
            if match and not event.get('home_away'):
                event['home_away'] = 'away' if re.search(r'\b(?:at|@)\s', event['title']) else 'home'
        with self.connect() as db:
            cursor = db.execute('INSERT INTO events (type, title, start_at, duration_min, audience, note, repeat_weekly, repeat_until, meeting_id, created_at, opponent, home_away, location, focus, todo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                (event['type'], event['title'], event['start_at'], event['duration_min'], event['audience'], event['note'],
                                 event['repeat_weekly'], event.get('repeat_until'), event.get('meeting_id'), now_iso(),
                                 event.get('opponent'), event.get('home_away'), event.get('location'), event.get('focus'), event.get('todo', 0)))
            event_id = cursor.lastrowid
        return self.get_event(event_id)

    def update_event(self, event_id, raw):
        changes = validate_event(raw, partial=True)
        self.get_event(event_id)
        if changes:
            with self.connect() as db:
                db.execute(f"UPDATE events SET {', '.join(f'{k} = ?' for k in changes)} WHERE id = ?", (*changes.values(), event_id))
        return self.get_event(event_id)

    def delete_event(self, event_id):
        self.get_event(event_id)
        with self.connect() as db:
            db.execute('DELETE FROM events WHERE id = ?', (event_id,))

    def seed_schedule(self, today=None):
        """Synthetic sample game week, installed once so the schedule is not empty."""
        with self.connect() as db:
            if db.execute("SELECT 1 FROM settings WHERE key = 'schedule_seeded'").fetchone():
                return 0
            db.execute("INSERT INTO settings VALUES ('schedule_seeded', 'true')")
        base = today or date.today()
        monday = base - timedelta(days=base.weekday())
        saturday = monday + timedelta(days=5)
        samples = [
            ('practice', 'Practice (pads)', monday + timedelta(days=1), '15:30', 120, 'team', True),
            ('practice', 'Practice (shells)', monday + timedelta(days=2), '15:30', 120, 'team', True),
            ('practice', 'Practice (helmets)', monday + timedelta(days=3), '15:30', 90, 'team', True),
            ('film', 'Film: opponent install', monday, '14:00', 60, 'team', True),
            ('lift', 'Lift', monday + timedelta(days=1), '07:00', 60, 'team', True),
            ('walkthrough', 'Walk-through', monday + timedelta(days=4), '15:00', 45, 'team', True),
            ('film', 'DB coverage film', monday + timedelta(days=2), '13:00', 45, 'group:DB', False),
            ('meeting', 'Receivers position room', monday + timedelta(days=3), '13:30', 30, 'group:WR', False),
            ('game', 'Game day · vs. North', saturday, '13:00', 180, 'team', False),
            ('other', 'Travel: bus leaves', saturday + timedelta(days=7), '08:30', 30, 'team', False),
            ('game', 'Game day · at Lakeside', saturday + timedelta(days=7), '13:00', 180, 'team', False),
        ]
        for kind, title, day, clock, length, audience, repeat in samples:
            self.create_event({'type': kind, 'title': title, 'start_at': f'{day.isoformat()}T{clock}', 'duration_min': length,
                               'audience': audience, 'repeat_weekly': repeat, 'note': None})
        return len(samples)

    # ---------- notifications ----------
    def sync_notifications(self, candidates):
        """Store current candidates by stable key; read state survives refreshes."""
        enabled = self.settings()['notification_kinds']
        active = [c for c in candidates if enabled.get(c['kind'], True)]
        with self.connect() as db:
            for item in active:
                db.execute('INSERT INTO notifications (key, kind, text, link, created_at) VALUES (?, ?, ?, ?, ?) '
                           'ON CONFLICT(key) DO UPDATE SET text = excluded.text, link = excluded.link',
                           (item['key'], item['kind'], item['text'], item['link'], item.get('created_at') or now_iso()))
            keys = [c['key'] for c in active]
            rows = db.execute(f"SELECT * FROM notifications WHERE key IN ({','.join('?' * len(keys))}) ORDER BY created_at DESC, id DESC", keys).fetchall() if keys else []
        items = [dict(r) for r in rows]
        return {'items': items, 'unread': sum(1 for i in items if not i['read_at'])}

    def mark_notifications_read(self, ids=None):
        with self.connect() as db:
            if ids:
                db.executemany('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL', [(now_iso(), i) for i in ids])
            else:
                db.execute('UPDATE notifications SET read_at = ? WHERE read_at IS NULL', (now_iso(),))
