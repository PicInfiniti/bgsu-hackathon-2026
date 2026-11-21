"""Speaker lines tagged by the coach: saved with the note, relabelled, Unknown never linked,
and extraction keeps players' own words apart from coach feedback (1 coach + 2 players)."""
import os
import tempfile
import unittest

from backend.core import DEMO
from backend.extraction import normalize_records, speaker_of
from backend.notebook import Notebook

P = {p['name'].split()[0]: p for p in DEMO['players']}
TAYLOR, MORGAN = P['Taylor'], P['Morgan']
LINES = [{'speaker_label': 'Coach', 'player_id': None, 'start_ms': 3000, 'text': 'Taylor, what happened on third down?'},
         {'speaker_label': TAYLOR['name'], 'player_id': TAYLOR['id'], 'start_ms': 7000, 'text': 'I missed the safety rotation.'},
         {'speaker_label': 'Coach', 'player_id': None, 'start_ms': 11000, 'text': 'Morgan, what happened with your route?'},
         {'speaker_label': MORGAN['name'], 'player_id': MORGAN['id'], 'start_ms': 15000, 'text': 'I ran it too deep.'},
         {'speaker_label': 'Coach', 'player_id': None, 'start_ms': 19000, 'text': 'Taylor must watch the safety on three clips by Friday. Morgan must run the dig at 12 yards in practice by Friday.'}]
NOTE = '\n'.join(f"[00:{l['start_ms'] // 1000:02d}] {l['speaker_label']}: {l['text']}" for l in LINES)


class SegmentStoreTests(unittest.TestCase):
    def test_segments_saved_reloaded_relabelled_and_unknown_unlinked(self):
        with tempfile.TemporaryDirectory() as d:
            nb = Notebook(os.path.join(d, 'n.sqlite3'))
            note = nb.create_note({'notebook': 'player_meetings', 'title': 'Film talk', 'body': NOTE, 'input_method': 'voice', 'segments': LINES})
            reloaded = Notebook(os.path.join(d, 'n.sqlite3')).get_note(note['id'])
            self.assertEqual([(s['speaker_label'], s['player_id'], s['start_ms'], s['source']) for s in reloaded['segments']],
                             [(l['speaker_label'], l['player_id'], l['start_ms'], 'coach_tag') for l in LINES])
            fixed = [dict(s) for s in reloaded['segments']]
            fixed[3] = {**fixed[3], 'speaker_label': 'Unknown', 'player_id': MORGAN['id']}
            fixed[1] = {**fixed[1], 'speaker_label': MORGAN['name'], 'player_id': MORGAN['id']}
            updated = nb.update_note(note['id'], {'segments': fixed})
            self.assertEqual((updated['segments'][3]['speaker_label'], updated['segments'][3]['player_id']), ('Unknown', None))  # Unknown is never a player
            self.assertEqual(updated['segments'][1]['player_id'], MORGAN['id'])
            for bad in ([{'speaker_label': 'Speaker 1', 'text': 'x', 'source': 'diarization'}], [{'speaker_label': 'Alex', 'player_id': 'Alex', 'text': 'x'}],
                        [{'speaker_label': 'Coach', 'text': ''}], 'not a list'):
                with self.assertRaises(ValueError):
                    nb.update_note(note['id'], {'segments': bad})  # labels can only come from the coach
            plain = nb.create_note({'notebook': 'personal', 'body': 'No tagging.'})
            self.assertEqual(plain['segments'], [])  # without tapping, nothing changes


class SpeakerExtractionTests(unittest.TestCase):
    def rec(self, mention, quote, task=None, feedback=None, kind=None):
        pid = next(p['id'] for p in DEMO['players'] if mention in p['name'])
        return {'target': {'scope': 'player', 'player_id': pid, 'mention': mention, 'match_method': 'first_or_last_name', 'group_label': None},
                'topic': None, 'skill': None, 'tags': [], 'details': None, 'feedback_type': kind, 'feedback': feedback,
                'action_item': {'task': task, 'deadline_text': 'by Friday' if task else None, 'deadline_date': None}, 'source_text': quote, 'confidence': 'high'}

    def test_one_coach_two_players_split_without_mixing(self):
        self.assertEqual(speaker_of('I missed the safety rotation.', NOTE), TAYLOR['name'])
        self.assertEqual(speaker_of('Morgan must run the dig at 12 yards in practice by Friday.', NOTE), 'Coach')
        meeting = {'title': 'Film talk', 'date': '2026-11-18', 'meeting_type': 'group', 'attendees': [TAYLOR['id'], MORGAN['id']], 'note': NOTE}
        payload = {'records': [
            self.rec('Taylor', 'Taylor must watch the safety on three clips by Friday.', task='Watch the safety on three clips'),
            self.rec('Morgan', 'Morgan must run the dig at 12 yards in practice by Friday.', task='Run the dig at 12 yards'),
            self.rec('Taylor', 'I missed the safety rotation.', feedback='Missed the safety rotation', kind='Improvement')],  # a player's own words
            'warnings': []}
        items, _, errors = normalize_records(payload, meeting, [TAYLOR, MORGAN])
        homework = {i['player_id']: i['text'] for i in items if i['kind'] == 'action'}
        self.assertEqual(homework, {TAYLOR['id']: 'Watch the safety on three clips', MORGAN['id']: 'Run the dig at 12 yards'})  # no mixing
        self.assertTrue(all(i['due_date'] == '2026-11-20' for i in items if i['kind'] == 'action'))
        own_words = next(i for i in items if i['kind'] == 'improvement')
        self.assertTrue(any('spoken by' in w for w in own_words['warnings']))
        self.assertTrue(any("player's own words" in e for e in errors))  # it cannot be approved as coach feedback without a correction


if __name__ == '__main__':
    unittest.main()
