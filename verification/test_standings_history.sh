#!/bin/bash
# Test script for Standings History

# Cleanup
rm -f tournament.json
rm -f test_names.txt

# Create team names
echo "Team A" > test_names.txt
echo "Team B" >> test_names.txt
echo "Team C" >> test_names.txt
echo "Team D" >> test_names.txt

# Switching to Python test script
python3 -c "
import sys
import json
import subprocess

def run_cmd(cmd):
    print(f'Running: {cmd}')
    subprocess.run(cmd, shell=True, check=True)

def report_round(round_num, winners=None):
    # Load matches from json
    with open('tournament.json') as f:
        data = json.load(f)
    
    matches = [m for m in data['matches'] if m['round_num'] == round_num]
    
    print(f'Reporting results for Round {round_num} ({len(matches)} matches)...')
    
    for m in matches:
        # Determine winner
        outcome = 'A'
        if winners:
            aff_name = m['aff_name']
            neg_name = m['neg_name']
            if aff_name in winners:
                outcome = 'A'
            elif neg_name in winners:
                outcome = 'N'
            else:
                outcome = 'A' # Default
        
        cmd = f\"./tournament_manager.py report {round_num} {m['match_id']} {m['aff_id']} {m['neg_id']} {outcome}\"
        run_cmd(cmd)

# Init
run_cmd('./tournament_manager.py init 4 2 --names test_names.txt --force')

# Round 1
run_cmd('./tournament_manager.py pair 1')
# Winners: A, C
report_round(1, winners=['Team A', 'Team C'])

# Round 2
run_cmd('./tournament_manager.py pair 2')
# Winners: A, B (A is 2-0, B is 1-1)
report_round(2, winners=['Team A', 'Team B'])

print('\n--- Verifying Standings History ---')

# Check Standings after Round 1
# Should be: A(1-0), C(1-0), B(0-1), D(0-1)
output_r1 = subprocess.check_output('./tournament_manager.py standings 1', shell=True).decode()
print('Standings after Round 1:')
print(output_r1)

# Verify A has 1.0
lines = output_r1.splitlines()
a_line = next((l for l in lines if 'Team A' in l), None)
if a_line and '1.0' in a_line:
    print('PASS: Team A has score 1.0 in Round 1 standings')
else:
    print(f'FAIL: Team A score incorrect for Round 1. Line: {a_line}')
    sys.exit(1)

# Check Standings after Round 2 (Current)
# Should be: A(2-0), C(1-1), B(1-1), D(0-2)
output_r2 = subprocess.check_output('./tournament_manager.py standings 2', shell=True).decode()
print('Standings after Round 2:')
print(output_r2)

# Verify A has 2.0
lines = output_r2.splitlines()
a_line = next((l for l in lines if 'Team A' in l), None)
if a_line and '2.0' in a_line:
    print('PASS: Team A has score 2.0 in Round 2 standings')
else:
    print(f'FAIL: Team A score incorrect for Round 2. Line: {a_line}')
    sys.exit(1)
    
print('ALL TESTS PASSED')
"
