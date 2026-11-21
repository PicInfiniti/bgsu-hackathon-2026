import copy
import json
import tempfile
import unittest
from pathlib import Path

from backend.core import DEMO, Store, validate_item, validate_meeting
from backend.dates import resolve_deadline
from backend.extraction_schema import SCHEMA
from backend.extraction import normalize_records, applies_to, enrich_demo


def record(mention='Avery', player_id='p01', scope='player', group=None, **changes):
    value = {'target': {'scope':scope, 'player_id':player_id, 'mention':mention,
                        'match_method':'full_name', 'group_label':group},
             'topic':'Football Skills', 'skill':'Footwork & Agility',
             'feedback_type':None, 'feedback':None,
             'action_item': {'task':'Complete footwork practice.', 'deadline_text':'tomorrow', 'deadline_date':None},
             'source_text':f'{mention}: Complete footwork practice tomorrow.', 'confidence':'high'}
    value.update(changes)
    return value


def meeting_for(note, ids=('p01',), kind='individual'):
    return {'title':'Synthetic extraction check', 'date':'2026-11-20', 'note':note,
            'attendees':list(ids), 'meeting_type':kind}


class SchemaContractTests(unittest.TestCase):
    def test_aivana_schema_uses_only_supported_keywords_and_nullable_scalar_types(self):
        allowed={'type','properties','required','additionalProperties','items','enum','minLength','maxLength','maxItems','description'}
        self.assertLess(len(json.dumps(SCHEMA).encode()),32768)
        def check(schema, depth=1):
            self.assertLessEqual(depth,10)
            self.assertTrue(set(schema)<=allowed)
            self.assertIn('type',schema)
            if isinstance(schema['type'],list):
                self.assertFalse({'object','array'} & set(schema['type']))
            required=schema.get('required',[])
            self.assertEqual(len(required),len(set(required)))
            self.assertTrue(set(required)<=set(schema.get('properties',{})))
            for child in schema.get('properties',{}).values(): check(child,depth+1)
            if 'items' in schema: check(schema['items'],depth+1)
        check(SCHEMA)


class DeadlineTests(unittest.TestCase):
    def test_explicit_this_weekday_can_be_today_and_bare_same_day_is_flagged(self):
        self.assertEqual(resolve_deadline('this Friday',None,'2026-11-20','Do it this Friday.'),('2026-11-20',None))
        self.assertIsNone(resolve_deadline('by Friday',None,'2026-11-20','Do it by Friday.')[0])
        self.assertTrue(resolve_deadline('by Friday',None,'2026-11-20','Do it by Friday.')[1])
        self.assertEqual(resolve_deadline('next Friday',None,'2026-11-20','Do it next Friday.'),('2026-11-27',None))
    def test_dates_are_computed_from_meeting_date(self):
        for phrase, expected in [('by Friday','2026-11-20'), ('Thursday','2026-11-19'),
                                 ('tomorrow','2026-11-18'), ('today','2026-11-17'),
                                 ('in 3 days','2026-11-20'),
                                 ('by 2026-11-23','2026-11-23')]:
            with self.subTest(phrase=phrase):
                due, warning = resolve_deadline(phrase, None, '2026-11-17', f'Complete the task {phrase}.')
                self.assertEqual(due, expected)
                self.assertIsNone(warning)

    def test_ambiguous_missing_invented_and_past_dates(self):
        for phrase in ('sometime next week','next week','before the Michigan game'):
            with self.subTest(phrase=phrase):
                due, warning = resolve_deadline(phrase, None, '2026-11-20', f'Do it {phrase}.')
                self.assertIsNone(due)
                self.assertTrue(warning)
        self.assertEqual(resolve_deadline(None,None,'2026-11-20','No deadline.'), (None,None))
        self.assertEqual(resolve_deadline('by Friday',None,'2026-11-17','Do it by\nFriday.'),('2026-11-20',None))
        self.assertIsNone(resolve_deadline('by 2026-11-19','2026-11-19','2026-11-20','Do it by 2026-11-19.')[0])
        due, warning = resolve_deadline('tomorrow','2027-01-01','2026-11-20','Do it tomorrow.')
        self.assertEqual(due,'2026-11-21')
        self.assertIn('Ignored',warning)
        self.assertIsNone(resolve_deadline('Friday',None,'2026-11-20','Do it after the game.')[0])
        self.assertIsNone(resolve_deadline('tomorrow',None,'9999-12-31','Do it tomorrow.')[0])


class ExtractionTests(unittest.TestCase):
    def test_target_must_be_present_in_its_evidence_not_elsewhere_in_note(self):
        raw = record('Avery')
        raw['source_text'] = 'Jordan: Complete footwork practice tomorrow.'
        meeting = meeting_for('Avery: Your passing was accurate. ' + raw['source_text'], ('p01','p02'), 'group')
        items, _, errors = self.normalize(raw,meeting)
        self.assertIsNone(items[0]['player_id'])
        self.assertTrue(errors)
    def normalize(self, raw, meeting, players=None):
        players = players or [p for p in DEMO['players'] if p['id'] in meeting['attendees']]
        return normalize_records({'records':[raw], 'warnings':[]},meeting,players)

    def test_nickname_and_jersey_match_only_attendees(self):
        for mention, method in [('AB','nickname'),('#4','jersey_number'),('Avery','first_or_last_name'),('Avery Brooks','full_name')]:
            raw = record(mention)
            meeting = meeting_for(raw['source_text'])
            items, warnings, errors = self.normalize(raw,meeting)
            self.assertEqual(items[0]['player_id'],'p01')
            self.assertEqual(items[0]['match_method'],method)
            self.assertEqual(items[0]['due_date'],'2026-11-21')
            self.assertFalse(errors)
            validate_item(items[0],meeting)

    def test_ambiguous_unknown_and_non_attendee_targets_are_not_guessed(self):
        raw = record('Chris')
        meeting = meeting_for(raw['source_text'],('p01','p02'),'group')
        players = [{**DEMO['players'][0], 'name':'Chris North'}, {**DEMO['players'][1], 'name':'Chris South'}]
        items, _, errors = self.normalize(raw,meeting,players)
        self.assertIsNone(items[0]['player_id'])
        self.assertEqual(items[0]['confidence'],'low')
        self.assertTrue(errors)
        with self.assertRaises(ValueError): validate_item(items[0],meeting)
        raw = record('Jordan','p02')
        items, _, _ = self.normalize(raw,meeting_for(raw['source_text']))
        self.assertIsNone(items[0]['player_id'])

    def test_source_failure_is_visible_and_cannot_save_but_whitespace_normalizes(self):
        raw = record()
        meeting = meeting_for('Avery: Different task tomorrow.')
        items, _, errors = self.normalize(raw,meeting)
        self.assertFalse(items[0]['source_valid'])
        self.assertTrue(errors)
        with self.assertRaises(ValueError): validate_item(items[0],meeting)
        meeting['note'] = 'AVERY: Complete   footwork practice tomorrow.'
        items, _, errors = self.normalize(raw,meeting)
        self.assertTrue(items[0]['source_valid'])
        self.assertIn(items[0]['quote'],meeting['note'])
        self.assertFalse(errors)

    def test_mentions_do_not_match_substrings_of_other_names_or_jerseys(self):
        raw = record('Avery')
        items, _, errors = self.normalize(raw,meeting_for('Averyson: Complete footwork practice tomorrow.'))
        self.assertIsNone(items[0]['player_id'])
        self.assertTrue(errors)
        raw = record('#4')
        items, _, errors = self.normalize(raw,meeting_for('#40: Complete footwork practice tomorrow.'))
        self.assertIsNone(items[0]['player_id'])

    def test_group_fans_out_to_attending_receivers_only(self):
        raw = record('All receivers', None, 'group','WR')
        ids = ('p03','p06','p01')
        items, _, errors = self.normalize(raw,meeting_for(raw['source_text'],ids,'group'))
        self.assertEqual({i['player_id'] for i in items},{'p03','p06'})
        self.assertEqual(len({i['group_record_id'] for i in items}),1)
        self.assertFalse(errors)

    def test_team_feedback_is_once_and_explicit_team_actions_are_per_player(self):
        raw = record('All attendees',None,'team',feedback_type='Praise',feedback='Your calls were clear.')
        raw['source_text'] += ' Your calls were clear.'
        meeting = meeting_for(raw['source_text'],tuple(p['id'] for p in DEMO['players']),'team')
        items, _, errors = self.normalize(raw,meeting)
        self.assertFalse(errors)
        self.assertEqual(len([i for i in items if i['kind']=='action']),25)
        feedback = next(i for i in items if i['kind']=='praise')
        self.assertIsNone(feedback['player_id'])
        self.assertEqual(len(feedback['player_ids']),25)
        self.assertTrue(applies_to(feedback,'p25'))
        validate_item(feedback,meeting)
        with tempfile.TemporaryDirectory() as directory:
            saved = Store(Path(directory)/'team.sqlite3').save({**meeting,'approved':True,'items':items})
            self.assertEqual(len(saved['items']),26)

    def test_sensitive_topics_and_invalid_enums_are_flagged(self):
        raw = record(topic='Health & Injury Follow-up', skill='Not Applicable')
        items, _, _ = self.normalize(raw,meeting_for(raw['source_text']))
        self.assertTrue(items[0]['sensitive'])
        raw['topic']='made up'
        raw['skill']='made up'
        items, _, errors = self.normalize(raw,meeting_for(raw['source_text']))
        self.assertEqual(items[0]['topic'],'Other')
        self.assertEqual(items[0]['skill'],'Not Specified')
        self.assertTrue(errors)

    def test_demo_uses_python_dates_and_neutral_observations_are_supported(self):
        sample = next(s for s in DEMO['samples'] if s['id']=='relative-date')
        result = enrich_demo(sample['items'],sample,[p for p in DEMO['players'] if p['id'] in sample['attendees']])
        self.assertEqual(result[0]['due_date'],'2026-11-21')
        self.assertEqual(result[0]['deadline_text'],'tomorrow')
        raw = record(action_item=None, feedback_type='Neutral/Observation', feedback='Avery practiced footwork.')
        raw['source_text']='Avery practiced footwork.'
        items, _, _ = self.normalize(raw,meeting_for(raw['source_text']))
        self.assertEqual(items[0]['kind'],'observation')

    def test_approval_audit_tracks_edited_added_deleted_and_unchanged_records(self):
        sample = copy.deepcopy(DEMO['samples'][0])
        meeting = validate_meeting(sample)
        players = [p for p in DEMO['players'] if p['id'] in meeting['attendees']]
        items = enrich_demo(sample['items'],meeting,players)
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'audit.sqlite3')
            run = store.capture_extraction(meeting,items,[],'aivana',{})
            self.assertEqual(store.list(),[])
            final = copy.deepcopy(items[:2])
            final[0]['text']='Coach-corrected footwork assignment.'
            added = copy.deepcopy(items[2]); added['id']='manual-added'; final.append(added)
            body = {**meeting,'approved':True,'items':final,'extraction_id':run,'origin':'aivana'}
            saved = store.save(body)
            with store.connect() as db:
                statuses = {row[0] for row in db.execute('SELECT change_type FROM record_edits')}
                self.assertEqual(statuses,{'edited','unchanged','added','deleted'})
            self.assertEqual(len(Store(store.path).list()),1)
            self.assertEqual(saved['origin'],'aivana')
            with self.assertRaisesRegex(ValueError,'already approved'): store.save(body)

    def test_approval_rejects_changed_source_and_invalid_new_categories(self):
        sample = copy.deepcopy(DEMO['samples'][0]); meeting = validate_meeting(sample)
        items = enrich_demo(sample['items'],meeting,[DEMO['players'][0]])
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'audit.sqlite3')
            run = store.capture_extraction(meeting,items,[],'demo',{})
            with self.assertRaisesRegex(ValueError,'Meeting changed'):
                store.save({**meeting,'title':'Changed','approved':True,'items':items,'extraction_id':run})
            items[0]['topic']='made up'
            with self.assertRaises(ValueError):
                store.save({**meeting,'approved':True,'items':items})
            self.assertEqual(store.list(),[])
