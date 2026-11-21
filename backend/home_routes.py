"""Notebook dependencies for the imported redesign Home; no branch assistant routes."""
from datetime import date, datetime, timedelta
from fastapi import HTTPException, Query
from fastapi.responses import FileResponse, Response
from . import aivana, home_aivana_notes as aivana_notes, home_coach_logic as logic, home_schedule_tools as sched
from .core import DEMO
from .home_notebook import Notebook, expand_events
from .home_diagrams import ConflictError
PLAYERS = DEMO['players']
def fail(error):
    from .home_diagrams import ConflictError
    if isinstance(error,ConflictError): return HTTPException(409,str(error))
    if isinstance(error, KeyError): return HTTPException(404, str(error.args[0]))
    if isinstance(error, aivana.AivanaError): return HTTPException(error.status, str(error))
    return HTTPException(422, str(error))
def register(app, store, notebook, diagrams):
    def occurrences(start, end):
        return expand_events(notebook.list_events(), start, end)
    def mode_of(body):
        mode = body.get('mode', 'live') if isinstance(body, dict) else 'live'
        if mode not in ('demo', 'live'):
            raise ValueError('Choose demo or live mode.')
        return mode

    # ---------- notes ----------
    @app.get('/api/notes')
    def list_notes(notebook_name: str | None = Query(None, alias='notebook'), search: str | None = None, folder: str | None = None):
        try:
            return notebook.list_notes(notebook_name, search, folder)
        except ValueError as error:
            raise fail(error) from None

    @app.post('/api/notes', status_code=201)
    def create_note(body: dict):
        try:
            return notebook.create_note(body)
        except (ValueError, KeyError) as error:
            raise fail(error) from None

    @app.get('/api/notes/{note_id}')
    def get_note(note_id: int):
        try:
            return notebook.get_note(note_id)
        except KeyError as error:
            raise fail(error) from None

    @app.patch('/api/notes/{note_id}')
    def update_note(note_id: int, body: dict):
        try:
            return notebook.update_note(note_id, body)
        except (ValueError, KeyError) as error:
            raise fail(error) from None

    @app.delete('/api/notes/{note_id}', status_code=204)
    def delete_note(note_id: int):
        try:
            notebook.delete_note(note_id)
        except KeyError as error:
            raise fail(error) from None
        return Response(status_code=204)

    @app.get('/api/notes/{note_id}/attachments/{attachment_id}')
    def attachment(note_id: int, attachment_id: int):
        try:
            return FileResponse(notebook.attachment_path(note_id, attachment_id), headers={'Cache-Control': 'private, max-age=3600'})
        except KeyError as error:
            raise fail(error) from None

    @app.get('/api/notes/{note_id}/versions')
    def versions(note_id: int):
        try:
            return notebook.versions(note_id)
        except KeyError as error:
            raise fail(error) from None

    @app.post('/api/notes/{note_id}/versions', status_code=201)
    def add_version(note_id: int, body: dict):
        try:
            return notebook.add_version(note_id, body)
        except (ValueError, KeyError) as error:
            raise fail(error) from None

    @app.post('/api/notes/{note_id}/versions/{version_id}/restore')
    def restore(note_id: int, version_id: int):
        try:
            return notebook.restore_version(note_id, version_id)
        except KeyError as error:
            raise fail(error) from None

    @app.post('/api/notes/clean-transcript')
    def clean(body: dict):
        try:
            mode = mode_of(body)
            text = body.get('text')
            if not isinstance(text, str) or not text.strip() or len(text) > 20000:
                raise ValueError('Send the spoken words as text (never audio).')
            payload = logic.demo_clean_transcript(text, PLAYERS) if mode == 'demo' else aivana_notes.clean_transcript(text, PLAYERS)
            return {**logic.finalize_clean(payload, text), 'origin': 'demo' if mode == 'demo' else 'aivana'}
        except (ValueError, aivana.AivanaError) as error:
            raise fail(error) from None

    def recap_for(note_id, mode):
        note = notebook.get_note(note_id)
        if not note['body'].strip():
            raise ValueError('Write something in the note first.')
        recap = logic.demo_recap(note, PLAYERS) if mode == 'demo' else logic.finalize_recap(aivana_notes.summarize(note, PLAYERS), note, PLAYERS)
        recap.update(origin='demo' if mode == 'demo' else 'aivana', created_at=datetime.now().replace(microsecond=0).isoformat(),
                     note_updated_at=note['updated_at'], events=logic.detect_events(note['body'], note['note_date'], PLAYERS), notebook=note['notebook'])
        notebook.set_summary(note_id, recap)
        return recap

    @app.post('/api/notes/{note_id}/summarize')
    def summarize(note_id: int, body: dict | None = None):
        try:
            return recap_for(note_id, mode_of(body or {}))
        except (ValueError, KeyError, aivana.AivanaError) as error:
            raise fail(error) from None

    # ---------- schedule ----------
    @app.get('/api/events')
    def events(start: str = Query(..., alias='from'), end: str = Query(..., alias='to')):
        try:
            today = date.today().isoformat()
            items = occurrences(start, end)
            meetings = store.list()
            notes = notebook.list_notes()
            notes_by_meeting = {n['meeting_id']: n['id'] for n in notes if n.get('meeting_id')}
            for item in items:
                item['source'] = 'event'
                if item.get('meeting_id'):
                    item['notes_saved'] = True
            saved = [{'source': 'meeting', 'type': 'meeting', 'id': m['id'], 'occurrence_id': f"meeting-{m['id']}", 'title': m['title'],
                      'date': m['date'], 'start_at': None, 'notes_saved': True, 'note_id': notes_by_meeting.get(m['id']),
                      'player_id': m['attendees'][0] if len(m['attendees']) == 1 else None, 'attendee_count': len(m['attendees'])}
                     for m in meetings if start <= m['date'] <= end]
            due = [{'source': 'homework', 'type': 'todo', **row, 'occurrence_id': f"hw-{row['id']}-{row['player_id']}", 'date': row['due_date'],
                    'title': f"{row['player_name']}: {row['text']}", 'status': logic.homework_status(row, today)}
                   for row in logic.homework(meetings, PLAYERS) if row['due_date'] and start <= row['due_date'] <= end]
            written = [{'source': 'note', 'type': 'note', 'id': n['id'], 'occurrence_id': f"note-{n['id']}", 'title': n['title'],
                        'date': n['note_date'], 'notebook': n['notebook'], 'start_at': None}
                       for n in notes if start <= n['note_date'] <= end]
            del written  # notes are not scheduled activities; they stay in the Coach's notebook
            for item in items:
                if item.get('todo'):  # coach to-do: an all-day item, not a timed event
                    item.update(type='coach_todo', source='todo', start_at=None, done=bool(item.get('done_at')))
            return {'items': items + saved + due, 'today': today}
        except ValueError as error:
            raise fail(error) from None

    @app.get('/api/events/upcoming')
    def upcoming(limit: int = 3):
        now = datetime.now()
        items = [e for e in occurrences(now.date().isoformat(), (now.date() + timedelta(days=60)).isoformat())
                 if datetime.fromisoformat(e['start_at']) + timedelta(minutes=e['duration_min']) >= now]
        return items[:max(1, min(limit, 20))]

    def export_range(start, end):
        today = date.today()
        if not start or not end:
            first, last = sched.season_range(today, notebook.settings().get('season'))
            return first.isoformat(), last.isoformat()
        date.fromisoformat(start)
        date.fromisoformat(end)
        return start, end

    @app.get('/api/events/export.ics')
    def export_ics(start: str | None = Query(None, alias='from'), end: str | None = Query(None, alias='to'), homework: int = 1, names: int = 0):
        try:
            first, last = export_range(start, end)
            occ = occurrences(first, last)
            rows = [r for r in logic.homework(store.list(), PLAYERS) if r['due_date'] and first <= r['due_date'] <= last]
            body = sched.build_range_ics(occ, rows, PLAYERS, include_homework=bool(homework), include_names=bool(names))
        except ValueError as error:
            raise fail(error) from None
        return Response(body, media_type='text/calendar; charset=utf-8',
                        headers={'Content-Disposition': f'attachment; filename="falcon-schedule-{first}-to-{last}.ics"'})

    @app.get('/api/schedule/search')
    def schedule_search(q: str = '', kind: str = 'all'):
        try:
            today = date.today()
            if kind not in ('all', *sched.TYPE_GROUPS):
                raise ValueError('Unknown filter.')
            if len(q) > 120:
                raise ValueError('Search is limited to 120 characters.')
            occ = occurrences((today - timedelta(days=200)).isoformat(), today.isoformat()) + occurrences((today + timedelta(days=1)).isoformat(), (today + timedelta(days=200)).isoformat())
            items = sched.schedule_items(occ, logic.homework(store.list(), PLAYERS), store.list(), PLAYERS)
            return {**sched.search(items, q, kind, today.isoformat(), PLAYERS), 'searched': [(today - timedelta(days=200)).isoformat(), (today + timedelta(days=200)).isoformat()]}
        except ValueError as error:
            raise fail(error) from None

    @app.get('/api/schedule/checklist')
    def schedule_checklist():
        now = datetime.now()
        today = now.date()
        occ = occurrences((today - timedelta(days=60)).isoformat(), (today + timedelta(days=60)).isoformat())
        from .home_diagrams import next_game
        game = next_game([e for e in occ if not e.get('todo')], now)
        todos = [e for e in occ if e.get('todo')]
        return {**sched.checklist(logic.homework(store.list(), PLAYERS), todos, game, today.isoformat()), 'game': game}

    @app.get('/api/events/{event_id}')
    def get_event(event_id: int):
        try:
            return notebook.get_event(event_id)
        except KeyError as error:
            raise fail(error) from None

    @app.post('/api/events', status_code=201)
    def create_event(body: dict):
        try:
            return notebook.create_event(body)
        except ValueError as error:
            raise fail(error) from None

    @app.patch('/api/events/{event_id}')
    def update_event(event_id: int, body: dict):
        try:
            return notebook.update_event(event_id, body)
        except (ValueError, KeyError) as error:
            raise fail(error) from None

    @app.delete('/api/events/{event_id}', status_code=204)
    def delete_event(event_id: int):
        try:
            notebook.delete_event(event_id)
        except KeyError as error:
            raise fail(error) from None
        return Response(status_code=204)

    # ---------- folders ----------
    @app.get('/api/folders')
    def folders(archived: bool = False):
        return notebook.folders(include_archived=archived)

    @app.post('/api/folders', status_code=201)
    def create_folder(body: dict):
        try:
            return notebook.create_folder(body)
        except ValueError as error:
            raise fail(error) from None

    @app.patch('/api/folders/{folder_id}')
    def update_folder(folder_id: int, body: dict):
        try:
            return notebook.update_folder(folder_id, body)
        except (ValueError, KeyError) as error:
            raise fail(error) from None

    @app.delete('/api/folders/{folder_id}')
    def delete_folder(folder_id: int):
        try:
            return notebook.delete_folder(folder_id)
        except KeyError as error:
            raise fail(error) from None

    @app.post('/api/notes/{note_id}/move')
    def move_note(note_id: int, body: dict):
        try:
            return notebook.move_note(note_id, (body or {}).get('folder_id'))
        except (ValueError, KeyError) as error:
            raise fail(error) from None


    @app.get('/api/settings')
    def settings(): return notebook.settings()
    @app.patch('/api/settings')
    def update_settings(body: dict):
        try: return notebook.update_settings(body)
        except ValueError as error: raise fail(error) from None
    @app.get('/api/events/{event_id}/played')
    def played(event_id: int, game_date: str = Query(..., alias='date')):
        try: return notebook.game_list(event_id, game_date)
        except (ValueError,KeyError,ConflictError) as error: raise fail(error) from None
    @app.put('/api/events/{event_id}/played')
    def save_played(event_id: int, body: dict):
        try: return notebook.save_game_list(event_id, body.get('date'),body.get('player_ids'),{p['id'] for p in PLAYERS})
        except (ValueError,KeyError,ConflictError) as error: raise fail(error) from None
    @app.get('/api/notes/{note_id}/meeting')
    def linked_meeting(note_id: int):
        try: note=notebook.get_note(note_id)
        except KeyError as error: raise fail(error) from None
        return next((m for m in store.list() if m['id']==note.get('meeting_id')), None)
    @app.get('/api/diagrams')
    def list_diagrams(note_id: int | None=None,film_id: int | None=None,meeting_id: str | None=None,player_id: str | None=None): return diagrams.list_diagrams(note_id=note_id,film_id=film_id,meeting_id=meeting_id,player_id=player_id)
    @app.get('/api/diagrams/{diagram_id}')
    def get_diagram(diagram_id: int):
        try: return diagrams.get_diagram(diagram_id)
        except KeyError as error: raise fail(error) from None
    @app.post('/api/diagrams',status_code=201)
    def create_diagram(body: dict):
        try: return diagrams.save_diagram(body, {p['id']:p for p in PLAYERS}, {m['id'] for m in store.list()})
        except (ValueError,KeyError,ConflictError) as error: raise fail(error) from None
    @app.put('/api/diagrams/{diagram_id}')
    def update_diagram(diagram_id: int,body: dict):
        try: return diagrams.save_diagram(body,{p['id']:p for p in PLAYERS},{m['id'] for m in store.list()},diagram_id)
        except (ValueError,KeyError,ConflictError) as error: raise fail(error) from None
    @app.delete('/api/diagrams/{diagram_id}',status_code=204)
    def delete_diagram(diagram_id:int):
        try: diagrams.delete_diagram(diagram_id)
        except KeyError as error: raise fail(error) from None
        return Response(status_code=204)
    @app.get('/api/diagrams/{diagram_id}/{kind}.png')
    def diagram_image(diagram_id: int,kind: str):
        if kind not in ('preview','background'): raise HTTPException(404,'Image not found.')
        try: return FileResponse(diagrams.diagram_file(diagram_id,kind),headers={'Cache-Control':'no-store'})
        except KeyError as error: raise fail(error) from None

    @app.get('/api/next-game')
    def next_game_card():
        from .home_diagrams import next_game
        now=datetime.now()
        return next_game(occurrences(now.date().isoformat(),(now.date()+timedelta(days=120)).isoformat()),now,logic.homework(store.list(),PLAYERS),getattr(diagrams,'list_films',lambda:[])())
