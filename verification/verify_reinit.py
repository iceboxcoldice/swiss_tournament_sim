import subprocess
import os
import sys
import json

# Backup
if os.path.exists("tournament.json"):
    os.rename("tournament.json", "tournament.json.bak")

try:
    print("=== Test 1: Reinit from pairings only ===")
    
    # Create a simple pairing file
    with open("test_pairings.txt", "w") as f:
        f.write("# Test pairings\n")
        f.write("# Format: Round MatchID AffID NegID\n\n")
        f.write("# Round 1\n")
        f.write("1 1 0 1\n")
        f.write("1 2 2 3\n\n")
        f.write("# Round 2\n")
        f.write("2 3 0 2\n")
        f.write("2 4 1 3\n")
    
    # Reinit from pairings only
    result = subprocess.run(
        ["python3", "tournament_manager.py", "reinit", "--pairings", "test_pairings.txt"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("FAIL: Reinit from pairings failed")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    
    # Verify tournament.json was created
    if not os.path.exists("tournament.json"):
        print("FAIL: tournament.json not created")
        sys.exit(1)
    
    with open("tournament.json") as f:
        data = json.load(f)
    
    if data['config']['num_teams'] != 4:
        print(f"FAIL: Expected 4 teams, got {data['config']['num_teams']}")
        sys.exit(1)
    
    if data['config']['num_rounds'] != 2:
        print(f"FAIL: Expected 2 rounds, got {data['config']['num_rounds']}")
        sys.exit(1)
    
    if len(data['matches']) != 4:
        print(f"FAIL: Expected 4 matches, got {len(data['matches'])}")
        sys.exit(1)
    
    if data['current_round'] != 0:
        print(f"FAIL: Expected current_round 0, got {data['current_round']}")
        sys.exit(1)
    
    print("PASS: Reinit from pairings only")
    
    print("\n=== Test 2: Reinit with results ===")
    
    # Remove existing tournament
    os.remove("tournament.json")
    
    # Create results file
    with open("test_results.txt", "w") as f:
        f.write("# Test results\n")
        f.write("1 1 0 1 A\n")
        f.write("1 2 2 3 N\n")
    
    # Reinit with results
    result = subprocess.run(
        ["python3", "tournament_manager.py", "reinit", 
         "--pairings", "test_pairings.txt",
         "--results", "test_results.txt"],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("FAIL: Reinit with results failed")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    
    with open("tournament.json") as f:
        data = json.load(f)
    
    # Check results were applied
    results_count = sum(1 for m in data['matches'] if m['result'] is not None)
    if results_count != 2:
        print(f"FAIL: Expected 2 results, got {results_count}")
        sys.exit(1)
    
    if data['current_round'] != 1:
        print(f"FAIL: Expected current_round 1, got {data['current_round']}")
        sys.exit(1)
    
    print("PASS: Reinit with results")
    
    print("\n=== Test 3: Error - Duplicate match ID ===")
    
    os.remove("tournament.json")
    
    with open("bad_pairings.txt", "w") as f:
        f.write("1 1 0 1\n")
        f.write("1 1 2 3\n")  # Duplicate match ID
    
    result = subprocess.run(
        ["python3", "tournament_manager.py", "reinit", "--pairings", "bad_pairings.txt"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("FAIL: Should have failed on duplicate match ID")
        sys.exit(1)
    
    if "Duplicate match ID" not in result.stdout:
        print(f"FAIL: Expected 'Duplicate match ID' error, got: {result.stdout}")
        sys.exit(1)
    
    print("PASS: Duplicate match ID detected")
    
    print("\n=== Test 4: Error - Team ID mismatch ===")
    
    with open("mismatch_results.txt", "w") as f:
        f.write("1 1 0 2 A\n")  # Wrong team IDs
    
    result = subprocess.run(
        ["python3", "tournament_manager.py", "reinit",
         "--pairings", "test_pairings.txt",
         "--results", "mismatch_results.txt"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("FAIL: Should have failed on team ID mismatch")
        sys.exit(1)
    
    if "Team ID mismatch" not in result.stdout:
        print(f"FAIL: Expected 'Team ID mismatch' error, got: {result.stdout}")
        sys.exit(1)
    
    print("PASS: Team ID mismatch detected")
    
    print("\n=== Test 5: Error - Match ID not in pairings ===")
    
    with open("missing_match_results.txt", "w") as f:
        f.write("1 99 0 1 A\n")  # Match ID 99 doesn't exist
    
    result = subprocess.run(
        ["python3", "tournament_manager.py", "reinit",
         "--pairings", "test_pairings.txt",
         "--results", "missing_match_results.txt"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("FAIL: Should have failed on missing match ID")
        sys.exit(1)
    
    if "does not exist" not in result.stdout:
        print(f"FAIL: Expected 'does not exist' error, got: {result.stdout}")
        sys.exit(1)
    
    print("PASS: Missing match ID detected")
    
    print("\n✅ All reinit tests passed!")

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
    for f in ["test_pairings.txt", "test_results.txt", "bad_pairings.txt", 
              "mismatch_results.txt", "missing_match_results.txt"]:
        if os.path.exists(f):
            os.remove(f)
    if os.path.exists("tournament.json") and not os.path.exists("tournament.json.bak"):
        os.remove("tournament.json")
