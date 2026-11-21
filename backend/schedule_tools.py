"""Schedule search, ranged calendar export and the To do checklist.
Everything is computed in code from the existing tables: events (including coach
to-dos), approved homework and saved meetings. Notes are never searched or exported."""
import re
from datetime import date, datetime, timedelta, timezone

from .notebook import ics_escape, ics_fold
from .vocabulary import is_sensitive

TYPE_GROUPS = {'games': {'game', 'scrimmage'}, 'practices': {'practice', 'walkthrough', 'lift'}, 'film': {'film'}, 'meetings': {'meeting', 'player_meeting'},
               'assignments': {'homework', 'todo'}}
LABELS = {'game': 'Official game', 'scrimmage': 'Scrimmage', 'practice': 'Practice', 'walkthrough': 'Walk-through', 'lift': 'Lift', 'film': 'Film review',
          'meeting': 'Meeting', 'player_meeting': 'Player meeting', 'homework': 'Assignment due', 'todo': 'Coach to-do', 'note': 'Note', 'other': 'Other'}
SEASON = ('08-01', '01-31')


def private(row):
    """Health/insurance homework stays out of search, export and the To do list (even older records without the flag)."""
    return bool(row.get('sensitive')) or is_sensitive(row.get('text', ''))


def scrub_names(text, players):
    """Remove roster names and jersey numbers (names off in exports)."""
    out = text
    for p in sorted(players, key=lambda p: -len(p['name'])):
        out = re.sub(r'\b' + re.escape(p['name']) + r'\b', 'player', out, flags=re.I)
    for p in players:
        first = p['name'].split()[0]
        if sum(1 for o in players if o['name'].split()[0] == first) == 1:
            out = re.sub(r'\b' + re.escape(first) + r"(?:'s)?\b", 'player', out)
    out = re.sub(r'#\d{1,2}\b', 'player', out)
    out = re.sub(r'^player:\s*', '', out)
    return re.sub(r'\s{2,}', ' ', out).strip()


def season_range(today, setting=None):
    """Default football season: Aug 1 to Jan 31 of the season containing today (editable)."""
    start_md, end_md = (setting or {}).get('start', SEASON[0]), (setting or {}).get('end', SEASON[1])
    year = today.year if today.strftime('%m-%d') >= start_md else today.year - 1
    start = date.fromisoformat(f'{year}-{start_md}')
    end = date.fromisoformat(f'{year if end_md > start_md else year + 1}-{end_md}')
    return start, end


def audience_names(audience, players):
    if not audience or audience == 'team':
        return 'whole team'
    if audience.startswith('group:'):
        group = audience[6:]
        return f"{group} room " + ' '.join(p['name'] for p in players if p['position_group'] == group)
    p = next((p for p in players if p['id'] == audience[7:]), None)
    return f"#{p['number']} {p['name']}" if p else ''


def schedule_items(occurrences, homework_rows, meetings, players):
    """Scheduled activities and assignment deadlines only. Each item is derived from its record, never copied."""
    items = []
    for e in occurrences:
        kind = 'todo' if e.get('todo') else e['type']
        if kind == 'note':
            continue
        who = audience_names(e.get('audience'), players)
        items.append({'kind': kind, 'source': 'event', 'id': e['id'], 'occurrence_id': e['occurrence_id'], 'date': e['date'], 'start_at': e['start_at'],
                      'title': e['title'], 'label': LABELS.get(kind, kind), 'done': bool(e.get('done_at')),
                      'search': ' '.join(filter(None, [e['title'], LABELS.get(kind, ''), e.get('opponent'), e.get('location'), e.get('focus'), who]))})
    for r in homework_rows:
        if not r['due_date'] or private(r):
            continue
        p = next((p for p in players if p['id'] == r['player_id']), {})
        items.append({'kind': 'homework', 'source': 'homework', 'id': r['id'], 'meeting_id': r['meeting_id'], 'player_id': r['player_id'], 'date': r['due_date'],
                      'start_at': None, 'title': f"{r['player_name']}: {r['text']}", 'label': 'Assignment due', 'done': r['completed'],
                      'search': f"{r['text']} {r['player_name']} #{p.get('number', '')} {p.get('position', '')} assignment homework"})
    for m in meetings:
        names = ' '.join(p['name'] for p in players if p['id'] in m['attendees'])
        items.append({'kind': 'player_meeting', 'source': 'meeting', 'id': m['id'], 'date': m['date'], 'start_at': None, 'title': m['title'],
                      'label': 'Player meeting', 'done': True, 'search': f"{m['title']} {names} meeting"})  # title and attendees only, never the note text
    return items


def search(items, query, kind='all', today=None, players=()):
    words = [w for w in re.findall(r'[#\w-]+', (query or '').casefold()) if w]
    group = TYPE_GROUPS.get(kind)
    out = []
    for it in items:
        if group and it['kind'] not in group:
            continue
        hay = it['search'].casefold()
        if words and not all(w in hay for w in words):
            continue
        row = {k: it[k] for k in ('kind', 'source', 'id', 'date', 'start_at', 'title', 'label', 'done')} | {'occurrence_id': it.get('occurrence_id'), 'count': 1}
        twin = next((o for o in out if (o['kind'], o['title'], o['date'], o['start_at']) == (row['kind'], row['title'], row['date'], row['start_at'])), None)
        if twin:  # the same thing saved twice: show it once
            twin['count'] += 1
            twin['done'] = twin['done'] and row['done']
            continue
        out.append(row)
    today = today or date.today().isoformat()
    upcoming = sorted([i for i in out if i['date'] >= today], key=lambda i: (i['date'], i['start_at'] or ''))
    past = sorted([i for i in out if i['date'] < today], key=lambda i: (i['date'], i['start_at'] or ''), reverse=True)
    return {'upcoming': upcoming[:40], 'past': past[:40], 'total': len(out)}


def utc(moment):
    """Local wall time on this computer → UTC, so every calendar app shows the right time."""
    return moment.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def build_range_ics(occurrences, homework_rows, players, include_homework=True, include_names=False, stamp=None):
    """Single events (repeats written out), UTC times, stable UIDs: re-importing updates instead of duplicating."""
    stamp = stamp or datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Falcon Follow-up//Coach Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
             'X-WR-CALNAME:Falcon Follow-up schedule']
    for e in occurrences:
        if e['type'] == 'note' or e.get('todo'):
            continue  # notes and the coach's private to-dos stay in the app
        begin = datetime.fromisoformat(e['start_at'])
        finish = begin + timedelta(minutes=e.get('duration_min') or 60)  # may cross midnight: multi-day is fine
        title = e['title'] if include_names else scrub_names(e['title'], players)
        lines += ['BEGIN:VEVENT', f"UID:event-{e['id']}-{e['date']}@falcon-follow-up", f'DTSTAMP:{stamp}', f'DTSTART:{utc(begin)}', f'DTEND:{utc(finish)}',
                  f"SUMMARY:{ics_escape(title)}", f"CATEGORIES:{ics_escape(LABELS.get(e['type'], e['type']).upper())}"]
        if e.get('location'):
            lines.append(f"LOCATION:{ics_escape(e['location'])}")
        lines.append('END:VEVENT')
    if include_homework:
        for r in homework_rows:
            if not r['due_date'] or r['completed'] or private(r):
                continue
            day = date.fromisoformat(r['due_date'])
            who = f"{r['player_name']}: " if include_names else ''
            task = r['text'] if include_names else scrub_names(r['text'], players)
            lines += ['BEGIN:VEVENT', f"UID:homework-{r['id']}-{r['player_id']}@falcon-follow-up", f'DTSTAMP:{stamp}',
                      f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{(day + timedelta(days=1)).strftime('%Y%m%d')}",
                      f"SUMMARY:{ics_escape('Assignment due: ' + who + task)}", 'CATEGORIES:ASSIGNMENT', 'TRANSP:TRANSPARENT', 'END:VEVENT']
    lines.append('END:VCALENDAR')
    return '\r\n'.join(ics_fold(line) for line in lines) + '\r\n'


def checklist(homework_rows, todos, game, today):
    """Overdue / Today / Before next game, from existing homework and coach to-dos (events with todo=1)."""
    kickoff = game['event']['date'] if game and game.get('event') else None
    items = [{'source': 'homework', 'id': r['id'], 'meeting_id': r['meeting_id'], 'player_id': r['player_id'], 'title': r['text'], 'who': r['player_name'],
              'due': r['due_date'], 'done': r['completed']} for r in homework_rows if r['due_date'] and not private(r)]
    items += [{'source': 'todo', 'id': t['id'], 'title': t['title'], 'who': None, 'due': t['date'], 'done': bool(t.get('done_at'))} for t in todos]
    groups = {'overdue': [], 'today': [], 'before_game': [], 'done': []}
    for it in sorted(items, key=lambda i: (i['due'], i['title'])):
        if it['done']:
            if it['due'] >= (date.fromisoformat(today) - timedelta(days=7)).isoformat():
                groups['done'].append(it)
        elif it['due'] < today:
            groups['overdue'].append(it)
        elif it['due'] == today:
            groups['today'].append(it)
        elif kickoff and it['due'] <= kickoff:
            groups['before_game'].append(it)
    return {'groups': groups, 'kickoff': kickoff}
