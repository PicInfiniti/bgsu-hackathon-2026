import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.assistant import select_context, checked_answer
from backend.core import DEMO, Store
from backend import aivana


class AssistantTests(unittest.TestCase):
    def setUp(self):
        self.meetings = copy.deepcopy(DEMO['meetings'])
        self.body = {'player_id': 'p01', 'question': 'Prepare my next meeting.', 'mode': 'live'}

    def test_retrieval_filters_before_model_context_and_excludes_notes(self):
        base = self.meetings[0]
        base['attendees'] = ['p01', 'p02']
        base['items'] = [dict(base['items'][0], player_id='p01', text='Footwork drill', skill='Footwork & Agility', topic='Football Skills', kind='action', due_date='2026-11-23', sensitive=False)]
        other = dict(base['items'][0], id='other', player_id='p02', text='Not this player')
        private = dict(base['items'][0], id='private', sensitive=True, text='Private record')
        legacy_private = dict(base['items'][0], id='legacy', sensitive=False, topic='Health & Injury Follow-up')
        base['items'] += [other, private, legacy_private]
        _, sources, total, _ = select_context([base], {**self.body, 'question':'What did I say about footwork?'})
        self.assertEqual(total, 1)
        self.assertEqual(sources[0]['text'], 'Footwork drill')
        self.assertNotIn('note', sources[0])
        self.assertNotIn('quote', sources[0])
        self.assertEqual(select_context([dict(base, approved=False)], self.body)[1], [])
        self.assertEqual(select_context([base], {**self.body,'question':'What about punting?'})[1], [])

    def test_group_feedback_and_date_skill_status_search_filters(self):
        meeting = self.meetings[0]
        item = dict(meeting['items'][0], player_id=None, player_ids=['p01','p02'], scope='team', kind='praise', sensitive=False)
        meeting['items'] = [item]
        filters = {'start':meeting['date'], 'end':meeting['date'], 'skill':item['skill'], 'search':item['text'][:10]}
        self.assertEqual(select_context([meeting], {**self.body,'filters':filters})[2], 1)
        self.assertEqual(select_context([meeting], {**self.body,'filters':{'status':'open'}})[2], 0)
        self.assertEqual(select_context([meeting], {**self.body,'filters':{'actions_only':True}})[2], 0)
        self.assertEqual(select_context([meeting], {**self.body,'filters':{'end':'2000-01-01'}})[2], 0)

    def test_bounded_retrieval_prioritizes_relevance_then_recency(self):
        meeting = self.meetings[0]
        meeting['items'] = [dict(meeting['items'][0], id=f'r{i}', player_id='p01', sensitive=False) for i in range(20)]
        _, sources, total, _ = select_context([meeting], self.body)
        self.assertEqual(total,20)
        self.assertEqual(len(sources),12)
        self.assertEqual(len({s['source_id'] for s in sources}),12)

    def test_action_status_and_inherited_category_are_preserved(self):
        meeting = self.meetings[0]
        base = dict(meeting['items'][0], player_id='p01', sensitive=False, skill='Positioning', topic=None, kind='action', due_date='2000-01-01', completed=False)
        meeting['items'] = [dict(base,id='open'),dict(base,id='done',completed=True),dict(base,id='undated',due_date=None)]
        for status, expected in [('all',3),('open',2),('overdue',1),('done',1)]:
            body = {**self.body,'filters':{'category':'Positioning','status':status}}
            self.assertEqual(select_context([meeting],body)[2],expected)
        self.assertEqual(select_context([meeting],{**self.body,'filters':{'category':'Other'}})[2],0)

    def test_citations_require_known_sources_and_nonempty_factual_support(self):
        sources = [{'source_id':'S1'}]
        good = {'statements':[{'text':'Coach assigned a drill.', 'source_ids':['S1']}], 'suggestions':['What would help you practice?']}
        self.assertEqual(checked_answer(good,sources),good)
        for ids in ([],['invented'],[{}]):
            bad = copy.deepcopy(good); bad['statements'][0]['source_ids'] = ids
            with self.assertRaises(ValueError): checked_answer(bad,sources)

    def test_bad_input_rejected(self):
        for override in ({'player_id':'unknown'}, {'question':''}, {'mode':'other'},
                         {'filters':{'start':'2026-02-30'}}, {'filters':{'start':'2026-11-23','end':'2026-11-20'}},
                         {'filters':{'status':'other'}}, {'filters':{'skill':'x' * 101}}):
            with self.subTest(override=override), self.assertRaises(ValueError):
                select_context(self.meetings,{**self.body,**override})

    def test_provider_contract_and_truncation(self):
        payload = {'statements':[{'text':'Coach assigned a drill.', 'source_ids':['S1']}], 'suggestions':[]}
        with patch('backend.aivana.open_request',return_value=io.BytesIO(json.dumps({'structured':payload,'finish_reason':'stop'}).encode())) as request:
            self.assertEqual(aivana.answer_question('Prepare',{'id':'p01'},[{'source_id':'S1'}],'2026-11-21'),payload)
            body = request.call_args.args[1]
            self.assertLessEqual(body['max_tokens'],2048)
            self.assertEqual(body['response_format']['schema']['properties']['statements']['items']['properties']['source_ids']['items']['enum'],['S1'])
        with patch('backend.aivana.open_request',return_value=io.BytesIO(json.dumps({'structured':payload,'finish_reason':'length'}).encode())):
            with self.assertRaises(aivana.AivanaError):
                aivana.answer_question('Prepare',{'id':'p01'},[{'source_id':'S1'}],'2026-11-21')

    def test_http_demo_live_empty_and_provider_failures_never_write(self):
        from fastapi.testclient import TestClient
        body = {**self.body, 'player_id':'p02'}
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {'COACH_DB_PATH':str(Path(directory)/'bootstrap.sqlite3'), 'COACH_ENV_FILE':str(Path(directory)/'absent.env')}):
                from backend import main
            old = main.store
            main.store = Store(Path(directory)/'assistant.sqlite3'); main.store.seed_pack()
            try:
                with TestClient(main.app) as client, patch('backend.aivana.answer_question') as answer:
                    before = main.store.list()
                    result = client.post('/api/assistant', json={**body,'mode':'demo'})
                    self.assertEqual(result.status_code,200)
                    self.assertEqual(result.json()['origin'],'demo')
                    self.assertTrue(result.json()['sources'])
                    answer.assert_not_called()
                    empty = client.post('/api/assistant',json={**body,'question':'What about submarines?'})
                    self.assertEqual(empty.json()['context_count'],0)
                    answer.assert_not_called()
                    answer.return_value = {'statements':[{'text':'Coach assigned footwork.', 'source_ids':['S1']}], 'suggestions':[]}
                    result = client.post('/api/assistant',json=body)
                    self.assertEqual(result.status_code,200)
                    self.assertEqual(result.json()['origin'],'aivana')
                    self.assertLessEqual(len(answer.call_args.args[2]),12)
                    answer.return_value['statements'][0]['source_ids']=['unknown']
                    self.assertEqual(client.post('/api/assistant',json=body).status_code,502)
                    answer.side_effect = aivana.AivanaError('Empty balance.',402)
                    self.assertEqual(client.post('/api/assistant',json=body).status_code,402)
                    self.assertEqual(main.store.list(),before)
            finally:
                main.store = old
