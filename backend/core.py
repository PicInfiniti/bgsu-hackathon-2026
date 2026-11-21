"""Validation and persistence, testable without third-party packages."""
import copy
import json
import sqlite3
import uuid
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO = json.loads((ROOT / 'data/demo.json').read_text())
PLAYERS = {p['id'] for p in DEMO['players']}


def text(value, name, limit=2000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'{name} must contain 1–{limit} characters.')
    return value.strip()


def valid_date(value):
    if not isinstance(value, str) or len(value) != 10:
        raise ValueError('Use dates in YYYY-MM-DD format.')
    date.fromisoformat(value)
    return value


def validate_meeting(raw, require_items=False, historical=False):
    if not isinstance(raw, dict):
        raise ValueError('Meeting must be an object.')
    result = {key: text(raw.get(key), key, limit) for key, limit in [('title', 160), ('note', 12000)]}
    result['date'] = valid_date(raw.get('date'))
    result['meeting_type'] = raw.get('meeting_type')
    if result['meeting_type'] not in ('individual', 'group', 'team'):
        raise ValueError('Choose individual, group, or team.')
    attendees = raw.get('attendees')
    if not isinstance(attendees, list) or not attendees or any(not isinstance(p, str) or p not in PLAYERS for p in attendees):
        raise ValueError('Choose attendees from the synthetic roster.')
    if len(set(attendees)) != len(attendees):
        raise ValueError('Attendees must be unique.')
    if result['meeting_type'] == 'individual' and len(attendees) != 1:
        raise ValueError('Individual meetings require exactly one attendee.')
    if result['meeting_type'] == 'group' and len(attendees) < 2:
        raise ValueError('Group meetings require at least two attendees.')
    if result['meeting_type'] == 'team' and not historical and set(attendees) != PLAYERS:
        raise ValueError('Team meetings require the full demo roster.')
    result['attendees'] = attendees
    if require_items:
        if raw.get('approved') is not True:
            raise ValueError('Review and approve the extraction before saving.')
        items = raw.get('items')
        if not isinstance(items, list) or not 1 <= len(items) <= 80:
            raise ValueError('Save between 1 and 80 reviewed items.')
        result['items'] = [validate_item(x, result) for x in items]
        result['approved'] = True
        result['origin'] = raw.get('origin') if raw.get('origin') in ('demo', 'aivana') else 'manual'
    return result


def validate_item(raw, meeting):
    if not isinstance(raw, dict) or raw.get('player_id') not in meeting['attendees']:
        raise ValueError('Each item must belong to a meeting attendee.')
    if raw.get('kind') not in ('action', 'praise', 'improvement'):
        raise ValueError('Unknown item kind.')
    item = {k: raw[k] for k in ('player_id', 'kind')}
    for key, limit in [('text', 1000), ('skill', 100), ('quote', 2000)]:
        item[key] = text(raw.get(key), key, limit)
    if item['quote'] not in meeting['note']:
        raise ValueError('Every source quote must appear verbatim in the meeting note.')
    due = raw.get('due_date')
    item['due_date'] = valid_date(due) if due else None
    if item['kind'] != 'action' and item['due_date']:
        raise ValueError('Only action items can have a due date.')
    item.update(id=str(uuid.uuid4()), completed=False)
    return item


def demo_extract(meeting):
    for sample in DEMO['samples']:
        if sample['date'] == meeting['date'] and sample['note'] == meeting['note'] and sample['meeting_type'] == meeting['meeting_type'] and set(sample['attendees']) == set(meeting['attendees']):
            return copy.deepcopy(sample['items'])
    raise ValueError('Demo extraction requires unchanged sample notes, date, type, and attendees. Load a sample or use Aivana mode.')


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, body TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.path)

    def list(self):
        with self.connect() as db:
            meetings = [json.loads(row[0]) for row in db.execute('SELECT body FROM meetings')]
        return sorted(meetings, key=lambda m: (m['date'], m['id']), reverse=True)

    def save(self, raw):
        meeting = validate_meeting(raw, require_items=True)
        meeting['id'] = str(uuid.uuid4())
        with self.connect() as db:
            db.execute('INSERT INTO meetings VALUES (?, ?)', (meeting['id'], json.dumps(meeting)))
        return meeting

    def import_reviewed(self, records):
        """Preserve approved browser history, IDs and statuses; SQLite wins conflicts."""
        if not isinstance(records, list) or len(records) > 500:
            raise ValueError('Import up to 500 reviewed meetings at a time.')
        restored = []
        for raw in records:
            meeting = validate_meeting(raw, require_items=True, historical=True)
            if meeting['origin'] != 'demo':
                raise ValueError('Browser migration accepts reviewed demo records only.')
            meeting['id'] = text(raw.get('id'), 'meeting id', 100)
            item_ids = set()
            for item, original in zip(meeting['items'], raw['items']):
                item['id'] = text(original.get('id'), 'item id', 100)
                if item['id'] in item_ids:
                    raise ValueError('Item IDs must be unique within a meeting.')
                item_ids.add(item['id'])
                completed = original.get('completed', False)
                if not isinstance(completed, bool) or (item['kind'] != 'action' and completed):
                    raise ValueError('Only action records may be completed, using a boolean.')
                item['completed'] = completed
            restored.append(meeting)
        # Validate everything first so malformed input cannot cause a partial import.
        with self.connect() as db:
            for meeting in restored:
                db.execute('INSERT OR IGNORE INTO meetings VALUES (?, ?)',
                           (meeting['id'], json.dumps(meeting)))
            return db.total_changes

    def seed_pack(self):
        """Install the two pre-reviewed practice examples once, never overwrite edits."""
        return self.import_reviewed(DEMO['meetings'])

    def complete(self, meeting_id, item_id, completed):
        if not isinstance(completed, bool):
            raise ValueError('completed must be a boolean.')
        with self.connect() as db:
            row = db.execute('SELECT body FROM meetings WHERE id = ?', (meeting_id,)).fetchone()
            if not row:
                raise KeyError('Meeting not found.')
            meeting = json.loads(row[0])
            item = next((x for x in meeting['items'] if x['id'] == item_id and x['kind'] == 'action'), None)
            if not item:
                raise KeyError('Action item not found.')
            item['completed'] = completed
            db.execute('UPDATE meetings SET body = ? WHERE id = ?', (json.dumps(meeting), meeting_id))
        return meeting
