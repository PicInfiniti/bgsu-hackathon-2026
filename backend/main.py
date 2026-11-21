import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from . import aivana
from .core import DEMO, PLAYERS, Store, demo_extract, validate_meeting
from .config import load_environment
from .extraction import normalize_records, enrich_demo, applies_to
from .extraction_schema import CATEGORIES
from .assistant import select_context, checked_answer, selected_players
from .grouping import annotate_shared_records
from . import strategy
from .preparation import preparation_context, demo_brief

load_environment()
app = FastAPI(title='Falcon Follow-up prototype')
db_path = Path(os.environ.get('COACH_DB_PATH', Path(__file__).with_name('coach.sqlite3')))
store = Store(db_path)
store.seed_pack()


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
        return store.save(body)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


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


def preparation_response(player_id, body):
    try:
        context = preparation_context(store.list(), player_id, body)
    except KeyError:
        raise HTTPException(404, 'Player not found.') from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    mode = body.get('mode', 'live')
    if mode not in ('demo','live'):
        raise HTTPException(422, 'Choose demo or live preparation.')
    if mode == 'live' and not os.environ.get('AIVANA_API_KEY'):
        raise HTTPException(503, 'Set AIVANA_API_KEY in the backend environment first.')

    def events():
        metadata = {key:context[key] for key in ('record_count','matched_count','limited','target')}
        yield f'event: context\ndata: {json.dumps(metadata)}\n\n'
        try:
            if mode == 'demo':
                yield f'event: delta\ndata: {json.dumps({"text":demo_brief(context)})}\n\n'
                yield 'event: done\ndata: {"finish_reason":"stop"}\n\n'
            else:
                for event, payload in aivana.preparation_events(context):
                    yield f'event: {event}\ndata: {json.dumps(payload)}\n\n'
        except (aivana.AivanaError, OSError) as error:
            message = str(error) if isinstance(error, aivana.AivanaError) else 'The Aivana connection was interrupted. Please retry.'
            yield f'event: error\ndata: {json.dumps({"message":message})}\n\n'
    return StreamingResponse(events(), media_type='text/event-stream', headers={'Cache-Control':'no-cache'})


@app.get('/api/players/{player_id}/prep')
def prep(player_id: str):
    return preparation_response(player_id, {})


@app.post('/api/players/{player_id}/prep')
def selected_prep(player_id: str, body: dict):
    return preparation_response(player_id, body)


@app.post('/api/assistant')
def assistant(body: dict):
    try:
        question, sources, total, today = select_context(store.list(), body)
        scope, player_ids = selected_players(body)
        people = [p for p in DEMO['players'] if p['id'] in player_ids]
        context = {'scope': scope, 'players': people}
        answer = {'statements': [], 'suggestions': []}
        if sources:
            if body['mode'] == 'demo':
                answer['statements'] = [{'text': f"{', '.join(s['player_names'])}: {s['text']}", 'source_ids': [s['source_id']]} for s in sources[:8]]
            else:
                try:
                    answer = checked_answer(aivana.answer_question(question, context, sources, today), sources)
                except ValueError as error:
                    raise aivana.AivanaError(str(error)) from None
        return {**answer, 'sources': sources, 'matched_count': total, 'context_count': len(sources),
                'limited': total > len(sources), 'origin': 'demo' if body['mode'] == 'demo' else 'aivana',
                'player_id': player_ids[0] if scope == 'individual' else None, 'scope': scope,
                'player_ids': player_ids, 'covered_player_count': len({pid for s in sources for pid in s['player_ids']}),
                'question': question}
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except aivana.AivanaError as error:
        raise HTTPException(error.status, str(error)) from None


@app.get('/api/strategy-boards')
def strategy_list():
    return strategy.list_boards(store)


@app.get('/api/strategy-boards/{board_id}')
def strategy_get(board_id: str):
    try:
        return strategy.get_board(store, board_id)
    except KeyError:
        raise HTTPException(404, 'Strategy board not found.') from None


@app.post('/api/strategy-boards', status_code=201)
def strategy_create(body: dict):
    try:
        return strategy.save_board(store, body)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


@app.put('/api/strategy-boards/{board_id}')
def strategy_update(board_id: str, body: dict):
    try:
        return strategy.save_board(store, body, board_id)
    except KeyError:
        raise HTTPException(404, 'Strategy board not found.') from None
    except strategy.StrategyConflict as error:
        raise HTTPException(409, str(error)) from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


from .note_media import register as register_note_media
register_note_media(app, store)
