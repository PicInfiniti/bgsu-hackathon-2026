"""Validation and persistence, testable without third-party packages."""
import copy
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from .extraction_schema import CATEGORIES, SENSITIVE_TOPICS
from .grouping import annotate_shared_records
from .vocabulary import clean_tags, is_sensitive

ROOT = Path(__file__).resolve().parents[1]
DEMO = json.loads((ROOT / 'data/demo.json').read_text(encoding='utf-8'))  # utf-8: Windows would read '·' as 'Â·'
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
    active = {p['id'] for p in DEMO['players'] if p.get('active', True)}
    if result['meeting_type'] == 'team' and not historical and not active <= set(attendees):
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
    for key, limit in [('text', 1000), ('quote', 2000)]:
        item[key] = text(raw.get(key), key, limit)
    # Open categories: skill and topic are optional free text; tags are any short words.
    skill = raw.get('skill')
    if skill is not None and (not isinstance(skill, str) or len(skill) > 100):
        raise ValueError('Skill must be at most 100 characters.')
    item['skill'] = skill.strip() if isinstance(skill, str) and skill.strip() else None
    if raw.get('tags') is not None and not isinstance(raw.get('tags'), list):
        raise ValueError('Tags must be a list of words.')
    tags = clean_tags(raw.get('tags') or [])
    if tags:
        item['tags'] = tags
    details = raw.get('details')
    if details is not None and (not isinstance(details, str) or len(details) > 1000):
        raise ValueError('Key details must be at most 1000 characters.')
    if isinstance(details, str) and details.strip():
        item['details'] = details.strip()
    if isinstance(raw.get('film_note_id'), int):
        item['film_note_id'] = raw['film_note_id']
    if item['quote'] not in meeting['note']:
        raise ValueError('Every source quote must appear verbatim in the meeting note.')
    due = raw.get('due_date')
    item['due_date'] = valid_date(due) if due else None
    if item['kind'] != 'action' and item['due_date']:
        raise ValueError('Only action items can have a due date.')
    if raw.get('schema_version') == 2:
        topic = raw.get('topic')
        if topic is not None and (not isinstance(topic, str) or len(topic) > 100):
            raise ValueError('Topic must be at most 100 characters.')
        item['topic'] = topic.strip() if isinstance(topic, str) and topic.strip() else None
        # Review metadata (not content categories) stays checked.
        for key, category in [('confidence', 'confidences'), ('match_method', 'match_methods')]:
            if raw.get(key) not in CATEGORIES[category]:
                raise ValueError(f'Choose a valid {key}.')
            item[key] = raw[key]
        if raw.get('scope') not in ('player', 'group', 'team'):
            raise ValueError('Choose a valid target scope.')
        if item['due_date'] and item['due_date'] < meeting['date']:
            raise ValueError('Deadline cannot precede the meeting date.')
        item.update(schema_version=2, scope=raw['scope'],
                    sensitive=bool(raw.get('sensitive')) or item['topic'] in SENSITIVE_TOPICS or is_sensitive(item['topic'], ' '.join(item.get('tags', []))), source_valid=True)
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


def repair_text(value):
    """Undo utf-8 text that was decoded as cp1252 ('Â·' -> '·', 'â€™' -> '’'). Clean text is returned unchanged."""
    if not isinstance(value, str) or not re.search('[Ââ][\u0080-¿€™‚-„‘-”†-…]', value):
        return value
    try:
        return value.encode('cp1252').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


class DuplicateMeeting(ValueError):
    """A note's homework was already approved once; a second meeting would double it."""
    def __init__(self, meeting):
        self.meeting = meeting
        when = (meeting.get('saved_at') or meeting['date'])[:10]
        super().__init__(f'Already sent to review on {when}. Open it instead of saving it again.')


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS extraction_runs (id TEXT PRIMARY KEY, body TEXT NOT NULL, saved_meeting_id TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS record_edits (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, extraction_id TEXT, draft_id TEXT, change_type TEXT NOT NULL, field_changes TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        # Commit/rollback like sqlite3's context manager, then always close so
        # Windows can delete temporary test databases.
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def list(self):
        with self.connect() as db:
            meetings = [json.loads(row[0]) for row in db.execute('SELECT body FROM meetings')]
        for meeting in meetings:
            meeting['items'] = annotate_shared_records(meeting['items'], meeting, DEMO['players'])
        return sorted(meetings, key=lambda m: (m['date'], m['id']), reverse=True)

    @staticmethod
    def fingerprint(meeting):
        """Same date, title, attendees and the same records (player, kind, text) = the same meeting."""
        records = sorted((i.get('player_id') or ','.join(sorted(i.get('player_ids') or [])), i['kind'], ' '.join(i['text'].split()).casefold()) for i in meeting['items'])
        return (meeting['date'], ' '.join(repair_text(meeting['title']).split()).casefold(), tuple(sorted(meeting['attendees'])), tuple(records))

    def same_content(self, meeting):
        key = self.fingerprint(meeting)
        return next((m for m in self.list() if self.fingerprint(m) == key), None)

    def repair_seed_text(self):
        """Seeds stored by an older Windows build read data/demo.json as cp1252 ('·' became 'Â·'). Fix those rows only."""
        fixed = 0
        with self.connect() as db:
            for mid, body in db.execute("SELECT id, body FROM meetings WHERE id LIKE 'm-%'").fetchall():
                def walk(value):
                    if isinstance(value, dict):
                        return {k: walk(v) for k, v in value.items()}
                    if isinstance(value, list):
                        return [walk(v) for v in value]
                    return repair_text(value)
                original = json.loads(body)
                repaired = walk(original)
                if repaired != original:
                    db.execute('UPDATE meetings SET body = ? WHERE id = ?', (json.dumps(repaired), mid))
                    fixed += 1
        return fixed

    def meeting_for_note(self, note_id):
        """The approved meeting already made from this notebook note, if any."""
        return next((m for m in self.list() if m.get('source_note_id') == note_id), None)

    def save(self, raw):
        meeting = validate_meeting(raw, require_items=True)
        meeting['id'] = str(uuid.uuid4())
        note_id = raw.get('source_note_id')
        if note_id is not None:
            if not isinstance(note_id, int) or isinstance(note_id, bool) or note_id < 1:
                raise ValueError('Invalid source note.')
            existing = self.meeting_for_note(note_id)
            if existing:
                raise DuplicateMeeting(existing)
            meeting['source_note_id'] = note_id
        meeting['saved_at'] = datetime.now().replace(microsecond=0).isoformat()
        extraction_id = raw.get('extraction_id')
        if extraction_id:
            with self.connect() as db:
                row = db.execute('SELECT saved_meeting_id FROM extraction_runs WHERE id = ?', (text(extraction_id, 'extraction id', 100),)).fetchone()
            if row and row[0]:
                raise ValueError('This extraction was already approved. Reload the notebook.')
        same = self.same_content(meeting)
        if same:
            raise DuplicateMeeting(same)  # e.g. the practice-pack sample approved again
        with self.connect() as db:
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
        body = dict(meeting=meeting, items=items, warnings=warnings, origin=origin, raw_output=raw_output,
                    created_at=datetime.now().replace(microsecond=0).isoformat())
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
        """Install the two pre-reviewed practice examples once, never overwrite edits."""
        self.repair_seed_text()
        return self.import_reviewed(DEMO['meetings'])

    def unsaved_runs(self):
        with self.connect() as db:
            return [(row[0], json.loads(row[1])) for row in db.execute('SELECT id, body FROM extraction_runs WHERE saved_meeting_id IS NULL')]

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
