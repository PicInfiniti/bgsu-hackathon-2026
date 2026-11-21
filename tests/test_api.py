import copy
import importlib.util
import os
import tempfile
import unittest

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class ApiTests(unittest.TestCase):
    def test_review_save_and_complete(self):
        from fastapi.testclient import TestClient
        from backend.core import DEMO, Store
        from backend import main
        with tempfile.TemporaryDirectory() as directory:
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
