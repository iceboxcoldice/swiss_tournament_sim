import subprocess
import os
import sys
import json

def run_cmd(args, check=True):
    result = subprocess.run(args, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"FAIL: Command {' '.join(args)} failed")
        print(result.stderr)
        print(result.stdout)
        sys.exit(1)
    return result

def main():
    print("--- Init ---")
    run_cmd(["python3", "tournament_manager.py", "init", "4", "3", "--force"])
    
    print("\n--- Test 1: Pair R1 ---")
    run_cmd(["python3", "tournament_manager.py", "pair", "1"])
    print("PASS: Pair R1")
    
    print("\n--- Test 2: Pair R2 without R1 results (Should Succeed) ---")
    run_cmd(["python3", "tournament_manager.py", "pair", "2"])
    print("PASS: Pair R2 without R1 results")
    
    print("\n--- Test 3: Pair R3 without R2 results (Should Fail) ---")
    res = run_cmd(["python3", "tournament_manager.py", "pair", "3"], check=False)
    if res.returncode == 0:
        print("FAIL: Should have failed to pair R3 without R2 results")
        print("STDOUT:", res.stdout)
        sys.exit(1)
    if "Cannot pair Round 3 until all results from Round 2 are reported" not in res.stdout:
        print(f"FAIL: Unexpected error message: {res.stdout}")
        sys.exit(1)
    print("PASS: Pair R3 blocked")
    
    print("\n--- Test 4: Report R2 and Pair R3 (Should Succeed) ---")
    # Need to report R2. But wait, R2 pairing exists.
    # Let's report R2 results.
    # Get match IDs for R2.
    with open("tournament.json") as f:
        data = json.load(f)
    matches = data['matches']
    r2_matches = [m for m in matches if m['round_num'] == 2]
    
    with open("r2_results.txt", "w") as f:
        for m in r2_matches:
            f.write(f"2 {m['match_id']} {m['aff_id']} {m['neg_id']} A\n")
            
    # Report R2. Note: R1 is still unreported.
    # Does reporting R2 require R1 results?
    # cmd_report checks: "You must complete previous rounds before reporting results for Round {round_num}."
    # So reporting R2 should fail if R1 is unreported!
    
    print("Checking if Report R2 fails due to missing R1...")
    res = run_cmd(["python3", "tournament_manager.py", "report", "2", "--file", "r2_results.txt"], check=False)
    if res.returncode == 0:
        print("FAIL: Should have failed to report R2 without R1 results")
        # Unless force is used? But I didn't use force.
        sys.exit(1)
    if "Round 1 is not fully reported" not in res.stdout:
        print(f"FAIL: Unexpected error message: {res.stdout}")
        sys.exit(1)
    print("PASS: Report R2 blocked by missing R1")
    
    # Okay, so we need to report R1 first.
    print("Reporting R1...")
    r1_matches = [m for m in matches if m['round_num'] == 1]
    with open("r1_results.txt", "w") as f:
        for m in r1_matches:
            f.write(f"1 {m['match_id']} {m['aff_id']} {m['neg_id']} A\n")
    run_cmd(["python3", "tournament_manager.py", "report", "1", "--file", "r1_results.txt"])
    
    print("Reporting R2...")
    run_cmd(["python3", "tournament_manager.py", "report", "2", "--file", "r2_results.txt"])
    
    print("Pairing R3...")
    run_cmd(["python3", "tournament_manager.py", "pair", "3"])
    print("PASS: Pair R3 succeeded after reporting R2")

if __name__ == "__main__":
    main()
