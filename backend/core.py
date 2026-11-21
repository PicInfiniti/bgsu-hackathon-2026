"""Validation and persistence, testable without third-party packages."""
import copy
import json
import sqlite3
import uuid
from datetime import date
from pathlib import Path
from .extraction_schema import CATEGORIES, SENSITIVE_TOPICS
from .grouping import annotate_shared_records

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
        if not isinstance(items, list) or len(items) > 80:
            raise ValueError('Provide up to 80 reviewed items.')
        if not items and raw.get('note_only') is not True:
            raise ValueError('Choose save original note only when there are no extracted records.')
        if items and raw.get('note_only') is True:
            raise ValueError('Note-only meetings cannot include extracted records.')
        result['items'] = [validate_item(x, result) for x in items]
        if not items:
            result['note_only'] = True
        result['approved'] = True
        result['origin'] = raw.get('origin') if raw.get('origin') in ('demo', 'aivana') else 'manual'
    return result


def validate_item(raw, meeting):
    if not isinstance(raw, dict):
        raise ValueError('Record must be an object.')
    shared = raw.get('schema_version') == 2 and raw.get('scope') == 'team' and raw.get('kind') != 'action' and raw.get('player_id') is None
    if shared and meeting['meeting_type'] != 'team':
        raise ValueError('Whole-team feedback requires a team meeting.')
    if shared and (not isinstance(raw.get('player_ids'), list) or not all(isinstance(p, str) for p in raw['player_ids']) or set(raw['player_ids']) != set(meeting['attendees'])):
        raise ValueError('Team feedback must apply to all meeting attendees.')
    if not shared and raw.get('player_id') not in meeting['attendees']:
        raise ValueError('Each item must belong to a meeting attendee.')
    if raw.get('kind') not in ('action', 'praise', 'improvement', 'observation'):
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
    if raw.get('schema_version') == 2:
        for key, category in [('topic', 'topics'), ('skill', 'skills'), ('confidence', 'confidences'), ('match_method', 'match_methods')]:
            if raw.get(key) not in CATEGORIES[category]:
                raise ValueError(f'Choose a valid {key}.')
            item[key] = raw[key]
        if raw.get('scope') not in ('player', 'group', 'team'):
            raise ValueError('Choose a valid target scope.')
        if item['due_date'] and item['due_date'] < meeting['date']:
            raise ValueError('Deadline cannot precede the meeting date.')
        item.update(schema_version=2, scope=raw['scope'],
                    sensitive=item['topic'] in SENSITIVE_TOPICS, source_valid=True)
        for key, limit in [('mention', 160), ('deadline_text', 160), ('group_label', 100), ('group_record_id', 100)]:
            value = raw.get(key)
            if value is not None and (not isinstance(value, str) or len(value) > limit):
                raise ValueError(f'Invalid {key}.')
            item[key] = value
        item['warnings'] = [str(w)[:500] for w in raw.get('warnings', [])][:20] if isinstance(raw.get('warnings'), list) else []
        if shared:
            item['player_ids'] = list(meeting['attendees'])
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
            db.execute('CREATE TABLE IF NOT EXISTS extraction_runs (id TEXT PRIMARY KEY, body TEXT NOT NULL, saved_meeting_id TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS record_edits (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, extraction_id TEXT, draft_id TEXT, change_type TEXT NOT NULL, field_changes TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.path)

    def list(self):
        with self.connect() as db:
            meetings = [json.loads(row[0]) for row in db.execute('SELECT body FROM meetings')]
        for meeting in meetings:
            meeting['items'] = annotate_shared_records(meeting['items'], meeting, DEMO['players'])
        return sorted(meetings, key=lambda m: (m['date'], m['id']), reverse=True)

    def save(self, raw):
        meeting = validate_meeting(raw, require_items=True)
        meeting['id'] = str(uuid.uuid4())
        with self.connect() as db:
            extraction_id = raw.get('extraction_id')
            baseline = []
            if extraction_id:
                extraction_id = text(extraction_id, 'extraction id', 100)
                row = db.execute('SELECT body, saved_meeting_id FROM extraction_runs WHERE id = ?', (extraction_id,)).fetchone()
                if not row:
                    raise ValueError('Extraction draft not found. Extract again before approval.')
                if row[1]:
                    raise ValueError('This extraction was already approved. Reload the notebook.')
                run = json.loads(row[0])
                if run['meeting'] != validate_meeting(raw):
                    raise ValueError('Meeting changed after extraction. Extract again before approval.')
                baseline = run['items']
                meeting['origin'] = run['origin']
            db.execute('INSERT INTO meetings VALUES (?, ?)', (meeting['id'], json.dumps(meeting)))
            fields = ('player_id', 'player_ids', 'kind', 'text', 'topic', 'skill', 'quote', 'due_date', 'deadline_text', 'confidence', 'scope')
            originals = {i['id']: i for i in baseline}
            seen = set()
            for original, saved in zip(raw['items'], meeting['items']):
                draft_id = original.get('id')
                if draft_id is not None:
                    draft_id = text(draft_id, 'draft id', 100)
                if draft_id in seen:
                    raise ValueError('Duplicate draft record IDs.')
                if draft_id:
                    seen.add(draft_id)
                before = originals.get(draft_id)
                changes = {key: {'before': before.get(key) if before else None, 'after': saved.get(key)}
                           for key in fields if (before.get(key) if before else None) != saved.get(key)}
                status = 'added' if before is None else 'edited' if changes else 'unchanged'
                db.execute('INSERT INTO record_edits VALUES (?, ?, ?, ?, ?, ?)',
                           (str(uuid.uuid4()), meeting['id'], extraction_id, draft_id, status, json.dumps(changes)))
            for draft_id, before in originals.items():
                if draft_id not in seen:
                    changes = {key: {'before': before.get(key), 'after': None} for key in fields if key in before}
                    db.execute('INSERT INTO record_edits VALUES (?, ?, ?, ?, ?, ?)',
                               (str(uuid.uuid4()), meeting['id'], extraction_id, draft_id, 'deleted', json.dumps(changes)))
            if extraction_id:
                db.execute('UPDATE extraction_runs SET saved_meeting_id = ? WHERE id = ?', (meeting['id'], extraction_id))
        meeting['items'] = annotate_shared_records(meeting['items'], meeting, DEMO['players'])
        return meeting

    def capture_extraction(self, meeting, items, warnings, origin, raw_output):
        run_id = str(uuid.uuid4())
        body = dict(meeting=meeting, items=items, warnings=warnings, origin=origin, raw_output=raw_output)
        with self.connect() as db:
            db.execute('INSERT INTO extraction_runs VALUES (?, ?, NULL)', (run_id, json.dumps(body)))
        return run_id

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
        """Install pre-reviewed practice examples once, never overwrite edits."""
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
        meeting['items'] = annotate_shared_records(meeting['items'], meeting, DEMO['players'])
        return meeting
