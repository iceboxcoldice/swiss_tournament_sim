#!/usr/bin/env python3
"""CLI entrypoint for Swiss Tournament Manager."""

import argparse
import json
import os
import sys
from dataclasses import asdict

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
for p in (BACKEND_DIR, PROJECT_ROOT, os.path.join(PROJECT_ROOT, 'simulation')):
    if p not in sys.path:
        sys.path.insert(0, p)

import tournament_manager as tm

def cmd_init(args):
    if os.path.exists(tm.TOURNAMENT_FILE) and not args.force:
        print(f"Error: {tm.TOURNAMENT_FILE} already exists. Use --force to overwrite.")
        sys.exit(1)

    teams = []
    if args.teams_file:
        with open(args.teams_file, 'r') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                # Format: TeamID, tm.Team Name, Institution, Member1, Member2, ... OR just tm.Team Name
                parts = [p.strip() for p in line.split(',')]
                try:
                    if len(parts) == 1:
                        team_id = len(teams)
                        name = parts[0]
                        institution = None
                        members = []
                    elif parts[0].isdigit():
                        team_id = int(parts[0])
                        name = parts[1]
                        institution = parts[2] if len(parts) > 2 else None
                        members = parts[3:] if len(parts) > 3 else []
                    else:
                        team_id = len(teams)
                        name = parts[0]
                        institution = parts[1] if len(parts) > 1 else None
                        members = parts[2:] if len(parts) > 2 else []
                    
                    team = tm.Team(id=team_id, true_rank=0, name=name, members=members)
                    if institution:
                        team.institution = institution
                    teams.append(team)
                except Exception as e:
                    print(f"Warning: Invalid team entry on line {line_num}: {line} ({e})")
                    continue
        
        # Sort by ID to ensure correct order
        teams.sort(key=lambda t: t.id)
        
        # Verify we have the expected number of teams
        if len(teams) != args.num_teams:
            print(f"Warning: Found {len(teams)} teams in file, expected {args.num_teams}")
        
        print(f"Loaded {len(teams)} teams from {args.teams_file}")
    else:
        for i in range(args.num_teams):
            teams.append(tm.Team(id=i, true_rank=0, name=f"tm.Team {i+1}"))

    # Load judges if judges file provided
    judges = []
    if args.judges:
        with open(args.judges, 'r') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                # Format: JudgeID, Name, Institution
                parts = [p.strip() for p in line.split(',')]
                if len(parts) < 2:
                    print(f"Warning: Invalid judge entry on line {line_num}: {line}")
                    continue
                
                try:
                    judge_id = int(parts[0])
                    name = parts[1]
                    institution = parts[2] if len(parts) > 2 else "Unknown"
                    
                    judges.append({
                        'id': judge_id,
                        'name': name,
                        'institution': institution
                    })
                except ValueError:
                    print(f"Warning: Invalid judge ID on line {line_num}: {line}")
                    continue
        
        print(f"Loaded {len(judges)} judges from {args.judges}")

    data = {
        "config": {
            "num_teams": args.num_teams,
            "num_rounds": args.rounds,
            "num_elim_rounds": args.elim_rounds,
            "pairing_scheme": getattr(args, 'pairing_scheme', 'high-low'),
        },
        "current_round": 0,
        "rounds": [],  # List of round data (match_ids)
        "teams": [asdict(t) for t in teams], # Initial team data
        "judges": judges,  # List of judge data
        "matches": [], # Global list of all matches
        "next_match_id": 1 # Counter for unique match IDs
    }
    
    # Acquire the thread lock before writing
    tm._tournament_lock.acquire()
    try:
        with open(tm.TOURNAMENT_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Initialized tournament with {args.num_teams} teams and {args.rounds} rounds.")
    finally:
        tm._tournament_lock.release()


def cmd_pair(args):
    data, teams = tm.load_tournament()
    round_num = args.round
    pairing_scheme = getattr(args, 'pairing_scheme', None)
    
    try:
        pairs = tm.pair_round_logic(data, teams, round_num, pairing_scheme=pairing_scheme)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    print(f"Generating pairings for Round {round_num}...")
    print(f"\n--- Pairings for Round {round_num} ---")
    
    next_match_id = data.get('next_match_id', 1)
    
    # Let's do it cleanly:
    # 1. Get existing matches
    existing_matches = data.get('matches', [])
    # 2. Remove any matches for this round (if re-pairing)
    existing_matches = [m for m in existing_matches if m['round_num'] != round_num]
    
    # 3. Add new matches (with Tabroom room & flight scheduling)
    rooms = data.get('rooms') or data.get('config', {}).get('rooms', [])
    num_flights = data.get('config', {}).get('num_flights', 1)
    is_flighted = num_flights > 1 or data.get('config', {}).get('flighted', False)
    debate_matches_count = len([p for p in pairs if p[1] is not None])
    flight_size = ((debate_matches_count + 1) // 2) if is_flighted else debate_matches_count
    debate_index = 0

    round_match_ids = []
    for i, (aff, neg) in enumerate(pairs):
        match_id = next_match_id
        next_match_id += 1
        
        if neg is None:
            print(f"Match {match_id}: {aff.name} (BYE)")
            match = {
                "match_id": match_id,
                "round_num": round_num,
                "aff_id": aff.id,
                "neg_id": -1,
                "aff_name": aff.name,
                "neg_name": "BYE",
                "result": "A",
                "judge_id": None,
                "is_bye": True,
                "flight": 1,
                "room": "BYE"
            }
        else:
            flight = 1
            room_idx = debate_index
            if is_flighted:
                flight = 1 if debate_index < flight_size else 2
                room_idx = debate_index if debate_index < flight_size else (debate_index - flight_size)
            room_name = rooms[room_idx % len(rooms)] if rooms else f"Room {room_idx + 1}"
            debate_index += 1

            flight_label = f" (Flight { 'A' if flight == 1 else 'B' }, {room_name})" if is_flighted else f" ({room_name})"
            print(f"Match {match_id}: {aff.name} (Aff) vs {neg.name} (Neg){flight_label}")
            match = {
                "match_id": match_id,
                "round_num": round_num,
                "aff_id": aff.id,
                "neg_id": neg.id,
                "aff_name": aff.name,
                "neg_name": neg.name,
                "result": None,
                "judge_id": None,
                "flight": flight,
                "room": room_name
            }
        existing_matches.append(match)
        round_match_ids.append(match_id)
        
    data['matches'] = existing_matches
    data['next_match_id'] = next_match_id
    
    effective_scheme = pairing_scheme or data['config'].get('pairing_scheme', 'high-low')
    round_data = {"round_num": round_num, "pairing_scheme": effective_scheme}
    data['rounds'].append(round_data)
    
    tm.save_tournament(data, teams) # Lock released in tm.save_tournament
    print(f"\nPairings saved. Use 'report {round_num}' to enter results.")


def _handle_single_match_report(args, matches) -> bool:
    try:
        round_num = int(args.round)
    except ValueError:
        print(f"Error: Invalid round number '{args.round}'")
        return False
        
    # Parse speaker points if provided via args (not implemented in CLI args yet, but placeholder)
    speaker_points = None
        
    success, _, error_msg = tm._process_match_result(
        round_num, args.match_id, args.aff_id, args.neg_id, args.outcome, 
        matches, args.force, getattr(args, 'judge_id', None), speaker_points
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
            if len(parts) < 6:
                msg = "Insufficient fields (need Round MatchID AffID NegID Outcome JudgeID [Aff1 Aff2 Neg1 Neg2])"
                errors_by_type['INVALID_FORMAT'].append((line_num, stripped, msg))
                all_errors.append((line_num, stripped, msg))
                continue
                
            try:
                r_num = int(parts[0])
                m_id = int(parts[1])
                aff_id = int(parts[2])
                neg_id = int(parts[3])
                outcome = parts[4].upper()
                judge_id = int(parts[5])
                
                # Treat -1 as "no judge"
                if judge_id == -1:
                    judge_id = None
                
                speaker_points = None
                
                # Check for speaker points (4 additional columns)
                if len(parts) >= 10:
                    try:
                        sps = []
                        for x in parts[6:10]:
                            if x.lower() == 'null':
                                sps.append(None)
                            else:
                                sps.append(float(x))
                                
                        speaker_points = {
                            'affPoints': [sps[0], sps[1]],
                            'negPoints': [sps[2], sps[3]]
                        }
                    except ValueError:
                        msg = "Invalid speaker points format (must be 4 numeric values or 'null')"
                        errors_by_type['INVALID_FORMAT'].append((line_num, stripped, msg))
                        all_errors.append((line_num, stripped, msg))
                        continue
                elif len(parts) > 6:
                    # Extra columns but not enough for speaker points
                    msg = f"Invalid format: expected 6 or 10 columns, got {len(parts)}"
                    errors_by_type['INVALID_FORMAT'].append((line_num, stripped, msg))
                    all_errors.append((line_num, stripped, msg))
                    continue
                
                # Process result
                success, code, error_msg = tm._process_match_result(
                    r_num, m_id, aff_id, neg_id, outcome, 
                    matches, force, judge_id=judge_id, speaker_points=speaker_points
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
            print(f"❌ tm.Team ID Mismatch ({len(errors_by_type['TEAM_MISMATCH'])} lines):")
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
    data, teams = tm.load_tournament()
    
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
    
    # Map team IDs to tm.Team objects for easy update
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
    tm.recalculate_stats(data, teams, team_map)
    
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
    
    tm.save_tournament(data, teams)
    print("Results saved and stats updated.")

def cmd_standings(args):
    data, teams = tm.load_tournament()
    
    if args.round:
        import copy
        # Work on a copy to avoid affecting the original objects (even if they are local)
        teams_copy = copy.deepcopy(teams)
        team_map = {t.id: t for t in teams_copy}
        tm.recalculate_stats(data, teams_copy, team_map, max_round=args.round)
        teams = teams_copy
        print(f"\n--- Standings after Round {args.round} ---")
    else:
        print("\n--- Current Standings ---")
    
    # Sort teams
    teams.sort(key=lambda t: (t.score, t.buchholz, t.wins), reverse=True)
    print(f"{'Rank':<5} {'Name':<20} {'Wins':<5} {'Score':<6} {'Buchholz':<8}")
    print("-" * 50)
    
    for i, t in enumerate(teams):
        print(f"{i+1:<5} {t.name:<20} {t.wins:<5} {t.score:<6} {t.buchholz:<8}")

def cmd_export(args):
    data, teams = tm.load_tournament()
    
    matches = data.get('matches', [])
    judges = data.get('judges', [])
    
    # Create judge lookup map
    judge_map = {j['id']: j for j in judges}
    
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
        f.write("# Format: Round MatchID AffID NegID Outcome JudgeID [Aff1 Aff2 Neg1 Neg2]\n")
        f.write("# JudgeID: Use -1 if no judge assigned\n")
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
                # Always include judge_id (-1 if none)
                judge_id = m.get('judge_id') if m.get('judge_id') is not None else -1
                line = f"{m['round_num']} {m['match_id']} {m['aff_id']} {m['neg_id']} {m['result']} {judge_id}"
                
                if m.get('speaker_points'):
                    sp = m['speaker_points']
                    # Format: Aff1 Aff2 Neg1 Neg2
                    a1 = sp['affPoints'][0] if sp['affPoints'][0] is not None else "null"
                    a2 = sp['affPoints'][1] if sp['affPoints'][1] is not None else "null"
                    n1 = sp['negPoints'][0] if sp['negPoints'][0] is not None else "null"
                    n2 = sp['negPoints'][1] if sp['negPoints'][1] is not None else "null"
                    line += f" {a1} {a2} {n1} {n2}"
                
                # Add comment with team names and judge name
                comment = f"  # {m['aff_name']} vs {m['neg_name']}"
                if judge_id != -1 and judge_id in judge_map:
                    judge = judge_map[judge_id]
                    comment += f" | Judge: {judge['name']}"
                line += comment
                    
                f.write(line + "\n")
            else:
                # Not reported - write as commented template
                f.write(f"# {m['round_num']} {m['match_id']} {m['aff_id']} {m['neg_id']} A_or_N -1  # {m['aff_name']} vs {m['neg_name']}\n")
    
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
        f.write("# Format: Round MatchID | Aff tm.Team vs Neg tm.Team | Result\n\n")
        
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
    if os.path.exists(tm.TOURNAMENT_FILE) and not args.force:
        print(f"Error: {tm.TOURNAMENT_FILE} already exists. Use --force to overwrite.")
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
                'result': None,
                'judge_id': None
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
            name = f"tm.Team {i+1}"
        teams.append(tm.Team(id=i, true_rank=0, name=name))
    
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
    tm.recalculate_stats(data, teams, team_map)
    
    # Update current_round based on completed rounds
    for r in range(1, num_rounds + 1):
        round_matches = [m for m in matches if m['round_num'] == r]
        if all(m['result'] is not None for m in round_matches):
            data['current_round'] = r
        else:
            break
    
    # Save tournament
    data['teams'] = [asdict(t) for t in teams]
    with open(tm.TOURNAMENT_FILE, 'w') as f:
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
    parser_init.add_argument('num_teams', type=int, help='Number of teams')
    parser_init.add_argument('rounds', type=int, help='Number of preliminary rounds')
    parser_init.add_argument('--elim-rounds', type=int, default=0, help='Number of elimination rounds (default: 0)')
    parser_init.add_argument('--pairing-scheme', choices=['high-low', 'high-high', 'random'], default='high-low', help='Swiss pairing scheme for power-matched rounds (default: high-low)')
    parser_init.add_argument('--teams', '--names', dest='teams_file', type=str, help='File containing team info (format: TeamID, Name, Institution, Member1, Member2, ...)')
    parser_init.add_argument('--judges', type=str, help='File containing judge info (format: JudgeID, Name, Institution)')
    parser_init.add_argument('--force', action='store_true', help='Overwrite existing tournament')
    
    # Pair
    parser_pair = subparsers.add_parser("pair", help="Generate pairings")
    parser_pair.add_argument("round", type=int, help="Round number to pair")
    parser_pair.add_argument("--pairing-scheme", "--scheme", choices=['high-low', 'high-high', 'random'], default=None, help="Pairing mode for this round (default: use tournament setting)")
    
    # Report
    parser_report = subparsers.add_parser("report", help="Report results")
    parser_report.add_argument("round", help="Round number (or 'all' for file mode to process all rounds)")
    parser_report.add_argument("match_id", type=int, nargs='?', help="Match ID (optional)")
    parser_report.add_argument("aff_id", type=int, nargs='?', help="Affirmative team ID (optional)")
    parser_report.add_argument("neg_id", type=int, nargs='?', help="Negative team ID (optional)")
    parser_report.add_argument("outcome", type=str, nargs='?', help="Outcome (A/N) (optional)")
    parser_report.add_argument("--judge-id", type=int, help="Judge ID (optional)")
    parser_report.add_argument("--file", type=str, help="File with results (format: Round MatchID AffID NegID Outcome)")
    parser_report.add_argument("--force", action="store_true", help="Overwrite existing results")
    
    # Standings
    parser_standings = subparsers.add_parser("standings", help="Show standings")
    parser_standings.add_argument("round", type=int, nargs='?', help="Show standings after specific round (optional)")
    
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
