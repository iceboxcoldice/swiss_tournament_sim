#!/usr/bin/env python3
"""
Test Tabroom Multi-Judge Elimination Panels & RFD Ballot Feedback in Python.
"""
import sys
import os
import unittest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)
for p in [os.path.join(PROJECT_ROOT, 'backend'), os.path.join(PROJECT_ROOT, 'simulation')]:
    if p not in sys.path:
        sys.path.insert(0, p)

import swiss_sim
import tournament_manager as tm

class TestTabroomPanelAndRFD(unittest.TestCase):
    def setUp(self):
        self.teams = [
            swiss_sim.Team(id=0, true_rank=1, name="Stanford A", institution="Stanford"),
            swiss_sim.Team(id=1, true_rank=2, name="Yale B", institution="Yale")
        ]
        self.judges = [
            {"id": 1, "name": "Judge One", "institution": "Tournament Hire", "matches_judged": []},
            {"id": 2, "name": "Judge Two", "institution": "Tournament Hire", "matches_judged": []},
            {"id": 3, "name": "Judge Three", "institution": "Tournament Hire", "matches_judged": []}
        ]
        self.data = {
            "config": {
                "num_teams": 2,
                "num_prelim_rounds": 1,
                "num_elim_rounds": 1,
                "num_rounds": 2,
                "elim_panel_size": 3
            },
            "current_round": 2,  # Round 2 is Finals (Elimination)
            "matches": [
                {
                    "round_num": 2,
                    "match_id": 10,
                    "aff_id": 0,
                    "neg_id": 1,
                    "judge_id": None,
                    "result": None
                }
            ],
            "judges": self.judges
        }

    def test_auto_assign_elim_panel(self):
        assignments = tm.auto_assign_judges(self.data, self.teams, round_num=2)
        self.assertEqual(len(assignments), 1)

        match = self.data['matches'][0]
        self.assertIsNotNone(match.get('panel'))
        self.assertEqual(len(match['panel']), 3)
        self.assertEqual(match['panel'], [1, 2, 3])
        self.assertEqual(match['judge_id'], 1)  # Chair judge

        print("✓ PASS: Auto-assigned full 3-judge panel for elimination round!")

    def test_multi_judge_voting_majority_decision(self):
        match = self.data['matches'][0]
        match['panel'] = [1, 2, 3]
        match['judge_id'] = 1

        matches = self.data['matches']

        # Ballot 1: Judge 1 votes 'A' with RFD
        success1, _, _ = tm._process_match_result(
            round_id=2, match_id=10, aff_id=0, neg_id=1, outcome='A',
            matches=matches, force=True, judge_id=1,
            rfd="Aff won framework on utilitarianism",
            comments={"aff": "Great 1AR collapse", "neg": "Need more offense in 2NR"}
        )
        self.assertTrue(success1)
        # 1-0 vote: not majority yet for 3-judge panel
        self.assertIsNone(match['result'])
        self.assertEqual(len(match['ballots']), 1)

        # Ballot 2: Judge 2 votes 'N' with RFD
        success2, _, _ = tm._process_match_result(
            round_id=2, match_id=10, aff_id=0, neg_id=1, outcome='N',
            matches=matches, force=True, judge_id=2,
            rfd="Neg proved CP solves all case advantages"
        )
        self.assertTrue(success2)
        # 1-1 split: not majority yet
        self.assertIsNone(match['result'])
        self.assertEqual(len(match['ballots']), 2)

        # Ballot 3: Judge 3 votes 'A' with RFD
        success3, _, _ = tm._process_match_result(
            round_id=2, match_id=10, aff_id=0, neg_id=1, outcome='A',
            matches=matches, force=True, judge_id=3,
            rfd="Aff impact outweighs on timeframe"
        )
        self.assertTrue(success3)

        # Majority reached! 2 votes Aff, 1 vote Neg -> Aff wins 2-1
        self.assertEqual(match['result'], 'A')
        self.assertEqual(match['decision'], '2-1')
        self.assertEqual(len(match['ballots']), 3)

        # Check all RFDs are preserved
        self.assertEqual(match['ballots']['1']['rfd'], "Aff won framework on utilitarianism")
        self.assertEqual(match['ballots']['2']['rfd'], "Neg proved CP solves all case advantages")
        self.assertEqual(match['ballots']['3']['rfd'], "Aff impact outweighs on timeframe")

        print("✓ PASS: 3-judge panel correctly resolved to 2-1 split decision for Affirmative!")
        print("✓ PASS: Individual judge ballots and RFDs successfully preserved!")

if __name__ == '__main__':
    print("Testing Tabroom Multi-Judge Elim Panels & RFDs in Python...\n")
    unittest.main()
