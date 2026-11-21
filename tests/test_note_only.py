import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.core import DEMO, Store, validate_meeting
from backend.assistant import select_context


class NoteOnlyTests(unittest.TestCase):
    def meeting(self, kind='group'):
        attendees=['p02','p03','p11']
        if kind=='team': attendees=[p['id'] for p in DEMO['players']]
        if kind=='individual': attendees=['p02']
        return {'title':'Encouraging conversation','date':'2026-11-21','meeting_type':kind,
                'attendees':attendees,'note':'Keep supporting each other. I believe in this team.',
                'items':[], 'note_only':True, 'approved':True, 'origin':'manual'}

    def test_explicit_approved_note_only_meetings_round_trip_for_all_meeting_types(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'notes.sqlite3')
            for kind in ('individual','group','team'):
                original=self.meeting(kind)
                saved=store.save(original)
                self.assertEqual(saved['note'],original['note'])
                self.assertEqual(saved['attendees'],original['attendees'])
                self.assertEqual(saved['items'],[])
                self.assertTrue(saved['note_only'])
            restored=Store(store.path).list()
            self.assertEqual(len(restored),3)
            self.assertTrue(all(not m['items'] for m in restored))
            _,sources,total,_=select_context(restored,{'player_id':'p02','question':'Prepare my next meeting.','mode':'live'})
            self.assertEqual(sources,[])
            self.assertEqual(total,0)

    def test_empty_save_requires_explicit_intent_approval_and_valid_meeting(self):
        for field,value in [('note_only',False),('approved',False),('note',''),('attendees',[]),('date','invalid'),('items',None)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_meeting({**self.meeting(),field:value},require_items=True)

    def test_empty_extraction_and_removed_drafts_can_be_approved_without_inventing_records(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'drafts.sqlite3')
            for drafts in ([],copy.deepcopy(DEMO['samples'][0]['items'])):
                meeting=validate_meeting(self.meeting())
                if drafts:
                    sample=DEMO['samples'][0]
                    meeting=validate_meeting(sample)
                    for index,item in enumerate(drafts): item['id']=f'draft-{index}'
                run=store.capture_extraction(meeting,drafts,[],'aivana',{})
                body={**meeting,'items':[],'note_only':True,'approved':True,'origin':'aivana','extraction_id':run}
                saved=store.save(body)
                self.assertTrue(saved['note_only'])
                self.assertEqual(saved['items'],[])
                with self.assertRaisesRegex(ValueError,'already approved'): store.save(body)
                if drafts:
                    with store.connect() as db:
                        deleted=db.execute('SELECT COUNT(*) FROM record_edits WHERE meeting_id=? AND change_type=?',(saved['id'],'deleted')).fetchone()[0]
                    self.assertEqual(deleted,len(drafts))

    def test_http_manual_and_empty_live_extract_approval_and_reload(self):
        from fastapi.testclient import TestClient
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ,{'COACH_DB_PATH':str(Path(directory)/'bootstrap.sqlite3'),'COACH_ENV_FILE':str(Path(directory)/'absent.env')}):
                from backend import main
            with patch.object(main,'store',Store(Path(directory)/'api.sqlite3')), TestClient(main.app) as client:
                body=self.meeting()
                with patch('backend.aivana.extract') as ai:
                    self.assertEqual(client.post('/api/meetings',json={**body,'approved':False}).status_code,422)
                    saved=client.post('/api/meetings',json=body)
                    self.assertEqual(saved.status_code,201)
                    ai.assert_not_called()
                with patch('backend.aivana.extract',return_value={'records':[],'warnings':[]}) as ai:
                    extraction=client.post('/api/extract',json={**body,'mode':'live'}).json()
                    self.assertEqual(extraction['items'],[])
                    ai.assert_called_once()
                    second=client.post('/api/meetings',json={**body,'origin':'aivana','extraction_id':extraction['extraction_id']})
                    self.assertEqual(second.status_code,201)
                records=client.get('/api/meetings').json()
                self.assertEqual(len(records),2)
                self.assertTrue(all(m['note_only'] and m['items']==[] for m in records))
