"""Film room: films, clips, notes at a time, quick grades, play diagrams,
skill checks and film packs. Percentages, trends and dates are computed here."""
import json
import re
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .notebook import parse_data_url, now_iso

MAX_UPLOAD = 20 * 1024 * 1024 * 1024  # 20 GB: no low cap; game film is big
VIDEO_EXTS = ('mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'avi', 'mkv', 'wmv', 'flv', 'mpg', 'mpeg', 'm2ts', 'mts', 'ts', '3gp', 'f4v', 'asf', 'vob', 'mxf')
BROWSER_PLAYABLE = ('mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg')
FILM_KINDS = ('game', 'practice', 'other')
FILM_STATUS = ('todo', 'in_progress', 'done')
TONES = ('praise', 'improve', 'observation')
GRADE_RESULTS = ('won', 'lost', 'critical')
DISTANCES = ('short', 'medium', 'long')
ZONES = ('own_20', 'mid', 'plus', 'red_zone', 'goal_line')
PLAY_TYPES = ('run', 'pass', 'rpo', 'st')
PLAYLIST_KINDS = ('cutup', 'teach', 'good_plays')
TEACH_LIMIT = 15
TEMPLATES = {'play': (53.33, 30.0), 'field': (120.0, 53.33), 'frame': (100.0, 56.25), 'blank': (100.0, 56.25)}  # width, height in yards (frame/blank: board units)
OBJECT_TYPES = ('pen', 'arrow', 'line', 'marker', 'text', 'highlight', 'scrimmage', 'first_down')
COLOR = re.compile(r'^#[0-9A-Fa-f]{6}$')
SENSITIVE_WORDS = re.compile(r'\b(injur\w*|health|medical|concussion|insurance|doctor|trainer room|rehab|surgery|illness|sick)\b', re.I)
TARGET = 80
DEFAULT_SKILLS = {
    'QB': ['Passing accuracy', 'Coverage recognition', 'Pocket movement', 'Decision-making'],
    'RB': ['Ball security', 'Vision', 'Pass protection'],
    'WR': ['Route precision', 'Catching', 'Separation'],
    'TE': ['Blocking', 'Receiving', 'Route running'],
    'OL': ['Footwork', 'Hand placement', 'Finishing blocks'],
    'DL': ['Gap responsibility', 'Pass rush', 'Block shedding'],
    'LB': ['Tackling', 'Run fits', 'Coverage recognition'],
    'DB': ['Coverage technique', 'Positioning', 'Ball tracking'],
    'ST': ['Accuracy', 'Consistency', 'Technique'],
}
SCALE = ['Lots of work', 'Developing', 'Meets my standard', 'Consistently good', 'Excellent']


def clean(value, name, limit, required=False):
    """Plain text only: tags are stripped so nothing renders as HTML or script."""
    if value is None or value == '':
        if required:
            raise ValueError(f'{name} is required.')
        return None
    if not isinstance(value, str):
        raise ValueError(f'{name} must be text.')
    value = re.sub(r'<[^>]*>', '', value).replace('\x00', '').strip()
    if len(value) > limit:
        raise ValueError(f'{name} must be at most {limit} characters.')
    if required and not value:
        raise ValueError(f'{name} is required.')
    return value or None


def parse_link(url):
    """https links from YouTube, Vimeo, Hudl or Google Drive only. Never fetched on the server."""
    if not isinstance(url, str) or len(url) > 500:
        raise ValueError('Paste a link to YouTube, Vimeo, Hudl or Google Drive.')
    parts = urlparse(url.strip())
    host = (parts.hostname or '').lower()
    if parts.scheme != 'https':
        raise ValueError('Links must start with https://')
    if host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'):
        video = None
        if host == 'youtu.be':
            video = parts.path.strip('/').split('/')[0]
        elif parts.path == '/watch':
            video = (parse_qs(parts.query).get('v') or [None])[0]
        else:
            match = re.match(r'^/(?:shorts|embed|live)/([^/?#]+)', parts.path)
            video = match.group(1) if match else None
        if not video or not re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
            raise ValueError('That YouTube link has no video ID.')
        return {'link_kind': 'youtube', 'embed_id': video, 'source_ref': f'https://www.youtube.com/watch?v={video}'}
    if host in ('vimeo.com', 'www.vimeo.com', 'player.vimeo.com'):
        match = re.search(r'/(\d{6,12})(?:/|$)', parts.path)
        if not match:
            raise ValueError('That Vimeo link has no video number.')
        return {'link_kind': 'vimeo', 'embed_id': match.group(1), 'source_ref': f'https://vimeo.com/{match.group(1)}'}
    if host == 'hudl.com' or host.endswith('.hudl.com') or host == 'hudl.app.link':
        return {'link_kind': 'hudl', 'embed_id': None, 'source_ref': url.strip()}
    if host in ('drive.google.com', 'docs.google.com'):
        return {'link_kind': 'drive', 'embed_id': None, 'source_ref': url.strip()}
    raise ValueError('Only YouTube, Vimeo, Hudl and Google Drive links are allowed.')


def sniff_video(head):
    if len(head) >= 12 and head[4:8] == b'ftyp':
        return 'mov' if head[8:10] == b'qt' else 'mp4'
    if head[:4] == b'\x1aE\xdf\xa3':
        return 'webm'
    if head[:4] == b'RIFF' and head[8:11] == b'AVI':
        return 'avi'
    if head[:4] == b'\x30\x26\xb2\x75':
        return 'wmv'
    if head[:4] in (b'\x00\x00\x01\xba', b'\x00\x00\x01\xb3'):
        return 'mpg'
    if head[:4] == b'OggS':
        return 'ogv'
    if head[:3] == b'FLV':
        return 'flv'
    return None


def video_ext(filename):
    ext = (filename or '').rsplit('.', 1)[-1].lower() if '.' in (filename or '') else ''
    return ext if ext in VIDEO_EXTS else None


def grade_summary(rows, target=TARGET):
    """rows: dicts with result/technique/effort. Percent of plays won; critical counts as lost."""
    graded = len(rows)
    won = sum(1 for r in rows if r['result'] == 'won')
    critical = sum(1 for r in rows if r['result'] == 'critical')

    def pct(key):
        marks = [r[key] for r in rows if r.get(key) in (0, 1)]
        return round(100 * sum(marks) / len(marks)) if marks else None
    percent = round(100 * won / graded) if graded else None
    return {'plays': graded, 'won': won, 'lost': graded - won - critical, 'critical': critical, 'percent': percent,
            'technique_pct': pct('technique'), 'effort_pct': pct('effort'), 'target': target,
            'label': None if percent is None else ('On target' if percent >= target else 'Below target')}


def skill_trend(scores):
    """scores oldest→newest. Last vs average of up to 3 before it."""
    if len(scores) < 2:
        return {'arrow': '—', 'label': 'First check' if scores else 'No checks yet'}
    before = scores[-4:-1]
    diff = scores[-1] - sum(before) / len(before)
    if diff >= 0.5:
        return {'arrow': '▲', 'label': 'Improving'}
    if diff <= -0.5:
        return {'arrow': '▼', 'label': 'Needs attention'}
    return {'arrow': '—', 'label': 'Steady'}


def repeat_corrections(notes, players):
    """Same tag noted as Improve for one player in 3+ different weeks → plan a 1-on-1."""
    names = {p['id']: p['name'] for p in players}
    seen = {}
    for note in notes:
        if note.get('tone') != 'improve':
            continue
        day = date.fromisoformat(note['created_at'][:10])
        week = day.isocalendar()[:2]
        for player_id in note['player_ids']:
            for tag in note['tags']:
                seen.setdefault((player_id, tag), set()).add(week)
    flags = [{'player_id': p, 'player_name': names.get(p, p), 'tag': tag, 'weeks': len(weeks),
              'text': f"Same correction {len(weeks)} weeks: {names.get(p, p)}, {tag} → plan a 1-on-1"}
             for (p, tag), weeks in seen.items() if len(weeks) >= 3]
    return sorted(flags, key=lambda f: (-f['weeks'], f['player_name']))


def validate_objects(raw, template):
    if template not in TEMPLATES:
        raise ValueError('Choose Play diagram, Full field, Film frame or Blank.')
    if not isinstance(raw, list):
        raise ValueError('Drawing objects must be a list.')
    if len(raw) > 2000:
        raise ValueError('A drawing can hold at most 2,000 objects.')
    if len(json.dumps(raw)) > 1024 * 1024:
        raise ValueError('This drawing is too large (1 MB limit).')
    width, height = TEMPLATES[template]

    def coord(v, limit):
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not -10 <= v <= limit + 10:
            raise ValueError('A drawing point is outside the board.')
        return round(float(v), 3)
    out = []
    for obj in raw:
        if not isinstance(obj, dict) or obj.get('type') not in OBJECT_TYPES:
            raise ValueError('Unknown drawing tool.')
        item = {'type': obj['type'], 'id': clean(str(obj.get('id') or uuid.uuid4().hex[:10]), 'id', 40)}
        color = obj.get('color', '#20252B')
        if not isinstance(color, str) or not COLOR.match(color):
            raise ValueError('Colors must look like #F58220.')
        item['color'] = color
        item['width'] = obj.get('width') if obj.get('width') in ('S', 'M', 'L') else 'M'
        if obj['type'] in ('pen', 'arrow', 'line'):
            points = obj.get('points')
            if not isinstance(points, list) or not 1 <= len(points) <= 5000:
                raise ValueError('A line needs points.')
            item['points'] = [[coord(p[0], width), coord(p[1], height)] + ([round(float(p[2]), 2)] if len(p) > 2 and isinstance(p[2], (int, float)) else [])
                              for p in points if isinstance(p, list) and len(p) >= 2]
            item['style'] = obj.get('style') if obj.get('style') in ('solid', 'dashed', 'curved') else 'solid'
            item['end'] = obj.get('end') if obj.get('end') in ('arrow', 'block', 'none') else ('arrow' if obj['type'] == 'arrow' else 'none')
        else:
            item['x'], item['y'] = coord(obj.get('x'), width), coord(obj.get('y'), height)
        if obj['type'] in ('scrimmage', 'first_down'):
            item['x'] = 0
        if obj['type'] == 'marker':
            item['shape'] = obj.get('shape') if obj.get('shape') in ('circle', 'x', 'o', 'square') else 'circle'
            item['side'] = obj.get('side') if obj.get('side') in ('offense', 'defense') else 'offense'
            item['label'] = clean(obj.get('label'), 'Label', 200) or ''
            item['size'] = obj.get('size') if isinstance(obj.get('size'), (int, float)) and 0.5 <= obj['size'] <= 4 else 1
            item['player_id'] = obj.get('player_id') if isinstance(obj.get('player_id'), str) and re.fullmatch(r'p\d{2}', obj['player_id']) else None
        if obj['type'] == 'text':
            item['text'] = clean(obj.get('text'), 'Text', 200, required=True)
        if obj['type'] == 'highlight':
            item['shape'] = 'box' if obj.get('shape') == 'box' else 'circle'
            item['w'] = coord(obj.get('w', 4), width)
            item['h'] = coord(obj.get('h', 4), height)
        out.append(item)
    return out


class FilmRoom:
    def __init__(self, db_path, files_dir):
        self.path = str(db_path)
        self.files = Path(files_dir)
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS films (id INTEGER PRIMARY KEY, title TEXT NOT NULL, source_type TEXT CHECK(source_type IN ('upload','link')),
              source_ref TEXT, link_kind TEXT, embed_id TEXT, kind TEXT CHECK(kind IN ('game','practice','other')), film_date TEXT, opponent TEXT,
              meeting_id TEXT, assigned_to TEXT, status TEXT DEFAULT 'todo', description TEXT, size_bytes INTEGER, created_at TEXT, updated_at TEXT);
            CREATE TABLE IF NOT EXISTS film_players (film_id INTEGER, player_id TEXT, PRIMARY KEY(film_id, player_id));
            CREATE TABLE IF NOT EXISTS clips (id INTEGER PRIMARY KEY, film_id INTEGER REFERENCES films(id), start_s REAL NOT NULL, end_s REAL NOT NULL,
              label TEXT, quarter TEXT, down INTEGER, distance TEXT, field_zone TEXT, hash TEXT, play_type TEXT, formation TEXT, result TEXT,
              tags_json TEXT DEFAULT '[]', player_ids_json TEXT DEFAULT '[]', created_at TEXT);
            CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY, title TEXT NOT NULL, kind TEXT CHECK(kind IN ('cutup','teach','good_plays')),
              filter_json TEXT, created_at TEXT);
            CREATE TABLE IF NOT EXISTS playlist_clips (playlist_id INTEGER, clip_id INTEGER, sort INTEGER, PRIMARY KEY(playlist_id, clip_id));
            CREATE TABLE IF NOT EXISTS film_notes (id INTEGER PRIMARY KEY, film_id INTEGER REFERENCES films(id), clip_id INTEGER NULL, t_seconds REAL NOT NULL,
              text TEXT NOT NULL, tags_json TEXT DEFAULT '[]', tone TEXT, show_in_pack INTEGER DEFAULT 0, created_at TEXT);
            CREATE TABLE IF NOT EXISTS film_note_players (film_note_id INTEGER, player_id TEXT, PRIMARY KEY(film_note_id, player_id));
            CREATE TABLE IF NOT EXISTS quick_grades (id INTEGER PRIMARY KEY, clip_id INTEGER REFERENCES clips(id), player_id TEXT NOT NULL,
              result TEXT CHECK(result IN ('won','lost','critical')), technique INTEGER, effort INTEGER, reason TEXT, created_at TEXT, UNIQUE(clip_id, player_id));
            CREATE TABLE IF NOT EXISTS film_summaries (film_id INTEGER, player_id TEXT, coaching_points TEXT, work_on TEXT, summary TEXT, updated_at TEXT,
              PRIMARY KEY(film_id, player_id));
            CREATE TABLE IF NOT EXISTS play_diagrams (id INTEGER PRIMARY KEY, title TEXT NOT NULL, template TEXT, schema_version INTEGER, objects_json TEXT NOT NULL,
              preview_png_path TEXT, background_path TEXT, meeting_id TEXT, note_id INTEGER, film_id INTEGER, t_seconds REAL, remember TEXT, alt_text TEXT,
              tags_json TEXT DEFAULT '[]', created_at TEXT, updated_at TEXT);
            CREATE TABLE IF NOT EXISTS diagram_players (diagram_id INTEGER, player_id TEXT, PRIMARY KEY(diagram_id, player_id));
            CREATE TABLE IF NOT EXISTS position_skills (position TEXT, skill TEXT, sort INTEGER, PRIMARY KEY(position, skill));
            CREATE TABLE IF NOT EXISTS skill_checks (id INTEGER PRIMARY KEY, player_id TEXT NOT NULL, skill TEXT NOT NULL, score INTEGER CHECK(score BETWEEN 1 AND 5),
              why TEXT NOT NULL, source_kind TEXT, source_ref TEXT, check_date TEXT, created_at TEXT);
            CREATE TABLE IF NOT EXISTS film_packs (id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, title TEXT, audience_kind TEXT, audience_ref TEXT,
              items_json TEXT NOT NULL, include_scores INTEGER DEFAULT 0, due_date TEXT, expires_at TEXT, revoked_at TEXT, created_at TEXT,
              first_opened_at TEXT, last_opened_at TEXT, watched_at TEXT);
            ''')
            if not db.execute('SELECT 1 FROM position_skills LIMIT 1').fetchone():
                db.executemany('INSERT INTO position_skills VALUES (?, ?, ?)',
                               [(pos, skill, n) for pos, skills in DEFAULT_SKILLS.items() for n, skill in enumerate(skills)])

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    # ---------- films ----------
    def _film(self, db, film_id):
        row = db.execute('SELECT * FROM films WHERE id = ?', (film_id,)).fetchone()
        if not row:
            raise KeyError('Film not found.')
        film = dict(row)
        film['player_ids'] = [r[0] for r in db.execute('SELECT player_id FROM film_players WHERE film_id = ?', (film_id,))]
        film['clip_count'] = db.execute('SELECT COUNT(*) FROM clips WHERE film_id = ?', (film_id,)).fetchone()[0]
        film['note_count'] = db.execute('SELECT COUNT(*) FROM film_notes WHERE film_id = ?', (film_id,)).fetchone()[0]
        film['graded_clips'] = db.execute('SELECT COUNT(DISTINCT q.clip_id) FROM quick_grades q JOIN clips c ON c.id = q.clip_id WHERE c.film_id = ?', (film_id,)).fetchone()[0]
        ext = (film['source_ref'] or '').rsplit('.', 1)[-1].lower() if film['source_type'] == 'upload' else ''
        film['playable'] = film['source_type'] == 'upload' and bool(film['source_ref']) and ext in BROWSER_PLAYABLE or film['link_kind'] in ('youtube', 'vimeo')
        film['file_ext'] = ext or None
        film['needs_convert'] = film['source_type'] == 'upload' and bool(film['source_ref']) and ext not in BROWSER_PLAYABLE
        return film

    def _film_fields(self, raw, roster, partial=False):
        out = {}
        if not partial or 'title' in raw:
            out['title'] = clean(raw.get('title'), 'Title', 160, required=True)
        if not partial or 'kind' in raw:
            if raw.get('kind') not in FILM_KINDS:
                raise ValueError('Kind is Game, Practice or Other.')
            out['kind'] = raw['kind']
        if not partial or 'film_date' in raw:
            out['film_date'] = date.fromisoformat(raw.get('film_date') or '').isoformat() if raw.get('film_date') else None
            if not out['film_date']:
                raise ValueError('Date is required.')
        for key, limit in (('opponent', 80), ('assigned_to', 80), ('description', 2000), ('meeting_id', 100)):
            if not partial or key in raw:
                out[key] = clean(raw.get(key), key.replace('_', ' ').capitalize(), limit)
        if 'status' in raw:
            if raw['status'] not in FILM_STATUS:
                raise ValueError('Status is To do, In progress or Done.')
            out['status'] = raw['status']
        if 'player_ids' in raw:
            ids = raw['player_ids'] or []
            if not isinstance(ids, list) or any(p not in roster for p in ids):
                raise ValueError('Choose players from the roster.')
            out['player_ids'] = list(dict.fromkeys(ids))
        return out

    def create_film(self, raw, roster):
        if not isinstance(raw, dict):
            raise ValueError('Film must be an object.')
        fields = self._film_fields(raw, roster)
        source = raw.get('source_type')
        if source == 'link':
            fields.update(parse_link(raw.get('url')))
        elif source == 'upload':
            fields.update(link_kind='file', embed_id=None, source_ref=None)
        else:
            raise ValueError('Choose Upload or Link.')
        players = fields.pop('player_ids', [])
        stamp = now_iso()
        with self.connect() as db:
            cursor = db.execute('INSERT INTO films (title, source_type, source_ref, link_kind, embed_id, kind, film_date, opponent, meeting_id, assigned_to, status, description, created_at, updated_at) '
                                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                (fields['title'], source, fields['source_ref'], fields['link_kind'], fields['embed_id'], fields['kind'], fields['film_date'], fields['opponent'],
                                 fields['meeting_id'], fields['assigned_to'], 'todo', fields['description'], stamp, stamp))
            film_id = cursor.lastrowid
            db.executemany('INSERT INTO film_players VALUES (?, ?)', [(film_id, p) for p in players])
            return self._film(db, film_id)

    def list_films(self):
        with self.connect() as db:
            return [self._film(db, r[0]) for r in db.execute('SELECT id FROM films ORDER BY film_date DESC, id DESC').fetchall()]

    def get_film(self, film_id):
        with self.connect() as db:
            return self._film(db, film_id)

    def update_film(self, film_id, raw, roster):
        fields = self._film_fields(raw, roster, partial=True)
        players = fields.pop('player_ids', None)
        with self.connect() as db:
            self._film(db, film_id)
            if fields:
                db.execute(f"UPDATE films SET {', '.join(f'{k} = ?' for k in fields)}, updated_at = ? WHERE id = ?", (*fields.values(), now_iso(), film_id))
            if players is not None:
                db.execute('DELETE FROM film_players WHERE film_id = ?', (film_id,))
                db.executemany('INSERT INTO film_players VALUES (?, ?)', [(film_id, p) for p in players])
            return self._film(db, film_id)

    def delete_film(self, film_id):
        with self.connect() as db:
            film = self._film(db, film_id)
            clip_ids = [r[0] for r in db.execute('SELECT id FROM clips WHERE film_id = ?', (film_id,))]
            for clip_id in clip_ids:
                db.execute('DELETE FROM quick_grades WHERE clip_id = ?', (clip_id,))
                db.execute('DELETE FROM playlist_clips WHERE clip_id = ?', (clip_id,))
            note_ids = [r[0] for r in db.execute('SELECT id FROM film_notes WHERE film_id = ?', (film_id,))]
            db.executemany('DELETE FROM film_note_players WHERE film_note_id = ?', [(n,) for n in note_ids])
            for table in ('clips', 'film_notes', 'film_players', 'film_summaries'):
                db.execute(f'DELETE FROM {table} WHERE film_id = ?', (film_id,))
            db.execute('UPDATE play_diagrams SET film_id = NULL, t_seconds = NULL WHERE film_id = ?', (film_id,))
            db.execute('DELETE FROM films WHERE id = ?', (film_id,))
        if film['source_type'] == 'upload' and film['source_ref']:
            (self.files / film['source_ref']).unlink(missing_ok=True)

    def store_upload(self, film_id, chunks, filename=''):
        """chunks: iterable of bytes. Any video type is kept; size is only limited by MAX_UPLOAD."""
        film = self.get_film(film_id)
        if film['source_type'] != 'upload':
            raise ValueError('This film is a link, not an upload.')
        ext = video_ext(filename)
        self.files.mkdir(parents=True, exist_ok=True)
        tmp = self.files / f'{uuid.uuid4().hex}.part'
        size, first = 0, True
        try:
            with tmp.open('wb') as out:
                for chunk in chunks:
                    if not chunk:
                        continue
                    if first:
                        first = False
                        ext = ext or sniff_video(chunk[:16])
                        if not ext:
                            raise ValueError('That file does not look like a video.')
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise ValueError('That video is larger than 20 GB.')
                    out.write(chunk)
            if not size:
                raise ValueError('The video file is empty.')
            name = f'{uuid.uuid4()}.{ext}'
            tmp.replace(self.files / name)
        finally:
            tmp.unlink(missing_ok=True)
        if film['source_ref']:
            (self.files / film['source_ref']).unlink(missing_ok=True)
        with self.connect() as db:
            db.execute('UPDATE films SET source_ref = ?, size_bytes = ?, updated_at = ? WHERE id = ?', (name, size, now_iso(), film_id))
        return self.get_film(film_id)

    def store_upload_file(self, film_id, path, filename=''):
        """Move an already-streamed temp file into place (no second copy of big films)."""
        film = self.get_film(film_id)
        if film['source_type'] != 'upload':
            raise ValueError('This film is a link, not an upload.')
        path = Path(path)
        size = path.stat().st_size
        if not size:
            raise ValueError('The video file is empty.')
        if size > MAX_UPLOAD:
            raise ValueError('That video is larger than 20 GB.')
        with path.open('rb') as handle:
            head = handle.read(16)
        ext = video_ext(filename) or sniff_video(head)
        if not ext:
            raise ValueError('That file does not look like a video.')
        name = f'{uuid.uuid4()}.{ext}'
        path.replace(self.files / name)
        if film['source_ref']:
            (self.files / film['source_ref']).unlink(missing_ok=True)
        with self.connect() as db:
            db.execute('UPDATE films SET source_ref = ?, size_bytes = ?, updated_at = ? WHERE id = ?', (name, size, now_iso(), film_id))
        return self.get_film(film_id)

    def convert_to_mp4(self, film_id):
        """Optional: needs ffmpeg on this computer. Keeps the original until conversion succeeds."""
        import shutil
        import subprocess
        ffmpeg = shutil.which('ffmpeg')
        if not ffmpeg:
            raise ValueError("This video format can't play in the browser. Convert it to MP4 to watch it here (ffmpeg is not installed on this computer).")
        source = self.video_path(film_id)
        target = self.files / f'{uuid.uuid4()}.mp4'
        result = subprocess.run([ffmpeg, '-y', '-i', str(source), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', str(target)],
                                capture_output=True, timeout=3600)
        if result.returncode or not target.is_file():
            target.unlink(missing_ok=True)
            raise ValueError('The conversion failed. Try exporting the video as MP4.')
        with self.connect() as db:
            db.execute('UPDATE films SET source_ref = ?, size_bytes = ?, updated_at = ? WHERE id = ?', (target.name, target.stat().st_size, now_iso(), film_id))
        source.unlink(missing_ok=True)
        return self.get_film(film_id)

    def video_path(self, film_id):
        film = self.get_film(film_id)
        if film['source_type'] != 'upload' or not film['source_ref']:
            raise KeyError('This film has no uploaded video.')
        path = (self.files / film['source_ref']).resolve()
        if path.parent != self.files.resolve() or not path.is_file():
            raise KeyError('Video file not found.')
        return path

    # ---------- clips ----------
    def _clip_fields(self, raw, roster, partial=False):
        out = {}
        for key in ('start_s', 'end_s'):
            if not partial or key in raw:
                value = raw.get(key)
                if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 6 * 3600:
                    raise ValueError('Clip times must be seconds into the film.')
                out[key] = round(float(value), 2)
        checks = {'quarter': ('1', '2', '3', '4', 'OT'), 'hash': ('L', 'M', 'R')}
        # Open fields: suggestions only (short/medium/long, red zone, run/pass…); any short words are kept.
        for key in ('distance', 'field_zone', 'play_type'):
            if key in raw:
                value = clean(str(raw.get(key)) if raw.get(key) not in (None, '') else None, key.replace('_', ' ').capitalize(), 40)
                out[key] = value.lower() if value else None
        for key, allowed in checks.items():
            if key in raw:
                value = raw.get(key) or None
                if value is not None and str(value) not in allowed:
                    raise ValueError(f'Choose a valid {key.replace("_", " ")}.')
                out[key] = str(value) if value is not None else None
        if 'down' in raw:
            down = raw.get('down')
            if down not in (None, '', 1, 2, 3, 4):
                raise ValueError('Down is 1 to 4.')
            out['down'] = down or None
        for key, limit in (('label', 120), ('formation', 60), ('result', 120)):
            if key in raw or not partial:
                out[key] = clean(raw.get(key), key.capitalize(), limit)
        if 'tags' in raw:
            out['tags_json'] = json.dumps(clean_tags(raw['tags']))
        if 'player_ids' in raw:
            ids = raw.get('player_ids') or []
            if not isinstance(ids, list) or any(p not in roster for p in ids):
                raise ValueError('Choose players from the roster.')
            out['player_ids_json'] = json.dumps(list(dict.fromkeys(ids)))
        return out

    @staticmethod
    def _clip_row(row):
        clip = dict(row)
        clip['tags'] = json.loads(clip.pop('tags_json') or '[]')
        clip['player_ids'] = json.loads(clip.pop('player_ids_json') or '[]')
        return clip

    def create_clip(self, film_id, raw, roster):
        fields = self._clip_fields(raw, roster)
        if fields['end_s'] <= fields['start_s']:
            raise ValueError('The clip must end after it starts.')
        fields.setdefault('tags_json', '[]')
        fields.setdefault('player_ids_json', '[]')
        with self.connect() as db:
            self._film(db, film_id)
            cols = ', '.join(fields)
            cursor = db.execute(f'INSERT INTO clips (film_id, {cols}, created_at) VALUES (?, {", ".join("?" * len(fields))}, ?)', (film_id, *fields.values(), now_iso()))
            return self._clip_row(db.execute('SELECT * FROM clips WHERE id = ?', (cursor.lastrowid,)).fetchone())

    def update_clip(self, clip_id, raw, roster):
        fields = self._clip_fields(raw, roster, partial=True)
        with self.connect() as db:
            row = db.execute('SELECT * FROM clips WHERE id = ?', (clip_id,)).fetchone()
            if not row:
                raise KeyError('Clip not found.')
            merged = {**dict(row), **fields}
            if merged['end_s'] <= merged['start_s']:
                raise ValueError('The clip must end after it starts.')
            if fields:
                db.execute(f"UPDATE clips SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?", (*fields.values(), clip_id))
            return self._clip_row(db.execute('SELECT * FROM clips WHERE id = ?', (clip_id,)).fetchone())

    def delete_clip(self, clip_id):
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM clips WHERE id = ?', (clip_id,)).fetchone():
                raise KeyError('Clip not found.')
            for table in ('quick_grades', 'playlist_clips'):
                db.execute(f'DELETE FROM {table} WHERE clip_id = ?', (clip_id,))
            db.execute('UPDATE film_notes SET clip_id = NULL WHERE clip_id = ?', (clip_id,))
            db.execute('DELETE FROM clips WHERE id = ?', (clip_id,))

    def clips(self, film_id=None, filters=None):
        """Filters build an instant cut-up across films."""
        filters = filters or {}
        query, args = 'SELECT c.*, f.title AS film_title, f.film_date FROM clips c JOIN films f ON f.id = c.film_id WHERE 1 = 1', []
        if film_id is not None:
            query += ' AND c.film_id = ?'
            args.append(film_id)
        for key in ('quarter', 'hash'):
            if filters.get(key):
                query += f' AND c.{key} = ?'
                args.append(str(filters[key]))
        for key in ('distance', 'field_zone', 'play_type'):
            if filters.get(key):
                query += f' AND lower(c.{key}) = ?'
                args.append(str(filters[key]).strip().lower())
        if filters.get('down'):
            query += ' AND c.down = ?'
            args.append(int(filters['down']))
        with self.connect() as db:
            rows = [self._clip_row(r) for r in db.execute(query + ' ORDER BY f.film_date DESC, c.start_s', args).fetchall()]
            graded = {r[0] for r in db.execute('SELECT DISTINCT clip_id FROM quick_grades')}
        for clip in rows:
            clip['graded'] = clip['id'] in graded
        if filters.get('player_id'):
            rows = [c for c in rows if filters['player_id'] in c['player_ids']]
        if filters.get('position'):
            from .core import DEMO
            ids = {p['id'] for p in DEMO['players'] if p['position_group'] == filters['position']}
            rows = [c for c in rows if ids & set(c['player_ids'])]
        if filters.get('tag'):
            rows = [c for c in rows if filters['tag'].lower() in c['tags']]
        if filters.get('ungraded'):
            rows = [c for c in rows if not c['graded']]
        if filters.get('search'):
            words = filters['search'].lower()
            rows = [c for c in rows if words in f"{c['label'] or ''} {c['formation'] or ''} {c['result'] or ''} {' '.join(c['tags'])} {c['film_title']}".lower()]
        return rows

    # ---------- playlists ----------
    def playlists(self):
        with self.connect() as db:
            out = []
            for row in db.execute('SELECT * FROM playlists ORDER BY id DESC').fetchall():
                item = dict(row)
                item['filter'] = json.loads(item.pop('filter_json') or 'null')
                item['clip_ids'] = [r[0] for r in db.execute('SELECT clip_id FROM playlist_clips WHERE playlist_id = ? ORDER BY sort', (row['id'],))]
                out.append(item)
            return out

    def save_playlist(self, raw, playlist_id=None):
        title = clean(raw.get('title'), 'Title', 120, required=True)
        kind = raw.get('kind', 'cutup')
        if kind not in PLAYLIST_KINDS:
            raise ValueError('Kind is cut-up, teach list or good plays.')
        ids = raw.get('clip_ids') or []
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            raise ValueError('clip_ids must be numbers.')
        ids = list(dict.fromkeys(ids))
        if kind == 'teach' and len(ids) > TEACH_LIMIT:
            raise ValueError(f'A Teach list holds up to {TEACH_LIMIT} clips.')
        with self.connect() as db:
            known = {r[0] for r in db.execute(f"SELECT id FROM clips WHERE id IN ({','.join('?' * len(ids))})", ids)} if ids else set()
            if set(ids) - known:
                raise ValueError('A clip in this list no longer exists.')
            if playlist_id is None:
                playlist_id = db.execute('INSERT INTO playlists (title, kind, filter_json, created_at) VALUES (?, ?, ?, ?)',
                                         (title, kind, json.dumps(raw.get('filter')), now_iso())).lastrowid
            else:
                if not db.execute('SELECT 1 FROM playlists WHERE id = ?', (playlist_id,)).fetchone():
                    raise KeyError('Playlist not found.')
                db.execute('UPDATE playlists SET title = ?, kind = ?, filter_json = ? WHERE id = ?', (title, kind, json.dumps(raw.get('filter')), playlist_id))
                db.execute('DELETE FROM playlist_clips WHERE playlist_id = ?', (playlist_id,))
            db.executemany('INSERT INTO playlist_clips VALUES (?, ?, ?)', [(playlist_id, c, n) for n, c in enumerate(ids)])
        return next(p for p in self.playlists() if p['id'] == playlist_id)

    def delete_playlist(self, playlist_id):
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM playlists WHERE id = ?', (playlist_id,)).fetchone():
                raise KeyError('Playlist not found.')
            db.execute('DELETE FROM playlist_clips WHERE playlist_id = ?', (playlist_id,))
            db.execute('DELETE FROM playlists WHERE id = ?', (playlist_id,))

    # ---------- notes at a time ----------
    def _note_row(self, db, row):
        note = dict(row)
        note['tags'] = json.loads(note.pop('tags_json') or '[]')
        note['player_ids'] = [r[0] for r in db.execute('SELECT player_id FROM film_note_players WHERE film_note_id = ?', (row['id'],))]
        note['show_in_pack'] = bool(note['show_in_pack'])
        return note

    def _note_fields(self, raw, roster, partial=False):
        out = {}
        if not partial or 't_seconds' in raw:
            t = raw.get('t_seconds')
            if not isinstance(t, (int, float)) or isinstance(t, bool) or not 0 <= t <= 6 * 3600:
                raise ValueError('The note needs a time in the film.')
            out['t_seconds'] = round(float(t), 2)
        if not partial or 'text' in raw:
            out['text'] = clean(raw.get('text'), 'Note', 2000, required=True)
        if 'tags' in raw or not partial:
            out['tags_json'] = json.dumps(clean_tags(raw.get('tags') or []))
        if 'tone' in raw or not partial:
            tone = raw.get('tone') or None
            if tone is not None and tone not in TONES:
                raise ValueError('Tone is Praise, Improve or Observation.')
            out['tone'] = tone
        if 'show_in_pack' in raw or not partial:
            out['show_in_pack'] = int(bool(raw.get('show_in_pack')))
        if 'clip_id' in raw:
            out['clip_id'] = raw.get('clip_id') if isinstance(raw.get('clip_id'), int) else None
        players = None
        if 'player_ids' in raw or not partial:
            players = raw.get('player_ids') or []
            if not isinstance(players, list) or any(p not in roster for p in players):
                raise ValueError('Choose players from the roster.')
        return out, players

    def film_notes(self, film_id=None, player_id=None):
        query, args = 'SELECT n.*, f.title AS film_title, f.film_date, f.link_kind, f.source_ref AS film_ref FROM film_notes n JOIN films f ON f.id = n.film_id', []
        if film_id is not None:
            query += ' WHERE n.film_id = ?'
            args.append(film_id)
        with self.connect() as db:
            notes = [self._note_row(db, r) for r in db.execute(query + ' ORDER BY n.film_id, n.t_seconds', args).fetchall()]
        if player_id:
            notes = [n for n in notes if player_id in n['player_ids']]
        return notes

    def get_film_note(self, note_id):
        notes = [n for n in self.film_notes() if n['id'] == note_id]
        if not notes:
            raise KeyError('Film note not found.')
        return notes[0]

    def create_film_note(self, film_id, raw, roster):
        fields, players = self._note_fields(raw, roster)
        with self.connect() as db:
            self._film(db, film_id)
            cols = ', '.join(fields)
            note_id = db.execute(f'INSERT INTO film_notes (film_id, {cols}, created_at) VALUES (?, {", ".join("?" * len(fields))}, ?)',
                                 (film_id, *fields.values(), raw.get('created_at') if isinstance(raw.get('created_at'), str) and _is_iso(raw['created_at']) else now_iso())).lastrowid
            db.executemany('INSERT INTO film_note_players VALUES (?, ?)', [(note_id, p) for p in dict.fromkeys(players)])
        return self.get_film_note(note_id)

    def update_film_note(self, note_id, raw, roster):
        fields, players = self._note_fields(raw, roster, partial=True)
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM film_notes WHERE id = ?', (note_id,)).fetchone():
                raise KeyError('Film note not found.')
            if fields:
                db.execute(f"UPDATE film_notes SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?", (*fields.values(), note_id))
            if players is not None:
                db.execute('DELETE FROM film_note_players WHERE film_note_id = ?', (note_id,))
                db.executemany('INSERT INTO film_note_players VALUES (?, ?)', [(note_id, p) for p in dict.fromkeys(players)])
        return self.get_film_note(note_id)

    def delete_film_note(self, note_id):
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM film_notes WHERE id = ?', (note_id,)).fetchone():
                raise KeyError('Film note not found.')
            db.execute('DELETE FROM film_note_players WHERE film_note_id = ?', (note_id,))
            db.execute('DELETE FROM film_notes WHERE id = ?', (note_id,))

    # ---------- quick grade ----------
    def set_grade(self, clip_id, player_id, raw, roster):
        if player_id not in roster:
            raise ValueError('Choose a player from the roster.')
        if raw.get('result') not in GRADE_RESULTS:
            raise ValueError('Grade is ✓ did the job, ✗ missed, or ✗* critical.')
        marks = {}
        for key in ('technique', 'effort'):
            value = raw.get(key)
            if value not in (None, 0, 1, True, False):
                raise ValueError(f'{key.capitalize()} is + or −.')
            marks[key] = None if value is None else int(bool(value))
        reason = clean(raw.get('reason'), 'Reason', 140)
        with self.connect() as db:
            if not db.execute('SELECT 1 FROM clips WHERE id = ?', (clip_id,)).fetchone():
                raise KeyError('Clip not found.')
            db.execute('INSERT INTO quick_grades (clip_id, player_id, result, technique, effort, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) '
                       'ON CONFLICT(clip_id, player_id) DO UPDATE SET result = excluded.result, technique = excluded.technique, effort = excluded.effort, reason = excluded.reason',
                       (clip_id, player_id, raw['result'], marks['technique'], marks['effort'], reason, now_iso()))
        return self.grades(clip_id=clip_id)

    def bulk_grade(self, clip_id, player_ids, roster, keep_existing=True):
        with self.connect() as db:
            row = db.execute('SELECT player_ids_json FROM clips WHERE id = ?', (clip_id,)).fetchone()
            if not row:
                raise KeyError('Clip not found.')
            existing = {r[0] for r in db.execute('SELECT player_id FROM quick_grades WHERE clip_id = ?', (clip_id,))}
        targets = player_ids or json.loads(row[0] or '[]')
        if not targets:
            raise ValueError('Tag players in this clip first.')
        for player_id in targets:
            if keep_existing and player_id in existing:
                continue
            self.set_grade(clip_id, player_id, {'result': 'won'}, roster)
        return self.grades(clip_id=clip_id)

    def delete_grade(self, clip_id, player_id):
        with self.connect() as db:
            db.execute('DELETE FROM quick_grades WHERE clip_id = ? AND player_id = ?', (clip_id, player_id))

    def grades(self, clip_id=None, film_id=None, player_id=None):
        query, args = 'SELECT q.*, c.film_id FROM quick_grades q JOIN clips c ON c.id = q.clip_id WHERE 1 = 1', []
        for key, value in (('q.clip_id', clip_id), ('c.film_id', film_id), ('q.player_id', player_id)):
            if value is not None:
                query += f' AND {key} = ?'
                args.append(value)
        with self.connect() as db:
            return [dict(r) for r in db.execute(query + ' ORDER BY q.clip_id, q.player_id', args)]

    def film_summary(self, film_id):
        rows = self.grades(film_id=film_id)
        by_player = {}
        for r in rows:
            by_player.setdefault(r['player_id'], []).append(r)
        with self.connect() as db:
            written = {r['player_id']: dict(r) for r in db.execute('SELECT * FROM film_summaries WHERE film_id = ?', (film_id,))}
        return {p: {**grade_summary(g), 'written': written.get(p)} for p, g in by_player.items()} | \
               {p: {**grade_summary([]), 'written': w} for p, w in written.items() if p not in by_player}

    def player_film_summary(self, player_id):
        rows = self.grades(player_id=player_id)
        films = {}
        for r in rows:
            films.setdefault(r['film_id'], []).append(r)
        return {'overall': grade_summary(rows), 'films': {f: grade_summary(g) for f, g in films.items()}}

    def save_written_summary(self, film_id, player_id, raw, roster):
        if player_id not in roster:
            raise ValueError('Choose a player from the roster.')
        fields = {k: clean(raw.get(k), k.replace('_', ' ').capitalize(), 2000) for k in ('coaching_points', 'work_on', 'summary')}
        with self.connect() as db:
            self._film(db, film_id)
            db.execute('INSERT OR REPLACE INTO film_summaries VALUES (?, ?, ?, ?, ?, ?)', (film_id, player_id, *fields.values(), now_iso()))
        return fields

    # ---------- diagrams ----------
    def _diagram(self, db, diagram_id):
        row = db.execute('SELECT * FROM play_diagrams WHERE id = ?', (diagram_id,)).fetchone()
        if not row:
            raise KeyError('Drawing not found.')
        d = dict(row)
        d['objects'] = json.loads(d.pop('objects_json'))
        d['tags'] = json.loads(d.pop('tags_json') or '[]')
        d['player_ids'] = [r[0] for r in db.execute('SELECT player_id FROM diagram_players WHERE diagram_id = ?', (diagram_id,))]
        d['has_preview'] = bool(d.pop('preview_png_path'))
        d['has_background'] = bool(d.pop('background_path'))
        return d

    def list_diagrams(self, meeting_id=None, film_id=None, note_id=None, player_id=None):
        query, args = 'SELECT id FROM play_diagrams WHERE 1 = 1', []
        for key, value in (('meeting_id', meeting_id), ('film_id', film_id), ('note_id', note_id)):
            if value is not None:
                query += f' AND {key} = ?'
                args.append(value)
        with self.connect() as db:
            items = [self._diagram(db, r[0]) for r in db.execute(query + ' ORDER BY updated_at DESC, id DESC', args).fetchall()]
        if player_id:
            items = [d for d in items if player_id in d['player_ids'] or any(o.get('player_id') == player_id for o in d['objects'])]
        return items

    def get_diagram(self, diagram_id):
        with self.connect() as db:
            return self._diagram(db, diagram_id)

    def _save_png(self, data_url, folder):
        mime, raw = parse_data_url(data_url)
        target = self.files / folder
        target.mkdir(parents=True, exist_ok=True)
        name = f"{folder}/{uuid.uuid4().hex}.{'png' if mime == 'image/png' else 'jpg'}"
        (self.files / name).write_bytes(raw)
        return name

    def save_diagram(self, raw, roster, meetings_ids, diagram_id=None):
        if not isinstance(raw, dict):
            raise ValueError('Drawing must be an object.')
        template = raw.get('template', 'play')
        objects = validate_objects(raw.get('objects', []), template)
        fields = {'title': clean(raw.get('title'), 'Name', 120) or 'Untitled play', 'template': template, 'schema_version': 1,
                  'objects_json': json.dumps(objects), 'remember': clean(raw.get('remember'), 'What to remember', 2000),
                  'alt_text': clean(raw.get('alt_text'), 'Alt text', 500), 'tags_json': json.dumps(clean_tags(raw.get('tags') or []))}
        meeting_id = raw.get('meeting_id') or None
        if meeting_id is not None and meeting_id not in meetings_ids:
            raise ValueError('That meeting does not exist.')
        fields['meeting_id'] = meeting_id
        note_id = raw.get('note_id')
        fields['note_id'] = note_id if isinstance(note_id, int) else None
        film_id = raw.get('film_id')
        if film_id is not None:
            self.get_film(film_id)
        fields['film_id'] = film_id
        t = raw.get('t_seconds')
        fields['t_seconds'] = round(float(t), 2) if isinstance(t, (int, float)) and not isinstance(t, bool) and t >= 0 else None
        players = raw.get('player_ids') or []
        if not isinstance(players, list) or any(p not in roster for p in players):
            raise ValueError('Choose players from the roster.')
        if raw.get('preview'):
            fields['preview_png_path'] = self._save_png(raw['preview'], 'previews')
        if raw.get('background') and template == 'frame':
            fields['background_path'] = self._save_png(raw['background'], 'frames')
        stamp = now_iso()
        with self.connect() as db:
            if diagram_id is None:
                cols = ', '.join(fields)
                diagram_id = db.execute(f'INSERT INTO play_diagrams ({cols}, created_at, updated_at) VALUES ({", ".join("?" * len(fields))}, ?, ?)',
                                        (*fields.values(), stamp, stamp)).lastrowid
            else:
                current = db.execute('SELECT updated_at FROM play_diagrams WHERE id = ?', (diagram_id,)).fetchone()
                if not current:
                    raise KeyError('Drawing not found.')
                if raw.get('base_updated_at') and raw['base_updated_at'] != current[0]:
                    raise ConflictError('This drawing was changed in another tab. Reload it before saving.')
                db.execute(f"UPDATE play_diagrams SET {', '.join(f'{k} = ?' for k in fields)}, updated_at = ? WHERE id = ?", (*fields.values(), stamp, diagram_id))
            db.execute('DELETE FROM diagram_players WHERE diagram_id = ?', (diagram_id,))
            db.executemany('INSERT INTO diagram_players VALUES (?, ?)', [(diagram_id, p) for p in dict.fromkeys(players)])
            return self._diagram(db, diagram_id)

    def diagram_file(self, diagram_id, kind):
        column = 'preview_png_path' if kind == 'preview' else 'background_path'
        with self.connect() as db:
            row = db.execute(f'SELECT {column} FROM play_diagrams WHERE id = ?', (diagram_id,)).fetchone()
        if not row or not row[0]:
            raise KeyError('Image not found.')
        path = (self.files / row[0]).resolve()
        if self.files.resolve() not in path.parents or not path.is_file():
            raise KeyError('Image not found.')
        return path

    def delete_diagram(self, diagram_id):
        with self.connect() as db:
            self._diagram(db, diagram_id)
            db.execute('DELETE FROM diagram_players WHERE diagram_id = ?', (diagram_id,))
            db.execute('DELETE FROM play_diagrams WHERE id = ?', (diagram_id,))

    # ---------- skill checks ----------
    def position_skills(self, position):
        with self.connect() as db:
            return [r[0] for r in db.execute('SELECT skill FROM position_skills WHERE position = ? ORDER BY sort', (position,))]

    def set_position_skills(self, position, skills):
        if position not in DEFAULT_SKILLS:
            raise ValueError('Unknown position room.')
        names = [clean(s, 'Skill', 60, required=True) for s in skills] if isinstance(skills, list) else None
        if not names or len(names) > 8:
            raise ValueError('List 1 to 8 skills.')
        with self.connect() as db:
            db.execute('DELETE FROM position_skills WHERE position = ?', (position,))
            db.executemany('INSERT OR IGNORE INTO position_skills VALUES (?, ?, ?)', [(position, s, n) for n, s in enumerate(names)])
        return self.position_skills(position)

    def add_skill_check(self, player_id, raw, roster):
        if player_id not in roster:
            raise KeyError('Player not found.')
        skill = clean(raw.get('skill'), 'Skill', 60, required=True)
        score = raw.get('score')
        if not isinstance(score, int) or isinstance(score, bool) or not 1 <= score <= 5:
            raise ValueError('Score is 1 to 5.')
        why = clean(raw.get('why'), 'Why', 500, required=True)
        kind = raw.get('source_kind') or 'practice'
        if kind not in ('film', 'meeting', 'practice', 'game'):
            raise ValueError('From is film, meeting, practice or game.')
        day = raw.get('check_date') or date.today().isoformat()
        date.fromisoformat(day)
        with self.connect() as db:
            db.execute('INSERT INTO skill_checks (player_id, skill, score, why, source_kind, source_ref, check_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                       (player_id, skill, score, why, kind, clean(raw.get('source_ref'), 'From', 120), day, now_iso()))
        return self.skill_checks(player_id)

    def skill_checks(self, player_id):
        with self.connect() as db:
            rows = [dict(r) for r in db.execute('SELECT * FROM skill_checks WHERE player_id = ? ORDER BY check_date, id', (player_id,))]
        skills = {}
        for r in rows:
            skills.setdefault(r['skill'], []).append(r)
        return {'checks': rows, 'skills': {s: {'latest': c[-1], 'history': [{'date': x['check_date'], 'score': x['score']} for x in c],
                                               **skill_trend([x['score'] for x in c])} for s, c in skills.items()}, 'scale': SCALE}

    def delete_skill_check(self, check_id):
        with self.connect() as db:
            if not db.execute('DELETE FROM skill_checks WHERE id = ?', (check_id,)).rowcount:
                raise KeyError('Skill check not found.')

    # ---------- film packs ----------
    def create_pack(self, raw, roster, rooms):
        if not isinstance(raw, dict):
            raise ValueError('Pack must be an object.')
        title = clean(raw.get('title'), 'Title', 120, required=True)
        kind = raw.get('audience_kind')
        ref = raw.get('audience_ref')
        if kind == 'player' and ref not in roster or kind == 'room' and ref not in rooms or kind not in ('player', 'room'):
            raise ValueError('Choose one player or one position room.')
        clip_ids = [i for i in raw.get('clip_ids') or [] if isinstance(i, int)][:15]
        good_ids = [i for i in raw.get('good_clip_ids') or [] if isinstance(i, int)][:8]
        note_ids = [i for i in raw.get('note_ids') or [] if isinstance(i, int)][:20]
        diagram_ids = [i for i in raw.get('diagram_ids') or [] if isinstance(i, int)][:3]
        questions = [clean(q, 'Question', 300) for q in raw.get('questions') or [] if isinstance(q, str) and q.strip()][:3]
        homework = [clean(h, 'Homework', 300) for h in raw.get('homework') or [] if isinstance(h, str) and h.strip()][:5]
        notes = [self.get_film_note(n) for n in note_ids]
        blocked = [n for n in notes if not n['show_in_pack'] or SENSITIVE_WORDS.search(n['text'] + ' ' + ' '.join(n['tags']))]
        if blocked:
            raise ValueError('Some notes are private (health, insurance or not marked "Show in film pack") and cannot go in a pack.')
        for d in diagram_ids:
            self.get_diagram(d)
        known = {c['id'] for c in self.clips()}
        if set(clip_ids + good_ids) - known:
            raise ValueError('A clip in this pack no longer exists.')
        due = raw.get('due_date') or None
        if due:
            date.fromisoformat(due)
        token = secrets.token_urlsafe(24)
        items = {'clip_ids': clip_ids, 'good_clip_ids': good_ids, 'note_ids': note_ids, 'diagram_ids': diagram_ids, 'questions': questions, 'homework': homework}
        expires = (datetime.now() + timedelta(days=14)).replace(microsecond=0).isoformat()
        with self.connect() as db:
            pack_id = db.execute('INSERT INTO film_packs (token, title, audience_kind, audience_ref, items_json, include_scores, due_date, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                 (token, title, kind, ref, json.dumps(items), int(bool(raw.get('include_scores'))), due, expires, now_iso())).lastrowid
        return self.get_pack(pack_id)

    def list_packs(self):
        with self.connect() as db:
            return [self._pack(dict(r)) for r in db.execute('SELECT * FROM film_packs ORDER BY id DESC')]

    def get_pack(self, pack_id):
        with self.connect() as db:
            row = db.execute('SELECT * FROM film_packs WHERE id = ?', (pack_id,)).fetchone()
        if not row:
            raise KeyError('Film pack not found.')
        return self._pack(dict(row))

    @staticmethod
    def _pack(row):
        row['items'] = json.loads(row.pop('items_json'))
        now = now_iso()
        row['state'] = 'revoked' if row['revoked_at'] else 'expired' if row['expires_at'] < now else 'ready'
        return row

    def revoke_pack(self, pack_id):
        with self.connect() as db:
            if not db.execute('UPDATE film_packs SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', (now_iso(), pack_id)).rowcount:
                raise KeyError('Film pack not found or already closed.')
        return self.get_pack(pack_id)

    def open_pack(self, token, players):
        """Player view. Expired or revoked → KeyError (404). Records opened time."""
        if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{20,64}', token):
            raise KeyError('Film pack not found.')
        with self.connect() as db:
            row = db.execute('SELECT * FROM film_packs WHERE token = ?', (token,)).fetchone()
            if not row or row['revoked_at'] or row['expires_at'] < now_iso():
                raise KeyError('This film pack was closed or has expired. Ask your coach for a new link.')
            stamp = now_iso()
            db.execute('UPDATE film_packs SET first_opened_at = COALESCE(first_opened_at, ?), last_opened_at = ? WHERE id = ?', (stamp, stamp, row['id']))
        pack = self._pack(dict(row))
        items = pack['items']
        names = {p['id']: p for p in players}
        all_clips = {c['id']: c for c in self.clips()}
        films = {}

        def film_info(film_id):
            if film_id not in films:
                f = self.get_film(film_id)
                films[film_id] = {'id': f['id'], 'title': f['title'], 'film_date': f['film_date'], 'source_type': f['source_type'], 'link_kind': f['link_kind'],
                                  'embed_id': f['embed_id'], 'link': f['source_ref'] if f['source_type'] == 'link' else None, 'playable': f['playable']}
            return films[film_id]
        clip_view = lambda c: {k: c[k] for k in ('id', 'film_id', 'start_s', 'end_s', 'label', 'down', 'distance', 'play_type', 'formation')} | {'film': film_info(c['film_id'])}
        notes = [self.get_film_note(n) for n in items['note_ids']]
        safe_notes = [{'t_seconds': n['t_seconds'], 'text': n['text'], 'film': film_info(n['film_id']), 'clip_id': n['clip_id'], 'tone': n['tone']}
                      for n in notes if n['show_in_pack'] and not SENSITIVE_WORDS.search(n['text'] + ' ' + ' '.join(n['tags']))]
        diagrams = []
        for d in items['diagram_ids']:
            try:
                g = self.get_diagram(d)
                diagrams.append({'id': g['id'], 'title': g['title'], 'remember': g['remember'], 'alt_text': g['alt_text'], 'has_preview': g['has_preview']})
            except KeyError:
                continue
        audience = names[pack['audience_ref']]['name'] if pack['audience_kind'] == 'player' and pack['audience_ref'] in names else f"{pack['audience_ref']} room"
        view = {'title': pack['title'], 'audience': audience, 'due_date': pack['due_date'], 'expires_at': pack['expires_at'], 'watched_at': pack['watched_at'],
                'clips': [clip_view(all_clips[c]) for c in items['clip_ids'] if c in all_clips],
                'good_plays': [clip_view(all_clips[c]) for c in items['good_clip_ids'] if c in all_clips],
                'notes': safe_notes, 'diagrams': diagrams, 'questions': items['questions'], 'homework': items['homework']}
        if pack['include_scores'] and pack['audience_kind'] == 'player':
            view['film_grade'] = self.player_film_summary(pack['audience_ref'])['overall']
        return view

    def pack_watched(self, token):
        with self.connect() as db:
            row = db.execute('SELECT id, revoked_at, expires_at FROM film_packs WHERE token = ?', (token,)).fetchone()
            if not row or row['revoked_at'] or row['expires_at'] < now_iso():
                raise KeyError('This film pack was closed or has expired.')
            db.execute('UPDATE film_packs SET watched_at = ? WHERE id = ?', (now_iso(), row['id']))

    def pack_diagram_ok(self, token, diagram_id):
        with self.connect() as db:
            row = db.execute('SELECT items_json, revoked_at, expires_at FROM film_packs WHERE token = ?', (token,)).fetchone()
        return bool(row) and not row['revoked_at'] and row['expires_at'] >= now_iso() and diagram_id in json.loads(row['items_json'])['diagram_ids']


class ConflictError(Exception):
    pass


def clean_tags(tags):
    if not isinstance(tags, list):
        raise ValueError('Tags must be a list.')
    out = []
    for tag in tags[:10]:
        value = clean(tag, 'Tag', 40)
        if value:
            value = re.sub(r'\s+', ' ', value.lower())
            if value not in out:
                out.append(value)
    return out


def _is_iso(value):
    try:
        datetime.fromisoformat(value)
        return True
    except ValueError:
        return False


def next_game(occurrences, now, homework_rows=None, films=None, player_id=None):
    """Next Game event from the schedule with what is due before kickoff (code-computed)."""
    games = [e for e in occurrences if e['type'] == 'game' and datetime.fromisoformat(e['start_at']) >= now - timedelta(hours=3)]
    if not games:
        return None
    game = games[0]
    kickoff = datetime.fromisoformat(game['start_at'])
    title = game['title']
    match = re.search(r'\b(vs\.?|at|@)\s+(.+)$', title)
    opponent = match.group(2).strip() if match else title.replace('Game day', '').strip(' ·-') or None
    home_away = 'away' if match and match.group(1) in ('at', '@') else 'home' if match else None
    due = [r for r in (homework_rows or []) if not r['completed'] and r['due_date'] and r['due_date'] <= kickoff.date().isoformat()
           and (player_id is None or r['player_id'] == player_id)]
    film_todo = [f for f in (films or []) if f['status'] != 'done' and f.get('assigned_to')]
    one_on_one = next((e for e in occurrences if e.get('type') == 'meeting' and (e.get('audience') or '').startswith('player:') and datetime.fromisoformat(e['start_at']) >= now
                       and (player_id is None or e['audience'] == f'player:{player_id}')), None)
    days = (kickoff.date() - now.date()).days
    return {'event': game, 'opponent': opponent, 'home_away': home_away, 'kickoff': game['start_at'], 'days_left': days,
            'when': 'Today' if days == 0 else 'Tomorrow' if days == 1 else f'In {days} days',
            'homework_due': due[:10], 'homework_due_count': len(due), 'film_to_break_down': [{'id': f['id'], 'title': f['title'], 'assigned_to': f['assigned_to'], 'status': f['status']} for f in film_todo][:5],
            'next_one_on_one': one_on_one}
