"""Derived shared-card metadata. Approved per-player records remain independent."""
import hashlib
import json

GROUP_NAMES = {'QB':'Quarterbacks', 'RB':'Running backs', 'WR':'Receivers', 'TE':'Tight ends',
               'OL':'Offensive line', 'DL':'Defensive line', 'LB':'Linebackers', 'DB':'Defensive backs', 'ST':'Special teams'}
FIELDS = ('kind', 'text', 'skill', 'topic', 'quote', 'due_date', 'deadline_text', 'sensitive')


def annotate_shared_records(items, meeting, players):
    """Group only identical content AND exact evidence within the same meeting.

    No text/name guessing, merging across meetings, or completion-status changes.
    Existing saved records receive this projection when read; no migration writes.
    """
    result = [{k:v for k,v in item.items() if k != 'display_group'} for item in items]
    if meeting['meeting_type'] == 'individual':
        return result
    buckets = {}
    for item in result:
        if item.get('player_id') not in meeting['attendees'] or not item.get('quote') or item['quote'] not in meeting['note']:
            continue
        signature = json.dumps([item.get(k) for k in FIELDS], sort_keys=True, ensure_ascii=False)
        buckets.setdefault(signature, []).append(item)
    roster = {p['id']:p for p in players}
    for signature, members in buckets.items():
        ids = [i['player_id'] for i in members]
        if len(ids) < 2 or len(set(ids)) != len(ids):
            continue
        positions = {roster.get(pid,{}).get('position_group') for pid in ids}
        label = 'Full team' if meeting['meeting_type'] == 'team' and set(ids) == set(meeting['attendees']) else GROUP_NAMES.get(next(iter(positions)), 'Shared group') if len(positions) == 1 else 'Shared group'
        group = {'id': hashlib.sha256(signature.encode()).hexdigest()[:24], 'label':label,
                 'player_ids':ids, 'member_ids':[i['id'] for i in members]}
        for item in members:
            item['display_group'] = group
    return result
