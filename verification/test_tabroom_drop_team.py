#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/.."))
from swiss_sim import Team, pair_round
import tournament_manager as tm

def test_drop_team_python():
    print("Testing Tabroom Team Drop & Reinstate Functionality in Python...\n")

    # 8 teams: IDs 0-7
    teams = [
        Team(id=i, true_rank=i+1, name=f"Team {i+1}", institution=f"School {i+1}")
        for i in range(8)
    ]

    # --- TEST 1: Round 1 Normal Pairing (8 teams) ---
    print("Test 1: Round 1 Normal Pairing (8 teams)...")
    pairs_r1 = pair_round(teams, round_num=0, use_buchholz=False, pairing_scheme='high-low')
    assert len(pairs_r1) == 4, f"Expected 4 matches in Round 1, got {len(pairs_r1)}"
    print("✓ PASS: 4 matches generated for 8 teams.")

    # Record round 1 results
    for aff, neg in pairs_r1:
        aff.score += 1.0
        aff.wins += 1
        aff.history.append("W")
        neg.history.append("L")
        aff.opponent_history.append(neg.id)
        neg.opponent_history.append(aff.id)

    # --- TEST 2: Mid-tournament drop (between rounds) ---
    print("\nTest 2: Drop Team 8 (ID 7) before Round 2...")
    teams[7].is_dropped = True

    # --- TEST 3: Round 2 pairing with 7 active teams (Triggering Tabroom BYE) ---
    print("\nTest 3: Pairing Round 2 with 7 active teams...")
    pairs_r2 = pair_round(teams, round_num=1, use_buchholz=False, pairing_scheme='high-low')
    
    # Check that Team 8 is not in any match
    for aff, neg in pairs_r2:
        assert aff.id != 7, "Dropped team was paired as Aff!"
        if neg is not None:
            assert neg.id != 7, "Dropped team was paired as Neg!"
    print("✓ PASS: Dropped Team 8 completely excluded from Round 2 pairings!")

    # Check for BYE match
    bye_matches = [(a, n) for a, n in pairs_r2 if n is None]
    assert len(bye_matches) == 1, f"Expected 1 BYE match for 7 active teams, got {len(bye_matches)}"
    print(f"✓ PASS: Odd active field of 7 teams automatically awarded BYE to {bye_matches[0][0].name}!")

    # --- TEST 4: tournament_manager drop_team & Forfeit Logic ---
    print("\nTest 4: tournament_manager.drop_team with in-progress match (Forfeit Win)...")
    data_mock = {
        'matches': [
            {
                'match_id': 1,
                'round_num': 2,
                'aff_id': 0, # Team 1
                'neg_id': 1, # Team 2
                'result': None,
                'is_bye': False
            }
        ]
    }
    
    # Drop Team 1 (aff_id)
    success = tm.drop_team(data_mock, teams, team_id=0)
    assert success, "Failed to drop Team 1"
    
    # Check that match 1 was converted to forfeit win for Neg (Team 2)
    match_1 = data_mock['matches'][0]
    assert match_1['result'] == 'N', f"Expected Neg to win by forfeit, got {match_1['result']}"
    assert match_1.get('is_forfeit') is True, "Expected is_forfeit to be True"
    assert match_1.get('forfeit_team_id') == 0, "Expected forfeit_team_id to be 0"
    print("✓ PASS: Mid-round drop automatically awarded Forfeit Win to opponent!")

    # --- TEST 5: Reinstate Team ---
    print("\nTest 5: tournament_manager.reinstate_team...")
    success_reinstate = tm.reinstate_team(data_mock, teams, team_id=0)
    assert success_reinstate, "Failed to reinstate Team 1"
    assert teams[0].is_dropped is False, "Expected Team 1 is_dropped to be False"
    print("✓ PASS: Team successfully reinstated!")

    print("\nAll Python Team Drop & Reinstate tests PASSED! ✅")

if __name__ == "__main__":
    test_drop_team_python()
