import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from . import aivana
from .core import DEMO, PLAYERS, Store, demo_extract, validate_item, validate_meeting

app = FastAPI(title='Falcon Follow-up prototype')
db_path = Path(os.environ.get('COACH_DB_PATH', Path(__file__).with_name('coach.sqlite3')))
store = Store(db_path)


@app.get('/api/health')
def health():
    return {'ok': True, 'aivana_configured': bool(os.environ.get('AIVANA_API_KEY'))}


@app.get('/api/meetings')
def meetings():
    return store.list()


@app.post('/api/extract')
def extract(body: dict):
    try:
        meeting = validate_meeting(body)
        if body.get('mode') not in ('demo', 'live'):
            raise ValueError('Choose demo or live mode.')
        items = demo_extract(meeting) if body['mode'] == 'demo' else aivana.extract(meeting, [p for p in DEMO['players'] if p['id'] in meeting['attendees']])
        validated = [validate_item(x, meeting) for x in items]
        return {'items': validated, 'origin': 'demo' if body['mode'] == 'demo' else 'aivana'}
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except aivana.AivanaError as error:
        raise HTTPException(error.status, str(error)) from None


@app.post('/api/meetings', status_code=201)
def save(body: dict):
    try:
        return store.save(body)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@app.patch('/api/meetings/{meeting_id}/items/{item_id}')
def complete(meeting_id: str, item_id: str, body: dict):
    try:
        return store.complete(meeting_id, item_id, body.get('completed'))
    except KeyError:
        raise HTTPException(404, 'Action item not found.') from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@app.get('/api/players/{player_id}/prep')
def prep(player_id: str):
    if player_id not in PLAYERS:
        raise HTTPException(404, 'Player not found.')
    records = []
    for meeting in store.list():
        items = [x for x in meeting['items'] if x['player_id'] == player_id]
        if items:
            records.append({'date': meeting['date'], 'items': items})
    if not records:
        raise HTTPException(422, 'Save a reviewed meeting for this player first.')
    if not os.environ.get('AIVANA_API_KEY'):
        raise HTTPException(503, 'Set AIVANA_API_KEY in the backend environment first.')

    def events():
        try:
            context = {'player': next(p for p in DEMO['players'] if p['id'] == player_id), 'records': records[:8]}
            for event, payload in aivana.preparation_events(context):
                yield f'event: {event}\ndata: {json.dumps(payload)}\n\n'
        except (aivana.AivanaError, OSError) as error:
            message = str(error) if isinstance(error, aivana.AivanaError) else 'The Aivana connection was interrupted. Please retry.'
            yield f'event: error\ndata: {json.dumps({"message": message})}\n\n'
    return StreamingResponse(events(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache'})
