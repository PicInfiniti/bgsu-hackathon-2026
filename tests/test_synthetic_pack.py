"""Integrity checks for the original synthetic practice data, not AI accuracy tests."""
import json
import tempfile
import unittest
from pathlib import Path

from backend.core import DEMO, Store, validate_item, validate_meeting
from scripts.build_demo_data import PACK, build


def read(name):
    return json.loads((PACK / name).read_text())


class SyntheticPackTests(unittest.TestCase):
    def test_shared_group_team_and_encouragement_seeds_preserve_completion(self):
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'shared-demo.sqlite3')
            self.assertEqual(store.seed_pack(),6)
            saved={m['id']:m for m in store.list()}
            self.assertIn('m-football-v2-0',saved)
            self.assertIn('m-football-v2-1',saved)
            for sid,count in [('shared-group-action',3),('shared-team-action',25)]:
                meeting=saved[f'm-football-v2-{sid}']
                self.assertEqual(len(meeting['items']),count)
                self.assertEqual(len({i['display_group']['id'] for i in meeting['items']}),1)
                first=meeting['items'][0]
                store.complete(meeting['id'],first['id'],True)
            self.assertEqual(store.seed_pack(),0)
            for sid in ('shared-group-action','shared-team-action'):
                meeting=next(m for m in store.list() if m['id']==f'm-football-v2-{sid}')
                self.assertEqual(sum(i['completed'] for i in meeting['items']),1)
            for sid in ('group-encouragement','team-encouragement'):
                meeting=saved[f'm-football-v2-{sid}']
                self.assertTrue(meeting['note_only'])
                self.assertEqual(meeting['items'],[])

    def test_football_roster_reference_skills_and_readable_notes(self):
        roster = read('roster.json')
        self.assertEqual(read('manifest.json')['sport'], 'Football')
        self.assertEqual([p['id'] for p in roster], [f'p{i:02}' for i in range(1, 26)])
        self.assertEqual([p['name'] for p in roster[:8]], [
            'Avery Brooks', 'Jordan Ellis', 'Morgan Reed', 'Casey Lane',
            'Riley Quinn', 'Taylor Hayes', 'Drew Parker', 'Skyler Vale'])
        self.assertEqual({p['position_group'] for p in roster},
                         {'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'})
        self.assertEqual(len({p['nickname'] for p in roster}), len(roster))
        self.assertTrue(all(p['position_label'] and p['position'] for p in roster))
        football_skills = {'Passing', 'Receiving', 'Route Running', 'Blocking',
                           'Tackling', 'Coverage & Positioning', 'Decision-Making',
                           'Ball Security', 'Footwork & Agility', 'Kicking & Punting',
                           'Other', 'Not Specified', 'Not Applicable'}
        for case in read('expected.json').values():
            self.assertTrue(all(item['skill'] in football_skills for item in case['items']))
        readable = (PACK / 'notes.md').read_text()
        for meeting in read('meetings.json'):
            self.assertIn(meeting['note'], readable)
            self.assertNotRegex(meeting['note'].lower(),
                                r'dribbl|rebound|free throws?|box.out|outlet pass|court|inbound|baseline trap')
        self.assertTrue(all(m['id'].startswith('m-football-v2-') for m in DEMO['meetings']))

    def test_manifest_roster_and_generated_fixture_match(self):
        manifest, roster, meetings, expected = (read(name) for name in (
            'manifest.json', 'roster.json', 'meetings.json', 'expected.json'))
        self.assertEqual(len(roster), 25)
        self.assertEqual(manifest['player_count'], len(roster))
        self.assertEqual(len({p['id'] for p in roster}), len(roster))
        self.assertEqual(len({p['name'] for p in roster}), len(roster))
        self.assertEqual(len({p['number'] for p in roster}), len(roster))
        self.assertEqual(manifest['meeting_count'], len(meetings))
        self.assertEqual(len({m['id'] for m in meetings}), len(meetings))
        self.assertEqual(set(expected), {m['id'] for m in meetings})
        self.assertEqual(manifest['expected_record_count'], sum(len(x['items']) for x in expected.values()))
        self.assertEqual(DEMO, build(), 'Regenerate data/demo.json with scripts/build_demo_data.py')

    def test_every_reference_record_validates_and_survives_storage(self):
        expected = read('expected.json')
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'pack.sqlite3')
            saved_count = 0
            for note in read('meetings.json'):
                with self.subTest(meeting=note['id']):
                    meeting = validate_meeting(note)
                    records = expected[note['id']]['items']
                    for record in records:
                        validate_item(record, meeting)
                    if not records:
                        with self.assertRaises(ValueError):
                            store.save({**meeting, 'approved': True, 'items': []})
                        continue
                    saved = store.save({**meeting, 'approved': True, 'origin': 'demo', 'items': records})
                    self.assertEqual(saved['note'], note['note'])
                    self.assertEqual(len(saved['items']), len(records))
                    saved_count += 1
            self.assertEqual(len(Store(store.path).list()), saved_count)

    def test_scenarios_cover_attribution_and_deadline_edges(self):
        meetings = read('meetings.json')
        notes = {m['id']: m for m in meetings}
        expected = read('expected.json')
        self.assertEqual({m['meeting_type'] for m in meetings}, {'individual', 'group', 'team'})
        all_ids = {p['id'] for p in read('roster.json')}
        self.assertEqual({r['player_id'] for v in expected.values() for r in v['items']}, all_ids)
        self.assertEqual(expected['no-records']['items'], [])
        self.assertEqual(expected['relative-date']['items'][0]['due_date'], '2026-11-21')
        self.assertIsNone(expected['ambiguous-date']['items'][0]['due_date'])
        self.assertIsNone(expected['no-deadline']['items'][0]['due_date'])
        self.assertEqual({r['player_id'] for r in expected['non-attendee']['items']}, {'p06'})
        self.assertEqual(set(notes['team']['attendees']), all_ids)
        self.assertEqual({r['player_id'] for r in expected['team']['items']}, {'p02', 'p03', 'p04'})
        self.assertEqual(len(expected['team-broadcast']['items']), 25)
        self.assertEqual({r['player_id'] for r in expected['team-broadcast']['items']}, all_ids)
        self.assertTrue(any(r['due_date'] and r['due_date'] < '2026-11-20' for r in expected['team']['items']))
