"""Notes, schedule, bell and Ask Aivana panel. Aivana is always mocked."""
import base64
import importlib.util
import io
import json
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from backend import aivana_notes
from backend import coach_logic as logic
from backend.core import DEMO, Store
from backend.notebook import Notebook, build_ics, expand_events, MAX_VERSIONS

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))
PNG = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'0' * 64).decode()


def client_for(directory):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.notebook_routes import register
    store = Store(os.path.join(directory, 'coach.sqlite3'))
    store.seed_pack()
    notebook = Notebook(os.path.join(directory, 'coach.sqlite3'))
    app = FastAPI()
    register(app, store, notebook)
    return TestClient(app), store, notebook


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class LogicTests(unittest.TestCase):
    def test_transcription_keeps_only_real_uncertain_words_and_marks_unreadable(self):
        result = logic.finalize_transcription({'text': 'Avery #4 slant [?] by Fri, 3rd & 7', 'uncertain_words': ['slant', 'nowhere', 'slant'], 'warnings': ['Blurry corner']})
        self.assertEqual(result['uncertain_words'], ['slant', '[?]'])
        self.assertEqual(result['unreadable_count'], 1)
        self.assertEqual(result['warnings'], ['Blurry corner'])
        self.assertIn('3rd & 7', result['text'])
        with self.assertRaises(ValueError):
            logic.finalize_transcription({'uncertain_words': []})

    def test_transcribe_request_uses_image_input_schema_and_low_effort(self):
        captured = {}

        def fake_open(endpoint, body):
            captured.update(endpoint=endpoint, body=body)
            return FakeResponse(json.dumps({'finish_reason': 'stop', 'structured': {'text': 'Mo slant', 'uncertain_words': [], 'warnings': []}}).encode())
        with patch.object(aivana_notes, 'open_request', fake_open):
            aivana_notes.transcribe([('image/png', 'QUJD')], DEMO['players'][:2])
        body = captured['body']
        self.assertEqual(captured['endpoint'], 'generate')
        self.assertEqual(body['attachments'], [{'mime_type': 'image/png', 'data': 'QUJD'}])
        self.assertEqual(body['effort'], 'low')
        self.assertEqual(body['response_format']['schema']['required'], ['text', 'uncertain_words', 'warnings'])
        self.assertIn('[?]', body['system'])

    def test_recap_dates_are_computed_in_code_and_unknown_names_are_flagged(self):
        note = {'title': 'WR room', 'note_date': '2026-11-18', 'body': 'Taylor Hayes needs to watch the red zone film by Friday. Morgan should fix his slant release tomorrow. Chris Walker owes the travel form.'}
        payload = {'summary': 'WR room.', 'key_points': ['Film'], 'players_mentioned': [{'name': 'Taylor Hayes', 'player_id': 'p06'}, {'name': 'Chris Walker', 'player_id': 'p06'}],
                   'to_dos': [{'player': 'Taylor Hayes', 'task': 'Watch red zone film', 'due_phrase': 'by Friday', 'source_text': 'Taylor Hayes needs to watch the red zone film by Friday.'},
                              {'player': 'Morgan', 'task': 'Fix slant release', 'due_phrase': 'tomorrow', 'source_text': 'Morgan should fix his slant release tomorrow.'},
                              {'player': 'Chris Walker', 'task': 'Travel form', 'due_phrase': 'next Tuesday', 'source_text': 'Chris Walker owes the travel form.'}],
                   'decisions': [], 'questions_to_follow_up': []}
        recap = logic.finalize_recap(payload, note, DEMO['players'])
        taylor, morgan, chris = recap['to_dos']
        self.assertEqual((taylor['player_id'], taylor['due_date']), ('p06', '2026-11-20'))
        self.assertEqual((morgan['player_id'], morgan['due_date']), ('p03', '2026-11-19'))
        self.assertTrue(chris['unknown_name'])
        self.assertIsNone(chris['player_id'])
        self.assertIsNone(chris['due_date'])  # the phrase is not in the quote, so no date is invented
        self.assertTrue(taylor['source_found'])
        mentioned = {p['name']: p for p in recap['players_mentioned']}
        self.assertTrue(mentioned['Chris Walker']['unknown_name'])  # a wrong model player_id is not trusted

    def test_demo_cleanup_turns_spoken_numbers_into_jerseys(self):
        result = logic.demo_clean_transcript('number four avery needs to run the slant by friday', DEMO['players'])
        self.assertIn('#4', result['text'])
        self.assertIn('Avery', result['text'])
        self.assertTrue(result['text'].endswith('.'))
        self.assertIn({'before': 'number four', 'after': '#4', 'reason': 'Jersey number'}, result['changes'])

    def test_weekly_repeats_expand_in_code(self):
        events = [{'id': 1, 'start_at': '2026-11-03T15:30', 'repeat_weekly': 1, 'repeat_until': '2026-11-24', 'duration_min': 90, 'title': 'Practice', 'type': 'practice'},
                  {'id': 2, 'start_at': '2026-11-21T13:00', 'repeat_weekly': 0, 'duration_min': 180, 'title': 'Game', 'type': 'game'}]
        found = expand_events(events, '2026-11-09', '2026-11-30')
        self.assertEqual([e['start_at'] for e in found], ['2026-11-10T15:30', '2026-11-17T15:30', '2026-11-21T13:00', '2026-11-24T15:30'])
        self.assertEqual(found[0]['occurrence_id'], '1@2026-11-10')
        with self.assertRaises(ValueError):
            expand_events(events, '2026-11-30', '2026-11-01')

    def test_ics_has_events_weekly_rule_and_homework_due_dates(self):
        text = build_ics([{'id': 7, 'type': 'practice', 'title': 'Practice (pads); WRs', 'start_at': '2026-11-24T15:30', 'duration_min': 90, 'note': 'Bring, helmets', 'repeat_weekly': 1, 'repeat_until': None}],
                         [{'id': 'h1', 'player_name': 'Avery Brooks', 'text': 'Watch film', 'due_date': '2026-11-27'}], stamp='20261121T090000')
        self.assertTrue(text.startswith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'))
        self.assertTrue(text.endswith('END:VCALENDAR\r\n'))
        for line in ('DTSTART:20261124T153000', 'DTEND:20261124T170000', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Practice (pads)\\; WRs', 'DESCRIPTION:Bring\\, helmets',
                     'DTSTART;VALUE=DATE:20261127', 'DTEND;VALUE=DATE:20261128', 'UID:homework-h1@falcon-follow-up'):
            self.assertIn(line, text)
        self.assertNotIn('\n\n', text)

    def test_event_requests_parse_day_and_time_in_code(self):
        draft, missing = logic.parse_event_request('Add practice Tuesday 3:30', date(2026, 11, 21), DEMO['players'])
        self.assertEqual(missing, [])
        self.assertEqual((draft['type'], draft['title'], draft['start_at']), ('practice', 'Practice', '2026-11-24T15:30'))
        draft, _ = logic.parse_event_request('Schedule a 1-on-1 with Jordan Ellis tomorrow at 9am for 30 min', date(2026, 11, 21), DEMO['players'])
        self.assertEqual((draft['type'], draft['audience'], draft['start_at'], draft['duration_min']), ('meeting', 'player:p02', '2026-11-22T09:00', 30))
        self.assertEqual(logic.parse_event_request('Add practice', date(2026, 11, 21), DEMO['players'])[1], ['day', 'time'])

    def test_player_status_red_amber_green(self):
        meetings = [{'id': 'm1', 'title': 'Check-in', 'date': '2026-11-10', 'meeting_type': 'individual', 'attendees': ['p01'],
                     'items': [{'id': 'a', 'kind': 'action', 'player_id': 'p01', 'text': 'Film', 'due_date': '2026-11-15', 'completed': False}]},
                    {'id': 'm2', 'title': 'Check-in', 'date': '2026-11-19', 'meeting_type': 'individual', 'attendees': ['p02'],
                     'items': [{'id': 'b', 'kind': 'action', 'player_id': 'p02', 'text': 'Form', 'due_date': '2026-11-22', 'completed': False}]},
                    {'id': 'm3', 'title': 'Check-in', 'date': '2026-11-19', 'meeting_type': 'individual', 'attendees': ['p03'],
                     'items': [{'id': 'c', 'kind': 'action', 'player_id': 'p03', 'text': 'Lift', 'due_date': '2026-11-20', 'completed': True}]}]
        status = logic.player_statuses(meetings, DEMO['players'], '2026-11-21')
        self.assertEqual((status['p01']['color'], status['p01']['label']), ('red', 'Late'))
        self.assertEqual((status['p02']['color'], status['p02']['label']), ('amber', 'Due Sun'))
        self.assertEqual((status['p03']['color'], status['p03']['label']), ('green', 'Done'))
        self.assertEqual((status['p04']['color'], status['p04']['label']), ('amber', 'No 1-on-1 yet'))


class NotebookStoreTests(unittest.TestCase):
    def test_versions_keep_saves_and_restore_adds_a_version(self):
        with tempfile.TemporaryDirectory() as directory:
            nb = Notebook(os.path.join(directory, 'n.sqlite3'))
            note = nb.create_note({'notebook': 'personal', 'title': 'Install', 'body': 'v0', 'input_method': 'type',
                                   'versions': [{'body': 'draft one', 'source': 'typing'}]})
            for n in range(MAX_VERSIONS + 20):
                nb.add_version(note['id'], {'body': f'typing {n}', 'source': 'typing'})
            versions = nb.versions(note['id'])
            self.assertEqual(len(versions), MAX_VERSIONS)
            self.assertIn('save', [v['source'] for v in versions])
            self.assertEqual(versions[-1]['body'], f'typing {MAX_VERSIONS + 19}')
            restored = nb.restore_version(note['id'], versions[-5]['id'])
            self.assertEqual(restored['body'], versions[-5]['body'])
            self.assertEqual(nb.versions(note['id'])[-1]['source'], 'restore')

    def test_pen_strokes_and_photo_attachments_are_stored(self):
        with tempfile.TemporaryDirectory() as directory:
            nb = Notebook(os.path.join(directory, 'n.sqlite3'))
            note = nb.create_note({'notebook': 'team_strategy', 'title': 'Red zone', 'body': 'slant', 'input_method': 'pen',
                                   'strokes': [{'color': 'black', 'points': [[1, 2, 0, 0.5], [3, 4, 16, 0.6]]}],
                                   'attachments': [{'kind': 'ink', 'data_url': PNG}, {'kind': 'photo', 'data_url': PNG}]})
            self.assertEqual(note['strokes'][0]['points'][1], [3, 4, 16, 0.6])
            self.assertEqual(sorted(a['kind'] for a in note['attachments']), ['ink', 'photo'])
            self.assertTrue(nb.attachment_path(note['id'], note['attachments'][0]['id']).is_file())
            with self.assertRaises(ValueError):
                nb.create_note({'notebook': 'personal', 'body': 'x', 'attachments': [{'kind': 'photo', 'data_url': 'data:image/gif;base64,R0lG'}]})
            nb.delete_note(note['id'])
            with self.assertRaises(KeyError):
                nb.get_note(note['id'])


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class RouteTests(unittest.TestCase):
    def test_events_crud_and_repeat_weekly_expansion(self):
        with tempfile.TemporaryDirectory() as directory:
            client, _, _ = client_for(directory)
            created = client.post('/api/events', json={'type': 'practice', 'title': 'Practice (pads)', 'start_at': '2026-11-03T15:30', 'duration_min': 120, 'audience': 'group:WR', 'repeat_weekly': True})
            self.assertEqual(created.status_code, 201)
            event = created.json()
            listed = [i for i in client.get('/api/events', params={'from': '2026-11-01', 'to': '2026-11-21'}).json()['items'] if i['source'] == 'event']
            self.assertEqual([i['date'] for i in listed], ['2026-11-03', '2026-11-10', '2026-11-17'])
            patched = client.patch(f"/api/events/{event['id']}", json={'title': 'Practice (shells)', 'repeat_weekly': False}).json()
            self.assertEqual((patched['title'], patched['repeat_weekly']), ('Practice (shells)', 0))
            self.assertEqual(len([i for i in client.get('/api/events', params={'from': '2026-11-01', 'to': '2026-11-21'}).json()['items'] if i['source'] == 'event']), 1)
            self.assertEqual(client.post('/api/events', json={'type': 'party', 'title': 'x', 'start_at': '2026-11-03T15:30'}).status_code, 422)
            self.assertEqual(client.post('/api/events', json={'type': 'game', 'title': ' ', 'start_at': '2026-11-03T15:30'}).status_code, 422)
            self.assertEqual(client.delete(f"/api/events/{event['id']}").status_code, 204)
            self.assertEqual(client.get(f"/api/events/{event['id']}").status_code, 404)

    def test_ics_export_route(self):
        with tempfile.TemporaryDirectory() as directory:
            client, _, _ = client_for(directory)
            client.post('/api/events', json={'type': 'game', 'title': 'Game day · vs. North', 'start_at': '2026-11-21T13:00', 'duration_min': 180})
            response = client.get('/api/events/export.ics')
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.headers['content-type'].startswith('text/calendar'))
            self.assertIn('attachment', response.headers['content-disposition'])
            self.assertIn('SUMMARY:Game day · vs. North', response.text)

    def test_assistant_add_event_needs_confirm_before_anything_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            client, _, notebook = client_for(directory)
            before = notebook.list_events()
            reply = client.post('/api/assistant/message', json={'message': 'Add practice Tuesday 3:30', 'page': 'schedule', 'mode': 'live'}).json()
            self.assertEqual(reply['intent'], 'add_event')
            self.assertEqual(reply['confirm']['kind'], 'add_event')
            self.assertEqual(reply['confirm']['event']['start_at'][11:], '15:30')
            self.assertEqual(notebook.list_events(), before)  # nothing saved by the assistant
            saved = client.post('/api/events', json=reply['confirm']['event'])  # the coach pressed confirm
            self.assertEqual(saved.status_code, 201)
            self.assertEqual(len(notebook.list_events()), len(before) + 1)

    def test_open_questions_answer_from_notes_or_say_not_found(self):
        with tempfile.TemporaryDirectory() as directory:
            client, _, notebook = client_for(directory)
            note = notebook.create_note({'notebook': 'team_strategy', 'title': 'Red zone install', 'body': 'Run the fade to Skyler Vale on 3rd & goal.', 'input_method': 'type'})
            demo = client.post('/api/assistant/message', json={'message': 'What is our red zone call?', 'mode': 'demo'}).json()
            self.assertIn(f"note:{note['id']}", [c['link'] for c in demo['citations']])
            missing = client.post('/api/assistant/message', json={'message': 'Who is the punter for bowling?', 'mode': 'demo'}).json()
            self.assertEqual(missing['reply'], "I couldn't find that in your notes.")
            with patch('backend.aivana_notes.answer_question', return_value={'answer': 'Fade to Skyler.', 'source_ids': ['S99']}) as ask:
                bad = client.post('/api/assistant/message', json={'message': 'What is our red zone call?', 'mode': 'live'}).json()
            self.assertEqual(bad['reply'], "I couldn't find that in your notes.")  # unknown citations are rejected
            self.assertTrue(ask.called)
            with patch('backend.aivana_notes.answer_question', return_value={'answer': 'Fade to Skyler on 3rd & goal.', 'source_ids': ['S1']}):
                good = client.post('/api/assistant/message', json={'message': 'What is our red zone call?', 'mode': 'live', 'history': [{'role': 'user', 'text': 'hi'}] * 10}).json()
            self.assertEqual(good['citations'][0]['link'], f"note:{note['id']}")

    def test_transcribe_route_validates_images_and_never_calls_ai_in_demo(self):
        with tempfile.TemporaryDirectory() as directory:
            client, _, _ = client_for(directory)
            with patch('backend.aivana_notes.transcribe', return_value={'text': 'Mo [?] slant', 'uncertain_words': ['Mo'], 'warnings': []}) as call:
                demo = client.post('/api/notes/transcribe', json={'images': [PNG], 'mode': 'demo'})
                self.assertEqual(demo.status_code, 422)
                self.assertFalse(call.called)
                self.assertEqual(client.post('/api/notes/transcribe', json={'images': ['data:image/heic;base64,AAAA'], 'mode': 'live'}).status_code, 422)
                self.assertEqual(client.post('/api/notes/transcribe', json={'images': [PNG] * 6, 'mode': 'live'}).status_code, 422)
                live = client.post('/api/notes/transcribe', json={'images': [PNG], 'mode': 'live'}).json()
            self.assertEqual(live['uncertain_words'], ['Mo', '[?]'])
            self.assertEqual(call.call_args[0][0][0][0], 'image/png')

    def test_summarize_route_resolves_dates_and_saves_nothing_but_the_recap(self):
        with tempfile.TemporaryDirectory() as directory:
            client, store, _ = client_for(directory)
            note = client.post('/api/notes', json={'notebook': 'player_meetings', 'title': 'WR room', 'note_date': '2026-11-18', 'body': 'Taylor Hayes needs to watch the red zone film by Friday.', 'input_method': 'voice'}).json()
            meetings_before = store.list()
            payload = {'summary': 'Film.', 'key_points': [], 'players_mentioned': [], 'decisions': [], 'questions_to_follow_up': [],
                       'to_dos': [{'player': 'Taylor Hayes', 'task': 'Watch film', 'due_phrase': 'by Friday', 'source_text': 'Taylor Hayes needs to watch the red zone film by Friday.'}]}
            with patch('backend.aivana_notes.summarize', return_value=payload):
                recap = client.post(f"/api/notes/{note['id']}/summarize", json={'mode': 'live'}).json()
            self.assertEqual(recap['to_dos'][0]['due_date'], '2026-11-20')
            self.assertEqual(recap['origin'], 'aivana')
            self.assertEqual(store.list(), meetings_before)  # homework is only saved after review and approval
            self.assertEqual(client.get(f"/api/notes/{note['id']}").json()['summary']['summary'], 'Film.')

    def test_bell_lists_late_homework_and_marks_read(self):
        with tempfile.TemporaryDirectory() as directory:
            client, store, _ = client_for(directory)
            late_day = (date.today() - timedelta(days=3)).isoformat()
            meeting = {'title': 'Travel forms', 'date': (date.today() - timedelta(days=5)).isoformat(), 'meeting_type': 'individual', 'attendees': ['p01'],
                       'note': 'Avery turns in the travel form.', 'approved': True, 'origin': 'manual',
                       'items': [{'player_id': 'p01', 'kind': 'action', 'text': 'Travel form', 'skill': 'Other', 'quote': 'Avery turns in the travel form.', 'due_date': late_day}]}
            store.save(meeting)
            bell = client.get('/api/notifications').json()
            late = [n for n in bell['items'] if n['kind'] == 'late' and n['link'] == 'player:p01']
            self.assertEqual(late[0]['text'], 'Homework late: Avery Brooks, Travel form')
            self.assertEqual(late[0]['link'], 'player:p01')
            self.assertGreaterEqual(bell['unread'], 1)
            client.post('/api/notifications/read', json={})
            self.assertEqual(client.get('/api/notifications').json()['unread'], 0)
            client.patch('/api/settings', json={'notification_kinds': {'late': False}})
            self.assertFalse([n for n in client.get('/api/notifications').json()['items'] if n['kind'] == 'late'])


if __name__ == '__main__':
    unittest.main()
