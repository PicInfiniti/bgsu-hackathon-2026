"""Known-answer development benchmark; --live consumes tokens, --replay makes no calls."""
import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import aivana
from backend.config import load_environment
from backend.extraction import normalize_records, source_quote


def tokens(value):
    return re.findall(r'\w+', value.casefold())


def evidence_overlap(left, right):
    """Conservative lexical alignment, not a judgment of semantic correctness."""
    a, b = tokens(left), tokens(right)
    if not a or not b:
        return 0
    # Match contiguous words, rather than rewarding repeated generic words.
    from difflib import SequenceMatcher
    common = SequenceMatcher(None, a, b, autojunk=False).find_longest_match().size
    return common / max(len(a), len(b)) if common >= min(3, len(a), len(b)) else 0


def assignment(weights):
    """Maximum-weight one-to-one alignment, with dummy columns for missing items."""
    n = len(weights)
    if not n:
        return []
    real = len(weights[0])
    costs = [[-w for w in row] + [0] * n for row in weights]
    m = real + n
    u, v, p, way = [0]*(n+1), [0]*(m+1), [0]*(m+1), [0]*(m+1)
    for i in range(1, n+1):
        p[0], j0 = i, 0
        minimum, used = [float('inf')]*(m+1), [False]*(m+1)
        while True:
            used[j0] = True
            i0, delta, j1 = p[j0], float('inf'), 0
            for j in range(1, m+1):
                if not used[j]:
                    cur = costs[i0-1][j-1] - u[i0] - v[j]
                    if cur < minimum[j]:
                        minimum[j], way[j] = cur, j0
                    if minimum[j] < delta:
                        delta, j1 = minimum[j], j
            for j in range(m+1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minimum[j] -= delta
            j0 = j1
            if not p[j0]:
                break
        while j0:
            j1 = way[j0]
            p[j0], j0 = p[j1], j1
    return [(p[j]-1, j-1) for j in range(1, real+1)
            if p[j] and weights[p[j]-1][j-1] > 0]


def expand(items):
    rows = []
    for item in items:
        # Shared team feedback is stored once but scored per applicable player.
        for player in item.get('player_ids') or [item.get('player_id')]:
            rows.append({**item, 'player_id': player})
    return rows


def score(meeting, expected, actual):
    actual = expand(actual)
    valid = [bool(i.get('quote')) and source_quote(i['quote'], meeting['note'])[1] for i in actual]
    weights = []
    for ref in expected:
        row = []
        for j, item in enumerate(actual):
            overlap = evidence_overlap(ref['quote'], item.get('quote', ''))
            row.append(10000 + 100*(ref['player_id'] == item.get('player_id'))
                       + 20*(ref['kind'] == item.get('kind')) + overlap
                       if valid[j] and overlap >= .6 else 0)
        weights.append(row)
    pairs = assignment(weights)
    matched_expected, matched_actual = {i for i, _ in pairs}, {j for _, j in pairs}
    counts = dict(expected=len(expected), actual=len(actual), aligned=len(pairs),
                  correct_player=0, correct_kind=0, correct_skill=0,
                  action_date_total=0, correct_action_date=0,
                  dated_total=0, correct_dated=0, undated_total=0, correct_undated=0,
                  true_positive=0, action_true_positive=0,
                  expected_actions=sum(i['kind']=='action' for i in expected),
                  actual_actions=sum(i.get('kind')=='action' for i in actual),
                  invalid_quotes=sum(not x for x in valid))
    details = []
    for i, j in sorted(pairs):
        ref, item = expected[i], actual[j]
        checks = {f: ref.get(f) == item.get(f) for f in ('player_id','kind','skill')}
        for field, metric in [('player_id','correct_player'),('kind','correct_kind'),('skill','correct_skill')]:
            counts[metric] += checks[field]
        identity = checks['player_id'] and checks['kind']
        counts['true_positive'] += identity
        counts['action_true_positive'] += identity and ref['kind']=='action'
        if ref['kind']=='action':
            checks['due_date'] = ref.get('due_date') == item.get('due_date') and identity
            counts['action_date_total'] += 1
            counts['correct_action_date'] += checks['due_date']
            bucket = 'dated' if ref.get('due_date') else 'undated'
            counts[bucket+'_total'] += 1
            counts['correct_'+bucket] += checks['due_date']
        details.append({'expected_index':i, 'actual_index':j, 'checks':checks})
    return {'counts':counts, 'alignment':details, 'actual':actual,
            'missing_expected':[i for i in range(len(expected)) if i not in matched_expected],
            'extra_actual':[j for j in range(len(actual)) if j not in matched_actual]}


def extract_case(meeting, roster):
    players = [p for p in roster if p['id'] in meeting['attendees']]
    errors, calls, raw, items, warnings = None, 0, [], [], []
    for attempt in range(2):
        calls += 1
        try:
            payload = aivana.extract(meeting, players, errors=errors)
        except aivana.AivanaError as error:
            if not attempt:
                return {'status':'error', 'error':str(error), 'http_status':error.status,
                        'calls':calls, 'items':[], 'raw':raw, 'warnings':[]}
            warnings.append('Correction failed; first drafts retained: '+str(error))
            break
        raw.append(payload)
        try:
            items, warnings, errors = normalize_records(payload, meeting, players)
        except ValueError as error:
            return {'status':'error','error':str(error),'calls':calls,'items':[],'raw':raw,'warnings':[]}
        if not errors:
            break
    return {'status':'ok', 'calls':calls, 'items':items, 'raw':raw,
            'warnings':warnings, 'validation_errors':errors or []}


def fraction(numerator, denominator):
    return f'{numerator}/{denominator} ({numerator/denominator:.1%})' if denominator else 'n/a (0 denominator)'


def report_markdown(report):
    totals = report['totals']
    lines = ['# Football extraction development benchmark', '',
             'Run: '+report['started_at']+'. No approved notebook records were written.', '',
             '**Scope:** one Live pass over team-authored, previously used development examples. '
             'Not an independent or held-out accuracy evaluation. Evidence alignment is a lexical proxy; '
             'faithful paraphrases and extra observations require human review. Exact skill disagreement may be reasonable.', '',
             f"Cases: {len(report['cases'])}; successful: {report['successful']}; failed: {report['failed']}; skipped: {report['skipped']}; provider requests: {report['calls']}.", '',
             '| Measurement | Result |', '|---|---|']
    metrics = [('Evidence + player + kind precision','true_positive','actual'),
               ('Evidence + player + kind recall (includes failed/skipped cases)','true_positive','expected'),
               ('Action precision','action_true_positive','actual_actions'),
               ('Action recall (includes failed/skipped cases)','action_true_positive','expected_actions'),
               ('Player attribution on evidence-aligned pairs','correct_player','aligned'),
               ('Record kind on evidence-aligned pairs','correct_kind','aligned'),
               ('Exact skill on evidence-aligned pairs','correct_skill','aligned'),
               ('Action deadline on aligned expected actions (also requires correct player/kind)','correct_action_date','action_date_total'),
               ('Explicit/resolved date on aligned expected actions','correct_dated','dated_total'),
               ('Missing/ambiguous deadline stays null on aligned expected actions','correct_undated','undated_total')]
    for label, num, den in metrics:
        lines.append(f'| {label} | {fraction(totals[num],totals[den])} |')
    lines += ['', f"Invalid source quotes: {totals['invalid_quotes']}. Unaligned extra candidate records: {report['extras']}; missing reference records: {report['missing']}. Extras are **not automatically invented records**.", '',
              '| Case | Status | References / candidates | Correct identity | Missing / extra | Calls |', '|---|---|---:|---:|---:|---:|']
    for case in report['cases']:
        c = case['score']['counts']
        lines.append(f"| {case['id']} | {case['status']} | {c['expected']} / {c['actual']} | {c['true_positive']} | {len(case['score']['missing_expected'])} / {len(case['score']['extra_actual'])} | {case['calls']} |")
    lines += ['', '## Review queue', '', 'Indices are zero-based; inspect the paired JSON report for source text, actual wording, raw provider output and field checks. Text meaning and topic correctness are not automatically scored. No single overall accuracy percentage is claimed.', '']
    for case in report['cases']:
        sc = case['score']
        mismatches = [p for p in sc['alignment'] if not all(p['checks'].values())]
        if case['status']!='ok' or mismatches or sc['missing_expected'] or sc['extra_actual'] or case.get('validation_errors'):
            lines += [f"### {case['id']}", '',
                      f"Status: {case['status']}. Missing expected indices: {sc['missing_expected']}; extra actual indices: {sc['extra_actual']}.",
                      'Field mismatches: '+json.dumps(mismatches),
                      'Errors/warnings: '+json.dumps([case.get('error'),case.get('validation_errors',[]),case.get('warnings',[])]), '']
    lines += ['## Reproducibility', '', 'Dataset, adapter, normalizer, schema and scorer SHA-256 hashes plus the source commit are recorded in JSON. The provider model version is not exposed by this adapter. Results are stochastic and this is one run. Labels are never passed to Aivana. Failed cases have zero candidates and remain in recall denominators. API calls are sequential with at most one production-style content correction per case; no automatic HTTP retries. Authentication, balance or rate-limit errors skip remaining calls.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--live', action='store_true')
    mode.add_argument('--replay', type=Path, help='Rescore a saved JSON run offline.')
    parser.add_argument('--cases', help='Comma-separated case IDs; default all 19.')
    parser.add_argument('--output', type=Path, required=True, help='New JSON result path; Markdown sibling is also written.')
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix('.md').exists():
        parser.error('Choose a new output path; existing results are never overwritten.')
    meetings = json.loads((ROOT/'data/synthetic/meetings.json').read_text())
    expected = json.loads((ROOT/'data/synthetic/expected.json').read_text())
    roster = json.loads((ROOT/'data/synthetic/roster.json').read_text())
    selected = args.cases.split(',') if args.cases else [m['id'] for m in meetings]
    if len(set(selected))!=len(selected) or set(selected)-{m['id'] for m in meetings}:
        parser.error('Cases must be distinct known IDs.')
    import subprocess
    report = {'started_at':datetime.now(timezone.utc).isoformat(), 'benchmark_version':1, 'complete':False,
              'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
              'hashes':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in
                        ['data/synthetic/meetings.json','data/synthetic/expected.json','data/synthetic/roster.json',
                         'backend/aivana.py','backend/extraction.py','backend/extraction_schema.py','data/categories.json','scripts/benchmark_extraction.py']},
              'cases':[], 'calls':0, 'successful':0, 'failed':0, 'skipped':0, 'extras':0, 'missing':0, 'totals':{}}
    if args.replay:
        previous = json.loads(args.replay.read_text())
        if previous['hashes']['data/synthetic/expected.json']!=report['hashes']['data/synthetic/expected.json'] or previous['hashes']['data/synthetic/meetings.json']!=report['hashes']['data/synthetic/meetings.json']:
            parser.error('Replay dataset/labels differ from the saved run.')
        saved = {c['id']:c for c in previous['cases']}
        if not args.cases:
            selected = list(saved)
        if set(selected)-saved.keys():
            parser.error('Replay lacks a requested case.')
        report['replay_of'] = str(args.replay)
        report['original_started_at'] = previous['started_at']
    else:
        load_environment()
        import os
        if not os.environ.get('AIVANA_API_KEY'):
            parser.error('Configure the backend key privately before --live.')
    blocked = False
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for meeting in meetings:
        if meeting['id'] not in selected:
            continue
        start = time.monotonic()
        if args.replay:
            result = {k:v for k,v in saved[meeting['id']].items() if k not in ('score','expected','meeting','id')}
            result['calls'] = 0
        elif blocked:
            result = {'status':'skipped','error':'Earlier authentication/workspace/balance/rate-limit error.', 'calls':0,'items':[]}
        else:
            result = extract_case(meeting,roster)
        blocked |= result.get('http_status') in (401,402,403,429,503)
        case = {**result, 'id':meeting['id'], 'meeting':meeting, 'expected':expected[meeting['id']]['items'],
                'score':score(meeting,expected[meeting['id']]['items'],result['items']), 'elapsed_seconds':round(time.monotonic()-start,3)}
        report['cases'].append(case)
        report['calls'] += case['calls']
        report[{'ok':'successful','error':'failed','skipped':'skipped'}[case['status']]] += 1
        report['extras'] += len(case['score']['extra_actual'])
        report['missing'] += len(case['score']['missing_expected'])
        for key,value in case['score']['counts'].items():
            report['totals'][key] = report['totals'].get(key,0)+value
        args.output.write_text(json.dumps(report,indent=2)+'\n')
        args.output.with_suffix('.md').write_text(report_markdown(report))
        print(f"{case['id']}: {case['status']} ({case['calls']} calls)",flush=True)
    report['complete'] = True
    args.output.write_text(json.dumps(report,indent=2)+'\n')
    args.output.with_suffix('.md').write_text(report_markdown(report))
    print(f'Results: {args.output} and {args.output.with_suffix(".md")}',flush=True)
    return 1 if report['failed'] or report['skipped'] else 0


if __name__=='__main__':
    raise SystemExit(main())
