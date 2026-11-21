"""Explicit coach-selected preparation targets and source conversations."""
from .core import DEMO, PLAYERS, valid_date
from .extraction import applies_to
from .extraction_schema import SENSITIVE_TOPICS

LIMIT = 10


def preparation_context(meetings, player_id, body=None):
    if player_id not in PLAYERS:
        raise KeyError(player_id)
    body = {} if body is None else body
    if not isinstance(body,dict):
        raise ValueError('Preparation choices must be an object.')
    purpose = body.get('purpose', 'meeting')
    if purpose not in ('meeting', 'game-plan', 'game-review', 'custom'):
        raise ValueError('Choose a preparation purpose.')
    goal = body.get('goal', '')
    if not isinstance(goal,str) or len(goal) > 800:
        raise ValueError('Preparation focus must contain at most 800 characters.')
    target_date = body.get('target_date')
    if target_date is not None and target_date != '':
        valid_date(target_date)
    available = {m['id']:m for m in meetings if m.get('approved') is True and player_id in m['attendees']}
    target_id = body.get('target_meeting_id')
    target = {'purpose':purpose,'focus':goal.strip(),'date':target_date or None,'title':'Custom preparation'}
    if target_id is not None and target_id != '':
        if not isinstance(target_id,str) or target_id not in available:
            raise ValueError('Choose a saved target meeting attended by this player.')
        meeting = available[target_id]
        target.update(meeting_id=target_id,title=meeting['title'],date=target_date or meeting['date'])
    ids = body.get('meeting_ids')
    if ids is not None:
        if not isinstance(ids,list) or not 1 <= len(ids) <= 100 or any(not isinstance(mid,str) or mid not in available for mid in ids) or len(ids) != len(set(ids)):
            raise ValueError('Choose one or more distinct source meetings attended by this player.')
    records, total, remaining = [], 0, LIMIT
    for meeting in sorted(available.values(),key=lambda m:(m['date'],m['id']),reverse=True):
        if ids is not None and meeting['id'] not in ids:
            continue
        items = [{key:x.get(key) for key in ('kind','text','skill','topic','due_date','completed')} for x in meeting['items']
                 if applies_to(x,player_id) and not x.get('sensitive') and x.get('topic') not in SENSITIVE_TOPICS]
        total += len(items)
        if items and remaining:
            records.append({'meeting_id':meeting['id'],'title':meeting['title'],'date':meeting['date'],'items':items[:remaining]})
            remaining -= len(items[:remaining])
    if not records:
        raise ValueError('The selected conversations have no approved, non-sensitive records for this player. Choose another source conversation.')
    return {'player':next(p for p in DEMO['players'] if p['id']==player_id),'target':target,'records':records,
            'context_window':f'At most {LIMIT} records from coach-selected conversations; partial history, not the full player history.',
            'record_count':LIMIT-remaining,'matched_count':total,'limited':total>LIMIT}


def demo_brief(context):
    target = context['target']
    heading = {'meeting':'Meeting preparation','game-plan':'Game-plan preparation','game-review':'Game-review preparation','custom':'Focused preparation'}[target['purpose']]
    lines = [f'## {heading}', '', 'Demo · Application-generated checklist, not Aivana output.', '', f"Selected target: {target['title']}" + (f" · {target['date']}" if target['date'] else '')]
    if target['focus']:
        lines.extend(['',f"Coach-selected focus: {target['focus']}"])
    lines.extend(['','### Selected records',''])
    for meeting in context['records']:
        for item in meeting['items']:
            status = f" ({'completed' if item.get('completed') else 'open'}" + (f"; due {item['due_date']}" if item.get('due_date') else '') + ')' if item['kind']=='action' else ''
            lines.append(f"- **{item['kind'].capitalize()}** · {meeting['date']}: {item['text']}{status}")
    lines.extend(['','### Suggested discussion','','Ask about the selected focus and updates on the documented actions.'])
    return '\n'.join(lines)
