"""Build offline demo fixtures from the original synthetic Project A practice pack.

Does not write to SQLite or browser storage. Run from any directory.
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / 'data/synthetic'


def build():
    def read(name):
        return json.loads((PACK / name).read_text())

    manifest = read('manifest.json')
    roster = read('roster.json')
    notes = read('meetings.json')
    expected = read('expected.json')
    samples = []
    for note in notes:
        sample = {key: copy.deepcopy(note[key]) for key in ('id', 'label', 'title', 'date', 'meeting_type', 'attendees', 'note')}
        sample['items'] = copy.deepcopy(expected[note['id']]['items'])
        samples.append(sample)
    meetings = []
    seed_namespace = f"{manifest['sport'].lower()}-v{manifest['version']}"
    for sample_id in manifest.get('seed_sample_ids', ['group', 'team']):
        sample = next(s for s in samples if s['id'] == sample_id)
        meeting = {key: copy.deepcopy(sample[key]) for key in ('title', 'date', 'meeting_type', 'attendees', 'note', 'items')}
        # Keep the original two seed IDs; additions use stable scenario IDs.
        seed_id = {'group':'0', 'team':'1'}.get(sample_id, sample_id)
        meeting.update(id=f'm-{seed_namespace}-{seed_id}', approved=True, origin='demo')
        if not meeting['items']:
            meeting['note_only'] = True
        for item_index, item in enumerate(meeting['items']):
            item.update(id=f'i-{seed_namespace}-{seed_id}-{item_index}', completed=False)
        meetings.append(meeting)
    return {
        'provenance': manifest['provenance'],
        'sport': manifest['sport'],
        'pack_version': manifest['version'],
        'pack_revision': manifest.get('revision', 0),
        'reference_date': manifest['reference_date'],
        'players': roster,
        'samples': samples,
        'meetings': meetings,
    }


if __name__ == '__main__':
    (ROOT / 'data/demo.json').write_text(json.dumps(build(), indent=2, ensure_ascii=False) + '\n')
    print('Built data/demo.json from data/synthetic; persistent app data untouched.')
