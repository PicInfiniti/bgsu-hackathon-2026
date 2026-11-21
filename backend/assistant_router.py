"""Routes Ask Aivana questions that need player context, summaries, homework or
recommendations. Everything factual comes from approved records via assistant_brain."""
from datetime import date, timedelta

from . import coach_logic as logic
from .assistant_brain import (GENERIC, HOMEWORK, RECOMMEND, SUMMARY, TEAM_WORDS, check_live, cited_sources, code_recommendations,
                              gather, norm, resolve_players, skill_of, status_of)

ACTION_INTENTS = ('add_event', 'mark_done', 'export', 'find_homework', 'fix_spelling', 'film_cutup', 'film_unassigned', 'list_events', 'today', 'no_one_on_one')
LABEL = {'improvement': 'to improve', 'praise': 'praise', 'action': 'homework', 'observation': 'observation', 'skill_check': 'skill check'}


class Brain:
    def __init__(self, store, notebook, film_room, players):
        self.store, self.notebook, self.film, self.players = store, notebook, film_room, players
        self.names = {p['id']: p['name'] for p in players}

    def vocabulary(self, meetings):
        words = set()
        for m in meetings:
            for i in m['items']:
                for w in [i.get('skill'), *(i.get('tags') or [])]:
                    if w and w.lower() not in GENERIC:
                        words.add(norm(w))
        for n in (self.film.film_notes() if self.film else []):
            words.update(norm(t) for t in n['tags'])
        return words

    def context_after(self, message, ctx_in, player_ids=None, skill=None):
        if player_ids is None:
            named = logic.players_in_text(message, self.players)
            if named:
                player_ids = [p['id'] for p in named]
            elif TEAM_WORDS.search(message):
                player_ids = []
            else:
                player_ids = [ctx_in['player_id']] if ctx_in.get('player_id') else []
        pid = player_ids[0] if len(player_ids) == 1 else None
        keep_skill = ctx_in.get('skill') if pid and pid == ctx_in.get('player_id') else None
        return {'player_id': pid, 'player_name': self.names.get(pid), 'skill': skill if skill is not None else keep_skill, 'film_id': ctx_in.get('film_id')}

    def handle(self, intent, message, ctx_in, mode, history, today, now):
        wants_rec = bool(RECOMMEND.search(message))
        named = logic.players_in_text(message, self.players)
        wants_summary = bool(SUMMARY.search(message)) and (intent != 'summarize_note' or bool(named))
        wants_homework = intent == 'late' or (bool(HOMEWORK.search(message)) and intent == 'question')
        if intent in ACTION_INTENTS and not wants_rec:
            return None
        if not (wants_rec or wants_summary or wants_homework):
            if intent in ('question', 'before_game'):
                player_ids, clarify, how = resolve_players(message, ctx_in, self.players)
                if clarify and how in ('ambiguous', 'unknown'):
                    return {'intent': 'clarify', 'reply': clarify, 'context': ctx_in, 'origin': 'code'}
            return None
        if intent == 'late' and not (named or ctx_in.get('player_id')) and not wants_rec:
            return None  # team-wide late list stays on the existing code path
        player_ids, clarify, how = resolve_players(message, ctx_in, self.players)
        if clarify:
            return {'intent': 'clarify', 'reply': clarify, 'context': ctx_in, 'origin': 'code'}
        meetings = self.store.list()
        skill = skill_of(message, ctx_in if how == 'context' else {}, self.vocabulary(meetings))
        notes = self.film.film_notes() if self.film else []
        checks = []
        if self.film:
            for pid in player_ids:
                checks += self.film.skill_checks(pid)['checks']
        records = gather(meetings, notes, checks, self.players, player_ids, today, skill)
        if skill and not records:
            records = gather(meetings, notes, checks, self.players, player_ids, today, None)
            skill = None
        ctx_out = self.context_after(message, ctx_in, player_ids, skill)
        who = ', '.join(self.names[p] for p in player_ids) if player_ids else 'the team'
        focus = f"{who}{f' · {skill}' if skill else ''}"
        base = {'context': ctx_out, 'origin': 'code'}

        if wants_homework and not wants_rec:
            rows = [r for r in records if r['kind'] == 'action']
            late = [r for r in rows if status_of(r, today) == 'late']
            opened = [r for r in rows if status_of(r, today) == 'open']
            done = [r for r in rows if status_of(r, today) == 'done']
            if not rows:
                return {**base, 'intent': 'homework', 'reply': f"No homework saved for {who}.", 'sections': {'facts': [], 'recommendations': [], 'missing': []}}
            facts = [{'text': f"Late: {r['who']}: \"{r['text']}\" (due {r['due_date']})", 'source_ids': [r['source_id']]} for r in late]
            facts += [{'text': f"Open: {r['who']}: \"{r['text']}\"" + (f" (due {r['due_date']})" if r['due_date'] else ' (no due date)'), 'source_ids': [r['source_id']]} for r in opened]
            ids = [f['source_ids'][0] for f in facts][:8]
            return {**base, 'intent': 'homework', 'reply': f"{who}: {len(late)} late, {len(opened)} open, {len(done)} done.",
                    'sections': {'facts': facts[:8], 'recommendations': [], 'missing': ['Whether a late assignment was really done is only known once you mark it in Homework.'] if late else []},
                    'citations': cited_sources(records, ids)}

        if wants_summary and not wants_rec:
            if not records:
                return {**base, 'intent': 'summary', 'reply': f"I couldn't find approved notes about {focus}.",
                        'sections': {'facts': [], 'recommendations': [], 'missing': ['There are no approved records for this yet.']}}
            kinds = {}
            for r in records:
                kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
            counts = ', '.join(f"{n} {LABEL.get(k, k)}" for k, n in kinds.items())
            facts = [{'text': f"{r['date']} · {LABEL.get(r['kind'], r['kind'])}: {r['text']}", 'source_ids': [r['source_id']]} for r in records[:8]]
            reply = f"{focus}: {len(records)} approved note{'s' if len(records) != 1 else ''} ({counts})."
            if mode == 'live':
                from . import aivana_notes
                try:
                    slim = [{'source_id': r['source_id'], 'date': r['date'], 'kind': r['kind'], 'text': r['text'], 'who': r['who']} for r in records[:12]]
                    out = aivana_notes.answer_question(message, slim, history, today)
                    if [i for i in out.get('source_ids') or [] if i in {r['source_id'] for r in records}] and out.get('answer'):
                        reply, base = out['answer'], {**base, 'origin': 'aivana'}
                except Exception:  # noqa: BLE001 - keep the code summary
                    pass
            return {**base, 'intent': 'summary', 'reply': reply, 'sections': {'facts': facts, 'recommendations': [], 'missing': []},
                    'citations': cited_sources(records, [f['source_ids'][0] for f in facts])}

        # Recommendations: grounded in records, statuses computed in code.
        game = None
        if self.film:
            from .film import next_game
            from .notebook import expand_events
            occ = expand_events(self.notebook.list_events(), today, (date.fromisoformat(today) + timedelta(days=60)).isoformat())
            game = next_game(occ, now, logic.homework(meetings, self.players), [], player_ids[0] if len(player_ids) == 1 else None)
        last = logic.last_one_on_one(meetings, player_ids[0]) if len(player_ids) == 1 else None
        recs, facts, missing = code_recommendations(records, self.players, player_ids, today, game, last)
        origin, answer = 'code', ''
        if mode == 'live' and records:
            from . import aivana_notes
            try:
                live = aivana_notes.recommend(message, focus, records, recs, history, today)
                lrecs, lfacts, lmissing = check_live(live, records)
                if lrecs:
                    recs, facts, missing, origin = lrecs, lfacts or facts, lmissing or missing, 'aivana'
                    answer = str(live.get('answer') or '').strip()
            except Exception:  # noqa: BLE001 - keep the grounded code recommendations
                origin = 'code'
        if origin == 'aivana' and answer:
            text = answer
        elif records:
            text = f"Recommended next steps for {focus}, based on {len(records)} approved record{'s' if len(records) != 1 else ''}."
        else:
            text = f"I don't have approved records for {focus} yet, so I can't recommend specific next steps."
        ids = [i for r in recs for i in r['source_ids']] + [i for f in facts for i in f['source_ids']]
        buttons = [{'label': f"Plan a 1-on-1 with {self.names[r['follow_up']['player_id']].split()[0]}", 'action': 'plan_one_on_one', 'player_id': r['follow_up']['player_id']}
                   for r in recs if r.get('follow_up')]
        return {**base, 'origin': origin, 'intent': 'recommend', 'reply': text,
                'sections': {'recommendations': [{k: r.get(k) for k in ('action', 'why', 'source_ids')} for r in recs], 'facts': facts, 'missing': missing},
                'citations': cited_sources(records, ids), 'buttons': buttons}
