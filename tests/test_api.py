import copy
import importlib.util
import os
import tempfile
import unittest
from unittest.mock import patch

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bootstrap = tempfile.TemporaryDirectory()
        with patch.dict(os.environ, {'COACH_DB_PATH': os.path.join(cls.bootstrap.name,'bootstrap.sqlite3'), 'COACH_ENV_FILE': os.path.join(cls.bootstrap.name,'absent.env')}):
            from backend import main

    @classmethod
    def tearDownClass(cls):
        cls.bootstrap.cleanup()

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
                    with patch('backend.aivana.extract', return_value={'records': [{'target': {'scope':'player', 'player_id':'p01', 'mention':'Avery', 'match_method':'first_or_last_name', 'group_label':None}, 'topic':'Football Skills', 'skill':'Footwork & Agility', 'feedback_type':None, 'feedback':None, 'action_item': {'task':sample['items'][0]['text'], 'deadline_text':'by 2026-11-23', 'deadline_date':'2026-11-23'}, 'source_text':sample['items'][0]['quote'], 'confidence':'high'}], 'warnings':[]}):
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

    def test_corrective_attempt_is_bounded_and_flagged_drafts_cannot_save(self):
        from fastapi.testclient import TestClient
        from backend.core import DEMO, Store
        from backend import main, aivana
        from test_extraction import record
        with tempfile.TemporaryDirectory() as directory:
            old_store = main.store
            main.store = Store(os.path.join(directory, 'correction.sqlite3'))
            raw = record()
            meeting = {'title':'Correction test','date':'2026-11-20','meeting_type':'individual','attendees':['p01'],'note':raw['source_text']}
            good = {'records':[raw],'warnings':[]}
            bad = copy.deepcopy(good); bad['records'][0]['target']['player_id']='not-an-attendee'
            try:
                with TestClient(main.app) as client:
                    with patch('backend.aivana.extract', side_effect=[bad,good]) as extract:
                        result = client.post('/api/extract',json={**meeting,'mode':'live'}).json()
                        self.assertEqual(extract.call_count,2)
                        self.assertTrue(extract.call_args.kwargs['errors'])
                        self.assertEqual(result['items'][0]['player_id'],'p01')
                        self.assertEqual(result['items'][0]['due_date'],'2026-11-21')
                        self.assertEqual(client.get('/api/meetings').json(),[])
                    with patch('backend.aivana.extract', return_value=bad) as extract:
                        result = client.post('/api/extract',json={**meeting,'mode':'live'}).json()
                        self.assertEqual(extract.call_count,2)
                        self.assertIsNone(result['items'][0]['player_id'])
                        self.assertTrue(result['warnings'])
                        response=client.post('/api/meetings',json={**meeting,'approved':True,'origin':'aivana','extraction_id':result['extraction_id'],'items':result['items']})
                        self.assertEqual(response.status_code,422)
                    with patch('backend.aivana.extract', side_effect=[bad,aivana.AivanaError('Connection failed.')]) as extract:
                        response=client.post('/api/extract',json={**meeting,'mode':'live'})
                        self.assertEqual(response.status_code,200)
                        self.assertEqual(extract.call_count,2)
                        self.assertTrue(response.json()['warnings'])
                    with patch('backend.aivana.extract', side_effect=aivana.AivanaError('Empty balance.',402)) as extract:
                        self.assertEqual(client.post('/api/extract',json={**meeting,'mode':'live'}).status_code,402)
                        self.assertEqual(extract.call_count,1)
            finally:
                main.store=old_store

    def test_preparation_uses_only_ten_non_sensitive_records(self):
        from fastapi.testclient import TestClient
        from backend.core import DEMO, Store, validate_meeting
        from backend.extraction import enrich_demo
        from backend import main
        with tempfile.TemporaryDirectory() as directory:
            old_store=main.store
            main.store=Store(os.path.join(directory,'prep.sqlite3'))
            meeting=validate_meeting(DEMO['samples'][0])
            items=enrich_demo(DEMO['samples'][0]['items'],meeting,[DEMO['players'][0]])
            many=[]
            for index in range(12):
                item=copy.deepcopy(items[index % len(items)]); item['id']=f'draft-{index}'; many.append(item)
            private_note='Avery: Appointment scheduled.'
            private=copy.deepcopy(items[0]); private.update(id='private',kind='observation',topic='Health & Injury Follow-up',skill='Not Applicable',text='Appointment scheduled.',quote=private_note,due_date=None,deadline_text=None)
            main.store.save({**meeting,'title':'Health follow-up','note':private_note,'approved':True,'items':[private]})
            main.store.save({**meeting,'approved':True,'items':many})
            try:
                with TestClient(main.app) as client, patch.dict(os.environ,{'AIVANA_API_KEY':'test-placeholder'}):
                    with patch('backend.aivana.preparation_events',return_value=iter([('delta',{'text':'Brief'}),('done',{'finish_reason':'stop'})])) as prep:
                        self.assertEqual(client.get('/api/players/p01/prep').status_code,200)
                        context=prep.call_args.args[0]
                        selected=[i for record in context['records'] for i in record['items']]
                        self.assertEqual(len(selected),10)
                        self.assertFalse(any(i['topic']=='Health & Injury Follow-up' for i in selected))
                        self.assertFalse(any('quote' in i for i in selected))
            finally:
                main.store=old_store

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
