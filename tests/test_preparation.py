import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.core import Store
from backend.preparation import preparation_context, demo_brief
from backend.aivana import AivanaError


def meeting(mid='old', date='2026-11-10', player='p01'):
    return {'id':mid,'title':mid+' conversation','date':date,'attendees':[player],'approved':True,'meeting_type':'individual',
            'note':'Original note not supplied to model','items':[{'id':mid+'-record','player_id':player,'kind':'action','text':mid+' task','skill':'Decision-Making','topic':'Football Skills','due_date':'2026-11-25','completed':False,'quote':'Raw quote not supplied'}]}


class PreparationTests(unittest.TestCase):
    def test_selected_old_conversation_and_target_do_not_expand_to_other_history_or_players(self):
        old,new,target=meeting(),meeting('new','2026-11-21'),meeting('target','2026-11-28')
        target['items']=[];target['note_only']=True
        old['attendees'].append('p02')
        old['items'] += [dict(old['items'][0],id='other',player_id='p02'),dict(old['items'][0],id='private',sensitive=True),dict(old['items'][0],id='legacy',topic='Health & Injury Follow-up')]
        context=preparation_context([new,old,target],'p01',{'meeting_ids':['old'],'target_meeting_id':'target','purpose':'game-plan','goal':'Review coverage'})
        self.assertEqual(context['record_count'],1)
        self.assertEqual(context['records'][0]['meeting_id'],'old')
        self.assertEqual(context['target']['date'],'2026-11-28')
        self.assertEqual(context['target']['focus'],'Review coverage')
        self.assertNotIn('note',context['records'][0]);self.assertNotIn('quote',context['records'][0]['items'][0])
        brief=demo_brief(context);self.assertIn('old task',brief);self.assertNotIn('new task',brief)
        self.assertIn('Game-plan preparation',brief)

    def test_context_limit_is_explicit_and_only_selected_sources_count(self):
        old=meeting();old['items']=[dict(old['items'][0],id=str(i)) for i in range(15)]
        result=preparation_context([old,meeting('new','2026-11-21')],'p01',{'meeting_ids':['old'],'purpose':'game-review','target_date':'2026-11-01'})
        self.assertEqual(result['record_count'],10);self.assertEqual(result['matched_count'],15);self.assertTrue(result['limited'])
        self.assertEqual(result['target']['date'],'2026-11-01')
        self.assertEqual(len(result['records'][0]['items']),10)

    def test_invalid_targets_sources_dates_and_focus_are_rejected(self):
        cases=[{'meeting_ids':[]},{'meeting_ids':['missing']},{'meeting_ids':['old','old']},{'meeting_ids':'old'},
               {'target_meeting_id':'other'},{'target_meeting_id':False},{'target_date':False},{'target_date':'2026-02-30'},{'purpose':'unknown'},{'goal':'x'*801}, {'goal':123}]
        for body in cases:
            with self.subTest(body=body),self.assertRaises(ValueError):preparation_context([meeting(),meeting('other',player='p02')],'p01',body)
        with self.assertRaises(KeyError):preparation_context([meeting()],'missing')
        with self.assertRaises(ValueError):preparation_context([{**meeting(),'approved':False}],'p01')
        with self.assertRaises(ValueError):preparation_context([{**meeting(),'items':[]}],'p01',{'meeting_ids':['old']})

    def test_http_demo_live_errors_and_storage_isolation(self):
        from fastapi.testclient import TestClient
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ,{'COACH_DB_PATH':str(Path(directory)/'bootstrap.sqlite3'),'COACH_ENV_FILE':str(Path(directory)/'absent.env')}):
                from backend import main
            store=Store(Path(directory)/'prep.sqlite3');store.seed_pack();before=store.list()
            eligible=next(m for m in before if any(i.get('player_id')=='p01' and not i.get('sensitive') for i in m['items']))
            body={'mode':'demo','meeting_ids':[eligible['id']],'target_meeting_id':eligible['id'],'purpose':'game-review','goal':'Review this conversation'}
            with patch.object(main,'store',store),TestClient(main.app) as client,patch('backend.aivana.preparation_events') as ai:
                response=client.post('/api/players/p01/prep',json=body)
                self.assertEqual(response.status_code,200);self.assertIn('event: context',response.text)
                self.assertIn('event: done',response.text);self.assertIn('Game-review preparation',response.text);ai.assert_not_called()
                self.assertEqual(client.post('/api/players/p01/prep',json={**body,'meeting_ids':[]}).status_code,422)
                self.assertEqual(client.post('/api/players/missing/prep',json=body).status_code,404)
                with patch.dict(os.environ,{'AIVANA_API_KEY':'test-only'}):
                    ai.return_value=iter([('delta',{'text':'Selected brief'}),('done',{'finish_reason':'stop'})])
                    live=client.post('/api/players/p01/prep',json={**body,'mode':'live'})
                    self.assertEqual(live.status_code,200);self.assertIn('Selected brief',live.text)
                    context=ai.call_args.args[0];self.assertEqual(context['target']['purpose'],'game-review')
                    self.assertEqual({m['meeting_id'] for m in context['records']},{eligible['id']})
                    ai.side_effect=AivanaError('Test stream failure')
                    self.assertIn('event: error',client.post('/api/players/p01/prep',json={**body,'mode':'live'}).text)
                self.assertEqual(store.list(),before)
