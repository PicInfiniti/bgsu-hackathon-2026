"""Film room, Play whiteboard, Skill checks and Film packs. Aivana is always mocked."""
import base64
import importlib.util
import json
import os
import tempfile
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from backend.core import DEMO, Store
from backend.film import (FilmRoom, grade_summary, next_game, parse_link, repeat_corrections, skill_trend,
                          sniff_video, validate_objects, video_ext)
from backend.notebook import Notebook
from backend.vocabulary import clean_tags

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))
ROSTER = {p['id'] for p in DEMO['players']}
PNG = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'0' * 32).decode()
WEBM = b'\x1aE\xdf\xa3' + b'\x00' * 2000
AVI = b'RIFF\x00\x00\x00\x00AVI LIST' + b'\x00' * 2000


def client_for(directory):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend import film_routes, notebook_routes
    path = os.path.join(directory, 'coach.sqlite3')
    store = Store(path)
    store.seed_pack()
    notebook = Notebook(path)
    room = FilmRoom(path, os.path.join(directory, 'film'))
    app = FastAPI()
    notebook_routes.register(app, store, notebook, film_room=room)
    film_routes.register(app, store, notebook, room)
    return TestClient(app), store, notebook, room


class FilmLogicTests(unittest.TestCase):
    def test_links_need_https_and_an_allowed_host(self):
        self.assertEqual(parse_link('https://youtu.be/dQw4w9WgXcQ')['embed_id'], 'dQw4w9WgXcQ')
        self.assertEqual(parse_link('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')['link_kind'], 'youtube')
        self.assertEqual(parse_link('https://www.youtube.com/shorts/dQw4w9WgXcQ')['embed_id'], 'dQw4w9WgXcQ')
        self.assertEqual(parse_link('https://vimeo.com/123456789')['embed_id'], '123456789')
        self.assertEqual(parse_link('https://www.hudl.com/video/3/abc')['link_kind'], 'hudl')
        self.assertEqual(parse_link('https://drive.google.com/file/d/x/view')['link_kind'], 'drive')
        for bad in ('http://youtu.be/dQw4w9WgXcQ', 'https://evil.example.com/video.mp4', 'javascript:alert(1)', 'https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ', 'ftp://youtu.be/x'):
            with self.assertRaises(ValueError, msg=bad):
                parse_link(bad)

    def test_any_video_type_is_recognised(self):
        self.assertEqual(sniff_video(b'\x00\x00\x00\x18ftypmp42'), 'mp4')
        self.assertEqual(sniff_video(b'\x00\x00\x00\x14ftypqt  '), 'mov')
        self.assertEqual(sniff_video(WEBM[:16]), 'webm')
        self.assertEqual(sniff_video(AVI[:16]), 'avi')
        self.assertEqual(video_ext('Game 3 Q2.MKV'), 'mkv')
        self.assertEqual(video_ext('practice.wmv'), 'wmv')
        self.assertIsNone(video_ext('notes.pdf'))

    def test_grade_percent_and_target_are_computed_in_code(self):
        rows = [{'result': 'won', 'technique': 1, 'effort': 1}, {'result': 'won', 'technique': 0, 'effort': None},
                {'result': 'lost', 'technique': None, 'effort': 1}, {'result': 'critical', 'technique': 0, 'effort': 0}]
        s = grade_summary(rows)
        self.assertEqual((s['plays'], s['won'], s['lost'], s['critical'], s['percent']), (4, 2, 1, 1, 50))
        self.assertEqual((s['technique_pct'], s['effort_pct'], s['label']), (33, 67, 'Below target'))
        self.assertEqual(grade_summary([{'result': 'won'}] * 4 + [{'result': 'lost'}])['label'], 'On target')
        self.assertIsNone(grade_summary([])['percent'])

    def test_skill_trend_and_repeat_rule(self):
        self.assertEqual(skill_trend([2, 2, 3, 4])['label'], 'Improving')
        self.assertEqual(skill_trend([4, 4, 4, 3])['label'], 'Needs attention')
        self.assertEqual(skill_trend([3, 3, 3])['label'], 'Steady')
        self.assertEqual(skill_trend([3])['label'], 'First check')
        weeks = ['2026-11-02T10:00:00', '2026-11-09T10:00:00', '2026-11-16T10:00:00']
        notes = [{'tone': 'improve', 'created_at': w, 'player_ids': ['p01'], 'tags': ['footwork']} for w in weeks]
        notes.append({'tone': 'improve', 'created_at': '2026-11-17T10:00:00', 'player_ids': ['p02'], 'tags': ['footwork']})
        flags = repeat_corrections(notes, DEMO['players'])
        self.assertEqual([(f['player_id'], f['tag'], f['weeks']) for f in flags], [('p01', 'footwork', 3)])
        self.assertIn('plan a 1-on-1', flags[0]['text'])
        same_week = [{'tone': 'improve', 'created_at': '2026-11-16T10:00:00', 'player_ids': ['p01'], 'tags': ['footwork']}] * 3
        self.assertEqual(repeat_corrections(same_week, DEMO['players']), [])

    def test_next_game_picks_the_first_game_and_what_is_due(self):
        now = datetime(2026, 11, 18, 9, 0)
        occ = [{'type': 'practice', 'title': 'Practice', 'start_at': '2026-11-18T15:30', 'date': '2026-11-18', 'audience': 'team'},
               {'type': 'meeting', 'title': '1-on-1: Avery', 'start_at': '2026-11-19T13:00', 'date': '2026-11-19', 'audience': 'player:p01'},
               {'type': 'game', 'title': 'Game day · at Lakeside', 'start_at': '2026-11-21T13:00', 'date': '2026-11-21', 'audience': 'team'}]
        rows = [{'completed': False, 'due_date': '2026-11-20', 'player_id': 'p01', 'text': 'Film'}, {'completed': False, 'due_date': '2026-11-25', 'player_id': 'p01', 'text': 'Later'}]
        game = next_game(occ, now, rows, [{'id': 1, 'title': 'North', 'status': 'todo', 'assigned_to': 'Coach Reed'}], 'p01')
        self.assertEqual((game['opponent'], game['home_away'], game['days_left'], game['when']), ('Lakeside', 'away', 3, 'In 3 days'))
        self.assertEqual([h['text'] for h in game['homework_due']], ['Film'])
        self.assertEqual(game['next_one_on_one']['title'], '1-on-1: Avery')
        self.assertEqual(len(game['film_to_break_down']), 1)
        self.assertIsNone(next_game([o for o in occ if o['type'] != 'game'], now))

    def test_diagram_objects_are_bounded_and_stripped(self):
        objs = validate_objects([{'type': 'marker', 'x': 10, 'y': 10, 'label': '<script>alert(1)</script>QB', 'side': 'offense', 'color': '#FFFFFF'},
                                 {'type': 'text', 'x': 5, 'y': 5, 'text': '<b>Cover 3</b>', 'color': '#F58220'},
                                 {'type': 'arrow', 'points': [[1, 1], [10, 20]], 'color': '#2563EB', 'style': 'dashed'}], 'play')
        self.assertEqual(objs[0]['label'], 'alert(1)QB')
        self.assertEqual(objs[1]['text'], 'Cover 3')
        self.assertEqual(objs[2]['style'], 'dashed')
        for bad in ([{'type': 'iframe', 'x': 1, 'y': 1}], [{'type': 'marker', 'x': 500, 'y': 1}], [{'type': 'text', 'x': 1, 'y': 1, 'text': 'x', 'color': 'red;background:url(x)'}],
                    [{'type': 'marker', 'x': 1, 'y': 1}] * 2001, 'not a list'):
            with self.assertRaises(ValueError):
                validate_objects(bad, 'play')
        with self.assertRaises(ValueError):
            validate_objects([], 'iframe')
        self.assertTrue(validate_objects([{'type': 'marker', 'x': 110, 'y': 50}], 'field'))  # full field is 120 x 53.3 yards

    def test_any_tag_text_is_accepted_and_tidied(self):
        self.assertEqual(clean_tags(['  Wide Outs ', 'RZ', 'Brand-new idea!', 'x']), ['receivers', 'red zone', 'brand-new idea!'])
        self.assertEqual(clean_tags(['two-minute drill', 'Two-Minute  Drill']), ['two-minute drill'])
        self.assertEqual(clean_tags(['<b>tag</b>']), ['tag'])


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class FilmRouteTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.client, self.store, self.notebook, self.room = client_for(self.dir.name)

    def tearDown(self):
        self.client.close()
        self.dir.cleanup()

    def film(self, **extra):
        body = {'title': 'Practice 7-on-7', 'source_type': 'upload', 'film_date': '2026-11-20', 'kind': 'practice', 'player_ids': ['p01', 'p03']} | extra
        response = self.client.post('/api/films', json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_film_crud_links_and_bad_hosts(self):
        link = self.film(source_type='link', url='https://www.youtube.com/watch?v=dQw4w9WgXcQ', title='Week 12 vs. North', kind='game', opponent='North')
        self.assertEqual((link['link_kind'], link['embed_id'], link['playable']), ('youtube', 'dQw4w9WgXcQ', True))
        self.assertEqual(self.client.post('/api/films', json={'title': 'x', 'source_type': 'link', 'url': 'http://youtu.be/dQw4w9WgXcQ', 'film_date': '2026-11-20', 'kind': 'game'}).status_code, 422)
        self.assertEqual(self.client.post('/api/films', json={'title': 'x', 'source_type': 'link', 'url': 'https://example.com/a.mp4', 'film_date': '2026-11-20', 'kind': 'game'}).status_code, 422)
        self.assertEqual(self.client.post('/api/films', json={'title': 'x', 'source_type': 'upload', 'film_date': '2026-11-20', 'kind': 'game', 'player_ids': ['p99']}).status_code, 422)
        patched = self.client.patch(f"/api/films/{link['id']}", json={'assigned_to': 'Coach Reed', 'status': 'in_progress'}).json()
        self.assertEqual((patched['assigned_to'], patched['status']), ('Coach Reed', 'in_progress'))
        self.assertEqual([f['id'] for f in self.client.get('/api/films', params={'search': 'north'}).json()], [link['id']])
        self.assertEqual(self.client.delete(f"/api/films/{link['id']}").status_code, 204)
        self.assertEqual(self.client.get(f"/api/films/{link['id']}").status_code, 404)

    def test_upload_any_video_type_and_range_streaming(self):
        film = self.film()
        bad = self.client.post(f"/api/films/{film['id']}/upload", content=b'%PDF-1.7 not a video', headers={'X-Filename': 'notes.pdf'})
        self.assertEqual(bad.status_code, 422)
        avi = self.client.post(f"/api/films/{film['id']}/upload", content=AVI, headers={'X-Filename': 'old camera.avi'}).json()
        self.assertEqual((avi['file_ext'], avi['playable'], avi['needs_convert']), ('avi', False, True))  # kept, not refused
        mkv = self.film()
        self.assertEqual(self.client.post(f"/api/films/{mkv['id']}/upload", content=WEBM, headers={'X-Filename': 'game.mkv'}).json()['file_ext'], 'mkv')
        webm = self.film()
        uploaded = self.client.post(f"/api/films/{webm['id']}/upload", content=WEBM, headers={'X-Filename': 'clip.webm'}).json()
        self.assertTrue(uploaded['playable'])
        part = self.client.get(f"/api/films/{webm['id']}/stream", headers={'Range': 'bytes=0-99'})
        self.assertEqual((part.status_code, len(part.content), part.headers['content-range']), (206, 100, f'bytes 0-99/{len(WEBM)}'))
        self.assertEqual(part.content, WEBM[:100])
        tail = self.client.get(f"/api/films/{webm['id']}/stream", headers={'Range': 'bytes=-10'})
        self.assertEqual(tail.content, WEBM[-10:])
        self.assertEqual(self.client.get(f"/api/films/{webm['id']}/stream", headers={'Range': f'bytes={len(WEBM) + 5}-'}).status_code, 416)
        with patch('shutil.which', return_value=None):
            converted = self.client.post(f"/api/films/{film['id']}/convert")
        self.assertEqual(converted.status_code, 422)
        self.assertIn('Convert it to MP4', converted.json()['detail'])

    def test_clips_filters_grades_and_bulk(self):
        film = self.film()
        clip = self.client.post(f"/api/films/{film['id']}/clips", json={'start_s': 2, 'end_s': 8, 'down': 3, 'distance': 'long', 'play_type': 'pass', 'field_zone': 'red_zone',
                                                                       'tags': ['Third Down', 'any new tag'], 'player_ids': ['p03', 'p06']}).json()
        self.client.post(f"/api/films/{film['id']}/clips", json={'start_s': 8, 'end_s': 12, 'down': 1, 'play_type': 'run', 'player_ids': ['p01']})
        self.assertEqual(self.client.post(f"/api/films/{film['id']}/clips", json={'start_s': 9, 'end_s': 5}).status_code, 422)
        self.assertEqual(clip['tags'], ['third down', 'any new tag'])
        trick = self.client.post(f"/api/films/{film['id']}/clips", json={'start_s': 12, 'end_s': 15, 'play_type': 'Hook and Lateral', 'field_zone': 'backed up', 'distance': '7'}).json()
        self.assertEqual((trick['play_type'], trick['field_zone'], trick['distance']), ('hook and lateral', 'backed up', '7'))  # open fields, no fixed list
        self.assertEqual(len(self.client.get('/api/clips', params={'play_type': 'Hook and lateral'}).json()), 1)
        wr_third = self.client.get('/api/clips', params={'position': 'WR', 'down': 3}).json()
        self.assertEqual([c['id'] for c in wr_third], [clip['id']])
        self.assertEqual(len(self.client.get('/api/clips', params={'tag': 'any new tag'}).json()), 1)
        bulk = self.client.post(f"/api/clips/{clip['id']}/grades/bulk", json={}).json()
        self.assertEqual({g['player_id']: g['result'] for g in bulk}, {'p03': 'won', 'p06': 'won'})
        self.client.put(f"/api/clips/{clip['id']}/grades/p06", json={'result': 'critical', 'reason': 'Assignment', 'technique': 0})
        again = self.client.post(f"/api/clips/{clip['id']}/grades/bulk", json={'keep_existing': True}).json()
        self.assertEqual({g['player_id']: g['result'] for g in again}['p06'], 'critical')  # coach edits are kept
        self.assertEqual(self.client.put(f"/api/clips/{clip['id']}/grades/p06", json={'result': 'great'}).status_code, 422)
        summary = self.client.get(f"/api/films/{film['id']}/grade-summary").json()
        self.assertEqual((summary['p03']['percent'], summary['p06']['percent'], summary['p06']['critical']), (100, 0, 1))
        self.assertEqual(self.client.post('/api/playlists', json={'title': 'Teach', 'kind': 'teach', 'clip_ids': list(range(1, 17))}).status_code, 422)

    def test_note_to_homework_goes_to_review_not_saved(self):
        film = self.film()
        note = self.client.post(f"/api/films/{film['id']}/notes", json={'t_seconds': 134, 'text': 'Eyes to the safety first on 3rd down.', 'player_ids': ['p01'],
                                                                       'tags': ['Cover 3'], 'tone': 'improve', 'show_in_pack': True}).json()
        self.assertEqual(note['tags'], ['cover 3'])
        before = self.store.list()
        due = (date.today() + timedelta(days=3)).isoformat()
        draft = self.client.post(f"/api/film-notes/{note['id']}/homework", json={'due_date': due}).json()
        self.assertEqual(self.store.list(), before)  # nothing saved until the coach approves
        self.assertEqual((draft['meeting']['attendees'], draft['items'][0]['due_date'], draft['items'][0]['film_note_id']), (['p01'], due, note['id']))
        self.assertIn('02:14', draft['meeting']['note'])
        saved = self.store.save({**draft['meeting'], 'approved': True, 'origin': 'manual', 'items': draft['items']})
        self.assertEqual(saved['items'][0]['film_note_id'], note['id'])
        self.assertEqual(self.client.post(f"/api/film-notes/{note['id']}/homework", json={'due_date': '2020-01-01'}).status_code, 422)

    def test_recap_reads_notes_only(self):
        film = self.film()
        self.client.post(f"/api/films/{film['id']}/notes", json={'t_seconds': 10, 'text': 'Avery stepped up in the pocket.', 'player_ids': ['p01'], 'tone': 'praise'})
        captured = {}

        def fake_open(endpoint, body):
            captured['body'] = body
            import io

            class R(io.BytesIO):
                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False
            return R(json.dumps({'finish_reason': 'stop', 'structured': {'summary': 'One note.', 'per_player': [], 'this_week_work_on': 'Pocket'}}).encode())
        with patch('backend.aivana_notes.open_request', fake_open):
            recap = self.client.post(f"/api/films/{film['id']}/recap", json={'mode': 'live'}).json()
        self.assertEqual(recap['label'], 'From your notes, not from the video')
        self.assertNotIn('attachments', captured['body'])
        prompt = json.loads(captured['body']['prompt'])
        self.assertEqual([n['text'] for n in prompt['notes']], ['Avery stepped up in the pocket.'])
        self.assertIn('NOT seen the video', captured['body']['system'])
        demo = self.client.post(f"/api/films/{film['id']}/recap", json={'mode': 'demo'}).json()
        self.assertEqual(demo['origin'], 'demo')

    def test_diagram_crud_bad_ids_and_restart(self):
        film = self.film()
        body = {'title': 'Cover 3', 'template': 'frame', 'film_id': film['id'], 't_seconds': 5, 'player_ids': ['p01'], 'background': PNG, 'preview': PNG,
                'objects': [{'type': 'marker', 'x': 50, 'y': 30, 'label': 'QB'}, {'type': 'text', 'x': 60, 'y': 10, 'text': 'Cover 3', 'color': '#FFFFFF'}]}
        d = self.client.post('/api/diagrams', json=body).json()
        self.assertTrue(d['has_background'] and d['has_preview'])
        self.assertEqual(self.client.post('/api/diagrams', json={**body, 'player_ids': ['p99']}).status_code, 422)
        self.assertEqual(self.client.post('/api/diagrams', json={**body, 'meeting_id': 'no-such-meeting'}).status_code, 422)
        self.assertEqual(self.client.post('/api/diagrams', json={**body, 'film_id': 9999}).status_code, 404)
        moved = self.client.put(f"/api/diagrams/{d['id']}", json={**body, 'objects': [{'type': 'marker', 'x': 40, 'y': 30, 'label': 'QB'}], 'base_updated_at': d['updated_at']}).json()
        self.assertEqual(moved['objects'][0]['x'], 40)
        stale = self.client.put(f"/api/diagrams/{d['id']}", json={**body, 'base_updated_at': '2000-01-01T00:00:00'})
        self.assertEqual(stale.status_code, 409)  # edited in another tab
        reopened = FilmRoom(os.path.join(self.dir.name, 'coach.sqlite3'), os.path.join(self.dir.name, 'film')).get_diagram(d['id'])
        self.assertEqual(reopened['objects'][0]['x'], 40)  # survives a restart
        self.assertEqual(self.client.get(f"/api/diagrams?player_id=p01").json()[0]['id'], d['id'])
        self.assertEqual(self.client.get(f"/api/diagrams/{d['id']}/preview.png").status_code, 200)
        self.assertEqual(self.client.delete(f"/api/diagrams/{d['id']}").status_code, 204)

    def test_skill_checks_bounds_and_trend(self):
        for score in (2, 3, 4):
            self.assertEqual(self.client.post('/api/players/p01/skill-checks', json={'skill': 'Coverage recognition', 'score': score, 'why': 'Film'}).status_code, 201)
        data = self.client.get('/api/players/p01/skill-checks').json()
        self.assertEqual(data['skills']['Coverage recognition']['label'], 'Improving')
        for bad in ({'skill': 'x', 'score': 0, 'why': 'y'}, {'skill': 'x', 'score': 6, 'why': 'y'}, {'skill': 'x', 'score': 3, 'why': ''}, {'skill': 'x', 'score': True, 'why': 'y'}):
            self.assertEqual(self.client.post('/api/players/p01/skill-checks', json=bad).status_code, 422)
        self.assertEqual(self.client.post('/api/players/p99/skill-checks', json={'skill': 'x', 'score': 3, 'why': 'y'}).status_code, 404)
        self.assertIn('Coverage recognition', self.client.get('/api/position-skills/QB').json())
        self.assertEqual(self.client.put('/api/position-skills/QB', json={'skills': ['Any skill the coach wants']}).json(), ['Any skill the coach wants'])

    def test_film_pack_token_sensitive_notes_opened_watched_and_revoke(self):
        film = self.film()
        clip = self.client.post(f"/api/films/{film['id']}/clips", json={'start_s': 1, 'end_s': 4, 'player_ids': ['p01']}).json()
        ok = self.client.post(f"/api/films/{film['id']}/notes", json={'t_seconds': 2, 'text': 'Great read.', 'player_ids': ['p01'], 'show_in_pack': True}).json()
        private = self.client.post(f"/api/films/{film['id']}/notes", json={'t_seconds': 3, 'text': 'Check his ankle injury with the trainer.', 'player_ids': ['p01'], 'show_in_pack': True}).json()
        hidden = self.client.post(f"/api/films/{film['id']}/notes", json={'t_seconds': 3, 'text': 'Coach-only note.', 'player_ids': ['p01']}).json()
        base = {'title': 'Before Saturday', 'audience_kind': 'player', 'audience_ref': 'p01', 'clip_ids': [clip['id']]}
        for bad_note in (private['id'], hidden['id']):
            self.assertEqual(self.client.post('/api/film-packs', json={**base, 'note_ids': [bad_note]}).status_code, 422)
        a = self.client.post('/api/film-packs', json={**base, 'note_ids': [ok['id']]}).json()
        b = self.client.post('/api/film-packs', json={**base, 'note_ids': [ok['id']]}).json()
        self.assertNotEqual(a['token'], b['token'])
        self.assertGreaterEqual(len(a['token']), 32)  # 24 random bytes = 192 bits
        view = self.client.get(f"/api/pack/{a['token']}").json()
        self.assertEqual([n['text'] for n in view['notes']], ['Great read.'])
        self.assertNotIn('film_grade', view)
        text = json.dumps(view)
        self.assertNotIn('ankle', text)
        self.assertNotIn('Jordan', text)
        self.client.post(f"/api/pack/{a['token']}/watched")
        listed = {p['id']: p for p in self.client.get('/api/film-packs').json()}
        self.assertTrue(listed[a['id']]['first_opened_at'] and listed[a['id']]['watched_at'])
        self.assertEqual(self.client.post(f"/api/film-packs/{a['id']}/revoke").json()['state'], 'revoked')
        self.assertEqual(self.client.get(f"/api/pack/{a['token']}").status_code, 404)
        self.assertEqual(self.client.get('/api/pack/not-a-real-token-at-all-123').status_code, 404)
        with self.room.connect() as db:
            db.execute('UPDATE film_packs SET expires_at = ? WHERE id = ?', ('2020-01-01T00:00:00', b['id']))
        self.assertEqual(self.client.get(f"/api/pack/{b['token']}").status_code, 404)  # expired after 14 days

    def test_ask_aivana_film_cutup_needs_confirm(self):
        film = self.film()
        self.client.post(f"/api/films/{film['id']}/clips", json={'start_s': 2, 'end_s': 8, 'down': 3, 'player_ids': ['p03']})
        reply = self.client.post('/api/assistant/message', json={'message': 'Make a WR cut-up of 3rd downs', 'page': 'film', 'mode': 'live'}).json()
        self.assertEqual((reply['intent'], reply['confirm']['kind'], reply['confirm']['playlist']['title']), ('film_cutup', 'save_playlist', 'WR 3rd downs'))
        self.assertEqual(self.room.playlists(), [])  # nothing saved until the coach confirms
        note = self.client.post(f"/api/films/{film['id']}/notes", json={'t_seconds': 3, 'text': 'Stack the release.', 'player_ids': ['p03']}).json()
        missing = self.client.post('/api/assistant/message', json={'message': 'Which notes have no homework yet?', 'page': 'film', 'mode': 'live'}).json()
        self.assertIn(f"film:{film['id']}@3.0", [c['link'] for c in missing['citations']])
        self.assertTrue(note)


if __name__ == '__main__':
    unittest.main()
