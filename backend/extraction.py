"""Turn model records into reviewable drafts. No approved records are written here."""
import copy
import re
import uuid

from .dates import resolve_deadline
from .extraction_schema import CATEGORIES, SENSITIVE_TOPICS
from .vocabulary import clean_tags, is_sensitive

GROUP_ALIASES = {
    'QB': ('qb', 'qbs', 'quarterback', 'quarterbacks'),
    'RB': ('rb', 'rbs', 'running back', 'running backs'),
    'WR': ('wr', 'wrs', 'receiver', 'receivers', 'wide receiver', 'wide receivers'),
    'TE': ('te', 'tes', 'tight end', 'tight ends'),
    'OL': ('ol', 'offensive line', 'offensive linemen'),
    'DL': ('dl', 'defensive line', 'defensive linemen'),
    'LB': ('lb', 'lbs', 'linebacker', 'linebackers'),
    'DB': ('db', 'dbs', 'defensive back', 'defensive backs'),
    'ST': ('st', 'special teams', 'specialists'),
}


def normalized(value):
    return re.sub(r'\s+', ' ', value.casefold()).strip(' .,:;"\'')


def mention_present(mention, note):
    if not mention.strip():
        return False
    pattern = r'\s+'.join(re.escape(part) for part in mention.strip(' .,:;\"\'').split())
    return bool(pattern and re.search(r'(?<!\w)' + pattern + r'(?!\w)', note, re.IGNORECASE))


def match_player(mention, players):
    value = normalized(mention)
    candidates = []
    for player in players:
        method = None
        if value == normalized(player['name']):
            method = 'full_name'
        elif value in [normalized(part) for part in player['name'].split()]:
            method = 'first_or_last_name'
        elif player.get('nickname') and value == normalized(player['nickname']):
            method = 'nickname'
        elif re.fullmatch(r'(?:#|no\.?\s*)?\d{1,2}', value) and re.sub(r'\D', '', value) == str(player['number']):
            method = 'jersey_number'
        if method:
            candidates.append((player['id'], method))
    return candidates[0] if len(candidates) == 1 else (None, 'unmatched')


def source_quote(quote, note):
    if quote in note:
        return quote, True
    # Normalize presentation only, then return the original, verbatim excerpt.
    pattern = r'\s+'.join(re.escape(part) for part in quote.split())
    match = re.search(pattern, note, re.IGNORECASE) if pattern else None
    return (match.group(), True) if match else (quote, False)


def normalize_records(payload, meeting, players):
    if not isinstance(payload, dict) or not isinstance(payload.get('records'), list) or len(payload['records']) > 80:
        raise ValueError('Expected a records array with at most 80 records.')
    result, hard_errors = [], []
    global_warnings = [str(w)[:500] for w in payload.get('warnings', []) if isinstance(w, str)] if isinstance(payload.get('warnings', []), list) else []
    attendee_ids = [p['id'] for p in players]
    for index, raw in enumerate(payload['records']):
        prefix = f'Record {index + 1}'
        if not isinstance(raw, dict) or not isinstance(raw.get('target'), dict):
            hard_errors.append(f'{prefix}: invalid target; omitted. Add it manually if needed.')
            continue
        target = raw['target']
        quote = raw.get('source_text')
        if not isinstance(quote, str) or not quote.strip() or len(quote) > 2000:
            hard_errors.append(f'{prefix}: missing/oversized source quote; omitted. Add it manually if needed.')
            continue
        quote, source_valid = source_quote(quote, meeting['note'])
        warnings = []
        if not source_valid:
            warnings.append('Source quote was not found. Correct it before approval.')
            hard_errors.append(f'{prefix}: source not found.')
        # Open categories: any topic, skill or tag text is kept (tidied in code), never rejected.
        topic = raw.get('topic').strip()[:100] if isinstance(raw.get('topic'), str) and raw.get('topic').strip() else None
        skill = raw.get('skill').strip()[:100] if isinstance(raw.get('skill'), str) and raw.get('skill').strip() else None
        tags = clean_tags(raw.get('tags') if isinstance(raw.get('tags'), list) else [])
        details = raw.get('details').strip()[:1000] if isinstance(raw.get('details'), str) and raw.get('details').strip() else None
        confidence = raw.get('confidence')
        if confidence not in CATEGORIES['confidences']:
            confidence = 'low'; warnings.append('Missing confidence; review carefully.')
        mention = target.get('mention') if isinstance(target.get('mention'), str) else ''
        mention = mention[:160]
        scope, group_label = target.get('scope'), target.get('group_label')
        targets, group_id, method = [], None, 'unmatched'
        if scope == 'player':
            player_id, method = match_player(mention, players)
            claimed = target.get('player_id')
            if claimed is not None and (claimed not in attendee_ids or claimed != player_id):
                player_id, method = None, 'unmatched'
            collective = bool(re.search(r'\b(both|both of (?:you|them)|the two of (?:you|them)|everyone|everybody|all of (?:you|them)|each of (?:you|them)|both players|you two)\b', quote, re.I))
            if source_valid and player_id and collective and not mention_present(mention, quote) and mention_present(mention, meeting['note']):
                # "Both players should…": a shared instruction for named attendees. Kept, but flagged for the coach.
                warnings.append('Shared instruction for several players. Check that it applies to this player.')
            elif not source_valid or not mention_present(mention, quote) or not mention_present(mention, meeting['note']):
                player_id, method = None, 'unmatched'
            targets = [player_id]
        elif scope == 'group':
            group = str(group_label or '').upper()
            cleaned = re.sub(r'^(?:all|the)\s+', '', normalized(mention))
            collective_pair = normalized(mention) in ('both players', 'both attendees') and len(players) == 2 and all(p.get('position_group') == group for p in players)
            if (cleaned in GROUP_ALIASES.get(group, ()) or collective_pair) and mention_present(mention, quote):
                targets = [p['id'] for p in players if p.get('position_group') == group]
                method = 'position_group'
                group_label = group
            group_id = str(uuid.uuid4())
        elif scope == 'team':
            if meeting['meeting_type'] == 'team' and normalized(mention) in ('all attendees', 'all players', 'everyone', 'whole team', 'the team', 'team') and mention_present(mention, quote):
                targets, method = attendee_ids, 'team'
            group_id = str(uuid.uuid4())
        else:
            scope = 'player'
        if not targets or targets == [None]:
            targets = [None]
            warnings.append('Unmatched player/group. Choose the correct attendee or remove this record.')
            hard_errors.append(f'{prefix}: unmatched player/group.')
        confidence = 'low' if warnings else confidence
        common = dict(schema_version=2, topic=topic, skill=skill, tags=tags, details=details, confidence=confidence,
                      quote=quote, source_valid=source_valid, mention=mention, match_method=method,
                      scope=scope, group_label=group_label if scope == 'group' else None,
                      group_record_id=group_id, sensitive=topic in SENSITIVE_TOPICS or is_sensitive(topic, ' '.join(tags)))
        contents = []
        action = raw.get('action_item')
        if isinstance(action, dict) and isinstance(action.get('task'), str) and action['task'].strip():
            task = action['task'].strip()
            if len(task) > 1000:
                hard_errors.append(f'{prefix}: task too long; omitted.')
            else:
                due, warning = resolve_deadline(action.get('deadline_text'), action.get('deadline_date'), meeting['date'], quote)
                action_warnings = warnings + ([warning] if warning else [])
                contents.append(dict(kind='action', text=task, due_date=due,
                                     deadline_text=action.get('deadline_text') if isinstance(action.get('deadline_text'), str) else None,
                                     warnings=action_warnings, confidence='low' if warning else confidence))
        feedback, feedback_type = raw.get('feedback'), raw.get('feedback_type')
        kinds = {'Praise': 'praise', 'Improvement': 'improvement', 'Neutral/Observation': 'observation'}
        if isinstance(feedback, str) and feedback.strip():
            if not isinstance(feedback_type, str) or feedback_type not in kinds or len(feedback) > 1000:
                hard_errors.append(f'{prefix}: invalid feedback type/length; omitted.')
            else:
                contents.append(dict(kind=kinds[feedback_type], text=feedback.strip(), due_date=None,
                                     deadline_text=None, warnings=list(warnings)))
        if not contents:
            hard_errors.append(f'{prefix}: no valid feedback or action; omitted.')
        for content in contents:
            # Shared team feedback is stored once; explicit team actions fan out.
            shared = scope == 'team' and method == 'team' and content['kind'] != 'action'
            for player_id in [None] if shared else targets:
                item = {**copy.deepcopy(common), **copy.deepcopy(content), 'id': str(uuid.uuid4()),
                        'player_id': player_id, 'completed': False}
                if shared:
                    item['player_ids'] = list(attendee_ids)
                result.append(item)
                if len(result) > 80:
                    raise ValueError('Too many expanded records. Shorten the note before retrying.')
    return result, global_warnings, list(dict.fromkeys(hard_errors))


def enrich_demo(items, meeting, players):
    """Add review metadata to exact prepared fixtures, without pretending to parse custom notes."""
    result = []
    for raw in items:
        item = copy.deepcopy(raw)
        quote = item['quote']
        phrase = None
        match = re.search(r'\b(?:by|before|on) \d{4}-\d{2}-\d{2}\b|\btomorrow\b|\bsometime next week\b|\bduring the next practice\b', quote, re.I)
        if match:
            phrase = match.group()
        stated = item.get('due_date')
        due, warning = resolve_deadline(phrase, stated if stated and stated in quote else None, meeting['date'], quote)
        player = next(p for p in players if p['id'] == item['player_id'])
        mention = player['name'] if player['name'] in meeting['note'] else player['name'].split()[0]
        method = 'full_name' if mention == player['name'] else 'first_or_last_name'
        if 'All attendees:' in quote:
            mention, method = 'All attendees', 'team'
        topic = 'Football Skills' if item['skill'] != 'Not Applicable' else 'Team Communication'
        if 'warm-up checklist' in quote:
            topic = 'Training & Conditioning'
        item.update(schema_version=2, topic=topic, tags=clean_tags([item.get('skill')] if item.get('skill') not in (None, 'Not Applicable', 'Not Specified', 'Other') else []),
                    confidence='medium' if warning else 'high', mention=mention, match_method=method,
                    scope='player', sensitive=False, source_valid=True, warnings=[warning] if warning else [],
                    deadline_text=phrase if item['kind'] == 'action' else None,
                    due_date=due if item['kind'] == 'action' else None, id=str(uuid.uuid4()), completed=False)
        result.append(item)
    return result


def applies_to(item, player_id):
    return item.get('player_id') == player_id or player_id in item.get('player_ids', [])
