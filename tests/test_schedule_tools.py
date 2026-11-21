"""Schedule search, ranged ICS export, To do checklist and notes kept off the calendar."""
import importlib.util
import os
import re
import tempfile
import unittest
from datetime import date, timedelta

from backend import schedule_tools as sched
from backend.core import DEMO, Store
from backend.notebook import Notebook

AVAILABLE = all(importlib.util.find_spec(x) for x in ('fastapi', 'httpx'))
P = {p['name'].split()[0]: p['id'] for p in DEMO['players']}
T = date.today()
D = lambda n: (T + timedelta(days=n)).isoformat()  # noqa: E731


def item(pid, text, due, **kw):
    return {'player_id': pid, 'kind': 'action', 'text': text, 'quote': text, 'due_date': due, **kw}


@unittest.skipUnless(AVAILABLE, 'Install backend/requirements-dev.txt to run FastAPI route checks.')
class ScheduleRouteTests(unittest.TestCase):
    def setUp(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from backend import notebook_routes
        self.dir = tempfile.TemporaryDirectory()
        path = os.path.join(self.dir.name, 's.sqlite3')
        self.store, self.nb = Store(path), Notebook(path)
        app = FastAPI()
        notebook_routes.register(app, self.store, self.nb)
        self.client = TestClient(app)
        note = 'Jordan reviews coverage clips. Jordan sees the trainer about his ankle injury.'
        self.meeting = self.store.save({'title': 'DB room', 'date': D(-3), 'meeting_type': 'individual', 'attendees': [P['Jordan']], 'note': note, 'approved': True, 'origin': 'manual',
                                        'items': [item(P['Jordan'], 'Jordan reviews coverage clips.', D(3)),
                                                  item(P['Jordan'], 'Jordan sees the trainer about his ankle injury.', D(2), topic='Health & Injury Follow-up')]})
        self.nb.create_event({'type': 'game', 'title': 'Game day · at Lakeside', 'start_at': f'{D(5)}T13:00', 'location': 'Lakeside Stadium', 'duration_min': 180})
        self.nb.create_event({'type': 'game', 'title': 'Game day · vs. North', 'start_at': f'{D(-12)}T13:00'})
        self.nb.create_event({'type': 'practice', 'title': 'Practice (pads)', 'start_at': f'{D(-20)}T15:30', 'repeat_weekly': True, 'focus': 'Red zone'})
        self.nb.create_event({'type': 'meeting', 'title': '1-on-1: Jordan Ellis', 'start_at': f'{D(1)}T14:00', 'audience': f"player:{P['Jordan']}"})
        self.nb.create_note({'notebook': 'personal', 'title': 'Private thoughts', 'body': 'Lakeside coach is tough. Jordan family situation.', 'note_date': D(0)})

    def tearDown(self):
        self.client.close()
        self.dir.cleanup()

    def search(self, q, kind='all'):
        return self.client.get('/api/schedule/search', params={'q': q, 'kind': kind}).json()

    def test_search_covers_past_and_future_activities_and_deadlines(self):
        north = self.search('north')
        self.assertEqual([i['title'] for i in north['past']], ['Game day · vs. North'])  # past is searched too
        lakeside = self.search('lakeside stadium')  # location
        self.assertEqual([i['kind'] for i in lakeside['upcoming']], ['game'])
        self.assertTrue(self.search('red zone')['total'] >= 3)  # practice focus, every week of a repeat
        jordan = self.search('jordan ellis')
        kinds = {i['kind'] for i in jordan['upcoming'] + jordan['past']}
        self.assertTrue({'meeting', 'homework', 'player_meeting'} <= kinds)  # his 1-on-1, assignment deadline and saved meeting
        self.assertTrue(self.search('#12')['total'] >= 1)  # jersey number finds his assignment

    def test_type_chips_filter_search(self):
        self.assertEqual({i['kind'] for i in self.search('', 'games')['upcoming'] + self.search('', 'games')['past']}, {'game'})
        self.assertEqual({i['kind'] for i in self.search('jordan', 'assignments')['upcoming']}, {'homework'})
        self.assertEqual(self.client.get('/api/schedule/search', params={'q': 'x', 'kind': 'secrets'}).status_code, 422)

    def test_private_notes_and_health_items_are_never_searched(self):
        self.assertEqual(self.search('tough')['total'], 0)  # only in a private note
        self.assertEqual(self.search('family')['total'], 0)
        self.assertEqual(self.search('ankle')['total'], 0)  # health homework stays out
        self.assertEqual(self.search('trainer')['total'], 0)

    def test_notes_are_not_drawn_on_the_calendar(self):
        items = self.client.get('/api/events', params={'from': D(-1), 'to': D(1)}).json()['items']
        self.assertFalse([i for i in items if i.get('source') == 'note' or i['type'] == 'note'])

    def test_ics_range_uids_names_and_privacy(self):
        params = {'from': D(-1), 'to': D(7), 'homework': 1, 'names': 0}
        first = self.client.get('/api/events/export.ics', params=params).text
        second = self.client.get('/api/events/export.ics', params=params).text
        uids = lambda t: sorted(re.findall(r'^UID:(.+)$', t, re.M))  # noqa: E731
        self.assertEqual(uids(first), uids(second))  # importing again updates, not duplicates
        self.assertEqual(len(uids(first)), len(set(uids(first))))
        self.assertNotIn('RRULE', first)  # repeats are written out
        self.assertIn('Game day · at Lakeside', first)
        self.assertNotIn('vs. North', first)  # outside the range
        self.assertNotIn('Jordan', first)  # names off by default, also in 1-on-1 titles
        self.assertIn('SUMMARY:Assignment due: player reviews coverage clips.', first.replace('\r\n ', ''))
        self.assertNotIn('ankle', first)
        self.assertNotIn('tough', first)  # notes are never exported
        self.assertTrue(all(re.match(r'DTSTART:\d{8}T\d{6}Z$', l) for l in first.split('\r\n') if l.startswith('DTSTART:')))  # UTC
        self.assertIn('LOCATION:Lakeside Stadium', first)
        named = self.client.get('/api/events/export.ics', params={**params, 'names': 1}).text
        self.assertIn('Jordan Ellis', named)
        no_hw = self.client.get('/api/events/export.ics', params={**params, 'homework': 0}).text
        self.assertNotIn('Assignment due', no_hw)
        season = self.client.get('/api/events/export.ics').headers['content-disposition']
        start, end = sched.season_range(T)
        self.assertIn(f'{start.isoformat()}-to-{end.isoformat()}', season)  # default: the football season

    def test_checklist_reads_existing_homework_and_updates_the_original(self):
        todo = self.client.post('/api/events', json={'type': 'other', 'title': 'Confirm bus time', 'start_at': f'{D(0)}T07:00', 'duration_min': 15, 'todo': True}).json()
        data = self.client.get('/api/schedule/checklist').json()
        before_game = [i['title'] for i in data['groups']['before_game']]
        self.assertIn('Jordan reviews coverage clips.', before_game)
        self.assertNotIn('Jordan sees the trainer about his ankle injury.', str(data))
        self.assertEqual([i['title'] for i in data['groups']['today']], ['Confirm bus time'])
        hw = next(i for i in self.store.list()[0]['items'] if i['text'].startswith('Jordan reviews'))
        self.store.complete(self.meeting['id'], hw['id'], True)  # what the checkbox's PATCH /api/meetings/.../items/... calls
        data = self.client.get('/api/schedule/checklist').json()
        self.assertIn('Jordan reviews coverage clips.', [i['title'] for i in data['groups']['done']])
        self.assertTrue(next(i for i in self.store.list()[0]['items'] if i['id'] == hw['id'])['completed'])  # the original record
        items = self.client.get('/api/events', params={'from': D(3), 'to': D(3)}).json()['items']
        self.assertTrue(next(i for i in items if i['source'] == 'homework')['completed'])  # the calendar chip follows
        self.client.patch(f"/api/events/{todo['id']}", json={'done': True})
        self.assertEqual(self.client.get('/api/schedule/checklist').json()['groups']['today'], [])
        export = self.client.get('/api/events/export.ics', params={'from': D(-1), 'to': D(1)}).text
        self.assertNotIn('Confirm bus time', export)  # coach to-dos stay in the app


class SeasonTests(unittest.TestCase):
    def test_season_defaults_and_custom(self):
        self.assertEqual(sched.season_range(date(2026, 11, 21)), (date(2026, 8, 1), date(2027, 1, 31)))
        self.assertEqual(sched.season_range(date(2027, 1, 10)), (date(2026, 8, 1), date(2027, 1, 31)))
        self.assertEqual(sched.season_range(date(2026, 3, 1), {'start': '03-01', 'end': '05-31'}), (date(2026, 3, 1), date(2026, 5, 31)))


if __name__ == '__main__':
    unittest.main()
