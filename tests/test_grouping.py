import copy
import os
import tempfile
import unittest
from pathlib import Path

from backend.core import DEMO, Store, validate_meeting
from backend.extraction import enrich_demo
from backend.grouping import annotate_shared_records


class GroupingTests(unittest.TestCase):
    def sample(self, sample_id):
        sample = copy.deepcopy(next(s for s in DEMO['samples'] if s['id'] == sample_id))
        meeting = validate_meeting(sample)
        players = [p for p in DEMO['players'] if p['id'] in meeting['attendees']]
        return meeting, players, enrich_demo(sample['items'], meeting, players)

    def test_shared_named_praise_forms_one_group_and_individual_action_stays_separate(self):
        meeting, players, items = self.sample('shared-praise')
        output = annotate_shared_records(items, meeting, players)
        praises = [i for i in output if i['kind']=='praise']
        self.assertEqual(len(praises),3)
        self.assertEqual(len({i['display_group']['id'] for i in praises}),1)
        self.assertEqual(praises[0]['display_group']['label'],'Offensive line')
        self.assertEqual(len(praises[0]['display_group']['player_ids']),3)
        self.assertNotIn('display_group',next(i for i in output if i['kind']=='action'))
        self.assertNotIn('display_group',items[0])

    def test_shared_action_group_survives_save_reload_and_individual_completion(self):
        meeting, players, items = self.sample('team-broadcast')
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'groups.sqlite3')
            saved = store.save({**meeting,'items':items,'approved':True})
            self.assertEqual(len(saved['items']),25)
            group = saved['items'][0]['display_group']
            self.assertEqual(group['label'],'Full team')
            updated = store.complete(saved['id'],saved['items'][0]['id'],True)
            self.assertEqual(sum(i['completed'] for i in updated['items']),1)
            self.assertEqual(updated['items'][0]['display_group'],group)
            self.assertEqual(Store(store.path).list()[0],updated)
            # The read projection adds no metadata writes to persisted meeting bodies.
            with store.connect() as db:
                body = db.execute('SELECT body FROM meetings').fetchone()[0]
            self.assertNotIn('display_group',body)

    def test_different_deadlines_evidence_sensitive_flags_and_individual_edits_do_not_merge(self):
        meeting, players, items = self.sample('shared-praise')
        for field, value in [('text','Individually corrected praise.'),('quote',meeting['note']),('skill','Other'),('topic','Other'),('sensitive',True),('due_date','2026-12-01')]:
            changed = copy.deepcopy(items)
            changed[0][field]=value
            output=annotate_shared_records(changed,meeting,players)
            self.assertNotIn('display_group',output[0])
            self.assertEqual(len(output[1]['display_group']['player_ids']),2)

    def test_duplicate_player_or_forged_group_metadata_never_creates_shared_group(self):
        meeting, players, items = self.sample('shared-praise')
        items[1]['player_id']=items[0]['player_id']
        items[0]['display_group']={'id':'forged'}
        self.assertFalse(any(i.get('display_group') for i in annotate_shared_records(items,meeting,players)))

    def test_http_extract_and_approval_return_group_projection(self):
        from unittest.mock import patch
        from fastapi.testclient import TestClient
        sample = copy.deepcopy(next(s for s in DEMO['samples'] if s['id']=='shared-praise'))
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {'COACH_DB_PATH':str(Path(directory)/'bootstrap.sqlite3'), 'COACH_ENV_FILE':str(Path(directory)/'absent.env')}):
                from backend import main
            with patch.object(main,'store',Store(Path(directory)/'api.sqlite3')), TestClient(main.app) as client:
                result=client.post('/api/extract',json={**sample,'mode':'demo'})
                self.assertEqual(result.status_code,200)
                drafts=result.json()
                self.assertEqual(len([i for i in drafts['items'] if i.get('display_group')]),3)
                saved=client.post('/api/meetings',json={**sample,'items':drafts['items'],'approved':True,'extraction_id':drafts['extraction_id']})
                self.assertEqual(saved.status_code,201)
                self.assertEqual(client.get('/api/meetings').json(),[saved.json()])
