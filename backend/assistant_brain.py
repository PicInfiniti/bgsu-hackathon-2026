"""Ask Aivana: context memory, clarification, de-duplicated evidence and grounded
recommendations. Facts come only from approved records; dates, counts and late
status are computed here. Suggested actions are labelled as suggestions and every
one cites the records it rests on. Missing information is said out loud."""
import re
from datetime import date, datetime, timedelta

from . import coach_logic as logic

PRONOUN = re.compile(r"\b(he|him|his|he's|this player|that player|the player|this guy|that guy)\b", re.I)
TEAM_WORDS = re.compile(r'\b(team|everyone|everybody|all players|whole roster|receivers|wrs?|dbs?|defensive backs|offensive line|o-?line|linebackers|qbs?|quarterbacks|running backs|rbs?|position room)\b', re.I)
RECOMMEND = re.compile(r"\b(next steps?|recommend\w*|suggest\w*|advice|what should (?:i|we)|what do you think i should|prioriti[sz]e|focus on|what to (?:do|focus|work on)|discuss with|talk (?:to|with) .* about|prepare|preparation|plan (?:for|with)|follow[\s-]?up plan)\b", re.I)
SUMMARY = re.compile(r'\b(summari[sz]e|summary|recap|overview of|tell me about|how is .* doing|what did i (?:tell|say to|note on|write about))\b', re.I)
HOMEWORK = re.compile(r'\b(homework|assignments?|to-?dos?|tasks?|due|deadlines?)\b', re.I)
GENERIC = {'other', 'not specified', 'not applicable', 'football skills', 'team communication', ''}
LAST_MEETING =re.compile(r'\b(last|latest|most recent|previous)\s+(meeting|1[\s-]?on[\s-]?1|film review|film session|position room|practice)\b', re.I)


def norm(text):
    return re.sub(r'[^a-z0-9#]+', ' ', (text or '').casefold()).strip()


def strip_name(text, who):
    """'Taylor Hayes: Review clips' → 'Review clips' when the name is already shown."""
    for name in [w.strip() for w in (who or '').split(',') if w.strip()]:
        for prefix in (name, name.split()[0]):
            if text.lower().startswith(prefix.lower() + ':'):
                return text[len(prefix) + 1:].strip()
    return text


def ambiguous_names(message, players):
    """Words that are the first or last name of more than one player (and no full name given)."""
    out = []
    for word in set(re.findall(r"[A-Za-z][a-z'-]+", message)):
        hits = [p for p in players if word.casefold() in [x.casefold() for x in p['name'].split()]]
        if len(hits) > 1 and not any(p['name'].casefold() in message.casefold() for p in hits):
            out.append((word, hits))
    return out


def resolve_players(message, context, players):
    """Returns (player_ids, clarification or None, source) using names, then the conversation context."""
    unclear = ambiguous_names(message, players)
    named = logic.players_in_text(message, players)
    if unclear and not named:
        word, hits = unclear[0]
        names = ' or '.join(p['name'] for p in hits)
        return [], f"I can help with that. Are you asking about {names}?", 'ambiguous'
    if named:
        return [p['id'] for p in named], None, 'named'
    current = (context or {}).get('player_id')
    if current and (PRONOUN.search(message) or not TEAM_WORDS.search(message)):
        return [current], None, 'context'
    if PRONOUN.search(message):
        return [], 'Who do you mean? Name the player (for example "Avery" or "#4").', 'unknown'
    return [], None, 'none'


def skill_of(message, context, vocabulary):
    text = norm(message)
    for phrase in sorted(vocabulary, key=len, reverse=True):
        if phrase and len(phrase) > 3 and f' {phrase} ' in f' {text} ':
            return phrase
    return (context or {}).get('skill') if not TEAM_WORDS.search(message) else None


def gather(meetings, film_notes, skill_checks, players, player_ids, today, skill=None):
    """All evidence for the players (or the team), de-duplicated, newest first."""
    names = {p['id']: p['name'] for p in players}
    wanted = set(player_ids)
    records, seen = [], {}
    for m in meetings:
        if m.get('approved') is not True:
            continue  # unapproved drafts never count as facts
        for item in m['items']:
            if item.get('sensitive'):
                continue
            targets = [item['player_id']] if item.get('player_id') else item.get('player_ids') or []
            if wanted and not wanted & set(targets):
                continue
            words = ' '.join(filter(None, [item.get('skill'), item.get('topic'), *(item.get('tags') or [])]))
            if skill and skill not in norm(f"{item['text']} {words}"):
                continue
            who = ', '.join(names.get(t, t) for t in targets if not wanted or t in wanted) or 'Whole team'
            key = (norm(item['text']), item['kind'], m['date'])
            if key in seen:  # the same statement saved for several players: keep once, merge names
                seen[key]['who'] = ', '.join(dict.fromkeys(seen[key]['who'].split(', ') + who.split(', ')))
                continue
            entry = {'kind': item['kind'], 'text': item['text'], 'who': who, 'date': m['date'], 'meeting_id': m['id'], 'meeting_title': m['title'],
                     'skill': words, 'due_date': item.get('due_date'), 'completed': bool(item.get('completed')), 'item_id': item['id'],
                     'player_ids': targets, 'link': f"player:{targets[0]}" if len(targets) == 1 else 'homework',
                     'themes': [t for t in dict.fromkeys([(item.get('skill') or '').lower(), *[(x or '').lower() for x in item.get('tags') or []]]) if t and t not in GENERIC]}
            seen[key] = entry
            records.append(entry)
    for n in film_notes:
        if wanted and not wanted & set(n['player_ids']):
            continue
        if skill and skill not in norm(n['text'] + ' ' + ' '.join(n['tags'])):
            continue
        records.append({'kind': {'improve': 'improvement', 'praise': 'praise'}.get(n['tone'], 'observation'), 'text': n['text'],
                        'who': ', '.join(names.get(p, p) for p in n['player_ids']), 'date': n['created_at'][:10], 'meeting_title': f"Film: {n['film_title']}",
                        'skill': ' '.join(n['tags']), 'due_date': None, 'completed': False, 'player_ids': n['player_ids'], 'film_time': n['t_seconds'], 'themes': list(n['tags']),
                        'link': f"film:{n['film_id']}@{n['t_seconds']}"})
    for c in skill_checks:
        if wanted and c['player_id'] not in wanted:
            continue
        records.append({'kind': 'skill_check', 'text': f"Skill check {c['skill']}: {c['score']}/5 ({c['why']})", 'who': names.get(c['player_id'], ''),
                        'date': c['check_date'], 'meeting_title': 'Skill check', 'skill': c['skill'].lower(), 'due_date': None, 'completed': False,
                        'player_ids': [c['player_id']], 'link': f"player:{c['player_id']}", 'score': c['score'], 'themes': [c['skill'].lower()]})
    # De-duplicate across sources (a film note and the homework made from it say the same thing).
    unique, keys = [], {}
    for r in sorted(records, key=lambda r: (r['kind'] != 'action', r['date'])):
        r['text'] = strip_name(r['text'], r['who'])
        k = norm(r['text'])
        if k in keys:
            keys[k]['also'] = keys[k].get('also', 0) + 1
            continue
        keys[k] = r
        unique.append(r)
    records = unique
    records.sort(key=lambda r: r['date'], reverse=True)
    for i, r in enumerate(records):
        r['source_id'] = f'S{i + 1}'
    return records


def status_of(r, today):
    if r['kind'] != 'action':
        return None
    if r['completed']:
        return 'done'
    if r['due_date'] and r['due_date'] < today:
        return 'late'
    return 'open'


def code_recommendations(records, players, player_ids, today, game=None, last_one_on_one=None):
    """Grounded next steps built by rules. Each cites the records it rests on."""
    names = {p['id']: p['name'] for p in players}
    who = names.get(player_ids[0]) if len(player_ids) == 1 else None
    first = who.split()[0] if who else None
    soon = (date.fromisoformat(today) + timedelta(days=3)).isoformat()
    recs, facts, missing = [], [], []
    late = [r for r in records if status_of(r, today) == 'late']
    due_soon = [r for r in records if status_of(r, today) == 'open' and r['due_date'] and r['due_date'] <= soon]
    undated = [r for r in records if status_of(r, today) == 'open' and not r['due_date']]
    for r in late[:3]:
        recs.append({'action': f"Follow up with {r['who']} on \"{r['text']}\". It was due {r['due_date']} and no record says it was finished.",
                     'why': 'Late assignment in an approved meeting record.', 'source_ids': [r['source_id']], 'priority': 1})
        facts.append({'text': f"{r['who']}: \"{r['text']}\" was due {r['due_date']} and is still open.", 'source_ids': [r['source_id']]})
    for r in due_soon[:2]:
        recs.append({'action': f"Check {r['who']}'s progress on \"{r['text']}\" before {r['due_date']}.", 'why': 'Assignment due within 3 days.', 'source_ids': [r['source_id']], 'priority': 2})
    # Recurring improvement themes (same tag/skill in 2+ records).
    themes = {}
    for r in records:
        if r['kind'] in ('improvement', 'action') or (r['kind'] == 'skill_check' and r.get('score', 5) <= 2):
            for t in r.get('themes') or []:
                themes.setdefault(t, []).append(r)
    for theme, rs in sorted(themes.items(), key=lambda kv: -len(kv[1]))[:2]:
        if len(rs) >= 2 and theme:
            dates = ', '.join(sorted({x['date'] for x in rs}))
            recs.append({'action': f"Plan focused work on {theme}{f' with {first}' if first else ''} — it came up {len(rs)} times ({dates}).",
                         'why': 'Recurring coaching point across approved records.', 'source_ids': [x['source_id'] for x in rs[:4]], 'priority': 3})
    improve = [r for r in records if r['kind'] == 'improvement'][:2]
    for r in improve:
        if not any(r['source_id'] in x['source_ids'] for x in recs):
            recs.append({'action': f"Revisit this coaching point{f' with {first}' if first else ''} at the next practice: \"{r['text']}\".", 'why': 'Improvement noted by the coach.',
                         'source_ids': [r['source_id']], 'priority': 4})
        facts.append({'text': f"Coach's note ({r['date']}): {r['text']}", 'source_ids': [r['source_id']]})
    praise = [r for r in records if r['kind'] == 'praise'][:1]
    for r in praise:
        recs.append({'action': f"Recognize the progress you noted: \"{r['text']}\".", 'why': 'Praise recorded by the coach.', 'source_ids': [r['source_id']], 'priority': 6})
    if game and game.get('event') and (late or due_soon):
        recs.append({'action': f"Before {game['opponent'] or 'the game'} ({game['when'].lower()}), make sure the open assignments above are done.", 'why': 'Next game on the schedule.',
                     'source_ids': [r['source_id'] for r in (late + due_soon)[:3]], 'priority': 2})
    if who is not None:
        stale = (date.fromisoformat(today) - timedelta(days=21)).isoformat()
        if not last_one_on_one or last_one_on_one < stale:
            recs.append({'action': f"Schedule a 1-on-1 with {who}{f' (last one {last_one_on_one})' if last_one_on_one else ' (none saved this season)'}.", 'why': 'No recent individual meeting in the records.',
                         'source_ids': [], 'priority': 5, 'follow_up': {'kind': 'plan_one_on_one', 'player_id': player_ids[0]}})
    for r in undated[:2]:
        missing.append(f"\"{r['text']}\" ({r['who']}) has no due date. Set one so it can be tracked.")
    if late or due_soon:
        missing.append('No saved record says whether the open assignments were done. Check with the player before marking them.')
    if improve and not any(r['kind'] == 'praise' and r['date'] > improve[0]['date'] for r in records):
        missing.append("There is no later record showing whether the player improved on these points. Check at the next practice or film session.")
    if not records:
        missing.append('There are no approved records for this yet.')
    recs.sort(key=lambda r: r['priority'])
    seen, unique = set(), []
    for r in recs:
        k = norm(r['action'])
        if k not in seen:
            seen.add(k)
            unique.append(r)
    return unique[:5], facts[:5], list(dict.fromkeys(missing))[:4]


def cited_sources(records, ids):
    known = {r['source_id']: r for r in records}
    out = []
    for i in dict.fromkeys(ids):
        r = known.get(i)
        if r:
            out.append({'source_id': i, 'title': r['meeting_title'], 'date': r['date'], 'link': r['link'], 'text': f"{r['who']}: {r['text']}" if r['who'] else r['text']})
    return out


def check_live(payload, records):
    """Validate an Aivana recommendation answer: only known source ids; recommendations without a source are dropped."""
    known = {r['source_id'] for r in records}
    if not isinstance(payload, dict):
        raise ValueError('The answer was incomplete.')
    recs = []
    for r in payload.get('recommendations') or []:
        ids = [i for i in r.get('source_ids') or [] if i in known]
        if isinstance(r.get('action'), str) and r['action'].strip() and ids:
            recs.append({'action': r['action'].strip()[:400], 'why': str(r.get('why') or '')[:300], 'source_ids': ids})
    facts = []
    for f in payload.get('known_facts') or []:
        ids = [i for i in f.get('source_ids') or [] if i in known]
        if isinstance(f.get('text'), str) and ids:
            facts.append({'text': f['text'].strip()[:400], 'source_ids': ids})
    missing = [str(m)[:300] for m in payload.get('missing_information') or [] if isinstance(m, str)][:4]
    return recs[:5], facts[:5], missing
