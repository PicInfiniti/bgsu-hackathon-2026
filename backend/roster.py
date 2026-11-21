"""Editable roster. The synthetic players in data/demo.json are the starting point; the
players table stores added players and edits (same player id), so meetings, homework,
film notes and drawings stay linked. Players are never deleted, only marked inactive."""
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import date

from . import core
from .core import DEMO
from .notebook import now_iso, parse_data_url

GROUPS = ('QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST')
POSITIONS = {'QB': 'Quarterback', 'RB': 'Running back', 'FB': 'Fullback', 'WR': 'Wide receiver', 'TE': 'Tight end', 'OL': 'Offensive line', 'LT': 'Left tackle',
             'LG': 'Left guard', 'C': 'Center', 'RG': 'Right guard', 'RT': 'Right tackle', 'DL': 'Defensive line', 'DE': 'Defensive end', 'DT': 'Defensive tackle',
             'NT': 'Nose tackle', 'LB': 'Linebacker', 'MLB': 'Middle linebacker', 'OLB': 'Outside linebacker', 'DB': 'Defensive back', 'CB': 'Cornerback',
             'S': 'Safety', 'FS': 'Free safety', 'SS': 'Strong safety', 'K': 'Kicker', 'P': 'Punter', 'LS': 'Long snapper', 'KR': 'Kick returner'}
CLASS_YEARS = ('Freshman', 'Redshirt freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate')
EXTRA = ('class_year', 'height', 'weight')
_listeners = []


def on_change(fn):
    """Other modules keep id/room sets; they register here so the sets stay in step."""
    _listeners.append(fn)


def default_season(today=None):
    today = today or date.today()
    return str(today.year if today.month >= 8 else today.year - 1)


class Roster:
    def __init__(self, path):
        self.path = str(path)
        pack = json.loads((core.ROOT / 'data/demo.json').read_text(encoding='utf-8'))
        self.base = {p['id']: p for p in pack['players']}  # the synthetic pack, before edits
        with self.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, number INTEGER,
                          position TEXT, position_group TEXT, nickname TEXT, photo TEXT, season TEXT, active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT)''')
            cols = {r[1] for r in db.execute('PRAGMA table_info(players)')}
            for col in EXTRA:
                if col not in cols:
                    db.execute(f'ALTER TABLE players ADD COLUMN {col} TEXT')
        self.apply()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def rows(self):
        with self.connect() as db:
            return {r['id']: dict(r) for r in db.execute('SELECT * FROM players')}

    def apply(self):
        """Rebuild the shared roster list in place (every module holds this same list)."""
        rows = self.rows()
        merged = []
        for pid, base in self.base.items():
            merged.append(self._merge(base, rows.get(pid)))
        for pid, row in rows.items():
            if pid not in self.base:
                merged.append(self._merge({'id': pid}, row))
        DEMO['players'][:] = merged
        core.PLAYERS.clear()
        core.PLAYERS.update(p['id'] for p in merged)
        for fn in _listeners:
            fn(merged)
        return merged

    @staticmethod
    def _merge(base, row):
        if not row:
            return dict(base)  # unedited synthetic player: exactly as in data/demo.json (missing 'active' means active)
        p = {'class_year': None, 'height': None, 'weight': None, **base, 'active': True, 'season': base.get('season') or default_season(), 'photo': None}
        if row:
            p.update(name=f"{row['first_name']} {row['last_name']}".strip(), number=row['number'], position=row['position'],
                     position_label=POSITIONS.get(row['position'], row['position']), position_group=row['position_group'],
                     nickname=row['nickname'] or base.get('nickname'), photo=row['photo'], season=row['season'] or p['season'], active=bool(row['active']),
                     **{k: row.get(k) for k in EXTRA})
        return p

    def list(self):
        return [dict(p) for p in DEMO['players']]

    def _validate(self, raw, current=None):
        if not isinstance(raw, dict):
            raise ValueError('Player must be an object.')
        out = {}
        first = (raw.get('first_name', current and current['name'].split()[0]) or '').strip()
        last = (raw.get('last_name', current and ' '.join(current['name'].split()[1:])) or '').strip()
        if not first or not last or len(first) > 40 or len(last) > 60 or not re.fullmatch(r"[A-Za-zÀ-ÿ' .-]+", f'{first} {last}'):
            raise ValueError('Enter a first and last name (letters only).')
        out['first_name'], out['last_name'] = first, last
        number = raw.get('number', current and current['number'])
        if isinstance(number, str) and number.strip().isdigit():
            number = int(number)
        if not isinstance(number, int) or isinstance(number, bool) or not 0 <= number <= 99:
            raise ValueError('Jersey number must be 0 to 99.')
        out['number'] = number
        position = (raw.get('position', current and current['position']) or '').strip().upper()
        if position not in POSITIONS:
            raise ValueError('Choose a position (QB, RB, WR, TE, OL, DL, LB, DB, K, P…).')
        out['position'] = position
        group = (raw.get('position_group', current and current['position_group']) or '').strip().upper()
        if group not in GROUPS:
            raise ValueError('Choose a position room: QB, RB, WR, TE, OL, DL, LB, DB or ST.')
        out['position_group'] = group
        season = str(raw.get('season', current and current.get('season')) or default_season()).strip()
        if not re.fullmatch(r'\d{4}', season):
            raise ValueError('Season is a year, like 2026.')
        out['season'] = season
        nickname = raw.get('nickname', current and current.get('nickname'))
        out['nickname'] = (nickname or '').strip()[:20] or None
        photo = raw.get('photo', current and current.get('photo'))
        if photo:
            parse_data_url(photo)
            if len(photo) > 400_000:
                raise ValueError('Use a smaller photo.')
        out['photo'] = photo or None
        class_year = raw.get('class_year', current and current.get('class_year')) or None
        if class_year is not None and class_year not in CLASS_YEARS:
            raise ValueError('Choose a class year: ' + ', '.join(CLASS_YEARS) + '.')
        out['class_year'] = class_year
        height = (raw.get('height', current and current.get('height')) or '').strip() or None
        if height is not None:
            m = re.fullmatch(r"(\d)\s*['’]\s*(\d{1,2})\s*(\"|”|'')?", height)
            if not m or not 4 <= int(m[1]) <= 7 or int(m[2]) > 11:
                raise ValueError("Height looks like 6'1 (feet'inches).")
            height = f"{m[1]}'{m[2]}" + '"'
        out['height'] = height
        weight = raw.get('weight', current and current.get('weight'))
        if weight in ('', None):
            weight = None
        else:
            weight = str(weight).strip().removesuffix('lb').strip()
            if not weight.isdigit() or not 100 <= int(weight) <= 450:
                raise ValueError('Weight is pounds, 100 to 450.')
        out['weight'] = weight
        active = raw.get('active', current.get('active', True) if current else True)
        if active not in (True, False):
            raise ValueError('Active must be true or false.')
        out['active'] = int(active)
        return out

    def warnings(self, fields, player_id=None):
        dup = [p for p in DEMO['players'] if p['id'] != player_id and p.get('active', True) and p['number'] == fields['number']
               and (p.get('season') or default_season()) == fields['season']]
        return [f"#{fields['number']} is also worn by {p['name']} this season." for p in dup]

    def create(self, raw):
        fields = self._validate(raw)
        used = {int(p['id'][1:]) for p in DEMO['players'] if re.fullmatch(r'p\d{2}', p['id'])}
        free = next((n for n in range(1, 100) if n not in used), None)
        if free is None:
            raise ValueError('The roster is full (99 players).')
        pid = f'p{free:02d}'
        stamp = now_iso()
        with self.connect() as db:
            self._write(db, pid, fields, stamp)
        self.apply()
        return self.get(pid), self.warnings(fields, pid)

    def get(self, pid):
        p = next((p for p in DEMO['players'] if p['id'] == pid), None)
        if not p:
            raise KeyError('Player not found.')
        return dict(p)

    def update(self, pid, raw):
        current = self.get(pid)
        fields = self._validate({k: v for k, v in raw.items()}, current)
        stamp = now_iso()
        with self.connect() as db:
            self._write(db, pid, fields, stamp)
        self.apply()
        return self.get(pid), self.warnings(fields, pid)

    @staticmethod
    def _write(db, pid, fields, stamp):
        cols = list(fields)
        db.execute(f"INSERT INTO players (id, {', '.join(cols)}, created_at, updated_at) VALUES ({', '.join('?' * (len(cols) + 3))}) "
                   f"ON CONFLICT(id) DO UPDATE SET {', '.join(f'{c}=excluded.{c}' for c in cols)}, updated_at=excluded.updated_at",
                   (pid, *fields.values(), stamp, stamp))

    def next_season(self, pid):
        """Roll a player over to the next season. Same player id, so every old note stays linked."""
        current = self.get(pid)
        return self.update(pid, {'season': str(int(current.get('season') or default_season()) + 1)})

