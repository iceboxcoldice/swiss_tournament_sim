#!/usr/bin/env python3
"""
Test Tabroom Judge Conflict Checking & Auto-Assignment Mechanism in Python.
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

class TestTabroomJudgeConflicts(unittest.TestCase):
    def setUp(self):
        self.teams = [
            swiss_sim.Team(id=0, true_rank=1, name="Stanford A", institution="Stanford"),
            swiss_sim.Team(id=1, true_rank=2, name="Yale B", institution="Yale"),
            swiss_sim.Team(id=2, true_rank=3, name="Harvard C", institution="Harvard"),
            swiss_sim.Team(id=3, true_rank=4, name="Princeton D", institution="Princeton"),
        ]
        self.match1 = {
            "match_id": 1,
            "round_num": 1,
            "aff_id": 0,  # Stanford A
            "neg_id": 1,  # Yale B
            "judge_id": None
        }
        self.match2 = {
            "match_id": 2,
            "round_num": 1,
            "aff_id": 2,  # Harvard C
            "neg_id": 3,  # Princeton D
            "judge_id": None
        }

    def test_school_conflict(self):
        stanford_judge = {
            "id": 10,
            "name": "Judge Alice",
            "institution": "Stanford"
        }
        has_conflict, reason = tm.check_judge_conflict(stanford_judge, self.match1, self.teams)
        self.assertTrue(has_conflict)
        self.assertIn("School conflict", reason)
        self.assertIn("Stanford", reason)

        # But Stanford judge should NOT conflict with Match 2 (Harvard vs Princeton)
        has_conflict2, reason2 = tm.check_judge_conflict(stanford_judge, self.match2, self.teams)
        self.assertFalse(has_conflict2)
        self.assertIsNone(reason2)

    def test_tournament_hire_clean(self):
        hire_judge = {
            "id": 11,
            "name": "Judge Bob",
            "institution": "Tournament Hire"
        }
        has_conflict, reason = tm.check_judge_conflict(hire_judge, self.match1, self.teams)
        self.assertFalse(has_conflict)
        self.assertIsNone(reason)

    def test_explicit_judge_conflict(self):
        hire_judge_with_conflict = {
            "id": 12,
            "name": "Judge Charlie",
            "institution": "Tournament Hire",
            "conflicts": ["Yale", 2]  # Explicit conflict with Yale and Team 2 (Harvard C)
        }
        # Match 1 involves Yale B -> conflict!
        has_conflict1, reason1 = tm.check_judge_conflict(hire_judge_with_conflict, self.match1, self.teams)
        self.assertTrue(has_conflict1)
        self.assertIn("Yale", reason1)

        # Match 2 involves Team 2 (Harvard C) -> conflict!
        has_conflict2, reason2 = tm.check_judge_conflict(hire_judge_with_conflict, self.match2, self.teams)
        self.assertTrue(has_conflict2)
        self.assertIn("Aff team", reason2)

    def test_explicit_team_conflict(self):
        team0 = self.teams[0]  # Stanford A
        team0.conflicts = [15]  # Conflicts with Judge 15

        judge15 = {
            "id": 15,
            "name": "Judge Dave",
            "institution": "Tournament Hire"
        }
        has_conflict, reason = tm.check_judge_conflict(judge15, self.match1, self.teams)
        self.assertTrue(has_conflict)
        self.assertIn("designated a conflict", reason)

    def test_auto_assign_judges_avoids_conflicts(self):
        judges = [
            {"id": 101, "name": "Stanford Judge", "institution": "Stanford", "matches_judged": []},
            {"id": 102, "name": "Harvard Judge", "institution": "Harvard", "matches_judged": []},
            {"id": 103, "name": "Independent Judge", "institution": "Tournament Hire", "matches_judged": []}
        ]
        data = {
            "current_round": 1,
            "matches": [dict(self.match1), dict(self.match2)],
            "judges": judges
        }

        assignments = tm.auto_assign_judges(data, self.teams, round_num=1)
        self.assertEqual(len(assignments), 2)

        match1_assigned = next(m for m in data['matches'] if m['match_id'] == 1)
        match2_assigned = next(m for m in data['matches'] if m['match_id'] == 2)

        # Match 1 has Stanford Aff -> MUST NOT be assigned Judge 101 (Stanford Judge)
        self.assertNotEqual(match1_assigned['judge_id'], 101)
        # Match 2 has Harvard Aff -> MUST NOT be assigned Judge 102 (Harvard Judge)
        self.assertNotEqual(match2_assigned['judge_id'], 102)

        # Check each assignment is completely conflict-free
        for m in data['matches']:
            assigned_judge = next(j for j in judges if j['id'] == m['judge_id'])
            has_c, r = tm.check_judge_conflict(assigned_judge, m, self.teams)
            self.assertFalse(has_c, f"Unexpected conflict: {r}")

        print("✓ PASS: Auto-assign judges strictly avoided all school and institutional conflicts!")

if __name__ == '__main__':
    print("Testing Tabroom Judge Conflicts & Auto-Assignment in Python...")
    unittest.main()
