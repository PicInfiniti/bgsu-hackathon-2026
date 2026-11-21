import copy
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from backend import aivana
from backend.core import DEMO, Store, demo_extract, validate_item, validate_meeting


class CoachTests(unittest.TestCase):
    def setUp(self):
        self.meeting = copy.deepcopy(DEMO['samples'][0])
        self.meeting.update(approved=True, origin='demo')

    def test_all_fixtures_validate_and_reference_actual_source(self):
        for sample in DEMO['samples']:
            meeting = validate_meeting(sample)
            for item in demo_extract(meeting):
                validate_item(item, meeting)
        for meeting in DEMO['meetings']:
            validate_meeting(meeting, require_items=True)

    def test_unapproved_records_cannot_save(self):
        self.meeting['approved'] = False
        with self.assertRaisesRegex(ValueError, 'approve'):
            validate_meeting(self.meeting, require_items=True)

    def test_wrong_player_cannot_be_saved(self):
        self.meeting['items'][0]['player_id'] = 'p02'
        with self.assertRaisesRegex(ValueError, 'attendee'):
            validate_meeting(self.meeting, require_items=True)

    def test_hallucinated_source_is_rejected(self):
        self.meeting['items'][0]['quote'] = 'This never appeared in the note.'
        with self.assertRaisesRegex(ValueError, 'verbatim'):
            validate_meeting(self.meeting, require_items=True)

    def test_bad_dates_and_incompatible_types_are_rejected(self):
        self.meeting['date'] = '2026-02-30'
        with self.assertRaises(ValueError):
            validate_meeting(self.meeting)
        self.meeting['date'] = '2026-11-20'
        self.meeting['items'][1]['due_date'] = '2026-11-22'
        with self.assertRaisesRegex(ValueError, 'Only action'):
            validate_meeting(self.meeting, require_items=True)

    def test_meeting_type_cardinality_and_duplicate_attendees(self):
        for attendees, kind in [(['p01','p02'],'individual'), (['p01'],'group'), (['p01'],'team'), (['p01','p01'],'group')]:
            with self.subTest(kind=kind, attendees=attendees), self.assertRaises(ValueError):
                validate_meeting({**self.meeting, 'attendees':attendees, 'meeting_type':kind})

    def test_demo_does_not_fabricate_extraction_for_custom_notes(self):
        self.meeting['note'] += ' A different task was discussed.'
        with self.assertRaisesRegex(ValueError, 'sample'):
            demo_extract(self.meeting)

    def test_demo_rejects_changed_date_instead_of_reusing_relative_deadline(self):
        meeting = copy.deepcopy(next(s for s in DEMO['samples'] if s['id'] == 'relative-date'))
        self.assertEqual(demo_extract(meeting)[0]['due_date'], '2026-11-21')
        meeting['date'] = '2026-12-01'
        with self.assertRaisesRegex(ValueError, 'date'):
            demo_extract(validate_meeting(meeting))

    def test_persistence_and_completion_survive_reopening_store(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'test.sqlite3'
            store = Store(path)
            saved = store.save(self.meeting)
            self.assertEqual(len(store.list()), 1)
            item = saved['items'][0]
            store.complete(saved['id'], item['id'], True)
            reopened = Store(path)
            self.assertTrue(reopened.list()[0]['items'][0]['completed'])
            self.assertIn(item['quote'], reopened.list()[0]['note'])
            reopened.complete(saved['id'], item['id'], False)
            self.assertFalse(reopened.list()[0]['items'][0]['completed'])
            with self.assertRaises(KeyError):
                store.complete(saved['id'], saved['items'][1]['id'], True)
            with self.assertRaises(ValueError):
                store.complete(saved['id'], item['id'], 'true')

    def test_extraction_uses_schema_and_validates_finish(self):
        payload = {'structured': {'records':[], 'warnings':[]}, 'finish_reason':'stop'}
        with patch('backend.aivana.open_request', return_value=io.StringIO(json.dumps(payload))) as request:
            result = aivana.extract(self.meeting, DEMO['players'])
            self.assertEqual(result, payload['structured'])
            endpoint, body = request.call_args.args
            self.assertEqual(endpoint,'generate')
            self.assertEqual(body['response_format']['type'],'json_schema')
            self.assertLessEqual(body['max_tokens'], 2048)
        with patch('backend.aivana.open_request', return_value=io.StringIO(json.dumps({**payload, 'finish_reason':'length'}))):
            with self.assertRaises(aivana.AivanaError):
                aivana.extract(self.meeting, DEMO['players'])
        with patch('backend.aivana.open_request', return_value=io.StringIO('{"structured":null}')):
            with self.assertRaises(aivana.AivanaError):
                aivana.extract(self.meeting, DEMO['players'])

    def test_workspace_token_limit_error_is_explained(self):
        error = urllib.error.HTTPError(aivana.API + 'generate', 403, 'Forbidden', {}, io.BytesIO(b'{"error":{"bucket":"max_output_tokens"}}'))
        with patch.dict('os.environ', {'AIVANA_API_KEY':'test-placeholder'}), patch('urllib.request.urlopen', side_effect=error):
            with self.assertRaisesRegex(aivana.AivanaError, 'workspace limit'):
                aivana.open_request('generate', {})

    def test_stream_preserves_deltas_and_ignores_trace(self):
        stream = io.BytesIO(b'event: trace\ndata: {}\n\nevent: delta\ndata: {"text":"Hello"}\n\nevent: done\ndata: {"finish_reason":"stop"}\n\n')
        with patch('backend.aivana.open_request', return_value=stream):
            events = list(aivana.preparation_events({}))
            self.assertEqual([x[0] for x in events],['delta','done'])
            self.assertEqual(events[0][1]['text'],'Hello')

    def test_stream_failure_and_incomplete_stream_are_not_success(self):
        for content in [b'event: error\ndata: {}\n\n', b'event: delta\ndata: {"text":"partial"}\n\n']:
            with self.subTest(content=content), patch('backend.aivana.open_request', return_value=io.BytesIO(content)):
                with self.assertRaises(aivana.AivanaError):
                    list(aivana.preparation_events({}))


if __name__ == '__main__':
    unittest.main()
