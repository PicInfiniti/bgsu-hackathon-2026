"""Scorer integrity tests: errors must not become impressive accuracy scores."""
import copy
import unittest
from unittest.mock import patch
from scripts.benchmark_extraction import assignment, expand, extract_case, score
from backend.aivana import AivanaError

NOTE = 'Avery: Review three coverage clips tomorrow. Jordan: Your coverage calls improved.'
MEETING = {'title':'Benchmark', 'date':'2026-11-20', 'meeting_type':'group',
           'attendees':['p01','p02'], 'note':NOTE}
REF = {'player_id':'p01','kind':'action','skill':'Coverage & Positioning',
       'text':'Review three coverage clips.', 'quote':'Review three coverage clips tomorrow.', 'due_date':'2026-11-21'}


class BenchmarkTests(unittest.TestCase):
    def test_perfect_and_failed_cases_keep_expected_denominator(self):
        c=score(MEETING,[REF],[REF])['counts']
        self.assertEqual((c['true_positive'],c['correct_action_date']),(1,1))
        failed=score(MEETING,[REF],[])['counts']
        self.assertEqual((failed['expected'],failed['true_positive'],failed['expected_actions']),(1,0,1))

    def test_wrong_player_kind_skill_and_date_are_separate(self):
        actual={**REF,'player_id':'p02','kind':'praise','skill':'Passing','due_date':None}
        c=score(MEETING,[REF],[actual])['counts']
        self.assertEqual(c['aligned'],1)
        for field in ['true_positive','correct_player','correct_kind','correct_skill','correct_action_date']:
            self.assertEqual(c[field],0,field)

    def test_duplicates_cannot_inflate_recall(self):
        result=score(MEETING,[REF],[REF,REF])
        self.assertEqual(result['counts']['true_positive'],1)
        self.assertEqual(len(result['extra_actual']),1)

    def test_invented_or_empty_quote_is_not_valid_evidence(self):
        for quote in ['', 'Review thirty invented clips tomorrow.']:
            with self.subTest(quote=quote):
                r=score(MEETING,[REF],[{**REF,'quote':quote}])
                self.assertEqual(r['counts']['invalid_quotes'],1)
                self.assertEqual(r['counts']['aligned'],0)

    def test_source_recovery_and_long_quote_alignment(self):
        actual={**REF,'quote':'AVERY: Review three coverage clips tomorrow.'}
        self.assertEqual(score(MEETING,[REF],[actual])['counts']['true_positive'],1)

    def test_shared_players_expand_without_mutating_and_align_by_identity(self):
        actual={**REF,'player_id':None,'player_ids':['p02','p01']}
        original=copy.deepcopy(actual)
        refs=[REF,{**REF,'player_id':'p02'}]
        result=score(MEETING,refs,[actual])
        self.assertEqual(result['counts']['true_positive'],2)
        self.assertEqual(actual,original)

    def test_global_matching_beats_greedy_and_allows_missing(self):
        self.assertEqual(set(assignment([[100,99],[98,0]])),{(0,1),(1,0)})
        self.assertEqual(assignment([[0],[0]]),[])
        self.assertEqual(assignment([[],[]]),[])
        self.assertEqual(assignment([]),[])

    def test_undated_action_requires_null_and_correct_identity(self):
        ref={**REF,'due_date':None}
        c=score(MEETING,[ref],[{**REF,'due_date':'2026-11-22'}])['counts']
        self.assertEqual((c['undated_total'],c['correct_undated']),(1,0))

    def test_no_records_case_counts_hallucinated_candidate_as_extra(self):
        r=score(MEETING,[],[REF])
        self.assertEqual(r['counts']['true_positive'],0)
        self.assertEqual(r['extra_actual'],[0])

    @patch('scripts.benchmark_extraction.aivana.extract',side_effect=AivanaError('incomplete extraction'))
    def test_provider_failure_is_not_retried_or_scored_as_success(self, call):
        result=extract_case(MEETING,[])
        self.assertEqual((result['status'],result['calls'],result['items']),('error',1,[]))
        self.assertEqual(call.call_count,1)

    @patch('scripts.benchmark_extraction.normalize_records',return_value=([REF],[],['unmatched player']))
    @patch('scripts.benchmark_extraction.aivana.extract',side_effect=[{'records':[]},AivanaError('correction failed')])
    def test_single_content_correction_preserves_first_drafts(self, call, normalize):
        result=extract_case(MEETING,[])
        self.assertEqual((result['status'],result['calls'],result['items']),('ok',2,[REF]))
        self.assertEqual(call.call_args.kwargs['errors'],['unmatched player'])
        self.assertTrue(result['validation_errors'])


if __name__=='__main__':
    unittest.main()
