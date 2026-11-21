import copy
import tempfile
import unittest
from pathlib import Path

from backend.core import DEMO, Store


class SharedStoreTests(unittest.TestCase):
    def test_football_seed_keeps_earlier_saved_practice_history_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'shared.sqlite3')
            note = 'Jordan Ellis: Review the defensive rotation clips by 2026-11-22.'
            earlier = {**copy.deepcopy(DEMO['meetings'][0]), 'id': 'm-seed-0',
                       'title': 'Earlier practice meeting', 'note': note,
                       'items': [{'id': 'i-seed-0-0', 'player_id': 'p02', 'kind': 'action',
                                  'text': 'Review the defensive rotation clips.', 'skill': 'Positioning',
                                  'quote': note, 'due_date': '2026-11-22', 'completed': True}]}
            store.import_reviewed([earlier])
            self.assertEqual(store.seed_pack(), len(DEMO['meetings']))
            self.assertEqual(store.seed_pack(), 0)
            historical = next(m for m in Store(store.path).list() if m['id'] == earlier['id'])
            self.assertEqual(historical['note'], note)
            self.assertEqual(historical['items'], earlier['items'])
            self.assertEqual(len(store.list()), len(DEMO['meetings']) + 1)

    def test_pack_seed_is_idempotent_and_preserves_existing_actions(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'shared.sqlite3')
            self.assertEqual(store.seed_pack(), len(DEMO['meetings']))
            meeting = next(m for m in store.list() if any(i['kind'] == 'action' for i in m['items']))
            action = next(i for i in meeting['items'] if i['kind'] == 'action')
            store.complete(meeting['id'], action['id'], True)
            reopened = Store(store.path)
            self.assertEqual(reopened.seed_pack(), 0)
            restored = next(m for m in reopened.list() if m['id'] == meeting['id'])
            self.assertTrue(next(i for i in restored['items'] if i['id'] == action['id'])['completed'])
            self.assertEqual(len(reopened.list()), len(DEMO['meetings']))

    def test_browser_import_preserves_history_ids_and_sqlite_wins_conflicts(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'shared.sqlite3')
            meeting = copy.deepcopy(DEMO['meetings'][0])
            meeting['id'] = 'legacy-reviewed-meeting'
            # Older team notes used a smaller roster; historical import preserves them.
            meeting['meeting_type'] = 'team'
            self.assertEqual(store.import_reviewed([meeting]), 1)
            action = next(i for i in meeting['items'] if i['kind'] == 'action')
            store.complete(meeting['id'], action['id'], True)
            self.assertEqual(store.import_reviewed([meeting]), 0)
            restored = Store(store.path).list()[0]
            self.assertEqual(restored['id'], meeting['id'])
            self.assertEqual(restored['meeting_type'], 'team')
            self.assertEqual([i['id'] for i in restored['items']], [i['id'] for i in meeting['items']])
            self.assertTrue(next(i for i in restored['items'] if i['id'] == action['id'])['completed'])

    def test_import_rejects_unapproved_data_without_partial_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'shared.sqlite3')
            good = copy.deepcopy(DEMO['meetings'][0])
            bad = copy.deepcopy(DEMO['meetings'][1])
            bad['approved'] = False
            with self.assertRaises(ValueError):
                store.import_reviewed([good, bad])
            self.assertEqual(store.list(), [])
