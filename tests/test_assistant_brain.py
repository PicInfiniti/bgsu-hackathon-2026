"""Ask Aivana reliability, Game Plan detection, event types, Quick Note, profile and Hudl links. Aivana is mocked."""
import importlib.util
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from backend import coach_logic as logic
from backend.assistant_brain import check_live, gather, resolve_players
from backend.core import DEMO
from backend.film import parse_link
from backend.notebook import Notebook

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
P = {p['name'].split()[0]: p['id'] for p in DEMO['players']}


class BrainUnitTests(unittest.TestCase):
    def test_names_context_and_ambiguity(self):
        players = DEMO['players']
        self.assertEqual(resolve_players('What about Casey Lane?', {}, players)[0], [P['Casey']])
        self.assertEqual(resolve_players('What about his homework?', {'player_id': P['Avery']}, players)[:2], ([P['Avery']], None))
        ids, ask, how = resolve_players('What did I tell Quinn?', {}, players)
        self.assertEqual((ids, how), ([], 'ambiguous'))
        self.assertIn('Riley Quinn', ask)
        self.assertIn('Quinn Marlow', ask)
        self.assertEqual(resolve_players('What about his homework?', {}, players)[2], 'unknown')
        self.assertEqual(resolve_players('What about #99?', {}, players)[0], [])  # no such jersey: no guess

    def test_unapproved_and_sensitive_records_never_count_and_duplicates_merge(self):
        base = {'id': 'm1', 'title': 'Room', 'date': '2026-11-20', 'approved': True}
        item = lambda i, pid, text, **kw: {'id': i, 'player_id': pid, 'kind': 'improvement', 'text': text, **kw}  # noqa: E731
        meetings = [{**base, 'items': [item('a', P['Casey'], 'Rotate earlier in Cover 3'), item('b', P['Jordan'], 'Rotate earlier in Cover 3'),
                                        item('c', P['Casey'], 'Knee check with the trainer', sensitive=True)]},
                    {**base, 'id': 'm2', 'approved': False, 'items': [item('d', P['Casey'], 'Draft only')]}]
        records = gather(meetings, [], [], DEMO['players'], [], '2026-11-21')
        self.assertEqual([r['text'] for r in records], ['Rotate earlier in Cover 3'])
        self.assertIn('Casey Lane', records[0]['who'])
        self.assertIn('Jordan Ellis', records[0]['who'])

    def test_live_answers_keep_only_cited_recommendations(self):
        records = [{'source_id': 'S1'}, {'source_id': 'S2'}]
        recs, facts, missing = check_live({'recommendations': [{'action': 'Do X', 'why': 'w', 'source_ids': ['S1', 'S9']}, {'action': 'Invented', 'why': '', 'source_ids': ['S9']},
                                                               {'action': 'No source', 'why': '', 'source_ids': []}],
                                           'known_facts': [{'text': 'Fact', 'source_ids': ['S2']}, {'text': 'Made up', 'source_ids': []}],
                                           'missing_information': ['Did he finish?']}, records)
        self.assertEqual([(r['action'], r['source_ids']) for r in recs], [('Do X', ['S1'])])
        self.assertEqual([f['text'] for f in facts], ['Fact'])
        self.assertEqual(missing, ['Did he finish?'])

    def test_game_plan_note_events_are_detected_in_code_not_saved(self):
        found = logic.detect_events('We have a game tomorrow at 2 PM against North. Film session sometime. Great energy.', '2026-11-21', DEMO['players'])
        game = found[0]['draft']
        self.assertEqual((game['type'], game['start_at'], game['opponent'], game['home_away']), ('game', '2026-11-22T14:00', 'North', 'home'))
        self.assertIsNone(found[1]['draft'])  # ambiguous: no day or time, so no event
        self.assertIn('no day or time', found[1]['message'])
        away = logic.detect_events('Scrimmage at Lakeside Saturday 10am.', '2026-11-21', DEMO['players'])[0]['draft']
        self.assertEqual((away['type'], away['start_at']), ('scrimmage', '2026-11-21T10:00'))

    def test_hudl_share_links_are_accepted(self):
        for url in ('https://app.hudl.com/video/3/123/abc', 'https://fan.hudl.com/usa/x', 'https://hudl.app.link/abc', 'https://www.hudl.com/v/2/1'):
            self.assertEqual(parse_link(url)['link_kind'], 'hudl', url)
        for url in ('https://hudl.com.evil.io/v', 'https://evilhudl.com/v'):
            with self.assertRaises(ValueError):
                parse_link(url)


class StoreTests(unittest.TestCase):
    def test_event_types_and_migration_from_the_old_table(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'old.sqlite3')
            db = sqlite3.connect(path)
            db.execute("""CREATE TABLE events (id INTEGER PRIMARY KEY, type TEXT CHECK(type IN ('practice','game','film','meeting','note','other')), title TEXT NOT NULL,
                          start_at TEXT NOT NULL, duration_min INTEGER DEFAULT 60, audience TEXT, note TEXT, repeat_weekly INTEGER DEFAULT 0, repeat_until TEXT NULL,
                          meeting_id TEXT NULL, created_at TEXT)""")
            db.executemany('INSERT INTO events (type, title, start_at) VALUES (?, ?, ?)', [('other', 'Lift', '2026-11-24T07:00'), ('practice', 'Walk-through', '2026-11-27T15:00'),
                                                                                           ('game', 'Game day · at Lakeside', '2026-11-28T13:00')])
            db.commit()
            db.close()
            nb = Notebook(path)
            rows = {e['title']: e for e in nb.list_events()}
            self.assertEqual((rows['Lift']['type'], rows['Walk-through']['type']), ('lift', 'walkthrough'))
            self.assertEqual((rows['Game day · at Lakeside']['opponent'], rows['Game day · at Lakeside']['home_away']), ('Lakeside', 'away'))
            s = nb.create_event({'type': 'scrimmage', 'title': 'Scrimmage vs. East', 'start_at': '2026-11-25T16:00', 'location': 'Main field', 'focus': 'Red zone'})
            self.assertEqual((s['type'], s['location'], s['focus']), ('scrimmage', 'Main field', 'Red zone'))
            g = nb.create_event({'type': 'game', 'title': 'Game day · vs. North', 'start_at': '2026-11-21T13:00'})
            self.assertEqual((g['opponent'], g['home_away']), ('North', 'home'))
            with self.assertRaises(ValueError):
                nb.create_event({'type': 'party', 'title': 'x', 'start_at': '2026-11-25T16:00'})
            with self.assertRaises(ValueError):
                nb.create_event({'type': 'game', 'title': 'x', 'start_at': '2026-11-25T16:00', 'home_away': 'somewhere'})

    def test_quick_note_player_and_profile_settings(self):
        with tempfile.TemporaryDirectory() as d:
            nb = Notebook(os.path.join(d, 'n.sqlite3'))
            note = nb.create_note({'notebook': 'player_meetings', 'title': 'Quick', 'body': 'Hands inside.', 'player_id': P['Morgan'], 'meeting_id': 'm-1'})
            self.assertEqual((note['player_id'], note['meeting_id']), (P['Morgan'], 'm-1'))
            with self.assertRaises(ValueError):
                nb.create_note({'notebook': 'personal', 'body': 'x', 'player_id': 'Morgan'})
            photo = 'data:image/jpeg;base64,' + 'A' * 100
            self.assertEqual(nb.update_settings({'profile': {'name': 'Coach Reed', 'photo': photo}})['profile'], {'name': 'Coach Reed', 'photo': photo, 'role': None})
            with self.assertRaises(ValueError):
                nb.update_settings({'profile': {'photo': 'data:text/html;base64,PHNjcmlwdD4='}})


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class AccuracyEvalTests(unittest.TestCase):
    def test_synthetic_accuracy_cases_all_pass(self):
        import eval_assistant
        rows = eval_assistant.run()
        failed = [(r['question'], r['fails']) for r in rows if not r['passed']]
        self.assertEqual(failed, [])
        self.assertGreaterEqual(len(rows), 39)

    def test_live_failure_falls_back_to_grounded_code_answer(self):
        import eval_assistant
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend import film_routes, notebook_routes, aivana
        from backend.core import Store
        from backend.film import FilmRoom
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'x.sqlite3')
            store = Store(path)
            eval_assistant.seed(store)
            nb = Notebook(path)
            room = FilmRoom(path, os.path.join(d, 'film'))
            app = FastAPI()
            notebook_routes.register(app, store, nb, film_room=room)
            film_routes.register(app, store, nb, room)
            with TestClient(app) as client:
                with patch('backend.aivana_notes.recommend', side_effect=aivana.AivanaError('Aivana token balance is empty.', 402)):
                    out = client.post('/api/assistant/message', json={'message': 'What should I do next with Casey Lane?', 'mode': 'live'}).json()
                self.assertEqual(out['origin'], 'code')
                self.assertTrue(out['sections']['recommendations'])
                with patch('backend.aivana_notes.recommend', return_value={'answer': 'Do it.', 'known_facts': [], 'missing_information': [],
                                                                           'recommendations': [{'action': 'Invented drill', 'why': '', 'source_ids': ['S99']}]}):
                    out = client.post('/api/assistant/message', json={'message': 'What should I do next with Casey Lane?', 'mode': 'live'}).json()
                self.assertEqual(out['origin'], 'code')  # uncited live suggestions are rejected
                self.assertNotIn('Invented drill', str(out))
                before = nb.list_events()
                recap_note = nb.create_note({'notebook': 'team_strategy', 'title': 'Plan', 'body': 'We have a game tomorrow at 2 PM against North.'})
                recap = client.post(f"/api/notes/{recap_note['id']}/summarize", json={'mode': 'demo'}).json()
                self.assertEqual(recap['events'][0]['draft']['start_at'], f"{(date.today() + timedelta(days=1)).isoformat()}T14:00")
                self.assertEqual(recap['notebook'], 'team_strategy')
                self.assertEqual(nb.list_events(), before)  # nothing added until the coach confirms


if __name__ == '__main__':
    unittest.main()
