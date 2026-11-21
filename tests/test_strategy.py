import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.core import Store
from backend.strategy import validate_board, save_board, get_board, list_boards, StrategyConflict


def sample():
    return {'title':'Third down plan','date':'2026-11-28','mode':'plan','opponent':'Imaginary scout team',
            'notes':'Coach-authored assignments','field_view':'full','show_los':True,'snap':False,'los':600,'ball':{'x':600,'y':310},
            'markers':[{'id':'our1','side':'home','player_id':'p01','label':'4','name':'Avery','role':'QB','assignment':'Read coverage','x':460,'y':310,'angle':0},
                       {'id':'opp1','side':'opponent','player_id':None,'label':'1','name':'Imaginary defender','role':'S','assignment':'','x':800,'y':310,'angle':-180}],
            'drawings':[{'id':'route','kind':'route','color':'#ff7a32','width':4,'angle':0,'text':'','points':[[560,120],[700,120],[760,200]]}]}


class StrategyTests(unittest.TestCase):
    def test_roundtrip_revision_copy_and_isolation_from_meeting_records(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'boards.sqlite3');store.seed_pack();before=store.list()
            board=save_board(store,sample());self.assertEqual(board['revision'],1)
            edited=save_board(store,{**board,'mode':'review','title':'Game review'},board['id']);self.assertEqual(edited['revision'],2)
            self.assertEqual(get_board(Store(store.path),board['id']),edited)
            with self.assertRaises(StrategyConflict):save_board(store,board,board['id'])
            duplicate=save_board(store,{**edited,'title':'Copy'});self.assertNotEqual(duplicate['id'],board['id'])
            self.assertEqual(len(list_boards(store)),2);self.assertNotIn('drawings',list_boards(store)[0])
            self.assertEqual(store.list(),before)

    def test_invalid_bounds_enums_ids_roster_and_drawing_limits_fail_without_writes(self):
        changes=[{'title':''},{'date':'2026-02-30'},{'mode':'unknown'},{'field_view':'unknown'},{'los':float('nan')},
                 {'snap':'yes'},{'ball':{'x':True,'y':100}},{'notes':'x'*12001},
                 {'markers':[dict(sample()['markers'][0],player_id='unknown')]},
                 {'markers':[dict(sample()['markers'][1],player_id='p01')]},
                 {'markers':[dict(sample()['markers'][0],id=str(i)) for i in range(2)]},
                 {'markers':[dict(sample()['markers'][1],id=str(i)) for i in range(12)]},
                 {'drawings':[dict(sample()['drawings'][0],id='our1')]},
                 {'drawings':[dict(sample()['drawings'][0],points=[[0,0]]*301)]},
                 {'drawings':[dict(sample()['drawings'][0],points=[[0,0],[float('inf'),1]])]},
                 {'drawings':[dict(sample()['drawings'][0],color='url(script)')]},
                 {'drawings':[dict(sample()['drawings'][0],kind='text',text='')]},
                 {'drawings':[dict(sample()['drawings'][0],width=True)]}]
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'invalid.sqlite3')
            for change in changes:
                with self.subTest(change=change),self.assertRaises(ValueError):save_board(store,{**sample(),**change})
            self.assertEqual(list_boards(store),[])
        with self.assertRaises(ValueError):validate_board(None)

    def test_empty_board_and_open_formation_slots_are_valid(self):
        board=sample();board['markers']=[];board['drawings']=[];self.assertEqual(validate_board(board)['markers'],[])
        slot=sample()['markers'][0];slot.update(player_id=None,name='Open RT slot',label='RT',role='RT')
        board['markers']=[slot];self.assertIsNone(validate_board(board)['markers'][0]['player_id'])
        with self.assertRaises(ValueError):validate_board({**board,'drawings':[{}]*101})

    def test_http_create_read_update_conflict_validation_and_no_ai_calls(self):
        from fastapi.testclient import TestClient
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ,{'COACH_DB_PATH':str(Path(directory)/'bootstrap.sqlite3'),'COACH_ENV_FILE':str(Path(directory)/'absent.env')}):
                from backend import main
            store=Store(Path(directory)/'http.sqlite3');store.seed_pack();before=store.list()
            with patch.object(main,'store',store),TestClient(main.app) as client,patch('backend.aivana.open_request') as ai:
                response=client.post('/api/strategy-boards',json=sample());self.assertEqual(response.status_code,201)
                board=response.json();path=f"/api/strategy-boards/{board['id']}"
                self.assertEqual(client.get(path).json()['markers'],sample()['markers'])
                self.assertEqual(len(client.get('/api/strategy-boards').json()),1)
                update=client.put(path,json={**board,'title':'Review','mode':'review'});self.assertEqual(update.status_code,200)
                self.assertEqual(update.json()['revision'],2)
                self.assertEqual(client.put(path,json=board).status_code,409)
                self.assertEqual(client.put(path,json={**update.json(),'revision':True}).status_code,409)
                self.assertEqual(client.put(path,json={**update.json(),'revision':2.0}).status_code,409)
                self.assertEqual(client.post('/api/strategy-boards',json={**sample(),'title':''}).status_code,422)
                self.assertEqual(client.get('/api/strategy-boards/missing').status_code,404)
                self.assertEqual(client.put('/api/strategy-boards/missing',json=sample()).status_code,404)
                self.assertEqual(client.get(path).json()['title'],'Review')
                self.assertEqual(store.list(),before);ai.assert_not_called()
