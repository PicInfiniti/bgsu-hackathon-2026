"""Players (add, edit, inactive, next season), notebook folders, settings, tours,
games played (official games only) and program-standard counts."""
import os
import tempfile
import unittest

from backend import core, roster as roster_mod
from backend.coach_logic import standard_counts
from backend.core import DEMO
from backend.notebook import Notebook
from backend.roster import Roster

BASE_COUNT = 25


class RosterTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.roster = Roster(os.path.join(self.dir.name, 'r.sqlite3'))

    def tearDown(self):
        Roster(os.path.join(self.dir.name, 'empty.sqlite3'))  # restore the plain synthetic roster for other tests
        self.dir.cleanup()

    def test_add_edit_inactive_and_next_season_keep_the_same_id(self):
        taken = DEMO['players'][0]
        player, warnings = self.roster.create({'first_name': 'Sam', 'last_name': 'Ortiz', 'number': taken['number'], 'position': 'WR', 'position_group': 'WR',
                                               'class_year': 'Junior', 'height': "6'1", 'weight': '185'})
        self.assertEqual(len(DEMO['players']), BASE_COUNT + 1)
        self.assertIn(player['id'], core.PLAYERS)
        self.assertEqual((player['height'], player['weight'], player['class_year']), ('6\'1"', '185', 'Junior'))
        self.assertEqual(len(warnings), 1)  # duplicate number in the same season is a warning, not a block
        edited, _ = self.roster.update(player['id'], {'number': 98, 'active': False})
        self.assertEqual((edited['id'], edited['number'], edited['active']), (player['id'], 98, False))
        self.assertIn(player['id'], core.PLAYERS)  # inactive players stay valid for their history
        rolled, _ = self.roster.next_season(player['id'])
        self.assertEqual((rolled['id'], int(rolled['season'])), (player['id'], int(player['season']) + 1))
        reopened = Roster(os.path.join(self.dir.name, 'r.sqlite3')).get(player['id'])
        self.assertEqual((reopened['number'], reopened['active']), (98, False))

    def test_editing_a_demo_player_overrides_without_a_new_id(self):
        first = DEMO['players'][0]
        edited, _ = self.roster.update(first['id'], {'last_name': 'Brookes'})
        self.assertEqual(edited['id'], first['id'])
        self.assertTrue(edited['name'].endswith('Brookes'))
        self.assertEqual(len(DEMO['players']), BASE_COUNT)

    def test_validation(self):
        good = {'first_name': 'Sam', 'last_name': 'Ortiz', 'number': 12, 'position': 'QB', 'position_group': 'QB'}
        for bad in ({**good, 'first_name': ''}, {**good, 'last_name': 'R2D2'}, {**good, 'number': 100}, {**good, 'number': -1}, {**good, 'number': 'ten'},
                    {**good, 'position': 'Wizard'}, {**good, 'position_group': 'XX'}, {**good, 'season': '26'}, {**good, 'height': 'tall'},
                    {**good, 'weight': '20'}, {**good, 'class_year': 'Fifth'}, {**good, 'active': 'no'}):
            with self.assertRaises(ValueError):
                self.roster.create(bad)
        self.assertEqual(len(DEMO['players']), BASE_COUNT)

    def test_team_meeting_needs_active_players_only(self):
        active = [p['id'] for p in DEMO['players']]
        self.roster.update(active[-1], {'active': False})
        meeting = {'title': 'Team', 'note': 'Good week.', 'date': '2026-11-20', 'meeting_type': 'team', 'attendees': active[:-1]}
        self.assertEqual(core.validate_meeting(meeting)['attendees'], active[:-1])


class FolderTests(unittest.TestCase):
    def test_create_rename_move_filter_search_archive_and_safe_delete(self):
        with tempfile.TemporaryDirectory() as d:
            nb = Notebook(os.path.join(d, 'n.sqlite3'))
            a = nb.create_note({'notebook': 'personal', 'title': 'Blitz idea', 'body': 'Zero pressure on 3rd and long'})
            b = nb.create_note({'notebook': 'team_strategy', 'title': 'Red zone', 'body': 'Fade to the boundary'})
            folder = nb.create_folder({'name': 'Week 12'})
            with self.assertRaises(ValueError):
                nb.create_folder({'name': 'week 12'})  # no duplicate names
            with self.assertRaises(ValueError):
                nb.create_folder({'name': 'Private'})  # built-in view names are reserved
            before = nb.get_note(a['id'])
            moved = nb.move_note(a['id'], folder['id'])
            self.assertEqual(moved['folder_id'], folder['id'])
            for key in ('title', 'body', 'notebook', 'updated_at', 'meeting_id', 'version_count'):
                self.assertEqual(moved[key], before[key])  # moving changes only folder_id
            self.assertEqual([n['id'] for n in nb.list_notes(folder=str(folder['id']))], [a['id']])
            self.assertEqual([n['id'] for n in nb.list_notes(folder='none')], [b['id']])
            self.assertEqual([n['id'] for n in nb.list_notes(search='fade')], [b['id']])  # search covers every folder
            self.assertEqual(nb.list_notes(folder=str(folder['id']), search='fade'), [])  # filter and search combine
            self.assertEqual(nb.update_folder(folder['id'], {'name': 'Rivalry week'})['name'], 'Rivalry week')
            nb.update_folder(folder['id'], {'archived': True})
            self.assertEqual(nb.folders(), [])
            with self.assertRaises(ValueError):
                nb.move_note(b['id'], folder['id'])  # cannot file into an archived folder
            self.assertEqual(nb.get_note(a['id'])['folder_id'], folder['id'])  # archiving keeps notes where they are
            self.assertEqual(nb.delete_folder(folder['id']), {'moved_to_no_folder': 1})
            self.assertIsNone(nb.get_note(a['id'])['folder_id'])  # the note survives in No folder
            self.assertEqual(len(nb.list_notes()), 2)


class SettingsTests(unittest.TestCase):
    def test_new_settings_and_tours(self):
        with tempfile.TemporaryDirectory() as d:
            nb = Notebook(os.path.join(d, 'n.sqlite3'))
            s = nb.settings()
            self.assertEqual((s['privacy']['export_names'], s['calendar']['default_view'], s['tours']), (False, 'week', {}))
            s = nb.update_settings({'profile': {'name': 'Coach Hayes', 'role': 'Position coach'}, 'team': {'name': 'Falcons'},
                                    'calendar': {'default_view': 'month', 'show_homework': False}, 'privacy': {'export_names': True}})
            self.assertEqual((s['profile']['role'], s['team']['name'], s['calendar'], s['privacy']['export_names']),
                             ('Position coach', 'Falcons', {'default_view': 'month', 'show_homework': False}, True))
            self.assertEqual(nb.update_settings({'tour': {'id': 'welcome', 'state': 'dismissed'}})['tours'], {'welcome': 'dismissed'})
            self.assertEqual(nb.update_settings({'tour': {'id': 'welcome', 'state': None}})['tours'], {})  # Replay
            for bad in ({'profile': {'role': 'Boss'}}, {'calendar': {'default_view': 'year'}}, {'privacy': {'export_names': 'yes'}}, {'tour': {'id': 'x', 'state': 'done'}}):
                with self.assertRaises(ValueError):
                    nb.update_settings(bad)


class GamesPlayedTests(unittest.TestCase):
    def test_official_games_only_and_nothing_without_a_list(self):
        with tempfile.TemporaryDirectory() as d:
            nb = Notebook(os.path.join(d, 'n.sqlite3'))
            ids = {p['id'] for p in DEMO['players']}
            pid = DEMO['players'][0]['id']
            g1 = nb.create_event({'type': 'game', 'title': 'vs Kent', 'start_at': '2026-11-07T15:30'})
            g2 = nb.create_event({'type': 'game', 'title': 'at Akron', 'start_at': '2026-11-14T15:30'})
            scrim = nb.create_event({'type': 'scrimmage', 'title': 'Spring scrimmage', 'start_at': '2026-11-01T10:00'})
            self.assertIsNone(nb.games_played(pid))  # no saved list means nothing to show (not 0)
            with self.assertRaises(ValueError):
                nb.save_game_list(scrim['id'], '2026-11-01', [pid], ids)  # scrimmages are not counted
            nb.save_game_list(g1['id'], '2026-11-07', [pid], ids)
            self.assertEqual(nb.games_played(pid), {'played': 1, 'of': 1})
            nb.save_game_list(g2['id'], '2026-11-14', [], ids)  # saved with nobody ticked for him
            self.assertEqual(nb.games_played(pid), {'played': 1, 'of': 2})
            nb.save_game_list(g2['id'], '2026-11-14', [pid, pid], ids)
            self.assertEqual(nb.games_played(pid), {'played': 2, 'of': 2})
            with self.assertRaises(ValueError):
                nb.save_game_list(g1['id'], '2026-11-07', ['nobody'], ids)


class StandardsTests(unittest.TestCase):
    def test_counts_are_approved_tagged_notes_in_the_last_30_days(self):
        pid = 'p01'
        def item(i, kind, tags, **extra):
            return {'id': f'i{i}', 'kind': kind, 'text': f'note {i}', 'player_id': pid, 'tags': tags, **extra}
        meetings = [
            {'id': 'm1', 'date': '2026-11-18', 'items': [item(1, 'praise', ['effort']), item(2, 'improvement', ['Communication']),
                                                         item(3, 'praise', ['effort', 'respect']), item(4, 'action', ['effort']),
                                                         item(5, 'improvement', ['attitude'], sensitive=True), item(6, 'praise', ['footwork'])]},
            {'id': 'm2', 'date': '2026-10-01', 'items': [item(7, 'praise', ['effort'])]},  # older than 30 days
            {'id': 'm3', 'date': '2026-11-19', 'items': [{**item(8, 'praise', ['effort']), 'player_id': 'p02'}]}]
        result = {s['key']: s for s in standard_counts(meetings, pid, '2026-11-21')['standards']}
        self.assertEqual((result['effort']['praise'], result['effort']['concern']), (2, 0))
        self.assertEqual((result['communication']['praise'], result['communication']['concern']), (0, 1))
        self.assertEqual(result['respect']['praise'], 1)
        self.assertEqual(result['attitude']['concern'], 0)  # sensitive notes are never counted
        self.assertEqual([n['item_id'] for n in result['effort']['notes']], ['i1', 'i3'])  # links to the notes
        self.assertEqual(list(result), ['prepared', 'effort', 'communication', 'ownership', 'attitude', 'respect'])


if __name__ == '__main__':
    unittest.main()


class RouteTests(unittest.TestCase):
    def test_folder_move_played_and_development_routes(self):
        import importlib.util
        if not all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx')):
            self.skipTest('fastapi/httpx not installed')
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend import notebook_routes
        from backend.core import Store
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'c.sqlite3')
            store, nb = Store(path), Notebook(path)
            app = FastAPI()
            notebook_routes.register(app, store, nb)
            with TestClient(app) as client:
                folder = client.post('/api/folders', json={'name': 'Week 12'}).json()
                note = client.post('/api/notes', json={'notebook': 'personal', 'body': 'Zone blitz idea', 'folder_id': folder['id']}).json()
                self.assertEqual(note['folder_id'], folder['id'])
                self.assertEqual([n['id'] for n in client.get(f"/api/notes?folder={folder['id']}").json()], [note['id']])
                self.assertIsNone(client.post(f"/api/notes/{note['id']}/move", json={'folder_id': None}).json()['folder_id'])
                self.assertEqual(client.delete(f"/api/folders/{folder['id']}").json(), {'moved_to_no_folder': 0})
                game = client.post('/api/events', json={'type': 'game', 'title': 'vs Kent', 'start_at': '2026-11-07T15:30'}).json()
                pid = DEMO['players'][0]['id']
                self.assertIsNone(client.get(f'/api/players/{pid}/development').json()['games_played'])
                saved = client.put(f"/api/events/{game['id']}/played", json={'date': '2026-11-07', 'player_ids': [pid]}).json()
                self.assertEqual(saved['player_ids'], [pid])
                self.assertEqual(client.get(f'/api/players/{pid}/development').json()['games_played'], {'played': 1, 'of': 1})
                self.assertEqual(client.put(f"/api/events/{game['id']}/played", json={'date': '2026-11-07', 'player_ids': ['zz']}).status_code, 422)
                self.assertEqual(client.get('/api/players/nobody/development').status_code, 404)


class PlayerRouteTests(unittest.TestCase):
    def test_add_edit_inactive_next_season_routes(self):
        import importlib.util
        from unittest.mock import patch
        if not all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx')):
            self.skipTest('fastapi/httpx not installed')
        from fastapi.testclient import TestClient
        with tempfile.TemporaryDirectory() as d:
            with patch.dict(os.environ, {'COACH_DB_PATH': os.path.join(d, 'boot.sqlite3'), 'COACH_ENV_FILE': os.path.join(d, 'absent.env')}):
                from backend import main
            old = main.roster
            main.roster = Roster(os.path.join(d, 'players.sqlite3'))
            try:
                with TestClient(main.app) as client:
                    made = client.post('/api/players', json={'first_name': 'Sam', 'last_name': 'Ortiz', 'number': 4, 'position': 'WR', 'position_group': 'WR'})
                    self.assertEqual(made.status_code, 201)
                    body = made.json()
                    self.assertEqual(len(body['warnings']), 1)  # #4 is taken this season
                    pid = body['player']['id']
                    self.assertIn(pid, [p['id'] for p in client.get('/api/players').json()])
                    off = client.patch(f'/api/players/{pid}', json={'active': False}).json()['player']
                    self.assertFalse(off['active'])
                    nxt = client.post(f'/api/players/{pid}/next-season').json()['player']
                    self.assertEqual((nxt['id'], int(nxt['season'])), (pid, int(body['player']['season']) + 1))
                    self.assertEqual(client.post('/api/players', json={'first_name': 'X', 'last_name': 'Y', 'number': 120, 'position': 'WR', 'position_group': 'WR'}).status_code, 422)
                    self.assertEqual(client.patch('/api/players/p99', json={'active': False}).status_code, 404)
                    from backend import film_routes
                    self.assertIn(pid, film_routes.ROSTER)  # an added player is valid in the Film room too
            finally:
                main.roster = old
                Roster(os.path.join(d, 'reset.sqlite3'))  # back to the plain synthetic roster
