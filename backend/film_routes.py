"""FastAPI routes for the Film room, Play whiteboard, Skill checks and Film packs."""
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from . import aivana, aivana_notes
from . import coach_logic as logic
from .core import DEMO
from .film import ConflictError, FilmRoom, next_game, repeat_corrections
from .notebook import expand_events

PLAYERS = DEMO['players']
ROSTER = {p['id'] for p in PLAYERS}
ROOMS = {p['position_group'] for p in PLAYERS}
MIME = {'mp4': 'video/mp4', 'm4v': 'video/mp4', 'mov': 'video/quicktime', 'webm': 'video/webm', 'ogv': 'video/ogg', 'ogg': 'video/ogg',
        'avi': 'video/x-msvideo', 'mkv': 'video/x-matroska', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'mpg': 'video/mpeg', 'mpeg': 'video/mpeg'}


def mmss(seconds):
    seconds = int(seconds)
    return f'{seconds // 60:02d}:{seconds % 60:02d}'


def fail(error):
    if isinstance(error, KeyError):
        return HTTPException(404, str(error.args[0]) if error.args else 'Not found.')
    if isinstance(error, ConflictError):
        return HTTPException(409, str(error))
    if isinstance(error, aivana.AivanaError):
        return HTTPException(error.status, str(error))
    return HTTPException(422, str(error))


def guard(fn):
    try:
        return fn()
    except (ValueError, KeyError, ConflictError, aivana.AivanaError) as error:
        raise fail(error) from None


def demo_film_recap(notes):
    """Code-only recap for Demo: groups the coach's written notes by player."""
    names = {p['id']: p['name'] for p in PLAYERS}
    per_player = {}
    for n in notes:
        for pid in n['player_ids'] or ['team']:
            per_player.setdefault(pid, {'player': names.get(pid, 'Whole team'), 'player_id': None if pid == 'team' else pid, 'points': [], 'homework': []})
            per_player[pid]['points'].append(f"{mmss(n['t_seconds'])} {n['text']}")
    improve = [n for n in notes if n['tone'] == 'improve']
    return {'summary': f"{len(notes)} notes on this film, {len(improve)} marked Improve.", 'per_player': list(per_player.values()),
            'this_week_work_on': improve[0]['text'] if improve else (notes[0]['text'] if notes else '')}


def register(app: FastAPI, store, notebook, film: FilmRoom):
    def body_mode(body):
        mode = (body or {}).get('mode', 'live')
        if mode not in ('demo', 'live'):
            raise ValueError('Choose demo or live mode.')
        return mode

    # ---------- films ----------
    @app.get('/api/films')
    def films(search: str | None = None, kind: str | None = None, assigned_to: str | None = None, room: str | None = None):
        items = film.list_films()
        if kind:
            items = [f for f in items if f['kind'] == kind]
        if assigned_to:
            items = [f for f in items if (f['assigned_to'] or '').lower() == assigned_to.lower()]
        if room:
            ids = {p['id'] for p in PLAYERS if p['position_group'] == room}
            items = [f for f in items if ids & set(f['player_ids'])]
        if search:
            words = search.lower()
            note_films = {n['film_id'] for n in film.film_notes() if words in n['text'].lower() or words in ' '.join(n['tags'])}
            names = {p['id'] for p in PLAYERS if words in p['name'].lower() or words == f"#{p['number']}"}
            items = [f for f in items if words in f"{f['title']} {f['opponent'] or ''} {f['description'] or ''}".lower() or f['id'] in note_films or names & set(f['player_ids'])]
        return items

    @app.post('/api/films', status_code=201)
    def create_film(body: dict):
        return guard(lambda: film.create_film(body, ROSTER))

    @app.get('/api/films/{film_id}')
    def get_film(film_id: int):
        return guard(lambda: film.get_film(film_id))

    @app.patch('/api/films/{film_id}')
    def update_film(film_id: int, body: dict):
        return guard(lambda: film.update_film(film_id, body, ROSTER))

    @app.delete('/api/films/{film_id}', status_code=204)
    def delete_film(film_id: int):
        guard(lambda: film.delete_film(film_id))
        return Response(status_code=204)

    @app.post('/api/films/{film_id}/upload')
    async def upload(film_id: int, request: Request):
        name = request.headers.get('x-filename', '')
        guard(lambda: film.get_film(film_id))
        film.files.mkdir(parents=True, exist_ok=True)
        tmp = Path(film.files) / f'.incoming-{film_id}-{os.getpid()}-{id(request)}'
        total = 0
        try:
            with tmp.open('wb') as out:
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > 20 * 1024 ** 3:
                        raise HTTPException(413, 'That video is larger than 20 GB.')
                    out.write(chunk)
            return guard(lambda: film.store_upload_file(film_id, tmp, name))
        finally:
            tmp.unlink(missing_ok=True)

    @app.post('/api/films/{film_id}/convert')
    def convert(film_id: int):
        return guard(lambda: film.convert_to_mp4(film_id))

    @app.get('/api/films/{film_id}/stream')
    def stream(film_id: int, request: Request):
        path = guard(lambda: film.video_path(film_id))
        size = path.stat().st_size
        mime = MIME.get(path.suffix.lstrip('.').lower(), 'application/octet-stream')
        header = request.headers.get('range')
        if not header:
            return FileResponse(path, media_type=mime, headers={'Accept-Ranges': 'bytes'})
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
        if not match or (not match.group(1) and not match.group(2)):
            raise HTTPException(416, 'Bad range.')
        if match.group(1):
            start = int(match.group(1))
            end = min(int(match.group(2)) if match.group(2) else size - 1, size - 1)
        else:
            start, end = max(0, size - int(match.group(2))), size - 1
        if start >= size or start > end:
            return Response(status_code=416, headers={'Content-Range': f'bytes */{size}'})

        def chunks():
            with path.open('rb') as handle:
                handle.seek(start)
                left = end - start + 1
                while left > 0:
                    block = handle.read(min(1024 * 1024, left))
                    if not block:
                        break
                    left -= len(block)
                    yield block
        return StreamingResponse(chunks(), status_code=206, media_type=mime,
                                 headers={'Content-Range': f'bytes {start}-{end}/{size}', 'Accept-Ranges': 'bytes', 'Content-Length': str(end - start + 1)})

    # ---------- clips, cut-ups, playlists ----------
    @app.get('/api/films/{film_id}/clips')
    def film_clips(film_id: int):
        guard(lambda: film.get_film(film_id))
        return film.clips(film_id)

    @app.post('/api/films/{film_id}/clips', status_code=201)
    def create_clip(film_id: int, body: dict):
        return guard(lambda: film.create_clip(film_id, body, ROSTER))

    @app.patch('/api/clips/{clip_id}')
    def update_clip(clip_id: int, body: dict):
        return guard(lambda: film.update_clip(clip_id, body, ROSTER))

    @app.delete('/api/clips/{clip_id}', status_code=204)
    def delete_clip(clip_id: int):
        guard(lambda: film.delete_clip(clip_id))
        return Response(status_code=204)

    @app.get('/api/clips')
    def cutup(request: Request):
        allowed = ('quarter', 'down', 'distance', 'field_zone', 'hash', 'play_type', 'player_id', 'position', 'tag', 'ungraded', 'search')
        filters = {k: v for k, v in request.query_params.items() if k in allowed and v}
        return guard(lambda: film.clips(filters=filters))

    @app.get('/api/playlists')
    def playlists():
        return film.playlists()

    @app.post('/api/playlists', status_code=201)
    def create_playlist(body: dict):
        return guard(lambda: film.save_playlist(body))

    @app.put('/api/playlists/{playlist_id}')
    def update_playlist(playlist_id: int, body: dict):
        return guard(lambda: film.save_playlist(body, playlist_id))

    @app.delete('/api/playlists/{playlist_id}', status_code=204)
    def delete_playlist(playlist_id: int):
        guard(lambda: film.delete_playlist(playlist_id))
        return Response(status_code=204)

    # ---------- notes at a time ----------
    @app.get('/api/films/{film_id}/notes')
    def notes(film_id: int):
        guard(lambda: film.get_film(film_id))
        return film.film_notes(film_id)

    @app.get('/api/film-notes')
    def all_notes(player_id: str | None = None):
        return film.film_notes(player_id=player_id)

    @app.post('/api/films/{film_id}/notes', status_code=201)
    def create_note(film_id: int, body: dict):
        return guard(lambda: film.create_film_note(film_id, body, ROSTER))

    @app.patch('/api/film-notes/{note_id}')
    def update_note(note_id: int, body: dict):
        return guard(lambda: film.update_film_note(note_id, body, ROSTER))

    @app.delete('/api/film-notes/{note_id}', status_code=204)
    def delete_note(note_id: int):
        guard(lambda: film.delete_film_note(note_id))
        return Response(status_code=204)

    @app.post('/api/film-notes/{note_id}/homework')
    def homework_draft(note_id: int, body: dict | None = None):
        """Builds a DRAFT for the existing review screen. Nothing is saved here."""
        def build():
            note = film.get_film_note(note_id)
            if not note['player_ids']:
                raise ValueError('Pick the player(s) this note is about first.')
            today = date.today().isoformat()
            due = (body or {}).get('due_date') or None
            if due:
                date.fromisoformat(due)
                if due < today:
                    raise ValueError('The due date must be today or later.')
            task = ((body or {}).get('task') or note['text']).strip()[:1000]
            meeting_note = f"{note['text']}\n\n(Film: {note['film_title']} at {mmss(note['t_seconds'])})"
            attendees = note['player_ids']
            meeting = {'title': f"Film: {note['film_title']}"[:160], 'date': today, 'note': meeting_note,
                       'meeting_type': 'team' if {x['id'] for x in PLAYERS if x.get('active', True)} <= set(attendees) else 'group' if len(attendees) > 1 else 'individual', 'attendees': attendees}
            items = [{'schema_version': 2, 'player_id': p, 'scope': 'player', 'kind': 'action', 'text': task, 'topic': None, 'skill': None,
                      'tags': note['tags'][:3], 'quote': note['text'], 'due_date': due, 'deadline_text': None, 'confidence': 'high',
                      'mention': next(x['name'] for x in PLAYERS if x['id'] == p), 'match_method': 'full_name', 'sensitive': False,
                      'film_note_id': note_id, 'warnings': [f"From film note at {mmss(note['t_seconds'])}. Check the player, homework and date."]}
                     for p in attendees]
            return {'meeting': meeting, 'items': items}
        return guard(build)

    @app.post('/api/films/{film_id}/recap')
    def recap(film_id: int, body: dict | None = None):
        def run():
            f = film.get_film(film_id)
            notes_ = film.film_notes(film_id)
            if not notes_:
                raise ValueError('Add notes at a time first. The recap reads your notes, not the video.')
            if body_mode(body) == 'demo':
                result = demo_film_recap(notes_)
                origin = 'demo'
            else:
                result = aivana_notes.film_recap(f['title'], [{'time': mmss(n['t_seconds']), 'text': n['text'], 'players': n['player_ids'], 'tags': n['tags'], 'tone': n['tone']} for n in notes_], PLAYERS)
                origin = 'aivana'
            return {**result, 'origin': origin, 'label': 'From your notes, not from the video'}
        return guard(run)

    # ---------- quick grade ----------
    @app.put('/api/clips/{clip_id}/grades/{player_id}')
    def grade(clip_id: int, player_id: str, body: dict):
        return guard(lambda: film.set_grade(clip_id, player_id, body, ROSTER))

    @app.delete('/api/clips/{clip_id}/grades/{player_id}', status_code=204)
    def ungrade(clip_id: int, player_id: str):
        film.delete_grade(clip_id, player_id)
        return Response(status_code=204)

    @app.post('/api/clips/{clip_id}/grades/bulk')
    def bulk(clip_id: int, body: dict | None = None):
        return guard(lambda: film.bulk_grade(clip_id, (body or {}).get('player_ids'), ROSTER, keep_existing=(body or {}).get('keep_existing', True)))

    @app.get('/api/clips/{clip_id}/grades')
    def clip_grades(clip_id: int):
        return film.grades(clip_id=clip_id)

    @app.get('/api/films/{film_id}/grade-summary')
    def grade_summary(film_id: int):
        guard(lambda: film.get_film(film_id))
        return film.film_summary(film_id)

    @app.put('/api/films/{film_id}/summary/{player_id}')
    def written_summary(film_id: int, player_id: str, body: dict):
        return guard(lambda: film.save_written_summary(film_id, player_id, body, ROSTER))

    @app.get('/api/players/{player_id}/film-summary')
    def player_film(player_id: str):
        if player_id not in ROSTER:
            raise HTTPException(404, 'Player not found.')
        return {**film.player_film_summary(player_id), 'notes': film.film_notes(player_id=player_id), 'diagrams': film.list_diagrams(player_id=player_id)}

    # ---------- diagrams ----------
    def meeting_ids():
        return {m['id'] for m in store.list()}

    @app.get('/api/diagrams')
    def diagrams(meeting_id: str | None = None, film_id: int | None = None, note_id: int | None = None, player_id: str | None = None):
        return film.list_diagrams(meeting_id, film_id, note_id, player_id)

    @app.post('/api/diagrams', status_code=201)
    def create_diagram(body: dict):
        return guard(lambda: film.save_diagram(body, ROSTER, meeting_ids()))

    @app.get('/api/diagrams/{diagram_id}')
    def get_diagram(diagram_id: int):
        return guard(lambda: film.get_diagram(diagram_id))

    @app.put('/api/diagrams/{diagram_id}')
    def update_diagram(diagram_id: int, body: dict):
        return guard(lambda: film.save_diagram(body, ROSTER, meeting_ids(), diagram_id))

    @app.delete('/api/diagrams/{diagram_id}', status_code=204)
    def delete_diagram(diagram_id: int):
        guard(lambda: film.delete_diagram(diagram_id))
        return Response(status_code=204)

    @app.get('/api/diagrams/{diagram_id}/{kind}.png')
    def diagram_image(diagram_id: int, kind: str):
        if kind not in ('preview', 'background'):
            raise HTTPException(404, 'Not found.')
        return FileResponse(guard(lambda: film.diagram_file(diagram_id, kind)), headers={'Cache-Control': 'no-cache'})

    # ---------- skill checks, next game, watch list ----------
    @app.get('/api/position-skills/{position}')
    def position_skills(position: str):
        return film.position_skills(position)

    @app.put('/api/position-skills/{position}')
    def set_position_skills(position: str, body: dict):
        return guard(lambda: film.set_position_skills(position, body.get('skills')))

    @app.get('/api/players/{player_id}/skill-checks')
    def skill_checks(player_id: str):
        if player_id not in ROSTER:
            raise HTTPException(404, 'Player not found.')
        return film.skill_checks(player_id)

    @app.post('/api/players/{player_id}/skill-checks', status_code=201)
    def add_check(player_id: str, body: dict):
        return guard(lambda: film.add_skill_check(player_id, body, ROSTER))

    @app.delete('/api/skill-checks/{check_id}', status_code=204)
    def delete_check(check_id: int):
        guard(lambda: film.delete_skill_check(check_id))
        return Response(status_code=204)

    @app.get('/api/next-game')
    def get_next_game(player_id: str | None = None):
        now = datetime.now()
        occ = expand_events(notebook.list_events(), now.date().isoformat(), (now.date() + timedelta(days=120)).isoformat())
        rows = logic.homework(store.list(), PLAYERS)
        return next_game(occ, now, rows, film.list_films(), player_id) or {}

    @app.get('/api/watch-list/repeats')
    def repeats():
        return repeat_corrections(film.film_notes(), PLAYERS)

    # ---------- film packs ----------
    @app.get('/api/film-packs')
    def packs():
        return film.list_packs()

    @app.post('/api/film-packs', status_code=201)
    def create_pack(body: dict):
        return guard(lambda: film.create_pack(body, ROSTER, ROOMS))

    @app.post('/api/film-packs/{pack_id}/revoke')
    def revoke(pack_id: int):
        return guard(lambda: film.revoke_pack(pack_id))

    @app.get('/api/pack/{token}')
    def pack_view(token: str):
        return guard(lambda: film.open_pack(token, PLAYERS))

    @app.post('/api/pack/{token}/watched')
    def pack_watched(token: str):
        guard(lambda: film.pack_watched(token))
        return {'ok': True}

    @app.get('/api/pack/{token}/diagrams/{diagram_id}.png')
    def pack_diagram(token: str, diagram_id: int):
        if not film.pack_diagram_ok(token, diagram_id):
            raise HTTPException(404, 'Not found.')
        return FileResponse(guard(lambda: film.diagram_file(diagram_id, 'preview')))

    return app


def film_notifications(film: FilmRoom, now):
    """Bell items from film packs (opened / watched) and repeat corrections. Code only."""
    names = {p['id']: p['name'] for p in PLAYERS}
    out = []
    for pack in film.list_packs():
        who = names.get(pack['audience_ref'], f"{pack['audience_ref']} room")
        if pack['first_opened_at']:
            out.append({'key': f"pack_opened:{pack['id']}", 'kind': 'pack', 'text': f"Film pack opened: {who}, {pack['title']}", 'link': 'film', 'created_at': pack['first_opened_at']})
        if pack['watched_at']:
            out.append({'key': f"pack_watched:{pack['id']}", 'kind': 'pack', 'text': f"Film pack watched: {who}, {pack['title']}", 'link': 'film', 'created_at': pack['watched_at']})
        if pack['state'] == 'ready' and pack['due_date'] and pack['due_date'] < now.date().isoformat() and not pack['first_opened_at']:
            out.append({'key': f"pack_late:{pack['id']}", 'kind': 'pack', 'text': f"Film pack not opened: {who}, was due {pack['due_date']}", 'link': 'film', 'created_at': f"{pack['due_date']}T23:59:00"})
    for flag in repeat_corrections(film.film_notes(), PLAYERS):
        out.append({'key': f"repeat:{flag['player_id']}:{flag['tag']}:{flag['weeks']}", 'kind': 'repeat', 'text': flag['text'], 'link': f"player:{flag['player_id']}", 'created_at': now.replace(microsecond=0).isoformat()})
    return out


def film_answer(film, store, notebook, intent, message, page, selected, mode, reply, cite, now):
    """Ask Aivana on the Film room and player pages. Numbers come from code; changes need a confirm."""
    names = {p['id']: p for p in PLAYERS}
    if intent == 'film_cutup':
        room = next((r for r in ROOMS if re.search(r'\b' + r + r's?\b', message)), None)
        down = re.search(r'\b([1-4])(?:st|nd|rd|th)\s*downs?\b', message, re.I)
        filters = {k: v for k, v in (('position', room), ('down', down.group(1) if down else None)) if v}
        clips = film.clips(filters=filters)
        if not clips:
            return {**reply, 'reply': "I couldn't find clips like that. Tag clips with players and down first."}
        title = ' '.join(x for x in (room, f"{down.group(1)}{['', 'st', 'nd', 'rd', 'th'][int(down.group(1))]} downs" if down else None) if x) or 'Cut-up'
        return {**reply, 'reply': f"{len(clips)} clip{'s' if len(clips) != 1 else ''} match. Save them as the cut-up \"{title}\"?",
                'confirm': {'kind': 'save_playlist', 'label': 'Save cut-up', 'playlist': {'title': title, 'kind': 'cutup', 'clip_ids': [c['id'] for c in clips][:60], 'filter': filters}},
                'citations': cite([{'title': f"{c['film_title']} · {c['label'] or 'clip'}", 'date': c['film_date'], 'link': f"film:{c['film_id']}@{c['start_s']}"} for c in clips[:8]])}
    if intent == 'film_unassigned':
        linked = {i.get('film_note_id') for m in store.list() for i in m['items'] if i.get('film_note_id')}
        notes = [n for n in film.film_notes(selected if page == 'film' and isinstance(selected, int) else None) if n['player_ids'] and n['id'] not in linked]
        if not notes:
            return {**reply, 'reply': 'Every film note with a player already has homework.'}
        return {**reply, 'reply': f"{len(notes)} film note{'s have' if len(notes) != 1 else ' has'} no homework yet. Open one and press Make homework.",
                'citations': cite([{'title': f"{n['film_title']} {int(n['t_seconds']) // 60:02d}:{int(n['t_seconds']) % 60:02d}", 'date': n['created_at'][:10], 'link': f"film:{n['film_id']}@{n['t_seconds']}", 'text': n['text']} for n in notes[:8]])}
    if intent == 'before_game':
        from .film import next_game
        named = logic.players_in_text(message, PLAYERS)
        pid = named[0]['id'] if named else (selected if page == 'player' and selected in ROSTER else None)
        occ = expand_events(notebook.list_events(), now.date().isoformat(), (now.date() + timedelta(days=120)).isoformat())
        game = next_game(occ, now, logic.homework(store.list(), PLAYERS), film.list_films(), pid)
        if not game:
            return {**reply, 'reply': 'No game on the schedule yet.'}
        who = names[pid]['name'] if pid else 'The team'
        items = [f"{h['text']} (due {h['due_date']})" for h in game['homework_due'][:5]]
        if game['next_one_on_one']:
            items.append(f"1-on-1: {game['next_one_on_one']['title']} on {game['next_one_on_one']['date']}")
        text = f"{who} before {game['opponent'] or 'the game'} ({game['when'].lower()}): " + ('; '.join(items) if items else 'nothing due.')
        return {**reply, 'reply': text, 'citations': cite([{'title': game['event']['title'], 'date': game['event']['date'], 'link': f"schedule:{game['event']['date']}"}])}
    # Recap this film (page film): notes only.
    if not isinstance(selected, int):
        return {**reply, 'reply': 'Open a film first, then ask me to recap it.'}
    notes = film.film_notes(selected)
    if not notes:
        return {**reply, 'reply': 'Add notes at a time first. The recap reads your notes, not the video.'}
    if mode == 'demo':
        result, origin = demo_film_recap(notes), 'demo'
    else:
        result = aivana_notes.film_recap(film.get_film(selected)['title'], [{'time': mmss(n['t_seconds']), 'text': n['text'], 'players': n['player_ids'], 'tags': n['tags'], 'tone': n['tone']} for n in notes], PLAYERS)
        origin = 'aivana'
    lines = [result['summary']] + [f"• {p['player']}: " + '; '.join(p['points'][:3]) for p in result['per_player'][:6]] + [f"This week work on: {result['this_week_work_on']}"]
    return {**reply, 'origin': origin, 'reply': 'From your notes, not from the video. ' + '\n'.join(lines),
            'citations': cite([{'title': f"{mmss(n['t_seconds'])} {n['text'][:60]}", 'date': n['created_at'][:10], 'link': f"film:{n['film_id']}@{n['t_seconds']}"} for n in notes[:8]])}
