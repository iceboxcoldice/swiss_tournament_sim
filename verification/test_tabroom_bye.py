#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))
from swiss_sim import Team, pair_round, select_bye_team, get_speaker_points
import tournament_manager as tm

def test_tabroom_bye_python():
    print("Testing Tabroom BYE Mechanism in Python...\n")

    # 9 teams (odd field)
    teams = [
        Team(id=i, true_rank=i+1, name=f"Team {i+1}", institution=f"School {i+1}")
        for i in range(9)
    ]

    # --- TEST 1: Round 1 Preset BYE ---
    print("Test 1: Round 1 Preset BYE...")
    pairs_r1 = pair_round(teams, round_num=0, use_buchholz=False, pairing_scheme='high-low')
    
    # Check that 1 match has neg is None
    bye_matches_r1 = [(aff, neg) for aff, neg in pairs_r1 if neg is None]
    assert len(bye_matches_r1) == 1, f"Expected 1 BYE match in Round 1, got {len(bye_matches_r1)}"
    
    r1_bye_team, _ = bye_matches_r1[0]
    print(f"✓ PASS: {r1_bye_team.name} assigned BYE in Round 1")
    assert r1_bye_team.score == 1.0, f"Expected bye team score 1.0, got {r1_bye_team.score}"
    assert r1_bye_team.wins == 1, f"Expected bye team wins 1, got {r1_bye_team.wins}"
    assert r1_bye_team.aff_count == 0 and r1_bye_team.neg_count == 0, f"Expected neutral sides, got Aff={r1_bye_team.aff_count}, Neg={r1_bye_team.neg_count}"
    assert -1 in r1_bye_team.opponent_history, "Expected -1 in opponent_history for bye"
    assert 1 in r1_bye_team.bye_rounds, "Expected round 1 in bye_rounds"
    print("✓ PASS: BYE awards 1 Win with neutral Aff/Neg side balance!")

    # Set scores for non-bye teams (simulate round 1 debates)
    debates_r1 = [(a, n) for a, n in pairs_r1 if n is not None]
    for aff, neg in debates_r1:
        aff.score += 1.0
        aff.wins += 1
        aff.history.append("W")
        neg.history.append("L")
        aff.aff_count += 1
        neg.neg_count += 1
        aff.last_side = "Aff"
        neg.last_side = "Neg"
        aff.opponent_history.append(neg.id)
        neg.opponent_history.append(aff.id)
        aff.speaker_points_history.append({'round': 1, 'points': [29.0, 29.0]})
        neg.speaker_points_history.append({'round': 1, 'points': [27.0, 27.0]})

    # --- TEST 2: Round 2 Single-Bye Rule (No Double Byes) ---
    print("\nTest 2: Round 2 Single-Bye Constraint...")
    pairs_r2 = pair_round(teams, round_num=1, use_buchholz=False, pairing_scheme='high-low')
    bye_matches_r2 = [(aff, neg) for aff, neg in pairs_r2 if neg is None]
    assert len(bye_matches_r2) == 1, f"Expected 1 BYE match in Round 2, got {len(bye_matches_r2)}"
    
    r2_bye_team, _ = bye_matches_r2[0]
    print(f"✓ PASS: {r2_bye_team.name} assigned BYE in Round 2")
    assert r2_bye_team.id != r1_bye_team.id, f"Violation of Single-Bye rule! Team {r1_bye_team.name} received a 2nd bye!"
    print("✓ PASS: Single-Bye rule strictly enforced (no repeat byes across rounds)!")

    # Set scores for non-bye teams (simulate round 2 debates)
    debates_r2 = [(a, n) for a, n in pairs_r2 if n is not None]
    for aff, neg in debates_r2:
        aff.score += 1.0
        aff.wins += 1
        aff.history.append("W")
        neg.history.append("L")
        aff.aff_count += 1
        neg.neg_count += 1
        aff.last_side = "Aff"
        neg.last_side = "Neg"
        aff.opponent_history.append(neg.id)
        neg.opponent_history.append(aff.id)
        aff.speaker_points_history.append({'round': 2, 'points': [28.5, 28.5]})
        neg.speaker_points_history.append({'round': 2, 'points': [27.5, 27.5]})

    # --- TEST 3: Round 3 Power-Matched BYE (Lowest Seed without a Bye) ---
    print("\nTest 3: Round 3 Power-Matched BYE (Lowest Seed without a Bye)...")
    eligible_r3 = [t for t in teams if t.id != r1_bye_team.id and t.id != r2_bye_team.id]
    eligible_r3.sort(key=lambda t: (t.score, get_speaker_points(t), getattr(t, 'buchholz', 0.0), -t.id))
    expected_r3_bye = eligible_r3[0]
    print(f"Lowest eligible seed before Round 3: {expected_r3_bye.name} (Score: {expected_r3_bye.score})")

    pairs_r3 = pair_round(teams, round_num=2, use_buchholz=True, pairing_scheme='high-low')
    bye_matches_r3 = [(aff, neg) for aff, neg in pairs_r3 if neg is None]
    assert len(bye_matches_r3) == 1, f"Expected 1 BYE match in Round 3, got {len(bye_matches_r3)}"
    r3_bye_team, _ = bye_matches_r3[0]
    print(f"Round 3 BYE awarded to: {r3_bye_team.name}")
    assert r3_bye_team.id == expected_r3_bye.id, f"Expected {expected_r3_bye.name} to receive Round 3 BYE, got {r3_bye_team.name}"
    print("✓ PASS: Lowest-seeded eligible team correctly selected for Power-Matched BYE!")

    # --- TEST 4: Speaker Points Average Imputation for Bye Rounds ---
    print("\nTest 4: Tabroom Speaker Points Average Imputation for Byes...")
    debated_rounds_pts = sum(sum(e['points']) for e in r1_bye_team.speaker_points_history)
    expected_with_bye = debated_rounds_pts + (debated_rounds_pts / len(r1_bye_team.speaker_points_history)) * len(r1_bye_team.bye_rounds)
    sp_total = get_speaker_points(r1_bye_team)
    print(f"{r1_bye_team.name} total speaker points with bye imputation: {sp_total}")
    assert sp_total == expected_with_bye, f"Expected {expected_with_bye} speaker points with bye imputation, got {sp_total}"
    print("✓ PASS: Speaker points average successfully imputed for bye rounds in Python!")

    # --- TEST 5: Tournament Manager Stats Recalculation Persistence ---
    print("\nTest 5: Tournament Manager recalculate_stats Persistence Check...")
    data_mock = {
        'matches': [
            {
                'match_id': 1,
                'round_num': 1,
                'aff_id': r1_bye_team.id,
                'neg_id': -1,
                'aff_name': r1_bye_team.name,
                'neg_name': 'BYE',
                'result': 'A',
                'is_bye': True
            }
        ]
    }
    team_map = {t.id: t for t in teams}
    tm.recalculate_stats(data_mock, teams, team_map)
    assert 1 in r1_bye_team.bye_rounds, f"Expected 1 in r1_bye_team.bye_rounds, got {r1_bye_team.bye_rounds}"
    assert r1_bye_team.score >= 1.0, f"Expected score >= 1.0, got {r1_bye_team.score}"
    assert r1_bye_team.wins >= 1, f"Expected wins >= 1, got {r1_bye_team.wins}"
    print("✓ PASS: Byes properly persist and recalculate without loss in Python tournament manager!")

    print("\nAll Python Tabroom BYE verifications PASSED! ✅")

if __name__ == "__main__":
    test_tabroom_bye_python()
