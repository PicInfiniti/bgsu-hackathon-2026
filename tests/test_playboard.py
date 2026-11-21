"""Playboard: drawing-only notes, text-only, text + drawing; positions survive a restart and edits persist."""
import importlib.util
import os
import tempfile
import unittest

from backend.core import Store
from backend.film import FilmRoom
from backend.notebook import Notebook

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))
PLAY = [{'type': 'marker', 'x': 26.67, 'y': 20.6, 'label': 'QB', 'side': 'offense'}, {'type': 'marker', 'x': 26.67, 'y': 25.2, 'label': 'RB', 'side': 'offense'},
        {'type': 'marker', 'x': 8.67, 'y': 19.4, 'label': 'WR', 'side': 'offense'}, {'type': 'marker', 'x': 22.67, 'y': 19.2, 'label': 'LT', 'side': 'offense'},
        {'type': 'marker', 'x': 26.67, 'y': 19.2, 'label': 'C', 'side': 'offense'}, {'type': 'arrow', 'points': [[8.67, 19.4], [14.0, 8.0]], 'color': '#F58220', 'style': 'solid'},
        {'type': 'arrow', 'points': [[26.67, 25.2], [34.0, 22.0], [40.0, 12.0]], 'color': '#2563EB', 'style': 'curved'}]


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class PlayboardTests(unittest.TestCase):
    def setUp(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend import film_routes, notebook_routes
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, 'p.sqlite3')
        store, nb = Store(self.path), Notebook(self.path)
        self.room = FilmRoom(self.path, os.path.join(self.dir.name, 'film'))
        app = FastAPI()
        notebook_routes.register(app, store, nb, film_room=self.room)
        film_routes.register(app, store, nb, self.room)
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.dir.cleanup()

    def note(self, body=''):
        r = self.client.post('/api/notes', json={'notebook': 'team_strategy', 'title': 'Play diagram', 'body': body})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def reopen(self, diagram_id):
        return FilmRoom(self.path, os.path.join(self.dir.name, 'film')).get_diagram(diagram_id)  # like a refresh or restart

    def test_text_only_drawing_only_and_both(self):
        self.assertEqual(self.note('Run the slant early.')['body'], 'Run the slant early.')
        drawing_only = self.note('')
        d = self.client.post('/api/diagrams', json={'title': 'Pro I slant', 'template': 'play', 'note_id': drawing_only['id'], 'objects': PLAY}).json()
        self.assertEqual([x['id'] for x in self.client.get('/api/diagrams', params={'note_id': drawing_only['id']}).json()], [d['id']])
        both = self.note('Watch the safety.')
        self.client.post('/api/diagrams', json={'title': 'Cover 3', 'template': 'play', 'note_id': both['id'], 'objects': PLAY[:2]})
        self.assertEqual(len(self.client.get('/api/diagrams', params={'note_id': both['id']}).json()), 1)

    def test_positions_survive_a_restart_and_edits_persist(self):
        n = self.note('')
        d = self.client.post('/api/diagrams', json={'title': 'Pro I slant', 'template': 'play', 'note_id': n['id'], 'objects': PLAY}).json()
        reopened = self.reopen(d['id'])
        for saved, original in zip(reopened['objects'], PLAY):
            self.assertEqual((saved['type'], saved.get('label')), (original['type'], original.get('label')))
            if 'points' in original:
                self.assertEqual(saved['points'], [[float(v) for v in p] for p in original['points']])
            else:
                self.assertEqual((saved['x'], saved['y']), (original['x'], original['y']))
        self.assertEqual(reopened['note_id'], n['id'])
        moved = [dict(o) for o in reopened['objects']]
        moved[0]['x'] = 30.0
        saved = self.client.put(f"/api/diagrams/{d['id']}", json={'title': 'Pro I slant v2', 'template': 'play', 'note_id': n['id'], 'objects': moved,
                                                                   'base_updated_at': reopened['updated_at']}).json()
        latest = self.reopen(d['id'])
        self.assertEqual((latest['title'], latest['objects'][0]['x']), ('Pro I slant v2', 30.0))
        self.assertEqual(saved['updated_at'], latest['updated_at'])

    def test_demo_and_live_save_the_same_way(self):
        n = self.note('')
        for mode in ('demo', 'live'):  # saving a drawing never calls Aivana, so the mode does not change anything
            r = self.client.post('/api/diagrams', json={'title': f'{mode} play', 'template': 'play', 'note_id': n['id'], 'objects': PLAY, 'mode': mode})
            self.assertEqual(r.status_code, 201)


if __name__ == '__main__':
    unittest.main()
