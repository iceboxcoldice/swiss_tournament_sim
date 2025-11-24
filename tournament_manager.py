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

def recalculate_stats(data: Dict, teams: List[Team], team_map: Dict[int, Team]):
    """
    Recalculates all team statistics (score, buchholz, wins, etc.) from scratch
    based on all completed rounds in the tournament data.
    This function assumes the _tournament_lock is already held.
    """
    # Reset teams
    for t in teams:
        t.score = 0
        t.buchholz = 0
        t.wins = 0
        t.aff_count = 0
        t.neg_count = 0
        t.last_side = None
        t.side_history = {}
        t.history = []
        t.opponent_history = []

    # Replay all rounds
    for r_data in data['rounds']:
        for p in r_data['pairings']:
            if p['result'] is None:
                continue
                
            aff = team_map[p['aff_id']]
            neg = team_map[p['neg_id']]
            
            # Record matchup
            aff.opponent_history.append(neg.id)
            neg.opponent_history.append(aff.id)
            
            # Sides
            aff.aff_count += 1
            neg.neg_count += 1
            aff.last_side = "Aff"
            neg.last_side = "Neg"
            aff.side_history.setdefault(neg.id, []).append("Aff")
            neg.side_history.setdefault(aff.id, []).append("Neg")
            
            # Result
            if p['result'] == 'A':
                aff.wins += 1
                aff.score += 1
                aff.history.append("W")
                neg.history.append("L")
            elif p['result'] == 'N':
                neg.wins += 1
                neg.score += 1
                neg.history.append("W")
                aff.history.append("L")
    
    # Update Buchholz
    for t in teams:
        buchholz = 0
        for opp_id in t.opponent_history:
            if opp_id != -1: # Assuming -1 is used for byes or non-existent opponents
                opp = team_map.get(opp_id)
                if opp:
                    buchholz += opp.score
        t.buchholz = buchholz

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
        "rounds": [],  # List of round data (pairings, results)
        "teams": [asdict(t) for t in teams]
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
    data, teams = load_tournament() # Lock acquired in load_tournament
    
    round_num = args.round
    
    # Validation
    if round_num != data['current_round'] + 1:
        print(f"Error: Expected to pair Round {data['current_round'] + 1}, but got {round_num}.")
        return
    
    print(f"Generating pairings for Round {round_num}...")
    
    # Generate pairings
    # Note: pair_round expects 0-indexed round_num
    pairs = pair_round(teams, round_num - 1, use_buchholz=True)
    
    # Display pairings
    print(f"\n--- Pairings for Round {round_num} ---")
    pairing_data = []
    for i, (aff, neg) in enumerate(pairs):
        print(f"Match {i+1}: {aff.name} (Aff) vs {neg.name} (Neg)")
        pairing_data.append({
            "match_id": i + 1,
            "aff_id": aff.id,
            "neg_id": neg.id,
            "aff_name": aff.name,
            "neg_name": neg.name,
            "result": None # To be filled in report
        })
    
    # Save round data
    # Check if round entry already exists (re-pairing?)
    if len(data['rounds']) >= round_num:
        print("Warning: Overwriting existing pairings for this round.")
        data['rounds'][round_num-1] = {"round_num": round_num, "pairings": pairing_data}
    else:
        data['rounds'].append({"round_num": round_num, "pairings": pairing_data})
    
    # Don't increment current_round yet, wait for results? 
    # Actually, usually we say we are IN round X.
    # Let's say current_round indicates the last COMPLETED round.
    # So if we pair Round 1, current_round is still 0 until we report results?
    # Or maybe current_round tracks "pairing generated for X".
    # Let's keep current_round as "last fully completed round".
    
    save_tournament(data, teams) # Lock released in save_tournament
    print(f"\nPairings saved. Use 'report {round_num}' to enter results.")

def cmd_report(args):
    data, teams = load_tournament() # Lock acquired in load_tournament
    round_num = args.round
    
    if round_num > len(data['rounds']):
        print(f"Error: Pairings for Round {round_num} have not been generated yet.")
        return
        
    round_data = data['rounds'][round_num-1]
    pairings = round_data['pairings']
    
    # Check if results already reported
    if all(p['result'] is not None for p in pairings) and not args.force:
        print(f"Results for Round {round_num} already complete. Use --force to overwrite.")
        return

    print(f"Reporting results for Round {round_num}...")
    
    # Map team IDs to Team objects for easy update
    team_map = {t.id: t for t in teams}
    
    # If file provided, read from file
    results_map = {}
    
    # Mode 1: Single match via CLI args
    if args.match_id is not None:
        match = next((p for p in pairings if p['match_id'] == args.match_id), None)
        if not match:
            print(f"Error: No match with ID {args.match_id} in Round {round_num}")
            return
        # Optional consistency checks
        if args.aff_id is not None and match['aff_id'] != args.aff_id:
            print(f"Error: Aff ID mismatch for Match {args.match_id} (expected {match['aff_id']}, got {args.aff_id})")
            return
        if args.neg_id is not None and match['neg_id'] != args.neg_id:
            print(f"Error: Neg ID mismatch for Match {args.match_id} (expected {match['neg_id']}, got {args.neg_id})")
            return
        if args.outcome is None:
            print("Error: Outcome (A/N) must be provided for single match mode.")
            return
        winner = args.outcome.upper()
        if match['result'] and not args.force:
            print(f"Error: Result for Match {args.match_id} already recorded. Use --force to overwrite.")
            return
        results_map[match['match_id']] = winner
        print(f"Recording result for Match {match['match_id']}: {match['aff_name']} vs {match['neg_name']} -> {winner}")

    # Mode 2: File input
    elif args.file:
        with open(args.file, 'r') as f:
            for line in f:
                parts = line.strip().split()
                # Expected format: Round MatchID AffID NegID Outcome
                if len(parts) >= 5:
                    try:
                        r_num = int(parts[0])
                        m_id = int(parts[1])
                        aff_id = int(parts[2])
                        neg_id = int(parts[3])
                        outcome = parts[4].upper()
                        if r_num != round_num:
                            print(f"Skipping line (wrong round): {line.strip()}")
                            continue
                        match = next((p for p in pairings if p['match_id'] == m_id), None)
                        if not match:
                            print(f"Error: No match with ID {m_id} in Round {round_num}")
                            continue
                        # Optional consistency checks
                        if match['aff_id'] != aff_id or match['neg_id'] != neg_id:
                            print(f"Error: IDs in line do not match stored pairing for Match {m_id}. Skipping line.")
                            continue
                        results_map[match['match_id']] = outcome
                    except ValueError:
                        print(f"Skipping invalid line: {line.strip()}")
                else:
                    print(f"Skipping invalid format (need Round MatchID AffID NegID Outcome): {line.strip()}")
    
    # Mode 3: Interactive
    else:
        # Interactive mode
        print(f"Enter result for each match in Round {round_num}.")
        print("Format: Winner (A/N). Type 'q' or 'exit' to quit.")
        print("Consistency Check: You must confirm the match details.")
        
        pending_matches = [p for p in pairings if not p['result']]
        print(f"\nPending matches: {len(pending_matches)}")
        
        if len(pending_matches) <= 10 and len(pending_matches) > 0:
            print("Pending matches list:")
            for p in pending_matches:
                print(f"  Match {p['match_id']}: {p['aff_name']} (ID: {p['aff_id']}) vs {p['neg_name']} (ID: {p['neg_id']})")
        
        for p in pairings:
            if p['result'] and not args.force:
                continue
            
            # Skip if we already have a result in this session (though loop iterates pairings, results_map is for new ones)
            if p['match_id'] in results_map:
                continue
                
            while True:
                print(f"\nMatch {p['match_id']}: {p['aff_name']} (ID: {p['aff_id']}) vs {p['neg_name']} (ID: {p['neg_id']})")
                confirm = input(f"Confirm match (Enter 'y' to proceed, 'q' to quit): ").strip().lower()
                
                if confirm in ['q', 'exit']:
                    print("Exiting interactive mode.")
                    # Process whatever we have collected so far
                    break
                
                if confirm != 'y':
                    print("Skipping match.")
                    break
                    
                res = input(f"Winner (A for Aff, N for Neg): ").strip().upper()
                if res in ['Q', 'EXIT']:
                    print("Exiting interactive mode.")
                    break
                    
                if res in ['A', 'N', 'AFF', 'NEG']:
                    results_map[p['match_id']] = res[0] # Store 'A' or 'N'
                    break
                print("Invalid input. Enter 'A' or 'N'.")
            
            if confirm in ['q', 'exit']:
                break

    # Process results
    for p in pairings:
        match_id = p['match_id']
        if match_id in results_map:
            p['result'] = results_map[match_id]

    # Re-calculate all derived stats and persist atomically
    _tournament_lock.acquire()
    try:
        recalculate_stats(data, teams, team_map)
        # Update current round if completed
        if all(p['result'] is not None for p in pairings) and data['current_round'] < round_num:
            data['current_round'] = round_num
            print(f"Round {round_num} completed.")
        save_tournament(data, teams)
    finally:
        _tournament_lock.release()
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
