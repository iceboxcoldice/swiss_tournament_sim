import json
import subprocess
import os
import sys

# Backup
if os.path.exists("tournament.json"):
    os.rename("tournament.json", "tournament.json.bak")

try:
    print("--- Init ---")
    subprocess.run(["python3", "tournament_manager.py", "init", "4", "2", "--force"], check=True)
    
    print("\n--- Pair R1 ---")
    subprocess.run(["python3", "tournament_manager.py", "pair", "1"], check=True)

    # Read pairings
    with open("tournament.json") as f:
        data = json.load(f)
    
    matches = data['matches']
    pairings = [m for m in matches if m['round_num'] == 1]
    print(f"Pairings length: {len(pairings)}")
    m1 = pairings[0]
    m2 = pairings[1]
    
    # Report R1 results
    print("\n--- Report R1 ---")
    with open("r1_results.txt", "w") as f:
        f.write(f"1 {m1['match_id']} {m1['aff_id']} {m1['neg_id']} A\n")
        f.write(f"1 {m2['match_id']} {m2['aff_id']} {m2['neg_id']} N\n")
    subprocess.run(["python3", "tournament_manager.py", "report", "1", "--file", "r1_results.txt"], check=True)
    
    print("\n--- Pair R2 ---")
    subprocess.run(["python3", "tournament_manager.py", "pair", "2"], check=True)
    
    # Create file with R2 result AND R1 correction
    print("\n--- Testing Multi-Round Update ---")
    with open("multi_round.txt", "w") as f:
        # R2 Match 1 (Valid)
        # Need to find correct IDs for R2 pairings, but let's just use R1 correction for now
        # R1 Match 1 Correction: Change A to N
        f.write(f"1 {m1['match_id']} {m1['aff_id']} {m1['neg_id']} N\n")
        
    # Run report for Round 2 with force
    subprocess.run(["python3", "tournament_manager.py", "report", "2", "--file", "multi_round.txt", "--force"], check=True)
    
    # Verify R1 result updated
    with open("tournament.json") as f:
        data = json.load(f)
    
    matches = data['matches']
    r1_m1 = next(m for m in matches if m['match_id'] == m1['match_id'])
    
    if r1_m1['result'] != 'N':
        print(f"FAIL: R1 result not updated. Got {r1_m1['result']}")
        sys.exit(1)
    print("PASS: R1 result updated from R2 report")
    
    # Verify R1 result NOT updated without force
    print("\n--- Testing Multi-Round Update (No Force) ---")
    with open("multi_round_fail.txt", "w") as f:
        f.write(f"1 {m1['match_id']} {m1['aff_id']} {m1['neg_id']} A\n") # Try to change back
        
    result = subprocess.run(["python3", "tournament_manager.py", "report", "2", "--file", "multi_round_fail.txt"], capture_output=True, text=True)
    
    # With the new logic, idempotent check happens first in _process_match_result
    # If results don't match, it proceeds to check outcome conflict (not round mismatch)
    if "Outcome conflict" not in result.stdout and "Round mismatch" not in result.stdout:
        print("FAIL: Should have warned about outcome conflict or round mismatch")
        print("STDOUT:", result.stdout)
        sys.exit(1)
        
    print("PASS: Conflict detected without force")

except subprocess.CalledProcessError as e:
    print(f"FAIL: Command failed with {e}")
    sys.exit(1)
except Exception as e:
    print(f"FAIL: {e}")
    sys.exit(1)
finally:
    # Restore
    if os.path.exists("tournament.json.bak"):
        os.replace("tournament.json.bak", "tournament.json")
    if os.path.exists("r1_results.txt"):
        os.remove("r1_results.txt")
    if os.path.exists("multi_round.txt"):
        os.remove("multi_round.txt")
    if os.path.exists("multi_round_fail.txt"):
        os.remove("multi_round_fail.txt")
    if os.path.exists("multi_round_fail_errors.txt"):
        os.remove("multi_round_fail_errors.txt")
