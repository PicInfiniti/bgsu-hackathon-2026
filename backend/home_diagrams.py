"""Only the Playboard storage/validation dependency from the redesign Home."""
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime,timedelta
from pathlib import Path
from .home_notebook import parse_data_url,now_iso
TEMPLATES={'play':(53.33,30.0),'field':(120.0,53.33),'frame':(100.0,56.25),'blank':(100.0,56.25)}
OBJECT_TYPES=('pen','arrow','line','marker','text','highlight','scrimmage','first_down')
COLOR=re.compile(r'^#[0-9A-Fa-f]{6}$')
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

class FilmRoom:
    def __init__(self,db_path,files_dir):
        self.path=str(db_path);self.files=Path(files_dir)
        with self.connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS play_diagrams (id INTEGER PRIMARY KEY,title TEXT NOT NULL,template TEXT,schema_version INTEGER,objects_json TEXT NOT NULL,
              preview_png_path TEXT,background_path TEXT,meeting_id TEXT,note_id INTEGER,film_id INTEGER,t_seconds REAL,remember TEXT,alt_text TEXT,tags_json TEXT DEFAULT '[]',created_at TEXT,updated_at TEXT);
            CREATE TABLE IF NOT EXISTS diagram_players (diagram_id INTEGER,player_id TEXT,PRIMARY KEY(diagram_id,player_id));
            """)
    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

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
            raise ValueError('This Playboard is linked to notebook notes, not film uploads.')
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
            if fields['note_id'] is not None and not db.execute('SELECT 1 FROM notes WHERE id=?',(fields['note_id'],)).fetchone():
                raise ValueError('Notebook note not found.')
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
