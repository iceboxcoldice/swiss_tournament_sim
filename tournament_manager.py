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
        sys.exit(1)

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
        sys.exit(1)
        
    # Validation: must be the next sequential round
    expected_round = len(data['rounds']) + 1
    if round_num != expected_round:
        print(f"Error: Expected to pair Round {expected_round}, but got {round_num}.")
        sys.exit(1)
    
    # Check that all matches from the most recent existing round have results (unless we're re-pairing it)
    # Special case: Round 2 doesn't need to wait for Round 1 results
    if len(data['rounds']) > 0 and round_num > 2:
        last_round_matches = [m for m in data['matches'] if m['round_num'] == len(data['rounds'])]
        unreported = [m for m in last_round_matches if m['result'] is None]
        if unreported:
            print(f"Error: Cannot pair Round {round_num} until all results from Round {len(data['rounds'])} are reported.")
            print(f"\nUnreported matches from Round {len(data['rounds'])}:")
            for m in unreported:
                print(f"  Match {m['match_id']}: {m['aff_name']} (ID: {m['aff_id']}) vs {m['neg_name']} (ID: {m['neg_id']})")
            sys.exit(1)
    
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

def _process_match_result(round_id, match_id, aff_id, neg_id, outcome, matches, force) -> Tuple[bool, str, str]:
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
    if match['round_num'] != round_id:
        # Allow idempotent updates: if result already matches, treat as success
        winner = outcome.upper()
        if match['result'] == winner:
            return True, 'OK', "Result already matches (idempotent)"
        return False, 'ROUND_MISMATCH', f"Round mismatch: Match {match_id} is in Round {match['round_num']}, expected {round_id}"

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
            
    match['result'] = winner
    return True, 'OK', ""

def _handle_single_match_report(args, matches) -> bool:
    success, _, error_msg = _process_match_result(
        args.round, args.match_id, args.aff_id, args.neg_id, args.outcome, 
        matches, args.force
    )
    
    if not success:
        print(f"Error: {error_msg}")
        if "Outcome conflict" in error_msg:
            print("Use --force to overwrite.")
        return False
    
    match = next(m for m in matches if m['match_id'] == args.match_id)
    print(f"Recording result for Match {match['match_id']}: {match['aff_name']} vs {match['neg_name']} -> {args.outcome.upper()}")
    return True

def _parse_results_file(filename, matches, force=False):
    """Parse a results file and apply results to matches.
    
    Returns: (valid_count, errors_by_type, all_errors)
    where errors are lists of (line_num, line_text, error_msg) tuples
    """
    errors_by_type = {
        'MATCH_NOT_FOUND': [],
        'TEAM_MISMATCH': [],
        'OUTCOME_CONFLICT': [],
        'ROUND_MISMATCH': [],
        'INVALID_FORMAT': []
    }
    all_errors = []
    valid_count = 0
    
    with open(filename, 'r') as f:
        for line_num, line in enumerate(f, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
            
            # Remove inline comments
            if '#' in stripped:
                stripped = stripped.split('#')[0].strip()
                
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
                
                # Process result
                success, code, error_msg = _process_match_result(
                    r_num, m_id, aff_id, neg_id, outcome, 
                    matches, force
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
    
    return valid_count, errors_by_type, all_errors

def _handle_file_report(args, matches) -> bool:
    # Use shared parsing function
    valid_count, errors_by_type, all_errors = _parse_results_file(args.file, matches, args.force)
    
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
            f_out.write(f"# Fix the errors and re-run: ./tournament_manager.py report {args.round} --file {error_file}\n\n")
            
            for line_num, line_text, msg in all_errors:
                f_out.write(f"{line_text}  # <<< ERROR: {msg}\n")
                
        print(f"\n📝 Annotated error file created: {error_file}")
        return False
        
    return True

def _handle_interactive_report(matches, force, round_num) -> bool:
    # Interactive mode
    print("Enter results (A for Aff win, N for Neg win, skip to ignore):")
    
    # Filter matches for this round
    round_matches = [m for m in matches if m['round_num'] == round_num]
    
    for m in round_matches:
        if m['result'] is not None and not force:
            continue # Already has result
            
        prompt = f"Round {round_num} Match {m['match_id']}: {m['aff_name']} (Aff) vs {m['neg_name']} (Neg)"
        if m['result']:
            prompt += f" [Current: {m['result']}]"
        prompt += " > "
        
        while True:
            val = input(prompt).strip().upper()
            if not val:
                break
            if val in ['A', 'N']:
                m['result'] = val
                break
            print("Invalid input. Enter A, N, or press Enter to skip.")
            
    return True

def cmd_report(args):
    data, teams = load_tournament()
    
    # Handle 'all' as special round specifier for file mode
    if isinstance(args.round, str) and args.round.lower() == 'all':
        if not args.file:
            print("Error: 'all' round specifier is only valid with --file mode.")
            sys.exit(1)
        round_num = 'all'
    else:
        # Convert to int if it's a string number
        try:
            round_num = int(args.round)
        except ValueError:
            print(f"Error: Invalid round specifier '{args.round}'. Use a number or 'all' (with --file).")
            sys.exit(1)
            
        if round_num > len(data['rounds']):
            print(f"Error: Round {round_num} does not exist.")
            sys.exit(1)

    matches = data.get('matches', [])
    
    # Validate previous rounds
    # We want to ensure all matches in rounds 1 to round_num-1 have results
    # unless --force is used? User said "in general want to only support... maybe add a check"
    # Let's make it a strict check unless force is used, or maybe always strict?
    # "maybe add a check" implies we should check.
    
    # Validate previous rounds (skip if round_num is 'all')
    if round_num != 'all':
        for r in range(1, round_num):
            # Find matches for round r
            prev_round_matches = [m for m in matches if m['round_num'] == r]
            unreported = [m for m in prev_round_matches if m['result'] is None]
            
            if unreported:
                print(f"Error: Round {r} is not fully reported.")
                print(f"Unreported matches in Round {r}: {', '.join(str(m['match_id']) for m in unreported)}")
                print(f"You must complete previous rounds before reporting results for Round {round_num}.")
                sys.exit(1)


    if round_num == 'all':
        print(f"Reporting results for all rounds...")
    else:
        print(f"Reporting results for Round {round_num}...")
    
    # Map team IDs to Team objects for easy update
    team_map = {t.id: t for t in teams}
    
    # Mode 1: Single match via CLI args
    if args.match_id is not None:
        if not _handle_single_match_report(args, matches): # Assuming _handle_single_match_report signature is unchanged for this diff
            sys.exit(1)
    # Mode 2: File input
    elif args.file:
        _handle_file_report(args, matches)
    # Mode 3: Interactive
    else:
        if not _handle_interactive_report(matches, args.force, round_num): # Assuming _handle_interactive_report signature is unchanged for this diff
            sys.exit(1)


    # Re-calculate all derived stats
    recalculate_stats(data, teams, team_map)
    
    # Update current round if completed (skip for 'all' mode)
    if round_num != 'all':
        current_round_matches = [m for m in matches if m['round_num'] == round_num]
        if all(m['result'] is not None for m in current_round_matches) and data['current_round'] < round_num:
            data['current_round'] = round_num
            print(f"Round {round_num} completed.")
    else:
        # For 'all' mode, update current_round to highest complete round
        for r in range(1, len(data['rounds']) + 1):
            round_matches = [m for m in matches if m['round_num'] == r]
            if all(m['result'] is not None for m in round_matches):
                data['current_round'] = r
            else:
                break
    
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

def cmd_export(args):
    data, teams = load_tournament()
    
    matches = data.get('matches', [])
    
    if not matches:
        print("No matches to export.")
        return
    
    # Filter to only matches with results
    reported_matches = [m for m in matches if m['result'] is not None]
    
    # Sort by round for cleaner output
    reported_matches.sort(key=lambda m: (m['round_num'], m['match_id']))
    
    output_file = args.output if args.output else "results_export.txt"
    
    # Always create results file (even if no results yet) to serve as template
    with open(output_file, 'w') as f:
        f.write("# Exported results from tournament\n")
        f.write("# Format: Round MatchID AffID NegID Outcome\n")
        f.write("# Outcome: A (Aff wins) or N (Neg wins)\n")
        f.write("# Uncomment and edit lines below to report results\n\n")
        
        all_matches_sorted = sorted(matches, key=lambda m: (m['round_num'], m['match_id']))
        
        current_round = None
        for m in all_matches_sorted:
            if current_round != m['round_num']:
                current_round = m['round_num']
                f.write(f"\n# Round {current_round}\n")
            
            if m['result']:
                # Already reported - write as active line
                f.write(f"{m['round_num']} {m['match_id']} {m['aff_id']} {m['neg_id']} {m['result']}\n")
            else:
                # Not reported - write as commented template
                f.write(f"# {m['round_num']} {m['match_id']} {m['aff_id']} {m['neg_id']} A_or_N  # {m['aff_name']} vs {m['neg_name']}\n")
    
    if reported_matches:
        print(f"Exported {len(reported_matches)} results to {output_file}")
    else:
        print(f"Created results template in {output_file} (no results reported yet)")
    
    if len(matches) > len(reported_matches):
        unreported_count = len(matches) - len(reported_matches)
        print(f"  ({unreported_count} unreported match{'es' if unreported_count != 1 else ''} included as commented templates)")
    
    # Export pairings file (all matches, not just reported)
    all_matches = sorted(matches, key=lambda m: (m['round_num'], m['match_id']))
    
    pairings_file = output_file.replace('.txt', '_pairings.txt')
    if not pairings_file.endswith('_pairings.txt'):
        pairings_file = output_file.replace('.txt', '') + '_pairings.txt'
    
    with open(pairings_file, 'w') as f:
        f.write("# Tournament Pairings\n")
        f.write("# Format: Round MatchID | Aff Team vs Neg Team | Result\n\n")
        
        current_round = None
        for m in all_matches:
            if current_round != m['round_num']:
                current_round = m['round_num']
                f.write(f"\n{'='*70}\n")
                f.write(f"Round {current_round}\n")
                f.write(f"{'='*70}\n\n")
            
            if m['result']:
                result_str = f"Winner: {m['result']}"
            else:
                result_str = "Not reported"
            f.write(f"Match {m['match_id']:2d} | {m['aff_name']:20s} (Aff) vs {m['neg_name']:20s} (Neg) | {result_str}\n")
    
    print(f"Exported pairings to {pairings_file}")

def cmd_reinit(args):
    """Reconstruct tournament from pairing and results files."""
    import re
    
    # Check if tournament exists
    if os.path.exists(TOURNAMENT_FILE) and not args.force:
        print(f"Error: {TOURNAMENT_FILE} already exists. Use --force to overwrite.")
        sys.exit(1)
    
    # Parse pairing file
    print("Parsing pairing file...")
    if not os.path.exists(args.pairings):
        print(f"Error: Pairing file '{args.pairings}' not found.")
        sys.exit(1)
    
    matches = []
    team_ids = set()
    match_ids = set()
    rounds_seen = set()
    
    with open(args.pairings, 'r') as f:
        for line_num, line in enumerate(f, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith('#'):
                continue
            
            # Parse format: Round MatchID AffID NegID [# comment]
            # Remove inline comments
            if '#' in stripped:
                stripped = stripped.split('#')[0].strip()
            
            parts = stripped.split()
            if len(parts) < 4:
                print(f"Error: Invalid format in pairing file at line {line_num}")
                print(f"  Expected: Round MatchID AffID NegID")
                print(f"  Got: {line.strip()}")
                sys.exit(1)
            
            try:
                round_num = int(parts[0])
                match_id = int(parts[1])
                aff_id = int(parts[2])
                neg_id = int(parts[3])
            except ValueError as e:
                print(f"Error: Invalid number in pairing file at line {line_num}: {e}")
                sys.exit(1)
            
            # Validation
            if match_id in match_ids:
                print(f"Error: Duplicate match ID {match_id} in pairing file at line {line_num}")
                sys.exit(1)
            
            match_ids.add(match_id)
            team_ids.add(aff_id)
            team_ids.add(neg_id)
            rounds_seen.add(round_num)
            
            matches.append({
                'match_id': match_id,
                'round_num': round_num,
                'aff_id': aff_id,
                'neg_id': neg_id,
                'result': None
            })
    
    if not matches:
        print("Error: No matches found in pairing file.")
        sys.exit(1)
    
    # Validate sequential rounds
    sorted_rounds = sorted(rounds_seen)
    for i, r in enumerate(sorted_rounds, 1):
        if r != i:
            print(f"Error: Non-sequential round numbers. Expected round {i}, found round {r}.")
            sys.exit(1)
    
    num_teams = max(team_ids) + 1
    num_rounds = max(rounds_seen)
    
    print(f"  Found {len(matches)} matches across {num_rounds} rounds")
    print(f"  Detected {num_teams} teams (IDs 0-{num_teams-1})")
    
    # Parse results file (optional)
    results_count = 0
    if args.results:
        print(f"\nParsing results file...")
        if not os.path.exists(args.results):
            print(f"Error: Results file '{args.results}' not found.")
            sys.exit(1)
        
        # Use shared parsing function
        results_count, errors_by_type, all_errors = _parse_results_file(args.results, matches, force=False)
        
        print(f"  Applied {results_count} results")
        
        # If there are errors, generate error file and exit
        if all_errors:
            print(f"\n⚠️  Found {len(all_errors)} issue(s) in results file:\n")
            
            # Print error summary (show first 3 of each type)
            for error_type, errors in errors_by_type.items():
                if errors:
                    type_name = error_type.replace('_', ' ').title()
                    print(f"❌ {type_name} ({len(errors)} lines):")
                    for line_num, line_text, msg in errors[:3]:
                        print(f"   Line {line_num}: {msg}")
                        print(f"   → {line_text}")
                    if len(errors) > 3:
                        print(f"   ... and {len(errors) - 3} more")
                    print()
            
            # Generate annotated error file
            error_file = args.results.replace('.txt', '_errors.txt')
            with open(error_file, 'w') as f_out:
                f_out.write(f"# Errors found in {args.results}\n")
                f_out.write(f"# Total errors: {len(all_errors)}\n\n")
                
                with open(args.results, 'r') as f_in:
                    error_map = {line_num: msg for line_num, _, msg in all_errors}
                    for line_num, line in enumerate(f_in, 1):
                        if line_num in error_map:
                            f_out.write(f"# ERROR: {error_map[line_num]}\n")
                        f_out.write(line)
            
            print(f"Annotated error file created: {error_file}")
            print(f"\nReinit aborted due to errors in results file.")
            sys.exit(1)
    
    # Create teams with default names
    print(f"\nCreating tournament with {num_teams} teams and {num_rounds} rounds...")
    teams = []
    
    # Load team names if provided
    team_names = []
    if args.names:
        if not os.path.exists(args.names):
            print(f"Warning: Names file '{args.names}' not found. Using default names.")
        else:
            with open(args.names, 'r') as f:
                team_names = [line.strip() for line in f if line.strip()]
    
    for i in range(num_teams):
        if i < len(team_names):
            name = team_names[i]
        else:
            name = f"Team {i+1}"
        teams.append(Team(id=i, true_rank=0, name=name))
    
    # Add team names to matches
    team_map = {t.id: t for t in teams}
    for m in matches:
        m['aff_name'] = team_map[m['aff_id']].name
        m['neg_name'] = team_map[m['neg_id']].name
    
    # Create tournament data structure
    data = {
        "config": {
            "num_teams": num_teams,
            "num_rounds": num_rounds,
        },
        "current_round": 0,
        "rounds": [{"round_num": r} for r in range(1, num_rounds + 1)],
        "teams": [asdict(t) for t in teams],
        "matches": matches,
        "next_match_id": max(match_ids) + 1
    }
    
    # Recalculate statistics
    print("Recalculating statistics...")
    recalculate_stats(data, teams, team_map)
    
    # Update current_round based on completed rounds
    for r in range(1, num_rounds + 1):
        round_matches = [m for m in matches if m['round_num'] == r]
        if all(m['result'] is not None for m in round_matches):
            data['current_round'] = r
        else:
            break
    
    # Save tournament
    data['teams'] = [asdict(t) for t in teams]
    with open(TOURNAMENT_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n✅ Tournament reconstructed successfully!")
    print(f"   Teams: {num_teams}")
    print(f"   Rounds: {num_rounds}")
    print(f"   Matches: {len(matches)}")
    print(f"   Results: {results_count}")
    print(f"   Current round: {data['current_round']}")

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
    parser_report.add_argument("round", help="Round number (or 'all' for file mode to process all rounds)")
    parser_report.add_argument("match_id", type=int, nargs='?', help="Match ID (optional)")
    parser_report.add_argument("aff_id", type=int, nargs='?', help="Affirmative team ID (optional)")
    parser_report.add_argument("neg_id", type=int, nargs='?', help="Negative team ID (optional)")
    parser_report.add_argument("outcome", type=str, nargs='?', help="Outcome (A/N) (optional)")
    parser_report.add_argument("--file", type=str, help="File with results (format: Round MatchID AffID NegID Outcome)")
    parser_report.add_argument("--force", action="store_true", help="Overwrite existing results")
    
    # Standings
    parser_standings = subparsers.add_parser("standings", help="Show standings")
    
    # Export
    parser_export = subparsers.add_parser("export", help="Export results to file")
    parser_export.add_argument("--output", "-o", type=str, help="Output file (default: results_export.txt)")
    
    # Reinit
    parser_reinit = subparsers.add_parser("reinit", help="Reconstruct tournament from pairing and results files")
    parser_reinit.add_argument("--pairings", "-p", type=str, required=True, help="Pairing file (format: Round MatchID AffID NegID)")
    parser_reinit.add_argument("--results", "-r", type=str, help="Results file (optional, format: Round MatchID AffID NegID Outcome)")
    parser_reinit.add_argument("--names", type=str, help="File with team names (one per line, indexed by team ID)")
    parser_reinit.add_argument("--force", action="store_true", help="Overwrite existing tournament")
    
    args = parser.parse_args()
    
    if args.command == "init":
        cmd_init(args)
    elif args.command == "pair":
        cmd_pair(args)
    elif args.command == "report":
        cmd_report(args)
    elif args.command == "standings":
        cmd_standings(args)
    elif args.command == "export":
        cmd_export(args)
    elif args.command == "reinit":
        cmd_reinit(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
