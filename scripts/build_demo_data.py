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
        return json.loads((PACK / name).read_text(encoding='utf-8'))

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
    for index, sample_id in enumerate(('group', 'team')):
        sample = next(s for s in samples if s['id'] == sample_id)
        meeting = {key: copy.deepcopy(sample[key]) for key in ('title', 'date', 'meeting_type', 'attendees', 'note', 'items')}
        meeting.update(id=f'm-{seed_namespace}-{index}', approved=True, origin='demo')
        for item_index, item in enumerate(meeting['items']):
            item.update(id=f'i-{seed_namespace}-{index}-{item_index}', completed=False)
        meetings.append(meeting)
    return {
        'provenance': manifest['provenance'],
        'sport': manifest['sport'],
        'pack_version': manifest['version'],
        'reference_date': manifest['reference_date'],
        'players': roster,
        'samples': samples,
        'meetings': meetings,
    }


if __name__ == '__main__':
    (ROOT / 'data/demo.json').write_text(json.dumps(build(), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('Built data/demo.json from data/synthetic; persistent app data untouched.')
