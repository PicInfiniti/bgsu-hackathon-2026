"""HTTP smoke check with an isolated DB; --live uses paid extraction and streaming (up to three calls with one validation correction)."""
import argparse
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Use real Aivana extraction and streaming (consumes tokens).')
    parser.add_argument('--key-file', type=Path, help='Private file containing a raw key or AIVANA_API_KEY=value. Never executed.')
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()
    env = os.environ.copy()
    if args.live:
        if args.key_file:
            lines = [line.strip() for line in args.key_file.read_text().splitlines() if line.strip() and not line.lstrip().startswith('#')]
            values = [line.split('=', 1)[1].strip().strip('\"\'') for line in lines if line.startswith('AIVANA_API_KEY=')]
            key = values[0] if len(values) == 1 else lines[0] if len(lines) == 1 else ''
            if not key.startswith('ai_live_') or any(c.isspace() for c in key):
                parser.error('Key file must contain one Live key or AIVANA_API_KEY=value.')
            env['AIVANA_API_KEY'] = key
        if not env.get('AIVANA_API_KEY'):
            parser.error('Export AIVANA_API_KEY or supply --key-file before --live.')
    else:
        env.pop('AIVANA_API_KEY', None)

    base = f'http://127.0.0.1:{args.port}'

    def request(path, body=None, method=None, expected=200):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(base + path, data=data, method=method, headers={'Content-Type': 'application/json'})
        try:
            response = urllib.request.urlopen(req, timeout=100)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            content = response.read().decode()
            if response.status != expected:
                # Only our backend's sanitized errors are printed, never request headers.
                raise RuntimeError(f'{path}: expected {expected}, got {response.status}: {content}')
            return content if path.endswith('/prep') and expected == 200 else json.loads(content)

    with tempfile.TemporaryDirectory(prefix='coach-backend-check-') as directory:
        env['COACH_DB_PATH'] = str(Path(directory) / 'verify.sqlite3')
        # Never load the developer's private .env, including during no-AI checks.
        env['COACH_ENV_FILE'] = str(Path(directory) / 'verify.env')
        with (Path(directory) / 'server.log').open('w+') as log:
            process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', str(args.port)], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                # Wait for our server's startup marker, never probe an unrelated server.
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError('Backend could not start; check dependencies and whether the selected port is occupied.')
                    log.seek(0)
                    if 'Uvicorn running on' in log.read():
                        break
                    time.sleep(0.1)
                else:
                    raise RuntimeError('Backend startup timed out.')
                health = request('/api/health')
                assert health == {'ok': True, 'aivana_configured': args.live}, health
                demo = json.loads((ROOT / 'data/demo.json').read_text())
                seeded = request('/api/meetings')
                assert {m['id'] for m in seeded} == {m['id'] for m in demo['meetings']}
                assert all(m['approved'] and m['origin'] == 'demo' for m in seeded)
                meeting = copy.deepcopy(demo['samples'][0])
                result = request('/api/extract', {**meeting, 'mode': 'demo'})
                assert result['origin'] == 'demo' and result['items']
                request('/api/extract', {**meeting, 'mode': 'invalid'}, expected=422)
                if not args.live:
                    request('/api/extract', {**meeting, 'mode': 'live'}, expected=503)
                meeting['items'] = result['items']
                meeting['extraction_id'] = result['extraction_id']
                assert all(i['schema_version'] == 2 for i in meeting['items'])
                meeting['approved'] = False
                request('/api/meetings', meeting, expected=422)
                assert request('/api/meetings') == seeded
                # Only the prepared, explicitly approved fixture is saved. AI output
                # remains unsaved pending a coach's review.
                meeting.update(approved=True, origin='demo')
                saved = request('/api/meetings', meeting, expected=201)
                assert any(m['id'] == saved['id'] for m in request('/api/meetings'))
                assert len(request('/api/meetings')) == len(seeded) + 1
                action = next(item for item in saved['items'] if item['kind'] == 'action')
                path = f"/api/meetings/{saved['id']}/items/{action['id']}"
                for completed in (True, False):
                    updated = request(path, {'completed': completed}, method='PATCH')
                    assert next(item for item in updated['items'] if item['id'] == action['id'])['completed'] is completed
                print('PASS: HTTP health, demo extraction, validation, approval gate, SQLite save/read, completion/reopening.', flush=True)
                prep_path = f"/api/players/{meeting['attendees'][0]}/prep"
                if not args.live:
                    request(prep_path, expected=503)
                    speech = {'title': 'Team encouragement', 'date': meeting['date'], 'meeting_type': 'team',
                              'attendees': [p['id'] for p in demo['players']],
                              'note': 'Keep supporting each other. I believe in this team.',
                              'items': [], 'note_only': True, 'origin': 'manual', 'approved': False}
                    request('/api/meetings', speech, expected=422)
                    speech['approved'] = True
                    note = request('/api/meetings', speech, expected=201)
                    assert note['note_only'] and note['items'] == [] and note['note'] == speech['note']
                    assert any(m == note for m in request('/api/meetings'))
                    print('PASS: original team speech approval/save/read without player records or AI.', flush=True)
                    print('PASS: missing-key errors. No Aivana requests made.', flush=True)
                    return
                print('Calling real Aivana structured extraction (one request, at most one corrective request)...', flush=True)
                live = request('/api/extract', {**meeting, 'mode': 'live'})
                assert live['origin'] == 'aivana' and live['items']
                assert all(i['player_id'] in meeting['attendees'] and i['quote'] in meeting['note'] for i in live['items']), 'Unmatched or unsupported evidence requires coach correction.'
                assert len(request('/api/meetings')) == len(seeded) + 1, 'Extraction must not save records.'
                print(f"PASS: real structured extraction; {len(live['items'])} server-validated items. Unsaved output for coach review:", flush=True)
                print(json.dumps(live['items'], indent=2), flush=True)
                print('Calling real Aivana preparation stream from the approved demo fixture (one request)...', flush=True)
                stream = request(prep_path)
                events = []
                text_parts = []
                for block in stream.strip().split('\n\n'):
                    lines = block.splitlines()
                    event = next((line[7:] for line in lines if line.startswith('event: ')), '')
                    payload = json.loads('\n'.join(line[6:] for line in lines if line.startswith('data: ')))
                    if event == 'error':
                        raise RuntimeError(f"Preparation stream failed: {payload.get('message', 'unknown error')}")
                    events.append(event)
                    if event == 'delta':
                        text_parts.append(payload.get('text', ''))
                    if event == 'done' and payload.get('finish_reason') == 'length':
                        raise RuntimeError('Preparation brief was truncated.')
                assert events and events[-1] == 'done' and ''.join(text_parts).strip(), 'Expected nonempty deltas followed by done.'
                print(f"PASS: real SSE preparation; {events.count('delta')} deltas and terminal done event.", flush=True)
                print(''.join(text_parts), flush=True)
                print('Temporary verification database will be removed; application data was untouched.', flush=True)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, AssertionError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
