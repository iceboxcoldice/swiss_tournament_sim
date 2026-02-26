#!/bin/bash
# Test script for Python Tournament Manager Elimination Rounds

# Cleanup
rm -f tournament.json
rm -f test_names.txt

# Create team names
echo "Team A" > test_names.txt
echo "Team B" >> test_names.txt
echo "Team C" >> test_names.txt
echo "Team D" >> test_names.txt
echo "Team E" >> test_names.txt
echo "Team F" >> test_names.txt
echo "Team G" >> test_names.txt
echo "Team H" >> test_names.txt

# Switching to Python test script for better control
python3 -c "
import sys
import json
import subprocess
import os

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
        # If winners list provided, check if aff or neg is in it
        # Else default to Aff win (simple case)
        outcome = 'A'
        if winners:
            aff_name = m['aff_name']
            neg_name = m['neg_name']
            if aff_name in winners:
                outcome = 'A'
            elif neg_name in winners:
                outcome = 'N'
            else:
                # Random or default
                outcome = 'A'
        
        # Construct command: report <round> <match_id> <aff_id> <neg_id> <outcome>
        cmd = f\"./tournament_manager.py report {round_num} {m['match_id']} {m['aff_id']} {m['neg_id']} {outcome}\"
        run_cmd(cmd)

# Init
run_cmd('./tournament_manager.py init 8 2 --elim-rounds 1 --names test_names.txt --force')

# Round 1
run_cmd('./tournament_manager.py pair 1')
# Winners: A, C, E, G
report_round(1, winners=['Team A', 'Team C', 'Team E', 'Team G'])

# Round 2
run_cmd('./tournament_manager.py pair 2')
# Winners: A, E (2-0), B, F (1-1) - making A and E top seeds
report_round(2, winners=['Team A', 'Team E', 'Team B', 'Team F'])

# Standings
run_cmd('./tournament_manager.py standings')

# Elim Round 3 (Finals)
print('\n--- Pairing Elim Round 3 ---')
run_cmd('./tournament_manager.py pair 3')

# Verify pairings
with open('tournament.json') as f:
    data = json.load(f)
    matches = data['matches']
    r3_matches = [m for m in matches if m['round_num'] == 3]
    print(f'Elim matches: {len(r3_matches)}')
    if len(r3_matches) != 1:
        print('FAIL: Expected 1 match for Finals')
        sys.exit(1)
    
    m = r3_matches[0]
    t1 = next(t for t in data['teams'] if t['id'] == m['aff_id'])
    t2 = next(t for t in data['teams'] if t['id'] == m['neg_id'])
    print(f'Final: {t1[\"name\"]} vs {t2[\"name\"]}')
    print(f'Seeds: {t1.get(\"break_seed\")} vs {t2.get(\"break_seed\")}')
    
    if t1.get('break_seed') and t2.get('break_seed'):
        print('PASS: Break seeds assigned')
        # Verify seeds are 1 and 2
        seeds = sorted([t1['break_seed'], t2['break_seed']])
        if seeds == [1, 2]:
             print('PASS: Seeds are 1 vs 2')
        else:
             print(f'FAIL: Expected seeds 1 vs 2, got {seeds}')
             sys.exit(1)
    else:
        print('FAIL: Break seeds missing')
        sys.exit(1)
"
