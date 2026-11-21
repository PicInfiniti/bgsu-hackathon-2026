import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.core import Store,DEMO
from backend.home_notebook import Notebook
from backend.home_diagrams import FilmRoom
from backend.home_routes import register
from backend.note_media import register as register_media

PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='

class HomeNotebookTests(unittest.TestCase):
    def setUp(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        path=Path(self.directory.name)/'test.sqlite3'
        self.store=Store(path);self.notebook=Notebook(path);self.diagrams=FilmRoom(path,Path(self.directory.name)/'drawings')
        app=FastAPI();register_media(app,self.store);register(app,self.store,self.notebook,self.diagrams)
        self.client=TestClient(app);self.addCleanup(self.client.close)
    def create(self,**extras):
        result=self.client.post('/api/notes',json={'title':'Coverage check-in','body':'Avery Brooks: Review coverage by Friday.','notebook':'player_meetings','note_date':'2026-11-21','input_method':'type',**extras})
        self.assertEqual(result.status_code,201,result.text);return result.json()
    def test_note_save_is_separate_from_approved_meetings(self):
        note=self.create();self.assertEqual(self.store.list(),[])
        self.assertEqual(self.client.get(f"/api/notes/{note['id']}").json()['body'],note['body'])
        self.assertEqual(len(self.client.get('/api/notes').json()),1)
        self.assertIsNone(self.client.get(f"/api/notes/{note['id']}/meeting").json())
    def test_folder_create_move_archive_restore_delete_preserves_note(self):
        response=self.client.post('/api/folders',json={'name':'Week 12'});self.assertEqual(response.status_code,201,response.text);folder=response.json()
        note=self.create(folder_id=folder['id'])
        self.assertEqual(self.client.get('/api/folders').json()[0]['note_count'],1)
        self.assertEqual(self.client.patch(f"/api/folders/{folder['id']}",json={'archived':True}).status_code,200)
        self.assertEqual(self.client.get('/api/folders').json(),[])
        self.assertEqual(self.client.patch(f"/api/folders/{folder['id']}",json={'archived':False}).status_code,200)
        self.assertEqual(self.client.delete(f"/api/folders/{folder['id']}").status_code,200)
        self.assertIsNone(self.client.get(f"/api/notes/{note['id']}").json()['folder_id'])
    def test_versions_restore_and_attachment_survive_reopening(self):
        note=self.create(attachments=[{'kind':'photo','data_url':PNG}])
        version=self.client.post(f"/api/notes/{note['id']}/versions",json={'body':'Changed words','source':'typing'});self.assertEqual(version.status_code,201,version.text)
        versions=self.client.get(f"/api/notes/{note['id']}/versions").json();self.assertGreaterEqual(len(versions),2)
        restored=self.client.post(f"/api/notes/{note['id']}/versions/{versions[0]['id']}/restore",json={});self.assertEqual(restored.status_code,200,restored.text)
        loaded=Notebook(self.notebook.path).get_note(note['id']);self.assertEqual(len(loaded['attachments']),1)
        image=self.client.get(f"/api/notes/{note['id']}/attachments/{loaded['attachments'][0]['id']}");self.assertEqual(image.status_code,200);self.assertTrue(image.content.startswith(b'\x89PNG'))
    def test_demo_recap_and_clean_make_no_provider_calls(self):
        note=self.create()
        with patch('backend.home_aivana_notes.open_request') as provider:
            result=self.client.post(f"/api/notes/{note['id']}/summarize",json={'mode':'demo'});self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['origin'],'demo')
            self.assertEqual(self.client.post('/api/notes/clean-transcript',json={'mode':'demo','text':'Avery Brooks number four'}).status_code,200)
            provider.assert_not_called()
        self.assertEqual(self.store.list(),[])
    def test_invalid_mode_and_live_provider_failure_preserve_note(self):
        note=self.create()
        self.assertEqual(self.client.post(f"/api/notes/{note['id']}/summarize",json={'mode':'invalid'}).status_code,422)
        from backend.aivana import AivanaError
        with patch('backend.home_aivana_notes.summarize',side_effect=AivanaError('Unavailable')):
            self.assertEqual(self.client.post(f"/api/notes/{note['id']}/summarize",json={'mode':'live'}).status_code,502)
        with patch('backend.home_aivana_notes.summarize',return_value={'summary':{},'to_dos':None}):
            self.assertEqual(self.client.post(f"/api/notes/{note['id']}/summarize",json={'mode':'live'}).status_code,422)
        self.assertEqual(self.notebook.get_note(note['id'])['body'],note['body'])
    def test_approval_links_note_once_and_failure_rolls_back(self):
        note=self.create();meeting=copy.deepcopy(DEMO['samples'][0]);meeting.update(items=[],approved=True,note_only=True,origin='manual',home_note_id=note['id'])
        saved=self.store.save(meeting)
        self.assertEqual(self.notebook.get_note(note['id'])['meeting_id'],saved['id'])
        self.assertEqual(self.client.get(f"/api/notes/{note['id']}/meeting").json()['id'],saved['id'])
        with self.assertRaisesRegex(ValueError,'already'):self.store.save(meeting)
        self.assertEqual(len(self.store.list()),1)
        second=self.create();meeting.update(home_note_id=second['id'],extraction_id='missing')
        with self.assertRaises(ValueError):self.store.save(meeting)
        self.assertIsNone(self.notebook.get_note(second['id'])['meeting_id'])
    def test_schedule_create_list_and_saved_meetings_deadlines(self):
        event=self.client.post('/api/events',json={'type':'practice','title':'Friday practice','start_at':'2026-11-27T15:00','duration_min':60,'audience':'team'})
        self.assertEqual(event.status_code,201,event.text)
        response=self.client.get('/api/events?from=2026-11-01&to=2026-11-30');self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(any(x['title']=='Friday practice' for x in response.json()['items']))
        self.assertEqual(self.client.get('/api/schedule/checklist').status_code,200)
        self.assertEqual(self.client.get('/api/settings').status_code,200)
    def test_playboard_note_link_preview_and_validation(self):
        note=self.create();body={'title':'Coverage','template':'play','note_id':note['id'],'objects':[{'id':'qb','type':'marker','x':20,'y':15,'color':'#F58220','label':'QB','player_id':'p01'}],'player_ids':['p01'],'preview':PNG}
        response=self.client.post('/api/diagrams',json=body);self.assertEqual(response.status_code,201,response.text);diagram=response.json()
        self.assertEqual(len(self.client.get(f"/api/diagrams?note_id={note['id']}").json()),1)
        self.assertEqual(self.client.get(f"/api/diagrams/{diagram['id']}/preview.png").status_code,200)
        body['note_id']=999;self.assertEqual(self.client.post('/api/diagrams',json=body).status_code,422)
        body['objects'][0]['x']=999;self.assertEqual(self.client.post('/api/diagrams',json=body).status_code,422)
