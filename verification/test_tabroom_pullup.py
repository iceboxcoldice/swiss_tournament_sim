#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))
from swiss_sim import Team, pair_round

def test_tabroom_pullup_python():
    print("Testing Tabroom Odd-Bracket Pull-Up Functionality in Python...\n")

    # 10 teams:
    # 5 teams with 2 wins (IDs 1, 2, 3, 4, 5) - ODD bracket!
    # 5 teams with 1 win  (IDs 6, 7, 8, 9, 10) - ODD bracket!
    teams_2_0 = [
        Team(id=i, true_rank=i, score=2.0, wins=2, name=f"Team {i}", institution=f"School {i}")
        for i in range(1, 6)
    ]
    teams_1_1 = [
        Team(id=i, true_rank=i, score=1.0, wins=1, name=f"Team {i}", institution=f"School {i}")
        for i in range(6, 11)
    ]

    all_teams = teams_2_0 + teams_1_1

    # Give 2-0 teams speaker points to establish seeding:
    # Team 1 (Seed 1): 59 pts
    # Team 2 (Seed 2): 58 pts
    # Team 3 (Seed 3): 57 pts
    # Team 4 (Seed 4): 56 pts
    # Team 5 (Seed 5): 55 pts
    for i, t in enumerate(teams_2_0):
        t.speaker_points_history = [30.0 - i * 0.5, 30.0 - i * 0.5]

    # Give 1-1 teams opponents to produce distinct Buchholz (average opponent win score):
    # Team 6: played Team 1 (2) & Team 2 (2) -> opp scores = [2.0, 2.0] -> Buchholz = 4.0
    # Team 7: played Team 2 (2) & Team 10 (1) -> opp scores = [2.0, 1.0] -> Buchholz = 3.0
    # Team 8: played Team 3 (2) -> opp scores = [2.0] -> Buchholz = 2.0
    # Team 9: played Team 10 (1) -> opp scores = [1.0] -> Buchholz = 1.0
    # Team 10: played no winning opponents -> opp scores = [] -> Buchholz = 0.0 (Worst opponent seed / easiest schedule)
    teams_1_1[0].opponent_history = [1, 2]
    teams_1_1[1].opponent_history = [2, 10]
    teams_1_1[2].opponent_history = [3]
    teams_1_1[3].opponent_history = [10]
    teams_1_1[4].opponent_history = []

    print("Generating Round 3 pairings (2-0 bracket has 5 teams, 1-1 has 5 teams)...")
    pairs = pair_round(all_teams, round_num=2, use_buchholz=True, pairing_scheme='high-low')

    print("\nGenerated Pairings:")
    for idx, (aff, neg) in enumerate(pairs):
        aff_pull = " [PULL-UP]" if 2 in (getattr(aff, 'pulled_up_rounds', []) or []) else ""
        neg_pull = " [PULL-UP]" if 2 in (getattr(neg, 'pulled_up_rounds', []) or []) else ""
        print(f"  Match {idx + 1}: {aff.name}{aff_pull} (Score: {aff.score}) vs {neg.name}{neg_pull} (Score: {neg.score})")

    # Verification 1: Who got pulled up?
    # Team 10 (ID 10) had the lowest Buchholz (0.0)
    print("\nChecking pull-up selection...")
    team_10 = next(t for t in all_teams if t.id == 10)
    assert 3 in team_10.pulled_up_rounds, f"Expected Team 10 to be pulled up in Round 3, got pulled_up_rounds: {team_10.pulled_up_rounds}"
    print("✓ PASS: Team 10 (worst average opponent seed) was successfully selected for pull-up!")

    # Verification 2: Under Tabroom High-Low, Seed 1 of higher bracket (Team 1, ID 1)
    # MUST debate the pulled-up team (Team 10, ID 10)!
    seed1_match = next((a, n) for a, n in pairs if a.id == 1 or n.id == 1)
    seed1_opp = seed1_match[1] if seed1_match[0].id == 1 else seed1_match[0]
    print(f"Seed 1 (Team 1) is paired against: {seed1_opp.name} (ID {seed1_opp.id})")
    assert seed1_opp.id == 10, f"Expected Seed 1 (ID 1) to debate pulled-up Team 10 (ID 10), but got ID {seed1_opp.id}"
    print("✓ PASS: Seed 1 of higher bracket correctly debates the pulled-up team!")

    # Verification 3: 3 matches formed for the 6 teams in 2-0 bracket
    top_matches = [
        (a, n) for a, n in pairs
        if (a.score == 2.0 or a.id == 10) and (n.score == 2.0 or n.id == 10)
    ]
    assert len(top_matches) == 3, f"Expected 3 matches for top bracket + pull-up, got {len(top_matches)}"
    print("✓ PASS: Exactly 3 matches created for the 6 teams in top bracket!")

    print("\nAll Python Tabroom pull-up verifications PASSED! ✅")

if __name__ == "__main__":
    test_tabroom_pullup_python()
