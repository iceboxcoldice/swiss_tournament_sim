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

import json
import os
import sys
import threading
from dataclasses import asdict
from typing import List, Dict, Any, Callable, Tuple, Optional, Union

# Ensure simulation and backend directories are accessible
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
for p in (BACKEND_DIR, PROJECT_ROOT, os.path.join(PROJECT_ROOT, 'simulation')):
    if p not in sys.path:
        sys.path.insert(0, p)

# Import Team and pairing logic from swiss_sim
try:
    from simulation.swiss_sim import Team, pair_round
except ImportError:
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
    
    return _reconstruct_teams(data)

def _reconstruct_teams(data):
    # Reconstruct Team objects
    teams = []
    for t_data in data['teams']:
        # Convert list back to set for opponents if needed, but Team class uses set
        # We need to handle the conversion carefully
        t = Team(id=t_data['id'], true_rank=t_data.get('true_rank', 0), name=t_data.get('name', ''))
        t.score = t_data.get('score', 0.0)
        t.buchholz = t_data.get('buchholz', 0.0)
        t.wins = t_data.get('wins', 0)
        t.aff_count = t_data.get('aff_count', 0)
        t.neg_count = t_data.get('neg_count', 0)
        t.last_side = t_data.get('last_side')
        t.side_history = t_data.get('side_history', [])
        t.history = t_data.get('history', [])
        t.opponent_history = t_data.get('opponent_history', [])
        t.break_seed = t_data.get('break_seed')
        t.members = t_data.get('members', [])
        t.institution = t_data.get('institution')
        t.speaker_points_history = t_data.get('speaker_points_history', [])
        t.bye_rounds = t_data.get('bye_rounds', [])
        t.is_dropped = t_data.get('is_dropped', False)
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

def recalculate_stats(data, teams, team_map, max_round=None):
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
        t.speaker_points_history = [] # Reset and rebuild from matches
        t.bye_rounds = []

    # Re-process all matches
    # Use sorted() to avoid modifying the original list order in data
    matches = sorted(data.get('matches', []), key=lambda m: m['round_num'])
    
    for match in matches:
        if max_round is not None and match['round_num'] > max_round:
            continue
            
        # Handle BYE match
        if match.get('is_bye') or match.get('neg_id') == -1:
            aff = team_map.get(match['aff_id'])
            if aff:
                aff.wins += 1
                aff.score += 1.0
                aff.history.append("W")
                aff.opponent_history.append(-1)
                if not hasattr(aff, 'bye_rounds') or aff.bye_rounds is None:
                    aff.bye_rounds = []
                aff.bye_rounds.append(match['round_num'])
            continue
            
        # Rebuild speaker points history regardless of result
        if 'speaker_points' in match and match['speaker_points']:
            sp = match['speaker_points']
            aff = team_map[match['aff_id']]
            neg = team_map[match['neg_id']]
            
            aff.speaker_points_history.append({
                'round': match['round_num'],
                'points': sp['affPoints']
            })
            neg.speaker_points_history.append({
                'round': match['round_num'],
                'points': sp['negPoints']
            })

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

def get_preliminary_standings(data, teams) -> List[Team]:
    """
    Calculates standings based ONLY on preliminary rounds.
    Returns a list of Team objects with stats calculated from prelim rounds.
    """
    import copy
    num_prelim_rounds = data['config']['num_rounds']
    
    # Create deep copies of teams to avoid modifying global state
    prelim_teams = copy.deepcopy(teams)
    team_map = {t.id: t for t in prelim_teams}
    
    # Calculate stats using only preliminary rounds
    recalculate_stats(data, prelim_teams, team_map, max_round=num_prelim_rounds)
    
    # Sort by standard stats (score, buchholz, wins)
    # Note: recalculate_stats already sorts them, but let's be explicit if needed.
    # Actually recalculate_stats sorts by (score, buchholz, -true_rank).
    # We might want to ensure consistent sorting.
    # The original get_preliminary_standings sorted by (prelim_score, prelim_buchholz, prelim_wins).
    # recalculate_stats sorts by (score, buchholz, -true_rank).
    # Let's re-sort to match the expected criteria if different, or rely on recalculate_stats.
    # Standard Swiss uses score, buchholz, wins usually.
    # Let's stick to recalculate_stats sorting which is consistent with the rest of the app.
    
    return prelim_teams

def determine_sides(t1: Team, t2: Team, matches: List[Dict], is_swappable: bool) -> Tuple[Team, Team]:
    """
    Determines side assignment for elimination rounds.
    Logic:
    1. If swappable (met once before): Force swap.
    2. If met > 1: Coin toss.
    3. If never met: Respect side preference (balance).
    """
    import random
    
    # Check history
    history_matches = [m for m in matches if (m['aff_id'] == t1.id and m['neg_id'] == t2.id) or (m['aff_id'] == t2.id and m['neg_id'] == t1.id)]
    
    if is_swappable and len(history_matches) == 1:
        # Force swap
        prev = history_matches[0]
        if prev['aff_id'] == t1.id:
            return t2, t1 # t1 was Aff, now Neg
        else:
            return t1, t2 # t1 was Neg, now Aff
            
    if len(history_matches) >= 2:
        # Coin toss
        return (t1, t2) if random.random() < 0.5 else (t2, t1)
        
    # Never met (or logic falls through): Side preference
    # Calculate preference score: Neg - Aff (higher means wants Aff)
    # Add bias for last side? JS does +/- 2.
    
    def get_pref(t):
        pref = t.neg_count - t.aff_count
        if t.last_side == 'Neg':
            pref += 2.0
        elif t.last_side == 'Aff':
            pref -= 2.0
        return pref
        
    p1 = get_pref(t1)
    p2 = get_pref(t2)
    
    if p1 > p2:
        return t1, t2
    if p2 > p1:
        return t2, t1
        
    # Equal preference -> Coin toss
    return (t1, t2) if random.random() < 0.5 else (t2, t1)

def generate_elim_pairings(data, teams, round_num) -> List[Tuple[Team, Team]]:
    num_prelim_rounds = data['config']['num_rounds']
    num_elim_rounds = data['config'].get('num_elim_rounds', 0)
    elim_round_idx = round_num - num_prelim_rounds
    
    break_size = 2 ** num_elim_rounds
    
    if elim_round_idx == 1:
        # First elim round: Seed based on prelims
        prelim_standings = get_preliminary_standings(data, teams)
        
        # Take top N active (non-dropped) teams
        active_teams_prelim = [pt for pt in prelim_standings if not getattr(pt, 'is_dropped', False)][:break_size]
        
        # Map back to actual Team objects (to persist break_seed)
        active_teams = []
        for i, pt in enumerate(active_teams_prelim):
            real_team = next(t for t in teams if t.id == pt.id)
            real_team.break_seed = i + 1
            active_teams.append(real_team)
            
        # Pair highest vs lowest (1 vs 8, 2 vs 7...)
        pairs = []
        num_pairs = len(active_teams) // 2
        for i in range(num_pairs):
            high = active_teams[i]
            low = active_teams[len(active_teams) - 1 - i]
            pairs.append((high, low))

        # Reorder pairs for standard bracket flow so top seeds converge in finals
        # Standard 8-team: 1v8, 4v5, 3v6, 2v7
        if break_size == 8 and len(pairs) == 4:
            pairs = [pairs[0], pairs[3], pairs[2], pairs[1]]
        elif break_size == 16 and len(pairs) == 8:
            pairs = [pairs[0], pairs[7], pairs[3], pairs[4], pairs[1], pairs[6], pairs[2], pairs[5]]
            
    else:
        # Subsequent rounds: Winners from previous round
        prev_round = round_num - 1
        prev_matches = [m for m in data['matches'] if m['round_num'] == prev_round]
        
        # Sort matches by match_id to maintain bracket order
        prev_matches.sort(key=lambda m: m['match_id'])
        
        winners = []
        for m in prev_matches:
            if m['result'] == 'A':
                winners.append(next(t for t in teams if t.id == m['aff_id']))
            elif m['result'] == 'N':
                winners.append(next(t for t in teams if t.id == m['neg_id']))
            else:
                raise ValueError(f"Match {m['match_id']} has no result")
                
        # For subsequent rounds, we pair adjacent winners in the list
        pairs = []
        for i in range(0, len(winners), 2):
            pairs.append((winners[i], winners[i+1]))
            
    # Apply side assignment
    final_pairs = []
    for t1, t2 in pairs:
        # Check if swappable (met once)
        # We need to check history.
        history_matches = [m for m in data['matches'] if (m['aff_id'] == t1.id and m['neg_id'] == t2.id) or (m['aff_id'] == t2.id and m['neg_id'] == t1.id)]
        is_swappable = len(history_matches) == 1
        
        aff, neg = determine_sides(t1, t2, data['matches'], is_swappable)
        final_pairs.append((aff, neg))
        
    return final_pairs

def pair_round_logic(data, teams, round_num, pairing_scheme=None):
    """Core logic for pairing a round. Returns list of matches."""
    # Check if this round already exists
    if round_num <= len(data['rounds']):
        raise ValueError(f"Round {round_num} already paired. Re-pairing is not supported.")
        
    # Validation: must be the next sequential round
    expected_round = len(data['rounds']) + 1
    if round_num != expected_round:
        raise ValueError(f"Expected to pair Round {expected_round}, but got {round_num}.")
    
    # Check that all matches from the most recent existing round have results
    if len(data['rounds']) > 0 and round_num > 2:
        last_round_matches = [m for m in data['matches'] if m['round_num'] == len(data['rounds'])]
        unreported = [m for m in last_round_matches if m['result'] is None]
        if unreported:
            msg = f"Cannot pair Round {round_num} until all results from Round {len(data['rounds'])} are reported."
            # We could include details about unreported matches in the exception if needed
            raise ValueError(msg)
    
    # Generate pairings
    num_prelim_rounds = data['config']['num_rounds']
    effective_scheme = pairing_scheme or data['config'].get('round_pairing_schemes', {}).get(str(round_num)) or data['config'].get('pairing_scheme', 'high-low')
    
    if round_num <= num_prelim_rounds:
        pairs = pair_round(teams, round_num - 1, use_buchholz=True, pairing_scheme=effective_scheme)
    else:
        # Elimination round
        pairs = generate_elim_pairings(data, teams, round_num)
        
    return pairs

def _process_match_result(round_id, match_id, aff_id, neg_id, outcome, matches, force, judge_id=None, speaker_points=None, rfd=None, comments=None) -> Tuple[bool, str, str]:
    """
    Validates and records a single match result (supports multi-judge panel voting & RFDs).
    Returns (Success, ErrorCode, ErrorMessage).
    ErrorCode: 'OK', 'MATCH_NOT_FOUND', 'TEAM_MISMATCH', 'OUTCOME_CONFLICT', 'ROUND_MISMATCH'
    """
    # Lookup match globally
    match = next((m for m in matches if m['match_id'] == match_id), None)
    
    if not match:
        return False, 'MATCH_NOT_FOUND', f"Match {match_id} does not exist"
        
    # Validate round number
    if match['round_num'] != round_id:
        winner = outcome.upper()
        if match['result'] == winner:
            if judge_id is not None:
                match['judge_id'] = judge_id
            if speaker_points is not None:
                match['speaker_points'] = speaker_points
            if rfd:
                match['rfd'] = rfd
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

    # Record individual judge ballot
    if judge_id is not None:
        ballots = match.setdefault('ballots', {})
        ballots[str(judge_id)] = {
            "judge_id": judge_id,
            "vote": winner,
            "speaker_points": speaker_points or {},
            "rfd": rfd or "",
            "comments": comments or {}
        }
    if rfd:
        match['rfd'] = rfd
    if comments:
        match['comments'] = comments
    if speaker_points is not None:
        match['speaker_points'] = speaker_points
    if judge_id is not None and not match.get('judge_id'):
        match['judge_id'] = judge_id

    panel = match.get('panel') or []
    if len(panel) > 1 and judge_id is not None:
        # Multi-judge panel majority vote resolution
        ballots = match.get('ballots', {})
        votes = [b.get('vote') for b in ballots.values() if b.get('vote') in ('A', 'N')]
        aff_votes = votes.count('A')
        neg_votes = votes.count('N')
        panel_size = len(panel)
        majority = (panel_size // 2) + 1

        if aff_votes >= majority:
            match['result'] = 'A'
            match['outcome'] = 'A'
        elif neg_votes >= majority:
            match['result'] = 'N'
            match['outcome'] = 'N'
        else:
            match['result'] = None  # Pending remaining panel votes

        if aff_votes >= majority or neg_votes >= majority or len(votes) >= panel_size:
            match['decision'] = f"{max(aff_votes, neg_votes)}-{min(aff_votes, neg_votes)}"
    else:
        # Single judge match
        if match['result'] is not None and match['result'] != winner and not force:
            return False, 'OUTCOME_CONFLICT', f"Outcome conflict: existing={match['result']}, new={winner}"
        match['result'] = winner
        match['outcome'] = winner
        match['decision'] = "1-0"

    return True, 'OK', "Result successfully recorded"

def drop_team(data, teams, team_id) -> bool:
    """Drops a team from the tournament. Forfeits any active, unreported match."""
    team = next((t for t in teams if t.id == team_id), None)
    if not team:
        return False
    team.is_dropped = True
    
    # Check in-progress matches for active round
    for m in data.get('matches', []):
        if m.get('result') is None and (m['aff_id'] == team_id or m['neg_id'] == team_id):
            if m['aff_id'] == team_id:
                m['result'] = 'N'
                m['is_forfeit'] = True
                m['forfeit_team_id'] = team_id
            else:
                m['result'] = 'A'
                m['is_forfeit'] = True
                m['forfeit_team_id'] = team_id
                
    team_map = {t.id: t for t in teams}
    recalculate_stats(data, teams, team_map)
    return True

def reinstate_team(data, teams, team_id) -> bool:
    """Reinstates a dropped team back to active status."""
    team = next((t for t in teams if t.id == team_id), None)
    if not team:
        return False
    team.is_dropped = False
    team_map = {t.id: t for t in teams}
    recalculate_stats(data, teams, team_map)
    return True

UNCONFLICTED_INSTITUTIONS = {
    "", "tournament hire", "hired", "unaffiliated", "independent", "none", "unknown", "clean", "hired judge"
}

def check_judge_conflict(judge: Dict, match: Dict, teams: Union[List, Dict]) -> Tuple[bool, Optional[str]]:
    """
    Returns (has_conflict, reason).
    Checks:
    1. School / Institution conflict (judge institution == aff institution or neg institution)
    2. Explicit judge conflicts (judge['conflicts'])
    3. Explicit team conflicts (team['conflicts'])
    """
    if match.get('is_bye') or match.get('neg_id') == -1 or match.get('neg_id') is None:
        return False, None

    if isinstance(teams, list):
        team_map = {getattr(t, 'id', None) if not isinstance(t, dict) else t.get('id'): t for t in teams}
    else:
        team_map = teams

    aff = team_map.get(match.get('aff_id'))
    neg = team_map.get(match.get('neg_id'))

    def get_attr(obj, attr, default=""):
        if obj is None:
            return default
        if isinstance(obj, dict):
            return obj.get(attr, default)
        return getattr(obj, attr, default)

    aff_inst = str(get_attr(aff, 'institution', '') or '').strip().lower()
    neg_inst = str(get_attr(neg, 'institution', '') or '').strip().lower()
    aff_name = str(get_attr(aff, 'name', f"Team {match.get('aff_id')}") or '')
    neg_name = str(get_attr(neg, 'name', f"Team {match.get('neg_id')}") or '')

    judge_inst = str(judge.get('institution', '') or '').strip().lower()
    judge_name = str(judge.get('name', f"Judge {judge.get('id')}") or '')
    judge_id = judge.get('id')

    # 1. School Conflict
    if judge_inst and judge_inst not in UNCONFLICTED_INSTITUTIONS:
        if aff_inst and judge_inst == aff_inst:
            return True, f"School conflict: {judge_name} and Aff ({aff_name}) are both from {judge.get('institution')}"
        if neg_inst and judge_inst == neg_inst:
            return True, f"School conflict: {judge_name} and Neg ({neg_name}) are both from {judge.get('institution')}"

    # 2. Judge explicit conflicts (team IDs, school names, debater names)
    judge_conflicts = judge.get('conflicts') or []
    for c in judge_conflicts:
        if isinstance(c, int):
            if c == match.get('aff_id'):
                return True, f"Judge explicit conflict with Aff team {aff_name} (ID {c})"
            if c == match.get('neg_id'):
                return True, f"Judge explicit conflict with Neg team {neg_name} (ID {c})"
        elif isinstance(c, str):
            c_lower = c.strip().lower()
            if c_lower in (aff_inst, aff_name.lower()):
                return True, f"Judge explicit conflict with Aff: {c}"
            if c_lower in (neg_inst, neg_name.lower()):
                return True, f"Judge explicit conflict with Neg: {c}"

    # 3. Team explicit conflicts (judge IDs, judge names, judge emails)
    aff_conflicts = get_attr(aff, 'conflicts', []) or []
    neg_conflicts = get_attr(neg, 'conflicts', []) or []
    if judge_id in aff_conflicts or judge.get('name') in aff_conflicts or judge.get('email') in aff_conflicts:
        return True, f"Aff team {aff_name} has designated a conflict with {judge_name}"
    if judge_id in neg_conflicts or judge.get('name') in neg_conflicts or judge.get('email') in neg_conflicts:
        return True, f"Neg team {neg_name} has designated a conflict with {judge_name}"

    return False, None

def auto_assign_judges(data: Dict, teams: Union[List, Dict], round_num: Optional[int] = None) -> List[Dict]:
    """
    Automatically assigns unconflicted judges to matches in round_num (or current_round),
    minimizing repeat judging and balancing workload across the judge pool.
    """
    if round_num is None:
        round_num = data.get('current_round', 1)

    matches = [m for m in data.get('matches', []) if m.get('round_num') == round_num and not m.get('is_bye') and m.get('neg_id') != -1]
    unassigned_matches = [m for m in matches if m.get('judge_id') is None]
    if not unassigned_matches:
        return []

    judges = data.get('judges', [])
    if not judges:
        return []

    # Map judges already assigned in this round
    assigned_in_round = {m.get('judge_id') for m in matches if m.get('judge_id') is not None}

    # History of which teams judges have seen in previous rounds
    past_matches = [m for m in data.get('matches', []) if m.get('round_num', 0) < round_num and m.get('judge_id') is not None]
    judge_seen_teams = {}
    for pm in past_matches:
        jid = pm.get('judge_id')
        judge_seen_teams.setdefault(jid, set()).add(pm.get('aff_id'))
        judge_seen_teams.setdefault(jid, set()).add(pm.get('neg_id'))

    is_elim = round_num > data.get('config', {}).get('num_prelim_rounds', 999)
    panel_size = data.get('config', {}).get('elim_panel_size', 3) if is_elim else 1

    assignments = []
    for match in unassigned_matches:
        aff_id = match.get('aff_id')
        neg_id = match.get('neg_id')

        candidates = []
        for judge in judges:
            jid = judge.get('id')
            if jid in assigned_in_round:
                continue

            has_conflict, _ = check_judge_conflict(judge, match, teams)
            if has_conflict:
                continue

            seen = judge_seen_teams.get(jid, set())
            repeat_penalty = 100 if (aff_id in seen or neg_id in seen) else 0
            workload_penalty = len(judge.get('matches_judged', []))

            score = repeat_penalty + workload_penalty
            candidates.append((score, judge))

        if candidates:
            candidates.sort(key=lambda x: x[0])
            needed = min(panel_size, len(candidates))
            selected_panel = [c[1] for c in candidates[:needed]]
            selected_jids = [j['id'] for j in selected_panel]

            match['panel'] = selected_jids
            match['judge_id'] = selected_jids[0]  # Chair judge

            for j in selected_panel:
                j.setdefault('matches_judged', [])
                if match['match_id'] not in j['matches_judged']:
                    j['matches_judged'].append(match['match_id'])
                assigned_in_round.add(j['id'])

            assignments.append({
                "match_id": match['match_id'],
                "judge_id": selected_jids[0],
                "panel": selected_jids,
                "judge_name": ", ".join(j.get('name', f"Judge {j['id']}") for j in selected_panel)
            })

    return assignments


if __name__ == "__main__":
    from cli import main
    main()
