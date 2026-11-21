"""Readiness fixes: a note's homework is saved once (F1), the same content is never saved twice,
and old practice-pack duplicates are cleaned up with their text repaired (F7)."""
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing

from backend.core import DEMO, DuplicateMeeting, Store, repair_text


def meeting(**extra):
    pid = DEMO['players'][1]['id']
    item = {'id': 'd1', 'schema_version': 2, 'player_id': pid, 'scope': 'player', 'kind': 'action', 'text': 'Run 20 curls', 'topic': None, 'skill': None, 'tags': [],
            'quote': 'Jordan, run 20 curls by Friday.', 'due_date': '2026-11-27', 'deadline_text': 'by Friday', 'confidence': 'high', 'mention': 'Jordan',
            'match_method': 'first_or_last_name', 'sensitive': False}
    return {'title': 'WR check-in', 'date': '2026-11-21', 'meeting_type': 'individual', 'attendees': [pid], 'note': 'Jordan, run 20 curls by Friday.',
            'approved': True, 'origin': 'manual', 'items': [item], **extra}


class DuplicateMeetingTests(unittest.TestCase):
    def test_same_note_or_same_content_is_never_saved_twice(self):
        with tempfile.TemporaryDirectory() as d:
            store = Store(os.path.join(d, 's.sqlite3'))
            first = store.save(meeting(source_note_id=7))
            self.assertEqual(store.meeting_for_note(7)['id'], first['id'])
            with self.assertRaisesRegex(DuplicateMeeting, 'Already sent to review on'):
                store.save(meeting(source_note_id=7, title='Edited title'))  # the same note, sent again
            with self.assertRaises(DuplicateMeeting):
                store.save(meeting())  # the same content, e.g. the practice sample approved again
            other = store.save(meeting(title='Next week'))
            self.assertNotEqual(other['id'], first['id'])
            self.assertEqual(len(store.list()), 2)

    def test_route_answers_409_and_finds_the_meeting_from_the_note(self):
        import importlib.util
        from unittest.mock import patch
        if not all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx')):
            self.skipTest('fastapi/httpx not installed')
        from fastapi.testclient import TestClient
        with tempfile.TemporaryDirectory() as d:
            with patch.dict(os.environ, {'COACH_DB_PATH': os.path.join(d, 'boot.sqlite3'), 'COACH_ENV_FILE': os.path.join(d, 'absent.env')}):
                from backend import main
            from backend.notebook import Notebook
            old, old_notebook = main.store, main.notebook
            main.store = Store(os.path.join(d, 'shared.sqlite3'))
            main.notebook = Notebook(os.path.join(d, 'shared.sqlite3'))
            try:
                with TestClient(main.app) as client:
                    self.assertEqual(client.post('/api/meetings', json=meeting(source_note_id=99999)).status_code, 201)
                    self.assertEqual(client.get('/api/notes/99999/meeting').json()['source_note_id'], 99999)
                    again = client.post('/api/meetings', json=meeting(source_note_id=99999, title='Again'))
                    self.assertEqual(again.status_code, 409)
                    self.assertIn('Already sent to review on', again.json()['detail'])
                    self.assertEqual(client.get('/api/notes/123456/meeting').status_code, 404)
            finally:
                main.store, main.notebook = old, old_notebook


class SeedRepairTests(unittest.TestCase):
    def test_text_repair_and_duplicate_cleanup_keep_the_seed_and_done_ticks(self):
        self.assertEqual(repair_text('Defensive backs Â· film'), 'Defensive backs · film')
        self.assertEqual(repair_text('Plain · text'), 'Plain · text')
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 's.sqlite3')
            store = Store(path)
            store.seed_pack()
            seed = DEMO['meetings'][0]
            with closing(sqlite3.connect(path)) as db, db:  # an older Windows build stored the seed as 'Â·', and the sample was approved twice
                body = json.loads(db.execute('SELECT body FROM meetings WHERE id = ?', (seed['id'],)).fetchone()[0])
                body['title'] = body['title'].replace('·', 'Â·')
                db.execute('UPDATE meetings SET body = ? WHERE id = ?', (json.dumps(body), seed['id']))
                for n, done in enumerate((True, False)):
                    copy = json.loads(json.dumps(seed))
                    copy['id'] = f'copy-{n}'
                    for item in copy['items']:
                        item['completed'] = done and item['kind'] == 'action'
                    db.execute('INSERT INTO meetings VALUES (?, ?)', (copy['id'], json.dumps(copy)))
            before = len(store.list())
            script = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'remove_duplicate_meetings.py')
            out = subprocess.run([sys.executable, script, '--db', path, '--apply'], capture_output=True, text=True, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
            self.assertEqual(out.returncode, 0, out.stderr)
            after = store.list()
            self.assertEqual(len(after), before - 2)
            kept = next(m for m in after if m['id'] == seed['id'])
            self.assertEqual(kept['title'], seed['title'])  # text repaired
            self.assertTrue(all(i['completed'] for i in kept['items'] if i['kind'] == 'action'))  # the done tick is kept
            store.seed_pack()
            self.assertEqual(len(store.list()), len(after))  # the seed never repeats


if __name__ == '__main__':
    unittest.main()
