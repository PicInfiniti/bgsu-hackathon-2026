"""Ask Aivana accuracy evaluation on synthetic records with known expected evidence.

Runs every case through the real FastAPI routes on a throwaway database (Demo mode:
the deterministic code path; no Aivana call, no tokens). Prints a table and writes
docs/assistant-accuracy.md.  Usage:  python scripts/eval_assistant.py [--write]
"""
import json
import os
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.core import DEMO, Store  # noqa: E402
from backend.extraction import normalize_records  # noqa: E402
from backend.film import FilmRoom  # noqa: E402
from backend.notebook import Notebook  # noqa: E402

TODAY = date.today()
D = lambda n: (TODAY + timedelta(days=n)).isoformat()  # noqa: E731
P = {p['name'].split()[0]: p['id'] for p in DEMO['players']}
NAMES = {p['id']: p['name'] for p in DEMO['players']}


def item(pid, kind, text, quote, due=None, done=False, tags=()):
    return {'player_id': pid, 'kind': kind, 'text': text, 'quote': quote, 'due_date': due, 'completed': done, 'schema_version': 2, 'scope': 'player',
            'topic': None, 'skill': None, 'tags': list(tags), 'confidence': 'high', 'mention': NAMES[pid], 'match_method': 'full_name', 'warnings': []}


def seed(store):
    """Synthetic approved meetings with known facts."""
    m1 = 'Taylor must complete route-running drills before Friday. Taylor showed better releases. Morgan needs to work on catching under pressure.'
    store.save({'title': 'WR room', 'date': D(-6), 'meeting_type': 'group', 'attendees': [P['Taylor'], P['Morgan']], 'note': m1, 'approved': True, 'origin': 'manual', 'items': [
        item(P['Taylor'], 'action', 'Complete route-running drills', 'Taylor must complete route-running drills before Friday.', D(-2), tags=['route running']),
        item(P['Taylor'], 'praise', 'Better releases', 'Taylor showed better releases.', tags=['route running']),
        item(P['Morgan'], 'improvement', 'Catching under pressure', 'Morgan needs to work on catching under pressure.', tags=['catching'])]})
    m2 = 'Casey was late to his coverage rotation again. Casey should review three Cover 3 clips by Monday. Casey communicated well pre-snap.'
    store.save({'title': 'DB 1-on-1', 'date': D(-3), 'meeting_type': 'individual', 'attendees': [P['Casey']], 'note': m2, 'approved': True, 'origin': 'manual', 'items': [
        item(P['Casey'], 'improvement', 'Late to coverage rotation', 'Casey was late to his coverage rotation again.', tags=['coverage']),
        item(P['Casey'], 'action', 'Review three Cover 3 clips', 'Casey should review three Cover 3 clips by Monday.', D(2), tags=['coverage', 'cover 3']),
        item(P['Casey'], 'praise', 'Good pre-snap communication', 'Casey communicated well pre-snap.')]})
    m3 = 'Casey still rotates late in Cover 3.'
    store.save({'title': 'DB film follow-up', 'date': D(-1), 'meeting_type': 'individual', 'attendees': [P['Casey']], 'note': m3, 'approved': True, 'origin': 'manual', 'items': [
        item(P['Casey'], 'improvement', 'Still rotates late in Cover 3', 'Casey still rotates late in Cover 3.', tags=['coverage'])]})
    m4 = 'Avery finished his footwork homework.'
    store.save({'title': 'QB check-in', 'date': D(-10), 'meeting_type': 'individual', 'attendees': [P['Avery']], 'note': m4, 'approved': True, 'origin': 'manual', 'items': [
        item(P['Avery'], 'action', 'Footwork homework', 'Avery finished his footwork homework.', D(-8), done=True, tags=['footwork'])]})
    qb = next(m for m in store.list() if m['title'] == 'QB check-in')
    store.complete(qb['id'], qb['items'][0]['id'], True)  # the coach marked it done


# (category, question, context player, checks)
CASES = [
    ('intent', 'What should I do next with Taylor Hayes?', None, {'intent': 'recommend'}),
    ('intent', 'What homework is overdue for Taylor Hayes?', None, {'intent': 'homework'}),
    ('intent', 'Summarize Casey Lane', None, {'intent': 'summary'}),
    ('intent', "What's on this week?", None, {'intent': 'list_events'}),
    ('intent', 'Add practice Tuesday 3:30', None, {'intent': 'add_event', 'confirm': True}),
    ('intent', 'What is the next step? Do you have any recommendations?', None, {'intent': 'recommend'}),
    ('player', 'What did I tell Morgan Reed about catching?', None, {'cites_player': 'Morgan'}),
    ('player', 'Summarize #3', None, {'context_player': 'Taylor'}),
    ('player', 'What should I discuss with Casey tomorrow?', None, {'context_player': 'Casey'}),
    ('player', 'What did I tell Quinn?', None, {'intent': 'clarify'}),
    ('player', 'How is Ellis doing?', None, {'intent': 'clarify'}),
    ('retrieval', 'Summarize Casey Lane', None, {'cites_text': ['Late to coverage rotation', 'Review three Cover 3 clips']}),
    ('retrieval', 'What did I tell Taylor Hayes?', None, {'cites_text': ['route-running drills']}),
    ('attribution', 'Summarize Morgan Reed', None, {'only_players': ['Morgan']}),
    ('attribution', 'Summarize Taylor Hayes', None, {'only_players': ['Taylor']}),
    ('citations', 'What should I do next with Casey Lane?', None, {'citations_valid': True}),
    ('citations', 'What should I do next with Taylor Hayes?', None, {'citations_valid': True}),
    ('grounding', 'What should I do next with Taylor Hayes?', None, {'no_claim': r'\b(completed|finished|did (?:it|them)|improved)\b', 'mentions': 'route-running'}),
    ('grounding', 'What should I do next with Casey Lane?', None, {'mentions': 'coverage', 'recurring': True}),
    ('grounding', 'What should I do next with Avery Brooks?', None, {'no_claim': r'\blate\b.*footwork|footwork.*\blate\b'}),
    ('dates', 'What homework is overdue for Taylor Hayes?', None, {'reply_has': '1 late'}),
    ('dates', 'What homework does Casey Lane have?', None, {'reply_has': '0 late, 1 open'}),
    ('dates', 'What homework does Avery Brooks have?', None, {'reply_has': '1 done'}),
    ('missing', 'What should I do next with Taylor Hayes?', None, {'missing': True}),
    ('missing', 'What should I do next with Skyler Vale?', None, {'reply_has': "don't have approved records"}),
    ('missing', 'Summarize Dakota Penn', None, {'reply_has': "couldn't find"}),
    ('missing', 'What did I say about the punt team flight plan?', None, {'reply_exact': "I couldn't find that in your notes."}),
    ('multiturn', 'What should I do next?', 'Casey', {'context_player': 'Casey', 'mentions': 'coverage'}),
    ('multiturn', 'What about his overdue homework?', 'Taylor', {'intent': 'homework', 'reply_has': 'Taylor Hayes'}),
    ('multiturn', 'Summarize his feedback', 'Morgan', {'context_player': 'Morgan', 'cites_text': ['Catching under pressure']}),
    ('multiturn', 'What should the whole team prioritize?', 'Casey', {'context_player': None}),
    ('multiturn', 'What about his homework?', None, {'intent': 'clarify'}),
    ('dedupe', 'What should I do next with Casey Lane?', None, {'no_duplicate_sources': True}),
    ('dedupe', 'Summarize Casey Lane', None, {'no_duplicate_sources': True}),
]


def check(case, out, records_text):
    cat, q, ctx, want = case
    fails = []
    recs = (out.get('sections') or {}).get('recommendations') or []
    facts = (out.get('sections') or {}).get('facts') or []
    cites = out.get('citations') or []
    blob = ' '.join([out.get('reply', '')] + [r['action'] for r in recs] + [f['text'] for f in facts] + [c.get('text', '') for c in cites])
    if 'intent' in want and out.get('intent') != want['intent']:
        fails.append(f"intent {out.get('intent')} != {want['intent']}")
    if want.get('confirm') and not out.get('confirm'):
        fails.append('no confirm card')
    if 'context_player' in want:
        expected = P[want['context_player']] if want['context_player'] else None
        if (out.get('context') or {}).get('player_id') != expected:
            fails.append(f"context {(out.get('context') or {}).get('player_id')} != {expected}")
    if want.get('cites_player') and NAMES[P[want['cites_player']]] not in blob:
        fails.append('player not cited')
    for t in want.get('cites_text', []):
        if t.lower() not in blob.lower():
            fails.append(f'missing evidence: {t}')
    if want.get('only_players'):
        allowed = {NAMES[P[n]] for n in want['only_players']}
        others = [n for n in NAMES.values() if n not in allowed and n in ' '.join(c.get('text', '') for c in cites)]
        if others:
            fails.append(f'wrong player attributed: {others}')
    if want.get('citations_valid'):
        used = {i for r in recs for i in r['source_ids']} | {i for f in facts for i in f['source_ids']}
        known = {c['source_id'] for c in cites}
        if not used or not used <= known or any(c.get('text', '').split(': ', 1)[-1] not in records_text for c in cites):
            fails.append('citation not backed by a saved record')
    claims = re.sub(r'no (?:saved )?record says (?:whether )?[^.]*', '', ' '.join(r['action'] for r in recs) + ' ' + ' '.join(f['text'] for f in facts), flags=re.I)
    if want.get('no_claim') and re.search(want['no_claim'], claims, re.I):
        fails.append('claims something no record says')
    if want.get('mentions') and want['mentions'].lower() not in blob.lower():
        fails.append(f"does not mention {want['mentions']}")
    if want.get('recurring') and not any('came up' in r['action'] for r in recs):
        fails.append('recurring pattern not summarized')
    if want.get('reply_has') and want['reply_has'].lower() not in out.get('reply', '').lower():
        fails.append(f"reply lacks '{want['reply_has']}'")
    if want.get('reply_exact') and out.get('reply') != want['reply_exact']:
        fails.append('wrong no-match reply')
    if want.get('missing') and not (out.get('sections') or {}).get('missing'):
        fails.append('missing information not stated')
    if want.get('no_duplicate_sources'):
        texts = [c.get('text', '').lower() for c in cites]
        if len(texts) != len(set(texts)):
            fails.append('duplicate sources')
    return fails


def extraction_cases():
    """Attribution with several players (offline: model output is given, code does the matching)."""
    players = [p for p in DEMO['players'] if p['id'] in (P['Jordan'], P['Morgan'])]
    note = 'Jordan needs to improve his route depth. Morgan should work on catching under pressure. Both players should review their routes before Friday.'
    meeting = {'title': 'Two players', 'date': TODAY.isoformat(), 'meeting_type': 'group', 'attendees': [p['id'] for p in players], 'note': note}

    def rec(pid, mention, quote, task=None, fb=None):
        return {'target': {'scope': 'player', 'player_id': pid, 'mention': mention, 'match_method': 'first_or_last_name', 'group_label': None}, 'topic': None, 'skill': None,
                'tags': [], 'details': None, 'feedback_type': 'Improvement' if fb else None, 'feedback': fb,
                'action_item': {'task': task, 'deadline_text': 'before Friday' if task else None, 'deadline_date': None}, 'source_text': quote, 'confidence': 'high'}
    payload = {'records': [rec(P['Jordan'], 'Jordan', 'Jordan needs to improve his route depth.', fb='Improve route depth'),
                           rec(P['Morgan'], 'Morgan', 'Morgan should work on catching under pressure.', fb='Catching under pressure'),
                           rec(P['Jordan'], 'Jordan', 'Both players should review their routes before Friday.', task='Review routes'),
                           rec(P['Morgan'], 'Morgan', 'Both players should review their routes before Friday.', task='Review routes'),
                           rec(P['Morgan'], 'Morgan', 'Jordan needs to improve his route depth.', fb='Wrong player')], 'warnings': []}
    items, _, errors = normalize_records(payload, meeting, players)
    results = []
    results.append(('attribution', 'Jordan feedback goes to Jordan', items[0]['player_id'] == P['Jordan']))
    results.append(('attribution', 'Morgan feedback goes to Morgan', items[1]['player_id'] == P['Morgan']))
    results.append(('attribution', '"Both players" homework kept for each named attendee (flagged)', items[2]['player_id'] == P['Jordan'] and items[3]['player_id'] == P['Morgan'] and any('Shared instruction' in w for w in items[2]['warnings'])))
    results.append(('attribution', 'Record quoting Jordan but labelled Morgan is not attributed', items[4]['player_id'] is None))
    results.append(('dates', '"before Friday" resolved in code', bool(items[2]['due_date']) and date.fromisoformat(items[2]['due_date']).weekday() == 4))
    return results


def run():
    with tempfile.TemporaryDirectory() as directory:
        path = os.path.join(directory, 'eval.sqlite3')
        store = Store(path)
        seed(store)
        notebook = Notebook(path)
        room = FilmRoom(path, os.path.join(directory, 'film'))
        from backend import film_routes, notebook_routes
        app = FastAPI()
        notebook_routes.register(app, store, notebook, film_room=room)
        film_routes.register(app, store, notebook, room)
        records_text = ' '.join(i['text'] + ' ' + i['quote'] for m in store.list() for i in m['items'])
        rows = []
        with TestClient(app) as client:
            for case in CASES:
                cat, q, ctx, _ = case
                body = {'message': q, 'mode': 'demo', 'page': 'home', 'context': {'player_id': P[ctx]} if ctx else {}}
                out = client.post('/api/assistant/message', json=body).json()
                fails = check(case, out, records_text)
                rows.append({'category': cat, 'question': q, 'context': ctx, 'passed': not fails, 'fails': fails, 'reply': out.get('reply', '')[:160]})
        for cat, label, ok in extraction_cases():
            rows.append({'category': cat, 'question': label, 'context': None, 'passed': ok, 'fails': [] if ok else ['extraction check failed'], 'reply': ''})
    return rows


def report(rows):
    cats = {}
    for r in rows:
        c = cats.setdefault(r['category'], [0, 0])
        c[0] += r['passed']
        c[1] += 1
    passed = sum(r['passed'] for r in rows)
    lines = ['# Ask Aivana accuracy report', '',
             f'Run on {TODAY.isoformat()} with `python scripts/eval_assistant.py --write`. Synthetic records with known expected evidence, '
             'run through the real API on a throwaway database in Demo mode (deterministic code path, no Aivana call). '
             'Live-mode answers use the same retrieval and the same citation checks, but their wording was not scored here.', '',
             f'**{passed} of {len(rows)} cases passed ({round(100 * passed / len(rows))}%).**', '',
             '| Category | Passed | Cases | Accuracy |', '|---|---|---|---|']
    names = {'intent': 'Intent recognition', 'player': 'Player identification', 'retrieval': 'Meeting / record retrieval', 'attribution': 'Correct attribution',
             'citations': 'Citation accuracy', 'grounding': 'Recommendation grounding', 'dates': 'Dates and deadlines', 'missing': 'Missing information',
             'multiturn': 'Multi-turn context', 'dedupe': 'No duplicate records'}
    for k, (ok, n) in cats.items():
        lines.append(f'| {names.get(k, k)} | {ok} | {n} | {round(100 * ok / n)}% |')
    failed = [r for r in rows if not r['passed']]
    lines += ['', '## Failures', ''] + ([f"- **{r['question']}** ({r['category']}): {'; '.join(r['fails'])}. Reply: \"{r['reply']}\"" for r in failed] or ['None in this run.'])
    lines += ['', '## Cases', '', '| Category | Question | Context | Result |', '|---|---|---|---|']
    lines += [f"| {r['category']} | {r['question']} | {r['context'] or ''} | {'pass' if r['passed'] else 'FAIL'} |" for r in rows]
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    rows = run()
    text = report(rows)
    print(text)
    if '--write' in sys.argv:
        (ROOT / 'docs' / 'assistant-accuracy-cases.md').write_text(text, encoding='utf-8')
