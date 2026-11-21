"""Bounded retrieval and citation validation for individual, group and team questions."""
import re
from datetime import date

from .core import PLAYERS, text, valid_date
from .extraction import applies_to
from .extraction_schema import CATEGORIES, SENSITIVE_TOPICS

LIMIT = 12
# Common coaching questions should not swamp the actual subject words.
STOP = set('a an the i we you he she they my our your his her their what which who when where how did do does have has had is are was were be been about for of to in on with and or me tell said say player players please prepare next meeting conversation summarize past feedback show need needs follow up outstanding tasks actions action items open overdue completed summarize summary before can should would could this these those'.split())


def selected_players(body):
    scope = body.get('scope', 'individual')
    if scope not in ('individual', 'group', 'team'):
        raise ValueError('Choose individual, group or team context.')
    if scope == 'team':
        return scope, list(PLAYERS)
    ids = [body.get('player_id')] if scope == 'individual' else body.get('player_ids')
    if not isinstance(ids, list) or not ids or any(not isinstance(pid, str) or pid not in PLAYERS for pid in ids):
        raise ValueError('Choose players from the roster.')
    if len(ids) != len(set(ids)) or scope == 'group' and not 2 <= len(ids) <= len(PLAYERS):
        raise ValueError('Choose at least two distinct players for a group.')
    return scope, ids


def select_context(meetings, body):
    scope, player_ids = selected_players(body)
    question = text(body.get('question'), 'Question', 800)
    if body.get('mode') not in ('demo', 'live'):
        raise ValueError('Choose demo or live mode.')
    filters = body.get('filters', {})
    if not isinstance(filters, dict):
        raise ValueError('Filters must be an object.')
    skill, topic = filters.get('skill'), filters.get('topic')
    category = filters.get('category', '')
    if not isinstance(category, str) or len(category) > 100:
        raise ValueError('Category must contain at most 100 characters.')
    if skill and skill not in CATEGORIES['skills']:
        raise ValueError('Choose a valid skill.')
    if topic and topic not in CATEGORIES['topics']:
        raise ValueError('Choose a valid topic.')
    meeting_type = filters.get('meeting_type', '')
    if meeting_type not in ('', 'individual', 'group', 'team'):
        raise ValueError('Choose a valid meeting type.')
    start, end = filters.get('start'), filters.get('end')
    for value in (start, end):
        if value:
            valid_date(value)
    if start and end and start > end:
        raise ValueError('Start date must be on or before end date.')
    status = filters.get('status', 'all')
    if status not in ('all', 'open', 'overdue', 'done'):
        raise ValueError('Choose a valid action status.')
    actions_only = filters.get('actions_only', False)
    if not isinstance(actions_only, bool):
        raise ValueError('Actions only must be a boolean.')
    search = filters.get('search', '')
    if not isinstance(search, str) or len(search) > 300:
        raise ValueError('Search must contain at most 300 characters.')
    tokens = set(re.findall(r'[a-z0-9]+', question.casefold())) - STOP
    # Names provide player context, rather than a subject to search for.
    from .core import DEMO
    people = [p for p in DEMO['players'] if p['id'] in player_ids]
    for person in people:
        tokens -= set(re.findall(r'[a-z0-9]+', person['name'].casefold()))
    tokens -= {'s', 'synthesize', 'brief', 'discussion', 'questions', 'team', 'group', 'selected', 'us'}
    today = date.today().isoformat()
    selected = []
    for meeting in meetings:
        if meeting.get('approved') is not True or start and meeting['date'] < start or end and meeting['date'] > end:
            continue
        if meeting_type and meeting.get('meeting_type') != meeting_type:
            continue
        for item in meeting['items']:
            applicable = [p for p in people if applies_to(item, p['id'])]
            if not applicable or item.get('sensitive') or item.get('topic') in SENSITIVE_TOPICS:
                continue
            if skill and item.get('skill') != skill or topic and item.get('topic') != topic:
                continue
            if category and category not in (item.get('skill'), item.get('topic')):
                continue
            if (actions_only or status != 'all') and item['kind'] != 'action':
                continue
            if status == 'open' and item['completed'] or status == 'done' and not item['completed']:
                continue
            if status == 'overdue' and (item['completed'] or not item.get('due_date') or item['due_date'] >= today):
                continue
            haystack = ' '.join(str(item.get(k) or '') for k in ('text', 'skill', 'topic', 'kind'))
            searchable = f"{haystack} {meeting['title']} {' '.join(str(p[k]) for p in applicable for k in ('name', 'number', 'position'))}".casefold()
            if search.strip().casefold() not in searchable:
                continue
            words = set(re.findall(r'[a-z0-9]+', haystack.casefold()))
            score = len(tokens & words)
            if tokens and not score:
                continue
            selected.append((score, meeting['date'], meeting['id'], item['id'], {
                'meeting_id': meeting['id'], 'record_id': item['id'], 'date': meeting['date'],
                'title': meeting['title'], 'meeting_type': meeting.get('meeting_type'),
                'player_ids': [p['id'] for p in applicable], 'player_names': [p['name'] for p in applicable], **{k: item.get(k) for k in ('kind', 'text', 'skill', 'topic', 'due_date', 'completed')},
            }))
    selected.sort(key=lambda x: x[:4], reverse=True)
    # Cover distinct players before filling remaining slots; never imply full coverage.
    chosen, covered = [], set()
    if scope != 'individual':
        for entry in selected:
            if set(entry[4]['player_ids']) - covered:
                chosen.append(entry)
                covered.update(entry[4]['player_ids'])
            if len(chosen) == LIMIT:
                break
    for entry in selected:
        if len(chosen) == LIMIT:
            break
        if entry not in chosen:
            chosen.append(entry)
    sources = [dict(source_id=f'S{i+1}', **entry[4]) for i, entry in enumerate(chosen)]
    return question, sources, len(selected), today


def checked_answer(payload, sources):
    """Only known source IDs may be attached to factual statements."""
    if not isinstance(payload, dict) or not isinstance(payload.get('statements'), list) or not isinstance(payload.get('suggestions'), list):
        raise ValueError('The assistant returned an invalid answer. Please retry.')
    if len(payload['statements']) > 8 or len(payload['suggestions']) > 3:
        raise ValueError('The assistant returned an oversized answer. Please retry.')
    known = {s['source_id'] for s in sources}
    statements = []
    for statement in payload['statements']:
        if not isinstance(statement, dict):
            raise ValueError('The assistant returned an invalid statement.')
        ids = statement.get('source_ids')
        if not isinstance(ids, list) or not 1 <= len(ids) <= LIMIT or any(not isinstance(s, str) or s not in known for s in ids):
            raise ValueError('The assistant returned an unsupported citation. Please retry.')
        statements.append({'text': text(statement.get('text'), 'Answer', 1000), 'source_ids': list(dict.fromkeys(ids))})
    return {'statements': statements, 'suggestions': [text(s, 'Suggested question', 300) for s in payload['suggestions']]}
