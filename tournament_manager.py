#!/usr/bin/env python3
"""
Tournament Manager for Swiss System Tournaments.

This script allows you to manage a real tournament using the Swiss pairing logic.
It maintains the tournament state in a JSON file.

Subcommands:
  init      Initialize a new tournament
  pair      Generate pairings for a round
  report    Record results for a round
  standings Display current standings
"""

import argparse
import json
import os
import sys
import threading
from dataclasses import asdict
from typing import List, Dict, Any, Callable, Tuple

# Import Team and pairing logic from swiss_sim
from swiss_sim import Team, pair_round

TOURNAMENT_FILE = "tournament.json"
# Global threading lock for safe concurrent writes
_tournament_lock = threading.Lock()

def load_tournament_data() -> Tuple[Dict, List[Team]]:
    """Loads tournament data and reconstructs Team objects."""
    if not os.path.exists(TOURNAMENT_FILE):
        print(f"Error: {TOURNAMENT_FILE} not found. Run 'init' first.")
        sys.exit(1)
    
    with open(TOURNAMENT_FILE, 'r') as f:
        data = json.load(f)
    
    # Reconstruct Team objects
    teams = []
    for t_data in data['teams']:
        # Convert list back to set for opponents if needed, but Team class uses set
        # We need to handle the conversion carefully
        t = Team(id=t_data['id'], true_rank=t_data.get('true_rank', 0), name=t_data.get('name', ''))
        t.score = t_data['score']
        t.buchholz = t_data['buchholz']
        t.wins = t_data['wins']
        t.aff_count = t_data['aff_count']
        t.neg_count = t_data['neg_count']
        t.last_side = t_data['last_side']
        t.side_history = t_data['side_history']
        t.history = t_data['history']
        t.opponent_history = t_data['opponent_history']
        # Reconstruct opponents set from opponent_history (ignoring -1/byes if needed, or just keeping track)
        # Actually, swiss_sim uses opponent_history now, so we just need to load that.
        # But wait, swiss_sim might still use .opponents in some places? 
        # No, we refactored it to use opponent_history.
        # However, let's double check if we need to populate anything else.
        teams.append(t)
        
    return data, teams

def load_tournament() -> Tuple[Dict, List[Team]]:
    """Loads tournament data (read-only)."""
    return load_tournament_data()

def save_tournament(data, teams):
    # Update teams data
    data['teams'] = [asdict(t) for t in teams]
    # Write under lock
    _tournament_lock.acquire()
    try:
        with open(TOURNAMENT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    finally:
        _tournament_lock.release()

def recalculate_stats(data, teams, team_map):
    # Reset stats
    for t in teams:
        t.score = 0.0
        t.buchholz = 0.0
        t.wins = 0
        t.aff_count = 0
        t.neg_count = 0
        t.last_side = None
        t.side_history = {}
        t.history = []
        t.opponent_history = []

    # Re-process all matches
    matches = data.get('matches', [])
    
    # Sort matches by round to process in order (important for history)
    matches.sort(key=lambda m: m['round_num'])
    
    for match in matches:
        if match['result']:
            aff = team_map[match['aff_id']]
            neg = team_map[match['neg_id']]
            
            # Record opponents
            aff.opponent_history.append(neg.id)
            neg.opponent_history.append(aff.id)
            
            # Update side counts
            aff.aff_count += 1
            neg.neg_count += 1
            aff.last_side = "Aff"
            neg.last_side = "Neg"
            
            # Side history
            aff.side_history.setdefault(neg.id, []).append("Aff")
            neg.side_history.setdefault(aff.id, []).append("Neg")
            
            # Score and Wins
            if match['result'] == 'A':
                aff.score += 1.0
                aff.wins += 1
                aff.history.append("W")
                neg.history.append("L")
            elif match['result'] == 'N':
                neg.score += 1.0
                neg.wins += 1
                neg.history.append("W")
                aff.history.append("L")
            # Handle draws if needed later

    # Update Buchholz
    for t in teams:
        buchholz = 0
        for opp_id in t.opponent_history:
            if opp_id != -1:
                opp = team_map.get(opp_id)
                if opp:
                    buchholz += opp.score
        t.buchholz = buchholz
        
    # Sort standings
    teams.sort(key=lambda t: (t.score, t.buchholz, -t.true_rank), reverse=True)

def cmd_init(args):
    if os.path.exists(TOURNAMENT_FILE) and not args.force:
        print(f"Error: {TOURNAMENT_FILE} already exists. Use --force to overwrite.")
        return

    teams = []
    if args.names:
        with open(args.names, 'r') as f:
            names = [line.strip() for line in f if line.strip()]
        
        if len(names) != args.teams:
            print(f"Warning: Number of names ({len(names)}) does not match number of teams ({args.teams}).")
            # We'll truncate or pad
            
        for i in range(args.teams):
            name = names[i] if i < len(names) else f"Team {i+1}"
            teams.append(Team(id=i, true_rank=0, name=name))
    else:
        for i in range(args.teams):
            teams.append(Team(id=i, true_rank=0, name=f"Team {i+1}"))

    data = {
        "config": {
            "num_teams": args.teams,
            "num_rounds": args.rounds,
        },
        "current_round": 0,
        "rounds": [],  # List of round data (match_ids)
        "teams": [asdict(t) for t in teams], # Initial team data
        "matches": [], # Global list of all matches
        "next_match_id": 1 # Counter for unique match IDs
    }
    
    # Acquire the thread lock before writing
    _tournament_lock.acquire()
    try:
        with open(TOURNAMENT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Initialized tournament with {args.teams} teams and {args.rounds} rounds.")
    finally:
        _tournament_lock.release()

def cmd_pair(args):
    data, teams = load_tournament()
    
    round_num = args.round
    
    # Check if this round already exists
    if round_num <= len(data['rounds']):
        print(f"Error: Round {round_num} already paired. Re-pairing is not supported.")
        return
        
    # Validation: must be the next sequential round
    expected_round = len(data['rounds']) + 1
    if round_num != expected_round:
        print(f"Error: Expected to pair Round {expected_round}, but got {round_num}.")
        return
    
    # Check that all matches from the most recent existing round have results (unless we're re-pairing it)
    # Special case: Round 2 doesn't need to wait for Round 1 results
    if len(data['rounds']) > 0 and not round_exists and round_num > 2:
        last_round_matches = [m for m in data['matches'] if m['round_num'] == len(data['rounds'])]
        unreported = [m for m in last_round_matches if m['result'] is None]
        if unreported:
            print(f"Error: Cannot pair Round {round_num} until all results from Round {len(data['rounds'])} are reported.")
            print(f"\nUnreported matches from Round {len(data['rounds'])}:")
            for m in unreported:
                print(f"  Match {m['match_id']}: {m['aff_name']} (ID: {m['aff_id']}) vs {m['neg_name']} (ID: {m['neg_id']})")
            return
    
    print(f"Generating pairings for Round {round_num}...")
    
    # Generate pairings
    # Note: pair_round expects 0-indexed round_num
    pairs = pair_round(teams, round_num - 1, use_buchholz=True)
    
    # Display pairings
    print(f"\n--- Pairings for Round {round_num} ---")
    
    next_match_id = data.get('next_match_id', 1)
    
    # Let's do it cleanly:
    # 1. Get existing matches
    existing_matches = data.get('matches', [])
    # 2. Remove any matches for this round (if re-pairing)
    existing_matches = [m for m in existing_matches if m['round_num'] != round_num]
    
    # 3. Add new matches
    round_match_ids = []
    for i, (aff, neg) in enumerate(pairs):
        match_id = next_match_id
        next_match_id += 1
        
        print(f"Match {match_id}: {aff.name} (Aff) vs {neg.name} (Neg)")
        
        match = {
            "match_id": match_id,
            "round_num": round_num,
            "aff_id": aff.id,
            "neg_id": neg.id,
            "aff_name": aff.name,
            "neg_name": neg.name,
            "result": None
        }
        existing_matches.append(match)
        round_match_ids.append(match_id)
        
    data['matches'] = existing_matches
    data['next_match_id'] = next_match_id
    
    round_data = {"round_num": round_num} # No longer storing match_ids here
    data['rounds'].append(round_data)
    
    save_tournament(data, teams) # Lock released in save_tournament
    print(f"\nPairings saved. Use 'report {round_num}' to enter results.")

def _process_match_result(match_id, aff_id, neg_id, outcome, matches, results_map, force, round_num) -> Tuple[bool, str, str]:
    """
    Validates and records a single match result.
    Returns (Success, ErrorCode, ErrorMessage).
    ErrorCode: 'OK', 'MATCH_NOT_FOUND', 'TEAM_MISMATCH', 'OUTCOME_CONFLICT', 'ROUND_MISMATCH'
    """
    # Lookup match globally
    match = next((m for m in matches if m['match_id'] == match_id), None)
    
    if not match:
        return False, 'MATCH_NOT_FOUND', f"Match {match_id} does not exist"
        
    # Validate round number
    if match['round_num'] != round_num:
        if not force:
             return False, 'ROUND_MISMATCH', f"Round mismatch: Match {match_id} is in Round {match['round_num']}, expected {round_num}"
        # If force is True, we allow it, but we should probably warn or handle it.
        # The caller handles the 'force' logic for multi-round updates usually.
        # But here we are validating a single line against an expected round_num.
        # If the user provided a file for Round X, and a line has Round Y, we check that.
        # But here we are checking the MATCH object's round vs the expected round.
        pass

    error_parts = []
    if aff_id is not None and match['aff_id'] != aff_id:
        error_parts.append(f"Aff: expected {match['aff_id']}, got {aff_id}")
    if neg_id is not None and match['neg_id'] != neg_id:
        error_parts.append(f"Neg: expected {match['neg_id']}, got {neg_id}")
        
    if error_parts:
        return False, 'TEAM_MISMATCH', f"Team ID mismatch: {' | '.join(error_parts)}"
        
    winner = outcome.upper()
    if match['result'] is not None:
        if match['result'] == winner:
            return True, 'OK', "Result already matches (idempotent)"
        if not force:
            return False, 'OUTCOME_CONFLICT', f"Outcome conflict: existing={match['result']}, new={winner}"
            
    results_map[match['match_id']] = winner
    return True, 'OK', ""

def _handle_single_match_report(args, matches, results_map, round_num) -> bool:
    success, _, error_msg = _process_match_result(
        args.match_id, args.aff_id, args.neg_id, args.outcome, 
        matches, results_map, args.force, round_num
    )
    
    if not success:
        print(f"Error: {error_msg}")
        if "Outcome conflict" in error_msg:
            print("Use --force to overwrite.")
        return False
        
    match = next(m for m in matches if m['match_id'] == args.match_id)
    print(f"Recording result for Match {match['match_id']}: {match['aff_name']} vs {match['neg_name']} -> {args.outcome.upper()}")
    return True

def _handle_file_report(args, matches, updates_by_round, current_round_num) -> bool:
    # Categories for console summary
    errors_by_type = {
        'MATCH_NOT_FOUND': [],
        'TEAM_MISMATCH': [],
        'OUTCOME_CONFLICT': [],
        'ROUND_MISMATCH': [],
        'INVALID_FORMAT': []
    }
    all_errors = [] # For file annotation: (line_num, line_text, msg)
    valid_count = 0
    
    with open(args.file, 'r') as f:
        for line_num, line in enumerate(f, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
                
            parts = stripped.split()
            if len(parts) < 5:
                msg = "Insufficient fields (need Round MatchID AffID NegID Outcome)"
                errors_by_type['INVALID_FORMAT'].append((line_num, stripped, msg))
                all_errors.append((line_num, stripped, msg))
                continue
                
            try:
                r_num = int(parts[0])
                m_id = int(parts[1])
                aff_id = int(parts[2])
                neg_id = int(parts[3])
                outcome = parts[4].upper()
                
                # Validate round number against current_round_num
                if r_num != current_round_num:
                    if not args.force:
                        msg = f"Round mismatch: expected {current_round_num}, got {r_num} (Use --force to update other rounds)"
                        errors_by_type['ROUND_MISMATCH'].append((line_num, stripped, msg))
                        all_errors.append((line_num, stripped, msg))
                        continue
                
                # Process result
                # We use r_num as the expected round for this specific match
                success, code, error_msg = _process_match_result(
                    m_id, aff_id, neg_id, outcome, 
                    matches, updates_by_round[r_num], args.force, r_num
                )
                
                if success:
                    valid_count += 1
                else:
                    if code in errors_by_type:
                        errors_by_type[code].append((line_num, stripped, error_msg))
                    all_errors.append((line_num, stripped, error_msg))
                    
            except ValueError as e:
                msg = f"Parse error: {str(e)}"
                errors_by_type['INVALID_FORMAT'].append((line_num, stripped, msg))
                all_errors.append((line_num, stripped, msg))
    
    print(f"Processed {valid_count} valid results.")
    
    if all_errors:
        print(f"\n⚠️  Found issues in {args.file}:\n")
        
        if errors_by_type['ROUND_MISMATCH']:
            print(f"❌ Round Mismatch ({len(errors_by_type['ROUND_MISMATCH'])} lines):")
            for line_num, line_text, msg in errors_by_type['ROUND_MISMATCH']:
                print(f"   Line {line_num}: {msg}")
                print(f"   → {line_text}")
            print()

        if errors_by_type['MATCH_NOT_FOUND']:
            print(f"❌ Match ID Not Found ({len(errors_by_type['MATCH_NOT_FOUND'])} lines):")
            for line_num, line_text, msg in errors_by_type['MATCH_NOT_FOUND']:
                print(f"   Line {line_num}: {msg}")
                print(f"   → {line_text}")
            print()
            
        if errors_by_type['TEAM_MISMATCH']:
            print(f"❌ Team ID Mismatch ({len(errors_by_type['TEAM_MISMATCH'])} lines):")
            for line_num, line_text, msg in errors_by_type['TEAM_MISMATCH']:
                print(f"   Line {line_num}: {msg}")
                print(f"   → {line_text}")
            print()
            
        if errors_by_type['OUTCOME_CONFLICT']:
            print(f"⚠️  Outcome Conflicts ({len(errors_by_type['OUTCOME_CONFLICT'])} lines):")
            for line_num, line_text, msg in errors_by_type['OUTCOME_CONFLICT']:
                print(f"   Line {line_num}: {msg}")
                print(f"   → {line_text}")
            print(f"   Use --force to overwrite existing results\n")
            
        if errors_by_type['INVALID_FORMAT']:
            print(f"❌ Invalid Format ({len(errors_by_type['INVALID_FORMAT'])} lines):")
            for line_num, line_text, msg in errors_by_type['INVALID_FORMAT']:
                print(f"   Line {line_num}: {msg}")
                print(f"   → {line_text}")
            print()
            
        # Generate annotated error file
        error_file = args.file.replace('.txt', '_errors.txt')
        if not error_file.endswith('_errors.txt'):
            error_file = args.file + '_errors.txt'
            
        with open(error_file, 'w') as f_out:
            f_out.write(f"# Annotated error file\n")
            f_out.write(f"# Original file: {args.file}\n")
            f_out.write(f"# Only lines with errors are included below.\n")
            f_out.write(f"# Fix the errors and re-run: ./tournament_manager.py report {current_round_num} --file {error_file}\n\n")
            
            for line_num, line_text, msg in all_errors:
                f_out.write(f"{line_text}  # <<< ERROR: {msg}\n")
                
        print(f"\n📝 Annotated error file created: {error_file}")
        
    return True # Always return True as we processed what we could

def _handle_interactive_report(matches, results_map, force, round_num) -> bool:
    # Interactive mode
    print("Enter results (A for Aff win, N for Neg win, skip to ignore):")
    
    # Filter matches for this round
    round_matches = [m for m in matches if m['round_num'] == round_num]
    
    for m in round_matches:
        if m['match_id'] in results_map:
            continue # Already processed in this session
            
        if m['result'] is not None and not force:
            continue # Already has result
            
        prompt = f"Match {m['match_id']}: {m['aff_name']} (Aff) vs {m['neg_name']} (Neg)"
        if m['result']:
            prompt += f" [Current: {m['result']}]"
        prompt += " > "
        
        while True:
            val = input(prompt).strip().upper()
            if not val:
                break
            if val in ['A', 'N']:
                results_map[m['match_id']] = val
                break
            print("Invalid input. Enter A, N, or press Enter to skip.")
            
    return True

def cmd_report(args):
    data, teams = load_tournament()
    round_num = args.round
    
    if round_num > len(data['rounds']):
        print(f"Error: Round {round_num} does not exist.")
        return

    matches = data.get('matches', [])
    
    # Validate previous rounds
    # We want to ensure all matches in rounds 1 to round_num-1 have results
    # unless --force is used? User said "in general want to only support... maybe add a check"
    # Let's make it a strict check unless force is used, or maybe always strict?
    # "maybe add a check" implies we should check.
    
    for r in range(1, round_num):
        # Find matches for round r
        prev_round_matches = [m for m in matches if m['round_num'] == r]
        unreported = [m for m in prev_round_matches if m['result'] is None]
        
        if unreported:
            print(f"Error: Round {r} is not fully reported.")
            print(f"Unreported matches in Round {r}: {', '.join(str(m['match_id']) for m in unreported)}")
            print("You must complete previous rounds before reporting results for Round {round_num}.")
            return

    # Check if results already reported for the current round
    current_round_matches = [m for m in matches if m['round_num'] == round_num]
    if all(m['result'] is not None for m in current_round_matches) and not args.force:
        print(f"Results for Round {round_num} already complete. Use --force to overwrite.")
        return

    print(f"Reporting results for Round {round_num}...")
    
    # Map team IDs to Team objects for easy update
    team_map = {t.id: t for t in teams}
    
    # Track updates for all rounds: round_num -> {match_id -> outcome}
    from collections import defaultdict
    updates_by_round = defaultdict(dict)
    
    # Mode 1: Single match via CLI args
    if args.match_id is not None:
        if not _handle_single_match_report(args, matches, updates_by_round[round_num], round_num):
            return

    # Mode 2: File input
    elif args.file:
        if not _handle_file_report(args, matches, updates_by_round, round_num):
            return
    
    # Mode 3: Interactive
    else:
        if not _handle_interactive_report(matches, updates_by_round[round_num], args.force, round_num):
            return

    # Process results for all affected rounds
    for r_num, updates in updates_by_round.items():
        for match_id, outcome in updates.items():
            # Find match in global list
            match = next((m for m in matches if m['match_id'] == match_id), None)
            if match:
                match['result'] = outcome
                
        if r_num != round_num:
            print(f"Updated results for Round {r_num}.")

    # Re-calculate all derived stats
    recalculate_stats(data, teams, team_map)
    
    # Update current round if completed
    current_round_matches = [m for m in matches if m['round_num'] == round_num]
    if all(m['result'] is not None for m in current_round_matches) and data['current_round'] < round_num:
        data['current_round'] = round_num
        print(f"Round {round_num} completed.")
    save_tournament(data, teams)
    print("Results saved and stats updated.")

def cmd_standings(args):
    data, teams = load_tournament()
    
    # Sort teams
    teams.sort(key=lambda t: (t.score, t.buchholz, t.wins), reverse=True)
    
    print("\n--- Current Standings ---")
    print(f"{'Rank':<5} {'Name':<20} {'Wins':<5} {'Score':<6} {'Buchholz':<8}")
    print("-" * 50)
    
    for i, t in enumerate(teams):
        print(f"{i+1:<5} {t.name:<20} {t.wins:<5} {t.score:<6} {t.buchholz:<8}")

def main():
    parser = argparse.ArgumentParser(description="Swiss Tournament Manager")
    subparsers = parser.add_subparsers(dest="command", help="Subcommands")
    
    # Init
    parser_init = subparsers.add_parser("init", help="Initialize tournament")
    parser_init.add_argument("teams", type=int, help="Number of teams")
    parser_init.add_argument("rounds", type=int, help="Number of rounds")
    parser_init.add_argument("--names", type=str, help="File with team names")
    parser_init.add_argument("--force", action="store_true", help="Overwrite existing tournament")
    
    # Pair
    parser_pair = subparsers.add_parser("pair", help="Generate pairings")
    parser_pair.add_argument("round", type=int, help="Round number to pair")
    
    # Report
    parser_report = subparsers.add_parser("report", help="Report results")
    parser_report.add_argument("round", type=int, help="Round number")
    parser_report.add_argument("match_id", type=int, nargs='?', help="Match ID (optional)")
    parser_report.add_argument("aff_id", type=int, nargs='?', help="Affirmative team ID (optional)")
    parser_report.add_argument("neg_id", type=int, nargs='?', help="Negative team ID (optional)")
    parser_report.add_argument("outcome", type=str, nargs='?', help="Outcome (A/N) (optional)")
    parser_report.add_argument("--file", type=str, help="File with results (format: Round MatchID AffID NegID Outcome)")
    parser_report.add_argument("--force", action="store_true", help="Overwrite existing results")
    
    # Standings
    parser_standings = subparsers.add_parser("standings", help="Show standings")
    
    args = parser.parse_args()
    
    if args.command == "init":
        cmd_init(args)
    elif args.command == "pair":
        cmd_pair(args)
    elif args.command == "report":
        cmd_report(args)
    elif args.command == "standings":
        cmd_standings(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
