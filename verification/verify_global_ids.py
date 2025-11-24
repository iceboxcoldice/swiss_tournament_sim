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
    
    # Verify R1 IDs are 1, 2
    with open("tournament.json") as f:
        data = json.load(f)
    
    matches = data.get('matches', [])
    if len(matches) != 2:
        print(f"FAIL: Expected 2 matches, got {len(matches)}")
        sys.exit(1)
        
    ids = sorted([m['match_id'] for m in matches])
    if ids != [1, 2]:
        print(f"FAIL: Expected match IDs [1, 2], got {ids}")
        sys.exit(1)
    print("PASS: R1 Match IDs correct")
    
    # Verify Re-pairing is disallowed
    print("\n--- Test Re-pairing ---")
    result = subprocess.run(["python3", "tournament_manager.py", "pair", "1"], capture_output=True, text=True)
    if result.returncode == 0:
        print("FAIL: Re-pairing should have failed")
        sys.exit(1)
    if "Re-pairing is not supported" not in result.stdout:
        print(f"FAIL: Unexpected error message: {result.stdout}")
        sys.exit(1)
    print("PASS: Re-pairing disallowed")
    
    # Report R1 results
    print("\n--- Report R1 ---")
    # Use global IDs
    m1 = matches[0]
    m2 = matches[1]
    with open("r1_results.txt", "w") as f:
        f.write(f"1 {m1['match_id']} {m1['aff_id']} {m1['neg_id']} A\n")
        f.write(f"1 {m2['match_id']} {m2['aff_id']} {m2['neg_id']} N\n")
    subprocess.run(["python3", "tournament_manager.py", "report", "1", "--file", "r1_results.txt"], check=True)
    
    print("\n--- Pair R2 ---")
    subprocess.run(["python3", "tournament_manager.py", "pair", "2"], check=True)
    
    # Verify R2 IDs are 3, 4
    with open("tournament.json") as f:
        data = json.load(f)
    
    matches = data.get('matches', [])
    if len(matches) != 4:
        print(f"FAIL: Expected 4 matches total, got {len(matches)}")
        sys.exit(1)
        
    ids = sorted([m['match_id'] for m in matches])
    if ids != [1, 2, 3, 4]:
        print(f"FAIL: Expected match IDs [1, 2, 3, 4], got {ids}")
        sys.exit(1)
    print("PASS: R2 Match IDs correct (Global uniqueness)")
    
    # Verify previous round check
    print("\n--- Test Previous Round Check ---")
    # Try to report R2 without reporting R1 (wait, we already reported R1 above)
    # Let's init a new tournament to test this check
    
    print("\n--- Init New Tournament for Check ---")
    subprocess.run(["python3", "tournament_manager.py", "init", "4", "2", "--force"], check=True)
    subprocess.run(["python3", "tournament_manager.py", "pair", "1"], check=True)
    
    # Manually hack tournament.json to add Round 2 without results for Round 1
    # Actually, cmd_pair enforces previous round results too!
    # "Cannot pair Round 2 until all results from Round 1 are reported."
    # Let's verify THAT check first.
    
    print("\n--- Test Pair R2 without R1 results ---")
    result = subprocess.run(["python3", "tournament_manager.py", "pair", "2"], capture_output=True, text=True)
    if result.returncode != 0:
        print("FAIL: Should allow pairing R2 without R1 results (Special Case)")
        print(result.stdout)
        sys.exit(1)
    print("PASS: Pair R2 allowed without R1 results")

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
