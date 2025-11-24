import subprocess
import os
import sys
import json

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
    r1_matches = [m for m in matches if m['round_num'] == 1]
    
    # Report R1 results
    print("\n--- Report R1 ---")
    with open("r1_results.txt", "w") as f:
        for m in r1_matches:
            f.write(f"1 {m['match_id']} {m['aff_id']} {m['neg_id']} A\n")
    subprocess.run(["python3", "tournament_manager.py", "report", "1", "--file", "r1_results.txt"], check=True)
    
    print("\n--- Pair R2 ---")
    subprocess.run(["python3", "tournament_manager.py", "pair", "2"], check=True)
    
    # Read R2 pairings
    with open("tournament.json") as f:
        data = json.load(f)
    
    matches = data['matches']
    r2_matches = [m for m in matches if m['round_num'] == 2]
    
    # Report R2 results
    print("\n--- Report R2 ---")
    with open("r2_results.txt", "w") as f:
        for m in r2_matches:
            f.write(f"2 {m['match_id']} {m['aff_id']} {m['neg_id']} N\n")
    subprocess.run(["python3", "tournament_manager.py", "report", "2", "--file", "r2_results.txt"], check=True)
    
    # Export results
    print("\n--- Export Results ---")
    subprocess.run(["python3", "tournament_manager.py", "export", "-o", "exported_results.txt"], check=True)
    
    # Verify export file exists and has content
    if not os.path.exists("exported_results.txt"):
        print("FAIL: Export file not created")
        sys.exit(1)
    
    with open("exported_results.txt") as f:
        lines = [l.strip() for l in f if l.strip() and not l.startswith('#')]
    
    if len(lines) != 4:  # 2 matches per round
        print(f"FAIL: Expected 4 result lines, got {len(lines)}")
        sys.exit(1)
    
    print("PASS: Export file created with correct number of results")
    
    # Verify pairings file exists
    if not os.path.exists("exported_results_pairings.txt"):
        print("FAIL: Pairings file not created")
        sys.exit(1)
    
    with open("exported_results_pairings.txt") as f:
        content = f.read()
        if "Team" not in content or "Match" not in content:
            print("FAIL: Pairings file missing expected content")
            sys.exit(1)
    
    print("PASS: Pairings file created with team names")
    
    # Test idempotent re-import for Round 1
    print("\n--- Test Idempotent Re-import (Round 1) ---")
    result = subprocess.run(
        ["python3", "tournament_manager.py", "report", "1", "--file", "exported_results.txt"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("FAIL: Re-import failed")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    
    if "Processed 4 valid results" not in result.stdout:
        print(f"FAIL: Expected 4 valid results in re-import (all idempotent), got: {result.stdout}")
        sys.exit(1)
    
    print("PASS: Idempotent re-import succeeded for Round 1 (processed all matching results)")
    
    # Test idempotent re-import for Round 2
    print("\n--- Test Idempotent Re-import (Round 2) ---")
    result = subprocess.run(
        ["python3", "tournament_manager.py", "report", "2", "--file", "exported_results.txt"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("FAIL: Re-import failed")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    
    if "Processed 4 valid results" not in result.stdout:
        print(f"FAIL: Expected 4 valid results in re-import, got: {result.stdout}")
        sys.exit(1)
    
    print("PASS: Idempotent re-import succeeded for Round 2")
    
    print("\n✅ All export/import tests passed!")

except subprocess.CalledProcessError as e:
    print(f"FAIL: Command failed with {e}")
    sys.exit(1)
except Exception as e:
    print(f"FAIL: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    # Cleanup
    if os.path.exists("tournament.json.bak"):
        os.replace("tournament.json.bak", "tournament.json")
    for f in ["r1_results.txt", "r2_results.txt", "exported_results.txt", "exported_results_pairings.txt"]:
        if os.path.exists(f):
            os.remove(f)
