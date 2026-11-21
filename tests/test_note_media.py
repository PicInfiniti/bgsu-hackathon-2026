import base64
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import aivana
from backend.core import DEMO, Store
from backend.note_media import parse_image, register, transcribe, validate_media

PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
RESULT = {'text': 'Avery [?] by Friday.', 'uncertain_words': ['[?]'], 'warnings': ['Check the name.']}


class MediaTests(unittest.TestCase):
    def meeting(self):
        meeting = copy.deepcopy(DEMO['samples'][0])
        meeting.update(approved=True, origin='manual', items=[], note_only=True,
                       source_images=[{'kind': 'photo', 'data_url': PNG}])
        return meeting

    def test_image_validation_rejects_other_mime_invalid_base64_signatures_and_counts(self):
        mime, raw = parse_image(PNG)
        self.assertEqual(mime, 'image/png')
        self.assertTrue(raw.startswith(b'\x89PNG'))
        for value in [None, 'https://example.com/note.png', 'data:image/svg+xml;base64,AAAA',
                      'data:image/png;base64,AAAA', 'data:image/jpeg;base64,AAAA', PNG[:-1] + '%']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_image(value)
        for values in [None, [{'kind': 'voice', 'data_url': PNG}], [{'kind':'pen','data_url':PNG}] * 6]:
            with self.assertRaises(ValueError):
                validate_media(values)

    def test_provider_receives_bounded_image_request_and_no_key_in_response(self):
        with patch('backend.aivana.open_request', return_value=io.BytesIO(json.dumps({'structured': RESULT, 'finish_reason':'stop'}).encode())) as provider:
            self.assertEqual(transcribe([parse_image(PNG)]), RESULT)
        endpoint, body = provider.call_args.args
        self.assertEqual(endpoint, 'generate')
        self.assertEqual(body['max_tokens'], 2048)
        self.assertEqual(body['attachments'][0]['mime_type'], 'image/png')
        self.assertEqual(base64.b64decode(body['attachments'][0]['data']), parse_image(PNG)[1])
        self.assertNotIn('key', body)

    def test_truncated_and_malformed_provider_output_rejected(self):
        for output in [{'structured': RESULT, 'finish_reason':'length'}, {'structured': {'text':3}},
                       {'structured': {**RESULT, 'warnings':['x'*301]}}, [], {'structured':{**RESULT, 'uncertain_words':[None]}}]:
            with self.subTest(output=output), patch('backend.aivana.open_request',return_value=io.BytesIO(json.dumps(output).encode())), self.assertRaises(aivana.AivanaError):
                transcribe([parse_image(PNG)])

    def test_media_saved_atomically_and_reopens_without_base64_in_meeting_list(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'test.sqlite3'
            store = Store(path)
            saved = store.save(self.meeting())
            self.assertEqual(saved['source_images'][0]['kind'], 'photo')
            self.assertNotIn('data_url', saved['source_images'][0])
            self.assertEqual(Store(path).list()[0]['source_images'], saved['source_images'])
            with store.connect() as db:
                self.assertEqual(bytes(db.execute('SELECT data FROM meeting_media').fetchone()[0]), parse_image(PNG)[1])
            invalid = self.meeting()
            invalid['source_images'][0]['data_url'] = 'not an image'
            with self.assertRaises(ValueError):
                store.save(invalid)
            self.assertEqual(len(store.list()), 1)
            with store.connect() as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM meeting_media').fetchone()[0], 1)

    def test_failed_approval_leaves_no_orphaned_images(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'test.sqlite3')
            meeting = self.meeting()
            meeting['extraction_id'] = 'missing'
            with self.assertRaises(ValueError):
                store.save(meeting)
            with store.connect() as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM meeting_media').fetchone()[0], 0)
            self.assertEqual(store.list(), [])

    def test_routes_demo_never_calls_provider_and_saved_images_can_be_read(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory)/'test.sqlite3')
            app = FastAPI()
            register(app, store)
            with TestClient(app) as client, patch('backend.note_media.transcribe', return_value=RESULT) as provider:
                self.assertEqual(client.post('/api/notes/transcribe', json={'mode':'demo','images':[PNG]}).status_code, 422)
                self.assertEqual(client.post('/api/notes/transcribe', json={'mode':'live','images':['https://example.com']}).status_code, 422)
                provider.assert_not_called()
                self.assertEqual(client.post('/api/notes/transcribe', json={'mode':'live','images':[PNG]}).json(), RESULT)
                saved = store.save(self.meeting())
                image_id = saved['source_images'][0]['id']
                source = client.get(f"/api/meetings/{saved['id']}/media/{image_id}")
                self.assertEqual(source.content, parse_image(PNG)[1])
                self.assertEqual(source.headers['content-type'], 'image/png')
                self.assertEqual(source.headers['cache-control'], 'no-store')
                self.assertEqual(client.get(f'/api/meetings/wrong/media/{image_id}').status_code, 404)
