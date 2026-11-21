"""Code-only helpers used by the imported Home notebook and its schedule."""
import re

from datetime import date, datetime, timedelta

from .dates import WEEKDAYS, resolve_deadline

NUMBER_WORDS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split())}

TENS = {'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90}

def word(value):
    return re.sub(r'\s+', ' ', value.casefold()).strip(' .,:;!?"\'')

def match_name(name, players):
    """Return a player id for a name, nickname or jersey (#4) only when exactly one fits."""
    value = word(name or '')
    if not value:
        return None
    hits = set()
    for p in players:
        parts = [word(x) for x in p['name'].split()]
        if value == word(p['name']) or value in parts or (p.get('nickname') and value == word(p['nickname'])):
            hits.add(p['id'])
        elif re.fullmatch(r'(?:#|no\.?\s*|number\s*)?\d{1,2}', value) and re.sub(r'\D', '', value) == str(p['number']):
            hits.add(p['id'])
    return hits.pop() if len(hits) == 1 else None

def players_in_text(text, players):
    """Roster players named in text by full name, unique first/last name or jersey #N."""
    found = []
    for p in players:
        names = [p['name']] + p['name'].split()
        if any(re.search(r'(?<![\w#])' + re.escape(n) + r'(?!\w)', text, re.IGNORECASE) for n in names if match_name(n, players) == p['id']) \
                or re.search(r'#' + str(p['number']) + r'(?!\d)', text):
            found.append(p)
    return found

def finalize_recap(payload, note, players):
    """Validate the model recap; resolve due phrases to dates in code; flag unknown names."""
    if not isinstance(payload, dict):
        raise ValueError('The recap was incomplete. Please retry.')
    if not isinstance(payload.get('summary', ''), str) or any(not isinstance(payload.get(key, []), list) for key in ('key_points','decisions','questions_to_follow_up','players_mentioned','to_dos')):
        raise ValueError('The recap was incomplete. Please retry.')
    roster = {p['id']: p for p in players}
    recap = {key: [str(x)[:300] for x in payload.get(key, []) if isinstance(x, str) and x.strip()][:8]
             for key in ('key_points', 'decisions', 'questions_to_follow_up')}
    recap['summary'] = str(payload.get('summary') or '').strip()[:800]
    mentioned, seen = [], set()
    for entry in payload.get('players_mentioned', []):
        if not isinstance(entry, dict) or not isinstance(entry.get('name'), str):
            continue
        # Code decides the match: the model's player_id is only accepted when the name fits that roster entry.
        player_id = match_name(entry['name'], players)
        suggested = roster.get(entry.get('player_id'))
        if not player_id and suggested and word(entry['name']) in word(suggested['name']).split() + [word(suggested['name'])]:
            player_id = suggested['id']
        key = player_id or word(entry['name'])
        if key in seen:
            continue
        seen.add(key)
        mentioned.append({'name': roster[player_id]['name'] if player_id else entry['name'], 'player_id': player_id,
                          'unknown_name': player_id is None})
    to_dos = []
    for item in payload.get('to_dos', []):
        if not isinstance(item, dict) or not isinstance(item.get('task'), str) or not item['task'].strip():
            continue
        source = item.get('source_text') if isinstance(item.get('source_text'), str) else ''
        in_note = bool(source) and word(source) in word(note['body'])
        player_id = match_name(item.get('player') or '', players)
        due, warning = (None, None)
        if item.get('due_phrase'):
            due, warning = resolve_deadline(item['due_phrase'], None, note['note_date'], source or item['due_phrase'])
        to_dos.append({'player': roster[player_id]['name'] if player_id else (item.get('player') or 'Not named'),
                       'player_id': player_id, 'unknown_name': player_id is None, 'task': item['task'].strip()[:400],
                       'due_phrase': item.get('due_phrase'), 'due_date': due, 'date_warning': warning,
                       'source_text': source, 'source_found': in_note})
    recap.update(players_mentioned=mentioned, to_dos=to_dos)
    return recap

ACTION_CUE = re.compile(r'\b(needs? to|should|has to|have to|must|homework|watch|review|send|turn in|bring|work on|study|finish|run|practice|ice|stretch)\b', re.I)

DUE_CUE = re.compile(r'\b(?:by|before|due|on)\s+(today|tomorrow|(?:next |this )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2}|in \d{1,3} days?)\b', re.I)

DECISION_CUE = re.compile(r'\b(we will|we\'ll|decided|plan is|going with|start(?:s|ing)?|move|switch|install)\b', re.I)

def sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+', text or '') if s.strip()]

def demo_recap(note, players):
    """Code-only recap for Demo mode (no AI call). Copies sentences from the note."""
    lines = sentences(note['body'])
    payload = {'summary': ' '.join(lines[:2]), 'key_points': lines[:5], 'players_mentioned': [], 'to_dos': [],
               'decisions': [], 'questions_to_follow_up': []}
    for p in players_in_text(note['body'], players):
        payload['players_mentioned'].append({'name': p['name'], 'player_id': p['id']})
    for line in lines:
        named = players_in_text(line, players)
        if re.match(r"\s*(?:we|we'll|team)\b", line, re.I) and DECISION_CUE.search(line):
            payload['decisions'].append(line)
        elif named and ACTION_CUE.search(line):
            due = DUE_CUE.search(line)
            for p in named[:3]:
                payload['to_dos'].append({'player': p['name'], 'task': line, 'due_phrase': due.group(0) if due else None, 'source_text': line})
        elif DECISION_CUE.search(line):
            payload['decisions'].append(line)
        if '?' in line or re.search(r'\b(check|follow up|ask)\b', line, re.I):
            payload['questions_to_follow_up'].append(line)
    return finalize_recap(payload, note, players)

def spoken_number(value):
    parts = value.casefold().split()
    if len(parts) == 1:
        return TENS.get(parts[0], NUMBER_WORDS.get(parts[0]))
    if len(parts) == 2 and parts[0] in TENS and parts[1] in NUMBER_WORDS and NUMBER_WORDS[parts[1]] < 10:
        return TENS[parts[0]] + NUMBER_WORDS[parts[1]]
    return None

def demo_clean_transcript(text, players):
    """Code-only cleanup: spoken jersey numbers, roster capitals, sentence capitals."""
    changes = []
    number_words = '|'.join(sorted(list(NUMBER_WORDS) + list(TENS), key=len, reverse=True))

    def jersey(match):
        value = spoken_number(match.group(2)) if not match.group(2).isdigit() else int(match.group(2))
        if value is None:
            return match.group(0)
        changes.append({'before': match.group(0), 'after': f'#{value}', 'reason': 'Jersey number'})
        return f'#{value}'
    cleaned = re.sub(rf'\b(number|no\.)\s+((?:{"|".join(TENS)})\s+(?:one|two|three|four|five|six|seven|eight|nine)|{number_words}|\d{{1,2}})\b',
                     jersey, text, flags=re.I)
    for p in players:
        for part in p['name'].split():
            if match_name(part, players) != p['id']:
                continue
            for found in set(re.findall(r'(?<!\w)' + re.escape(part) + r'(?!\w)', cleaned, re.I)):
                if found != part:
                    cleaned = re.sub(r'(?<!\w)' + re.escape(found) + r'(?!\w)', part, cleaned)
                    changes.append({'before': found, 'after': part, 'reason': 'Roster spelling'})
    fixed = re.sub(r'(^|[.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), cleaned.strip())
    if fixed and fixed[0] != cleaned.strip()[:1]:
        changes.append({'before': cleaned.strip()[:1], 'after': fixed[0], 'reason': 'Capital letter'})
    if fixed and fixed[-1] not in '.!?':
        fixed += '.'
        changes.append({'before': '', 'after': '.', 'reason': 'End of sentence'})
    return {'text': fixed, 'changes': changes}

def finalize_clean(payload, original):
    if not isinstance(payload, dict) or not isinstance(payload.get('text'), str):
        raise ValueError('The cleanup was incomplete. Your words are unchanged.')
    changes = [{k: str(c.get(k) or '')[:200] for k in ('before', 'after', 'reason')}
               for c in payload.get('changes') or [] if isinstance(c, dict)]
    changes = [c for c in changes if not c['before'] or c['before'] in original][:60]
    return {'text': payload['text'], 'changes': changes, 'original': original}

def homework(meetings, players, include_sensitive=False):
    names = {p['id']: p['name'] for p in players}
    rows = []
    for meeting in meetings:
        for item in meeting.get('items', []):
            if item.get('kind') != 'action' or (item.get('sensitive') and not include_sensitive):
                continue
            for player_id in ([item['player_id']] if item.get('player_id') else item.get('player_ids') or []):
                rows.append({'id': item['id'], 'meeting_id': meeting['id'], 'meeting_title': meeting['title'], 'meeting_date': meeting['date'],
                             'player_id': player_id, 'player_name': names.get(player_id, 'Unknown player'), 'text': item['text'],
                             'due_date': item.get('due_date'), 'completed': bool(item.get('completed'))})
    return rows

def homework_status(row, today):
    if row['completed']:
        return 'done'
    if row['due_date'] and row['due_date'] < today:
        return 'late'
    return 'open'

MONTHS = {m: i + 1 for i, m in enumerate('january february march april may june july august september october november december'.split())}

TYPE_WORDS = [
    (r'walk[\s-]?through', 'walkthrough', 'Walk-through'), (r'\bscrimmage\b', 'scrimmage', 'Scrimmage'), (r'\bpractice\b', 'practice', 'Practice'), (r'\bgame\b', 'game', 'Game day'),
    (r'\bfilm\b', 'film', 'Film'), (r'\blift\b', 'lift', 'Lift'), (r'\b(?:bus|travel)\b', 'other', 'Travel'),
    (r'\b1[\s-]?on[\s-]?1\b|\bone[\s-]on[\s-]one\b', 'meeting', '1-on-1'), (r'\bmeeting\b|\bposition room\b', 'meeting', 'Meeting'),
    (r'\breminder\b|\bremind\b', 'other', 'Reminder'),
]

def parse_day(text, today):
    lower = text.casefold()
    if re.search(r'\btoday\b|\btonight\b', lower):
        return today
    if re.search(r'\btomorrow\b', lower):
        return today + timedelta(days=1)
    match = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', lower)
    if match:
        return date.fromisoformat(match.group(1))
    match = re.search(r'\b(' + '|'.join(sorted(MONTHS, key=len, reverse=True)) + r')\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b', lower)
    if match:
        candidate = date(today.year, MONTHS[match.group(1)], int(match.group(2)))
        return candidate if candidate >= today - timedelta(days=60) else candidate.replace(year=today.year + 1)
    match = re.search(r'\b(\d{1,2})/(\d{1,2})\b', lower)
    if match:
        candidate = date(today.year, int(match.group(1)), int(match.group(2)))
        return candidate if candidate >= today - timedelta(days=60) else candidate.replace(year=today.year + 1)
    match = re.search(r'\b(next |this )?(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b', lower)
    if match:
        target = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].index(match.group(2))
        offset = (target - today.weekday()) % 7
        if match.group(1) == 'next ' and offset == 0:
            offset = 7
        return today + timedelta(days=offset)
    return None

def parse_time(text):
    lower = text.casefold()
    match = re.search(r'\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?|\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b|\bat\s+(\d{1,2})\b(?!\s*(?:min|hour|hr))', lower)
    if not match:
        if re.search(r'\bnoon\b', lower):
            return 12, 0
        return None
    hour = int(match.group(1) or match.group(4) or match.group(6))
    minute = int(match.group(2) or 0)
    meridian = (match.group(3) or match.group(5) or '').replace('.', '')
    if hour > 23 or minute > 59:
        return None
    if meridian == 'pm' and hour < 12:
        hour += 12
    elif meridian == 'am' and hour == 12:
        hour = 0
    elif not meridian and 1 <= hour <= 6:
        hour += 12  # "practice at 3:30" means the afternoon
    return hour, minute

def parse_duration(text):
    lower = text.casefold()
    match = re.search(r'\b(\d{1,3})\s*(?:min|minutes|mins)\b', lower)
    if match:
        return max(5, min(int(match.group(1)), 600))
    match = re.search(r'\b(\d(?:\.5)?)\s*(?:hours?|hrs?)\b', lower)
    if match:
        return int(float(match.group(1)) * 60)
    return None

def parse_event_request(text, today, players):
    """Turn "Add practice Tuesday 3:30" into an event draft. Returns (draft, missing)."""
    kind, title = 'other', None
    for pattern, event_type, label in TYPE_WORDS:
        if re.search(pattern, text, re.I):
            kind, title = event_type, label
            break
    gear = re.search(r'\b(pads|shells|helmets)\b', text, re.I)
    if title == 'Practice' and gear:
        title = f'Practice ({gear.group(1).lower()})'
    opponent = re.search(r'\b(vs\.?|at)\s+([A-Z][\w-]+(?:\s[A-Z][\w-]+)?)', text)
    if kind == 'game' and opponent:
        title = f"Game day · {'vs.' if opponent.group(1).startswith('vs') else 'at'} {opponent.group(2)}"
    audience = 'team'
    named = players_in_text(text, players)
    if named:
        audience = f"player:{named[0]['id']}"
        if title in ('1-on-1', 'Meeting'):
            title = f"1-on-1: {named[0]['name']}"
            kind = 'meeting'
    group = re.search(r'\b(QBs?|WRs?|RBs?|TEs?|OL|DL|LBs?|DBs?|ST)\b', text)
    if group and not named:
        audience = f"group:{group.group(1).rstrip('s')}"
    day, when = parse_day(text, today), parse_time(text)
    missing = [label for label, value in (('day', day), ('time', when)) if value is None]
    if not title:
        quoted = re.search(r'"([^"]{2,80})"', text)
        title = quoted.group(1) if quoted else None
        if not title:
            missing.append('what')
    draft = None
    if not missing:
        draft = {'type': kind, 'title': title, 'start_at': f'{day.isoformat()}T{when[0]:02d}:{when[1]:02d}',
                 'duration_min': parse_duration(text) or (180 if kind == 'game' else 120 if title.startswith('Practice') else 60),
                 'audience': audience, 'note': None, 'repeat_weekly': bool(re.search(r'\bevery\b|\bweekly\b', text, re.I))}
    return draft, missing

EVENT_WORDS = re.compile(r'\b(game|scrimmage|practice|walk[\s-]?through|film|lift|meeting|1[\s-]?on[\s-]?1|kickoff|bus|travel)\b', re.I)

def detect_events(text, note_date, players):
    """Events mentioned in a note ("We have a game tomorrow at 2 PM"), resolved in code
    relative to the note's date. Returns drafts only; nothing is saved here."""
    base = date.fromisoformat(note_date)
    found = []
    for line in sentences(text):
        if not EVENT_WORDS.search(line):
            continue
        draft, missing = parse_event_request(line, base, players)
        opponent = re.search(r'\b(?:vs\.?|versus|against|at|@)\s+([A-Z][\w-]*(?:\s[A-Z][\w-]*)?)', line)
        if draft and draft['type'] == 'game' and opponent:
            draft['opponent'] = opponent.group(1)
            draft['home_away'] = 'away' if re.search(r'\b(?:at|@)\s+[A-Z]', line) else 'home'
            draft['title'] = f"Game day · {'at' if draft['home_away'] == 'away' else 'vs.'} {opponent.group(1)}"
        found.append({'source_text': line, 'draft': draft, 'missing': missing,
                      'message': None if draft else f"Found a possible event but no {' or '.join(missing)}. Add it by hand if it is real."})
    return found[:5]
