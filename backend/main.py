import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from . import aivana
from .core import DEMO, PLAYERS, DuplicateMeeting, Store, demo_extract, validate_meeting
from .config import load_environment
from .extraction import normalize_records, enrich_demo, applies_to
from .extraction_schema import CATEGORIES
from .assistant import select_context, checked_answer
from .grouping import annotate_shared_records
from .notebook_routes import create_notebook, register
from .film import FilmRoom
from . import film_routes
from . import roster as roster_mod

load_environment()
app = FastAPI(title='Falcon Follow-up prototype')
db_path = Path(os.environ.get('COACH_DB_PATH', Path(__file__).with_name('coach.sqlite3')))
store = Store(db_path)
store.seed_pack()
notebook = create_notebook(db_path)


def _sync_film_sets(players):
    film_routes.ROSTER.clear()
    film_routes.ROSTER.update(p['id'] for p in players)
    film_routes.ROOMS.clear()
    film_routes.ROOMS.update(p['position_group'] for p in players)


roster_mod.on_change(_sync_film_sets)
roster = roster_mod.Roster(db_path)
film_room = FilmRoom(db_path, Path(os.environ.get('COACH_FILM_DIR', Path(__file__).resolve().parents[1] / 'data' / 'film')))
register(app, store, notebook, extra_notifications=lambda now: film_routes.film_notifications(film_room, now), film_room=film_room)
film_routes.register(app, store, notebook, film_room)


@app.get('/api/health')
def health():
    return {'ok': True, 'aivana_configured': bool(os.environ.get('AIVANA_API_KEY'))}


@app.get('/api/meta/categories')
def categories():
    return {'schema_version': 2, **CATEGORIES}


@app.get('/api/meetings')
def meetings():
    return store.list()


@app.post('/api/extract')
def extract(body: dict):
    try:
        meeting = validate_meeting(body)
        if body.get('mode') not in ('demo', 'live'):
            raise ValueError('Choose demo or live mode.')
        players = [p for p in DEMO['players'] if p['id'] in meeting['attendees']]
        origin = 'demo' if body['mode'] == 'demo' else 'aivana'
        warnings, raw_outputs = [], []
        if origin == 'demo':
            prepared = demo_extract(meeting)
            items = enrich_demo(prepared, meeting, players)
            raw_outputs.append(prepared)
        else:
            errors = None
            for attempt in range(2):
                try:
                    payload = aivana.extract(meeting, players, errors=errors)
                except aivana.AivanaError:
                    if not attempt:
                        raise
                    warnings.append('The corrective extraction failed. Review the first drafts and correct or remove flagged records.')
                    break
                raw_outputs.append(payload)
                try:
                    items, warnings, errors = normalize_records(payload, meeting, players)
                except ValueError as error:
                    raise aivana.AivanaError(str(error)) from None
                if not errors:
                    break
                if attempt:
                    warnings.extend(errors)
            if errors:
                warnings = list(dict.fromkeys(warnings + errors))
                warnings.append('Some records require correction. Unmatched players and invalid source quotes cannot be saved.')
        items = annotate_shared_records(items, meeting, players)
        run_id = store.capture_extraction(meeting, items, warnings, origin, raw_outputs)
        return {'items': items, 'warnings': warnings, 'origin': origin, 'extraction_id': run_id, 'schema_version': 2}
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except aivana.AivanaError as error:
        raise HTTPException(error.status, str(error)) from None


@app.post('/api/meetings', status_code=201)
def save(body: dict):
    try:
        if isinstance(body.get('items'), list) and any(not isinstance(item, dict) or item.get('schema_version') != 2 for item in body['items']):
            raise ValueError('Use the current review form to save records with topic and confidence fields.')
        if body.get('origin') == 'aivana' and not body.get('extraction_id'):
            raise ValueError('Aivana records need their extraction draft ID before approval.')
        note_id = body.get('source_note_id')
        if isinstance(note_id, int) and not isinstance(note_id, bool):
            existing = existing_meeting(note_id)
            if existing:
                raise DuplicateMeeting(existing)
        return store.save(body)
    except DuplicateMeeting as error:
        raise HTTPException(409, str(error)) from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


def existing_meeting(note_id):
    """A meeting already approved from this note: by its source note id, or the note's older meeting link."""
    meeting = store.meeting_for_note(note_id)
    if meeting:
        return meeting
    try:
        linked = notebook.get_note(note_id).get('meeting_id')
    except KeyError:
        return None
    return next((m for m in store.list() if m['id'] == linked), None) if linked else None


@app.get('/api/notes/{note_id}/meeting')
def meeting_for_note(note_id: int):
    """The meeting already approved from this note (so the review is not opened twice)."""
    meeting = existing_meeting(note_id)
    if not meeting:
        raise HTTPException(404, 'No meeting from this note yet.')
    return meeting


@app.post('/api/meetings/import')
def import_browser_history(body: dict):
    try:
        return {'imported': store.import_reviewed(body.get('meetings'))}
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


@app.get('/api/players')
def players_list():
    return roster.list()


@app.post('/api/players', status_code=201)
def player_create(body: dict):
    try:
        player, warnings = roster.create(body)
        return {'player': player, 'warnings': warnings}
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@app.patch('/api/players/{player_id}')
def player_update(player_id: str, body: dict):
    try:
        player, warnings = roster.update(player_id, body)
        return {'player': player, 'warnings': warnings}
    except KeyError:
        raise HTTPException(404, 'Player not found.') from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@app.post('/api/players/{player_id}/next-season')
def player_next_season(player_id: str):
    try:
        player, warnings = roster.next_season(player_id)
        return {'player': player, 'warnings': warnings}
    except KeyError:
        raise HTTPException(404, 'Player not found.') from None


@app.get('/api/players/{player_id}/prep')
def prep(player_id: str):
    if player_id not in PLAYERS:
        raise HTTPException(404, 'Player not found.')
    records = []
    remaining = 10
    for meeting in store.list():
        items = [{key: x.get(key) for key in ('kind', 'text', 'skill', 'topic', 'due_date', 'completed')} for x in meeting['items'] if applies_to(x, player_id) and not x.get('sensitive')]
        if items:
            records.append({'date': meeting['date'], 'items': items[:remaining]})
            remaining -= len(items[:remaining])
        if not remaining:
            break
    if not records:
        raise HTTPException(422, 'No non-sensitive approved records are available for this player.')
    if not os.environ.get('AIVANA_API_KEY'):
        raise HTTPException(503, 'Set AIVANA_API_KEY in the backend environment first.')

    def events():
        try:
            context = {'player': next(p for p in DEMO['players'] if p['id'] == player_id), 'records': records, 'context_window': 'Up to 10 latest non-sensitive approved records'}
            for event, payload in aivana.preparation_events(context):
                yield f'event: {event}\ndata: {json.dumps(payload)}\n\n'
        except (aivana.AivanaError, OSError) as error:
            message = str(error) if isinstance(error, aivana.AivanaError) else 'The Aivana connection was interrupted. Please retry.'
            yield f'event: error\ndata: {json.dumps({"message": message})}\n\n'
    return StreamingResponse(events(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache'})


@app.post('/api/assistant')
def assistant(body: dict):
    try:
        question, sources, total, today = select_context(store.list(), body)
        person = next(p for p in DEMO['players'] if p['id'] == body['player_id'])
        answer = {'statements': [], 'suggestions': []}
        if sources:
            if body['mode'] == 'demo':
                answer['statements'] = [{'text': s['text'], 'source_ids': [s['source_id']]} for s in sources[:8]]
            else:
                try:
                    answer = checked_answer(aivana.answer_question(question, person, sources, today), sources)
                except ValueError as error:
                    raise aivana.AivanaError(str(error)) from None
        return {**answer, 'sources': sources, 'matched_count': total, 'context_count': len(sources),
                'limited': total > len(sources), 'origin': 'demo' if body['mode'] == 'demo' else 'aivana',
                'player_id': person['id'], 'question': question}
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except aivana.AivanaError as error:
        raise HTTPException(error.status, str(error)) from None
