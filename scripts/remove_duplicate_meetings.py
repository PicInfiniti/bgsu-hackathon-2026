"""Remove exact duplicate meetings (same date, title, attendees and records), keeping one.

Keeps the practice-pack seed (id starting with "m-") or else the earliest saved copy, carries any
"done" ticks over to the kept copy, and deletes only the extra copies and their edit history.
Dry run by default; pass --apply to change the database. A backup is written first.

    python scripts/remove_duplicate_meetings.py [--db backend/coach.sqlite3] [--apply]
"""
import argparse
import json
import shutil
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.core import Store  # noqa: E402


def plan(store):
    groups = defaultdict(list)
    for meeting in store.list():
        groups[Store.fingerprint(meeting)].append(meeting)
    result = []
    for copies in groups.values():
        if len(copies) < 2:
            continue
        copies.sort(key=lambda m: (not m['id'].startswith('m-'), m.get('saved_at') or ''))
        result.append((copies[0], copies[1:]))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=str(Path(__file__).resolve().parents[1] / 'backend' / 'coach.sqlite3'))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    store = Store(args.db)
    store.repair_seed_text()
    work = plan(store)
    if not work:
        print('No duplicate meetings.')
        return
    for keep, extra in work:
        print(f"Keep {keep['id']} ({keep['date']} · {keep['title']}); remove {[m['id'] for m in extra]}")
    if not args.apply:
        print('Dry run. Pass --apply to remove them.')
        return
    backup = f"{args.db}.backup-{datetime.now():%Y%m%d-%H%M%S}"
    shutil.copy2(args.db, backup)
    print(f'Backup: {backup}')
    with sqlite3.connect(args.db) as db:
        for keep, extra in work:
            done = {(i.get('player_id'), i['kind'], i['text']) for m in extra for i in m['items'] if i.get('completed')}
            body = json.loads(db.execute('SELECT body FROM meetings WHERE id = ?', (keep['id'],)).fetchone()[0])
            for item in body['items']:
                if (item.get('player_id'), item['kind'], item['text']) in done:
                    item['completed'] = True
            db.execute('UPDATE meetings SET body = ? WHERE id = ?', (json.dumps(body), keep['id']))
            for m in extra:
                db.execute('DELETE FROM meetings WHERE id = ?', (m['id'],))
                db.execute('DELETE FROM record_edits WHERE meeting_id = ?', (m['id'],))
                db.execute('UPDATE notes SET meeting_id = ? WHERE meeting_id = ?', (keep['id'], m['id'])) if db.execute(
                    "SELECT 1 FROM sqlite_master WHERE name = 'notes'").fetchone() else None
    print('Done.')


if __name__ == '__main__':
    main()
