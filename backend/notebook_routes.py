"""FastAPI routes for notes, the schedule, the bell and the Ask Aivana panel."""
import os
import re
from datetime import date, datetime, timedelta

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response

from . import aivana, aivana_notes
from . import coach_logic as logic
from .core import DEMO
from .notebook import Notebook, build_ics, expand_events, parse_data_url
from .assistant_router import Brain

PLAYERS = DEMO['players']
NOT_FOUND = "I couldn't find that in your notes."


def fail(error):
    if isinstance(error, KeyError):
        return HTTPException(404, str(error.args[0]) if error.args else 'Not found.')
    if isinstance(error, aivana.AivanaError):
        return HTTPException(error.status, str(error))
    return HTTPException(422, str(error))


def register(app: FastAPI, store, notebook: Notebook, extra_notifications=None, film_room=None):
    brain = Brain(store, notebook, film_room, PLAYERS)

    def occurrences(start, end):
        return expand_events(notebook.list_events(), start, end)

    def mode_of(body):
        mode = body.get('mode', 'live') if isinstance(body, dict) else 'live'
        if mode not in ('demo', 'live'):
            raise ValueError('Choose demo or live mode.')
        return mode

    # ---------- notes ----------
    @app.get('/api/notes')
    def list_notes(notebook_name: str | None = Query(None, alias='notebook'), search: str | None = None):
        try:
            return notebook.list_notes(notebook_name, search)
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

    @app.post('/api/notes/transcribe')
    def transcribe(body: dict):
        try:
            mode = mode_of(body)
            images = body.get('images')
            if not isinstance(images, list) or not 1 <= len(images) <= 5:
                raise ValueError('Send 1 to 5 images.')
            parsed = []
            for value in images:
                mime, raw = parse_data_url(value)
                parsed.append((mime, value.split(',', 1)[1].strip()))
            if mode == 'demo':
                raise ValueError('Reading handwriting and photos uses Aivana. Switch to Live at the top to try it. Demo makes no AI calls.')
            return logic.finalize_transcription(aivana_notes.transcribe(parsed, PLAYERS))
        except (ValueError, aivana.AivanaError) as error:
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
            return {'items': items + saved + due + written, 'today': today}
        except ValueError as error:
            raise fail(error) from None

    @app.get('/api/events/upcoming')
    def upcoming(limit: int = 3):
        now = datetime.now()
        items = [e for e in occurrences(now.date().isoformat(), (now.date() + timedelta(days=60)).isoformat())
                 if datetime.fromisoformat(e['start_at']) + timedelta(minutes=e['duration_min']) >= now]
        return items[:max(1, min(limit, 20))]

    @app.get('/api/events/export.ics')
    def export_ics():
        rows = [r for r in logic.homework(store.list(), PLAYERS) if r['due_date'] and not r['completed']]
        return Response(build_ics(notebook.list_events(), rows), media_type='text/calendar; charset=utf-8',
                        headers={'Content-Disposition': 'attachment; filename="falcon-schedule.ics"'})

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

    @app.get('/api/settings')
    def settings():
        return notebook.settings()

    @app.patch('/api/settings')
    def update_settings(body: dict):
        try:
            return notebook.update_settings(body)
        except ValueError as error:
            raise fail(error) from None

    # ---------- players and bell ----------
    @app.get('/api/players/status')
    def statuses():
        return logic.player_statuses(store.list(), PLAYERS, date.today().isoformat())

    @app.get('/api/notifications')
    def notifications():
        now = datetime.now()
        upcoming_items = occurrences(now.date().isoformat(), (now.date() + timedelta(days=1)).isoformat())
        candidates = logic.notification_candidates(store.list(), PLAYERS, upcoming_items, notebook.list_notes(), store.unsaved_runs(), now)
        if extra_notifications:
            candidates += extra_notifications(now)
        return notebook.sync_notifications(candidates)

    @app.post('/api/notifications/read')
    def read(body: dict | None = None):
        ids = (body or {}).get('ids')
        if ids is not None and (not isinstance(ids, list) or not all(isinstance(i, int) for i in ids)):
            raise HTTPException(422, 'ids must be a list of numbers.')
        notebook.mark_notifications_read(ids)
        return {'ok': True}

    # ---------- Ask Aivana ----------
    @app.post('/api/assistant/message')
    def assistant_message(body: dict):
        try:
            return answer(body)
        except (ValueError, KeyError, aivana.AivanaError) as error:
            raise fail(error) from None

    def answer(body):
        if not isinstance(body, dict):
            raise ValueError('Message must be an object.')
        message = body.get('message')
        if not isinstance(message, str) or not message.strip() or len(message) > 800:
            raise ValueError('Ask in 1 to 800 characters.')
        message = message.strip()
        mode = mode_of(body)
        page = body.get('page') if body.get('page') in ('home', 'schedule', 'note', 'notebook', 'players', 'homework', 'film', 'player') else 'home'
        selected = body.get('selected_id')
        history = [t for t in body.get('history') or [] if isinstance(t, dict) and t.get('role') in ('user', 'assistant') and isinstance(t.get('text'), str)][-6:]
        now = datetime.now()
        today = now.date()
        intent = logic.detect_intent(message)
        meetings = store.list()
        reply = {'intent': intent, 'citations': [], 'confirm': None, 'buttons': [], 'origin': 'code'}

        def cite(items):
            return [{'source_id': f'S{i + 1}', 'title': x['title'], 'date': x['date'], 'link': x['link'], 'text': x.get('text', '')}
                    for i, x in enumerate(items)]

        ctx_in = body.get('context') if isinstance(body.get('context'), dict) else {}
        if ctx_in.get('player_id') not in {p['id'] for p in PLAYERS}:
            ctx_in = {**ctx_in, 'player_id': None}
        if page == 'player' and isinstance(selected, str) and not ctx_in.get('player_id'):
            ctx_in = {**ctx_in, 'player_id': selected}
        smart = brain.handle(intent, message, ctx_in, mode, history, today.isoformat(), now)
        if smart is not None:
            return {**reply, **smart}
        reply['context'] = brain.context_after(message, ctx_in)

        if intent == 'add_event':
            draft, missing = logic.parse_event_request(message, today, PLAYERS)
            if not draft:
                return {**reply, 'reply': f"Tell me the {' and '.join(missing)}, like \"Add practice Tuesday 3:30\"."}
            moment = datetime.fromisoformat(draft['start_at'])
            return {**reply, 'reply': f"Add {draft['title']} on {moment.strftime('%a %b')} {moment.day} at {logic.clock(moment)} {moment.strftime('%p')}? Nothing changes until you confirm.",
                    'confirm': {'kind': 'add_event', 'label': 'Add to schedule', 'event': draft}}
        if intent == 'mark_done':
            named = logic.players_in_text(message, PLAYERS)
            rows = [r for r in logic.homework(meetings, PLAYERS) if not r['completed'] and (not named or r['player_id'] in {p['id'] for p in named})]
            words = set(re.findall(r'[a-z]{4,}', message.casefold())) - {'mark', 'done', 'complete', 'finished', 'homework'}
            ranked = sorted(rows, key=lambda r: -len(words & set(re.findall(r'[a-z]{4,}', r['text'].casefold()))))
            if not named or not ranked:
                return {**reply, 'reply': 'Name the player and the homework, like "Mark Avery\'s film homework done".'}
            top = ranked[0]
            return {**reply, 'reply': f"Mark {top['player_name']}'s homework done: \"{top['text']}\"? Nothing changes until you confirm.",
                    'confirm': {'kind': 'mark_done', 'label': 'Mark done', 'meeting_id': top['meeting_id'], 'item_id': top['id']}}
        if intent == 'export':
            return {**reply, 'reply': 'Here is your schedule with homework due dates. It opens in Outlook, Google Calendar and Apple Calendar.',
                    'buttons': [{'label': 'Export to phone (.ics)', 'href': '/api/events/export.ics'}]}
        if film_room is not None and (intent in ('film_cutup', 'film_unassigned', 'before_game') or (intent == 'summarize_note' and page == 'film')):
            from .film_routes import film_answer
            return film_answer(film_room, store, notebook, intent, message, page, selected, mode, reply, cite, now)
        if intent in ('summarize_note', 'find_homework', 'fix_spelling'):
            if page != 'note' or not isinstance(selected, int):
                return {**reply, 'reply': 'Open a saved note first, then ask me again.'}
            note = notebook.get_note(selected)
            if intent == 'summarize_note':
                recap = recap_for(selected, mode)
                reply['origin'] = recap['origin']
                lines = [recap['summary']] + [f"• {t['player']}: {t['task']}" + (f" (due {t['due_date']})" if t['due_date'] else '') for t in recap['to_dos'][:5]]
                return {**reply, 'reply': 'Recap: ' + '\n'.join(x for x in lines if x), 'recap': recap,
                        'citations': cite([{'title': note['title'], 'date': note['note_date'], 'link': f"note:{note['id']}"}])}
            if intent == 'find_homework':
                return {**reply, 'reply': 'I can send this note to Find homework. You check every item before anything is saved.',
                        'buttons': [{'label': 'Find homework', 'action': 'find_homework', 'note_id': note['id']}]}
            payload = logic.demo_clean_transcript(note['body'], PLAYERS) if mode == 'demo' else aivana_notes.clean_transcript(note['body'], PLAYERS)
            cleaned = logic.finalize_clean(payload, note['body'])
            if cleaned['text'] == note['body']:
                return {**reply, 'reply': 'Looks clean already. No changes needed.'}
            return {**reply, 'origin': 'demo' if mode == 'demo' else 'aivana', 'reply': f"I found {len(cleaned['changes'])} fix{'es' if len(cleaned['changes']) != 1 else ''}. Apply them to \"{note['title']}\"?",
                    'confirm': {'kind': 'apply_text', 'label': 'Apply fixes', 'note_id': note['id'], 'text': cleaned['text'], 'changes': cleaned['changes']}}
        if intent == 'late':
            late = [r for r in logic.homework(meetings, PLAYERS) if logic.homework_status(r, today.isoformat()) == 'late']
            if not late:
                return {**reply, 'reply': 'Nobody is late on homework. Nice.'}
            guys = len({r['player_id'] for r in late})
            sources = [{'title': f"{r['player_name']}: {r['text']}", 'date': r['due_date'], 'link': f"player:{r['player_id']}"} for r in late[:8]]
            return {**reply, 'reply': f"{guys} player{'s are' if guys != 1 else ' is'} late on homework ({len(late)} item{'s' if len(late) != 1 else ''}).", 'citations': cite(sources)}
        if intent == 'no_one_on_one':
            since = logic.season_start(today.isoformat())
            missing = [p for p in PLAYERS if not (logic.last_one_on_one(meetings, p['id']) or '') >= since]
            if not missing:
                return {**reply, 'reply': 'Every player has had a 1-on-1 this season.'}
            sources = [{'title': f"#{p['number']} {p['name']} · {p['position']}", 'date': None, 'link': f"player:{p['id']}"} for p in missing[:12]]
            return {**reply, 'reply': f"{len(missing)} player{'s have' if len(missing) != 1 else ' has'} no 1-on-1 this season" + (', showing the first 12.' if len(missing) > 12 else '.'), 'citations': cite(sources)}
        if intent in ('today', 'list_events'):
            lower = message.casefold()
            start, end, label = today, today + timedelta(days=6 - today.weekday()), 'this week'
            if intent == 'today' or 'today' in lower:
                start, end, label = today, today, 'today'
            elif 'tomorrow' in lower:
                start = end = today + timedelta(days=1)
                label = 'tomorrow'
            elif 'next week' in lower:
                start = today + timedelta(days=7 - today.weekday())
                end, label = start + timedelta(days=6), 'next week'
            items = occurrences(start.isoformat(), end.isoformat())
            target = re.search(r'next (game|practice|1[\s-]?on[\s-]?1|one[\s-]on[\s-]one|meeting|film|lift)', lower)
            if target:
                kind = target.group(1)
                future = [e for e in occurrences(today.isoformat(), (today + timedelta(days=120)).isoformat()) if datetime.fromisoformat(e['start_at']) >= now]
                matches = [e for e in future if (kind in ('game', 'practice', 'film', 'meeting') and e['type'] == kind) or
                           ('1' in kind or 'one' in kind) and (e['audience'] or '').startswith('player:') or kind == 'lift' and 'lift' in e['title'].casefold()]
                if not matches:
                    return {**reply, 'reply': NOT_FOUND}
                e = matches[0]
                moment = datetime.fromisoformat(e['start_at'])
                return {**reply, 'reply': f"Next up: {e['title']}, {moment.strftime('%a %b')} {moment.day} at {logic.clock(moment)} {moment.strftime('%p')}.",
                        'citations': cite([{'title': e['title'], 'date': e['date'], 'link': f"schedule:{e['date']}"}])}
            lines = [f"{datetime.fromisoformat(e['start_at']).strftime('%a')} {logic.clock(datetime.fromisoformat(e['start_at']))} {e['title']}" for e in items]
            extra = ''
            if intent == 'today':
                rows = logic.homework(meetings, PLAYERS)
                due = [r for r in rows if not r['completed'] and r['due_date'] == today.isoformat()]
                late = [r for r in rows if logic.homework_status(r, today.isoformat()) == 'late']
                extra = f" Homework due today: {len(due)}. Late: {len(late)}."
            if not items:
                return {**reply, 'reply': f"Nothing on the schedule {label}.{extra}"}
            return {**reply, 'reply': f"{label.capitalize()}: " + '; '.join(lines[:10]) + '.' + extra,
                    'citations': cite([{'title': e['title'], 'date': e['date'], 'link': f"schedule:{e['date']}"} for e in items[:10]])}
        # Open question: answered only from saved notes, events and homework.
        window = (today - timedelta(days=120)).isoformat(), (today + timedelta(days=120)).isoformat()
        film_notes = [{'id': f"f{n['id']}", 'notebook': 'film', 'title': f"Film: {n['film_title']} {int(n['t_seconds']) // 60:02d}:{int(n['t_seconds']) % 60:02d}",
                       'body': n['text'] + ' ' + ' '.join(n['tags']) + ' ' + ' '.join(next((p['name'] for p in PLAYERS if p['id'] == pid), '') for pid in n['player_ids']),
                       'note_date': n['created_at'][:10], 'link': f"film:{n['film_id']}@{n['t_seconds']}"} for n in film_room.film_notes()] if film_room is not None else []
        if page == 'player' and isinstance(selected, str) and selected in {p['id'] for p in PLAYERS} and not logic.players_in_text(message, PLAYERS):
            message = f"{message} {next(p['name'] for p in PLAYERS if p['id'] == selected)}"
        sources = logic.search_sources(message, notebook.list_notes() + film_notes, occurrences(*window), meetings, PLAYERS, include_private=mode == 'demo')
        for s in sources:
            if s['kind'] == 'note' and str(s['id']).startswith('f'):
                s['link'] = next(f['link'] for f in film_notes if f['id'] == s['id'])
        if not sources:
            return {**reply, 'reply': NOT_FOUND}
        if mode == 'demo':
            return {**reply, 'origin': 'demo', 'reply': f"Here is what I found in your notes ({len(sources)} match{'es' if len(sources) != 1 else ''}). Demo lists matches; Live writes an answer.",
                    'citations': [{k: s[k] for k in ('source_id', 'title', 'date', 'link', 'text')} for s in sources[:6]]}
        result = aivana_notes.answer_question(message, sources, history, today.isoformat())
        known = {s['source_id']: s for s in sources}
        ids = [i for i in dict.fromkeys(result.get('source_ids') or []) if i in known]
        text = str(result.get('answer') or '').strip()
        if not ids or not text:
            return {**reply, 'origin': 'aivana', 'reply': NOT_FOUND}
        return {**reply, 'origin': 'aivana', 'reply': text, 'citations': [{k: known[i][k] for k in ('source_id', 'title', 'date', 'link', 'text')} for i in ids]}

    return app


def create_notebook(db_path):
    notebook = Notebook(db_path)
    if not os.environ.get('COACH_SKIP_SCHEDULE_SEED'):
        notebook.seed_schedule()
    return notebook
