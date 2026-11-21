import copy
import importlib.util
import os
import tempfile
import unittest
from unittest.mock import patch

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class ApiTests(unittest.TestCase):
    def test_modes_share_seeded_records_and_browser_import_is_idempotent(self):
        from fastapi.testclient import TestClient
        from backend.core import DEMO, Store
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {
                'COACH_DB_PATH': os.path.join(directory, 'app.sqlite3'),
                'COACH_ENV_FILE': os.path.join(directory, 'absent.env'),
            }):
                from backend import main
            old_store = main.store
            main.store = Store(os.path.join(directory, 'shared.sqlite3'))
            main.store.seed_pack()
            try:
                with TestClient(main.app) as client:
                    initial = client.get('/api/meetings').json()
                    self.assertEqual(len(initial), len(DEMO['meetings']))
                    sample = copy.deepcopy(DEMO['samples'][0])
                    with patch('backend.aivana.extract', return_value=sample['items']):
                        for mode in ('demo', 'live'):
                            result = client.post('/api/extract', json={**sample, 'mode': mode})
                            self.assertEqual(result.status_code, 200)
                            self.assertEqual(client.get('/api/meetings').json(), initial)
                    legacy = copy.deepcopy(DEMO['meetings'][0])
                    legacy['id'] = 'legacy-browser-meeting'
                    response = client.post('/api/meetings/import', json={'meetings': [legacy]})
                    self.assertEqual(response.json(), {'imported': 1})
                    self.assertEqual(client.post('/api/meetings/import', json={'meetings': [legacy]}).json(), {'imported': 0})
                    self.assertEqual(len(client.get('/api/meetings').json()), len(initial) + 1)
                    legacy['approved'] = False
                    self.assertEqual(client.post('/api/meetings/import', json={'meetings': [legacy]}).status_code, 422)
            finally:
                main.store = old_store

    def test_review_save_and_complete(self):
        from fastapi.testclient import TestClient
        from backend.core import DEMO, Store
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {
                'COACH_DB_PATH': os.path.join(directory, 'app.sqlite3'),
                'COACH_ENV_FILE': os.path.join(directory, 'absent.env'),
            }):
                from backend import main
            old_store = main.store
            main.store = Store(os.path.join(directory, 'routes.sqlite3'))
            try:
                with TestClient(main.app) as client:
                    meeting = copy.deepcopy(DEMO['samples'][0])
                    result = client.post('/api/extract', json={**meeting,'mode':'demo'})
                    self.assertEqual(result.status_code,200)
                    meeting['items'] = result.json()['items']
                    self.assertEqual(client.post('/api/meetings',json=meeting).status_code,422)
                    meeting['approved'] = True
                    meeting['origin'] = 'demo'
                    saved = client.post('/api/meetings',json=meeting)
                    self.assertEqual(saved.status_code,201)
                    saved = saved.json()
                    self.assertEqual(len(client.get('/api/meetings').json()),1)
                    # Recreate the store as a backend restart would, then read via HTTP.
                    main.store = Store(os.path.join(directory, 'routes.sqlite3'))
                    self.assertEqual(client.get('/api/meetings').json()[0], saved)
                    complete = client.patch(f"/api/meetings/{saved['id']}/items/{saved['items'][0]['id']}",json={'completed':True})
                    self.assertTrue(complete.json()['items'][0]['completed'])
                    reopened = client.patch(f"/api/meetings/{saved['id']}/items/{saved['items'][0]['id']}",json={'completed':False})
                    self.assertFalse(reopened.json()['items'][0]['completed'])
            finally:
                main.store = old_store
