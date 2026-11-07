#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))
from swiss_sim import Team, pair_round

def test_high_low_pairing():
    print("Testing Tabroom High-Low pairing in Python...")

    # 4 teams in 2-0 bracket: IDs 1, 2, 3, 4
    # 4 teams in 0-2 bracket: IDs 5, 6, 7, 8
    t1 = Team(id=1, true_rank=1, score=2.0, wins=2, name="Seed 1")
    t2 = Team(id=2, true_rank=2, score=2.0, wins=2, name="Seed 2")
    t3 = Team(id=3, true_rank=3, score=2.0, wins=2, name="Seed 3")
    t4 = Team(id=4, true_rank=4, score=2.0, wins=2, name="Seed 4")

    t5 = Team(id=5, true_rank=5, score=1.0, wins=1, name="Seed 5")
    t6 = Team(id=6, true_rank=6, score=1.0, wins=1, name="Seed 6")
    t7 = Team(id=7, true_rank=7, score=0.0, wins=0, name="Seed 7")
    t8 = Team(id=8, true_rank=8, score=0.0, wins=0, name="Seed 8")

    # In Round 1 & 2:
    # t1 played t5 and t6 -> opp scores: 1.0 + 1.0 = 2.0 (highest Buchholz)
    # t2 played t5 and t7 -> opp scores: 1.0 + 0.0 = 1.0
    # t3 played t6 and t8 -> opp scores: 1.0 + 0.0 = 1.0
    # t4 played t7 and t8 -> opp scores: 0.0 + 0.0 = 0.0 (lowest Buchholz)
    t1.opponent_history = [5, 6]
    t2.opponent_history = [5, 7]
    t3.opponent_history = [6, 8]
    t4.opponent_history = [7, 8]

    t5.opponent_history = [1, 2]
    t6.opponent_history = [1, 3]
    t7.opponent_history = [2, 4]
    t8.opponent_history = [3, 4]

    teams = [t1, t2, t3, t4, t5, t6, t7, t8]

    # Test Round 3 pairing (round_num=2) with High-Low
    pairs = pair_round(teams, round_num=2, use_buchholz=True, pairing_scheme='high-low')

    print("\nGenerated Pairings (Round 3 High-Low):")
    top_matches = []
    for aff, neg in pairs:
        print(f"  {aff.name} (ID {aff.id}) vs {neg.name} (ID {neg.id})")
        if aff.score == 2.0 and neg.score == 2.0:
            top_matches.append({aff.id, neg.id})

    # Rank 1 (ID 1) must play lowest in bracket Rank 4 (ID 4)
    # Rank 2 (ID 2) must play Rank 3 (ID 3)
    assert {1, 4} in top_matches, f"Expected {1, 4} in top matches, got {top_matches}"
    assert {2, 3} in top_matches, f"Expected {2, 3} in top matches, got {top_matches}"
    print("✓ PASS: High-Low paired 1v4 and 2v3!")

    # Test High-High
    pairs_hihi = pair_round(teams, round_num=2, use_buchholz=True, pairing_scheme='high-high')
    top_matches_hihi = []
    for aff, neg in pairs_hihi:
        if aff.score == 2.0 and neg.score == 2.0:
            top_matches_hihi.append({aff.id, neg.id})

    assert {1, 2} in top_matches_hihi or {1, 3} in top_matches_hihi
    assert {1, 4} not in top_matches_hihi
    print("✓ PASS: High-High avoided 1v4!")

    # Test Same-School Protection
    print("\nTesting Same-School Protection...")
    t1.institution = "Harvard"
    t4.institution = "Harvard"
    t2.institution = "Yale"
    t3.institution = "Princeton"

    pairs_school = pair_round(teams, round_num=2, use_buchholz=True, pairing_scheme='high-low')
    school_matches = []
    for aff, neg in pairs_school:
        if aff.score == 2.0 and neg.score == 2.0:
            school_matches.append({aff.id, neg.id})

    assert {1, 4} not in school_matches, f"Harvard teams should not play each other! Got {school_matches}"
    print("✓ PASS: Same-school conflict successfully avoided in Python!")

    # Test Round-Specific Mode Selection via pair_round_logic
    from tournament_manager import pair_round_logic
    data_mock = {
        'config': {'num_rounds': 4, 'num_elim_rounds': 0, 'pairing_scheme': 'high-low'},
        'rounds': [{'round_num': 1}, {'round_num': 2}],
        'matches': [
            {'round_num': 1, 'result': 'A'},
            {'round_num': 2, 'result': 'A'}
        ]
    }
    t1.institution = None
    t4.institution = None
    # Tournament default is high-low, but director requests high-high for Round 3:
    pairs_logic = pair_round_logic(data_mock, teams, round_num=3, pairing_scheme='high-high')
    top_matches_logic = []
    for aff, neg in pairs_logic:
        if aff.score == 2.0 and neg.score == 2.0:
            top_matches_logic.append({aff.id, neg.id})

    assert {1, 2} in top_matches_logic or {1, 3} in top_matches_logic
    assert {1, 4} not in top_matches_logic
    print("✓ PASS: pair_round_logic per-round scheme override verified in Python!")

if __name__ == "__main__":
    test_high_low_pairing()
