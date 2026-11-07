import random
import math
import argparse
from dataclasses import dataclass, field
from typing import List, Tuple, Set, Optional
from collections import defaultdict

@dataclass
class Team:
    id: int
    true_rank: int = 0  # Optional for real tournaments
    name: str = ""      # Team name for real tournaments
    score: float = 0.0
    buchholz: float = 0.0
    wins: int = 0
    aff_count: int = 0
    neg_count: int = 0
    last_side: Optional[str] = None
    side_history: dict = field(default_factory=dict)  # Opponent ID -> List of sides played
    history: list = field(default_factory=list)  # Win/Loss sequence ("W"/"L")
    opponent_history: list = field(default_factory=list)  # List of opponent IDs by round
    break_seed: Optional[int] = None # Seed for elimination rounds
    members: List[str] = field(default_factory=list) # List of team members
    institution: Optional[str] = None # Team institution
    # Speaker points history: list of dicts {round: int, points: [float, float]}
    speaker_points_history: list = field(default_factory=list) 
    # Rounds in which this team was pulled up to a higher bracket
    pulled_up_rounds: list = field(default_factory=list) 
    # Rounds in which this team received a BYE
    bye_rounds: list = field(default_factory=list) 
    # Whether the team has dropped out of the tournament
    is_dropped: bool = False 
 


    
    def __hash__(self):
        return hash(self.id)

# Consistent LCG-based PRNG for Python/JS alignment
_seed = 12345

def set_seed(new_seed: int):
    global _seed
    _seed = new_seed

def lcg_random() -> float:
    global _seed
    # Parameters for LCG (same as used in JS test)
    _seed = (_seed * 1664525 + 1013904223) % 4294967296
    return _seed / 4294967296

def manual_shuffle(items: list):
    """
    Fisher-Yates shuffle using our LCG PRNG.
    """
    for i in range(len(items) - 1, 0, -1):
        j = int(lcg_random() * (i + 1))
        items[i], items[j] = items[j], items[i]

def probability_of_win(team_a: Team, team_b: Team, model: str = 'elo') -> float:
    """
    Calculate probability of team_a winning against team_b.
    Models:
    - 'elo': Elo-based formula (current, allows upsets)
    - 'linear': Linear probability based on rank difference
    - 'deterministic': Better rank always wins
    """
    if model == 'deterministic':
        # Better rank (lower number) always wins
        return 1.0 if team_a.true_rank < team_b.true_rank else 0.0
    
    elif model == 'linear':
        # Linear model: probability based on rank difference
        # P(A wins) = 0.5 + (rank_diff / (2 * max_rank))
        # This gives ~75% for Rank 1 vs Rank 64, ~90% for Rank 1 vs Rank 128
        rank_diff = team_b.true_rank - team_a.true_rank
        max_rank = max(team_a.true_rank, team_b.true_rank)
        prob = 0.5 + (rank_diff / (2.0 * max_rank))
        return max(0.0, min(1.0, prob))  # Clamp to [0, 1]
    
    else:  # 'elo' (default)
        # Elo-based formula
        rating_a = 2000 - 50 * team_a.true_rank
        rating_b = 2000 - 50 * team_b.true_rank
        return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))

def simulate_match(team_a: Team, team_b: Team, win_model: str = 'elo') -> Tuple[float, float]:
    """
    Simulate a match between team_a and team_b.
    Returns points for (team_a, team_b).
    1.0 for win, 0.0 for loss, 0.5 for draw (optional, ignoring draws for now).
    """
    prob_a = probability_of_win(team_a, team_b, win_model)
    if lcg_random() < prob_a:
        return 1.0, 0.0
    else:
        return 0.0, 1.0

def calculate_side_preference(team: Team) -> float:
    """
    Calculate side preference score.
    Positive => Wants Aff.
    Negative => Wants Neg.
    """
    pref = team.neg_count - team.aff_count
    if team.last_side == "Neg":
        pref += 2.0
    elif team.last_side == "Aff":
        pref -= 2.0
    return pref

def find_best_opponent(t1: Team, group: List[Team], pairing_scheme: str = 'high-low') -> Tuple[Optional[Team], int, bool]:
    """
    Find best opponent for t1 in the group.
    Returns (opponent, index, is_swappable_repeat).
    In High-Low (Tabroom standard): searches candidates starting from the lowest-seeded in group.
    In High-High: searches candidates starting from the highest-seeded in group.
    Includes institution protection (avoids pairing teams from same school if possible).
    """
    best_non_repeat_diff_school = None
    best_non_repeat_diff_school_idx = -1

    best_non_repeat = None
    best_non_repeat_idx = -1
    
    best_swappable = None
    best_swappable_idx = -1

    t1_inst = (getattr(t1, 'institution', None) or '').strip().lower()
    has_t1_inst = bool(t1_inst and t1_inst not in ('unknown', 'none', ''))

    indices = range(len(group) - 1, -1, -1) if pairing_scheme == 'high-low' else range(len(group))
    
    for i in indices:
        candidate = group[i]
        if candidate.id not in t1.opponent_history:
            cand_inst = (getattr(candidate, 'institution', None) or '').strip().lower()
            same_school = has_t1_inst and bool(cand_inst and cand_inst not in ('unknown', 'none', '') and cand_inst == t1_inst)

            if not same_school and best_non_repeat_diff_school is None:
                best_non_repeat_diff_school = candidate
                best_non_repeat_diff_school_idx = i
                break # Found ideal high-low matchup

            if best_non_repeat is None:
                best_non_repeat = candidate
                best_non_repeat_idx = i
        else:
            # Check for swappable repeat
            if best_swappable is None:
                can_play_aff = "Aff" not in t1.side_history.get(candidate.id, [])
                can_play_neg = "Neg" not in t1.side_history.get(candidate.id, [])
                
                if can_play_aff or can_play_neg:
                    best_swappable = candidate
                    best_swappable_idx = i
    
    if best_non_repeat_diff_school:
        return best_non_repeat_diff_school, best_non_repeat_diff_school_idx, False
    elif best_non_repeat:
        return best_non_repeat, best_non_repeat_idx, False
    elif best_swappable:
        return best_swappable, best_swappable_idx, True
        
    return None, -1, False

def get_speaker_points(team: Team) -> float:
    """Helper to sum speaker points for tiebreaking/ranking, with Tabroom bye average imputation."""
    if not team or not getattr(team, 'speaker_points_history', None):
        return 0.0
    total = 0.0
    debated_rounds = 0
    for entry in team.speaker_points_history:
        if isinstance(entry, dict):
            pts = entry.get('points', [])
            p_sum = sum(p for p in pts if isinstance(p, (int, float)))
            total += p_sum
            debated_rounds += 1
        elif isinstance(entry, (list, tuple)):
            p_sum = sum(p for p in entry if isinstance(p, (int, float)))
            total += p_sum
            debated_rounds += 1
        elif isinstance(entry, (int, float)):
            total += entry
            debated_rounds += 1

    bye_count = len(getattr(team, 'bye_rounds', []) or [])
    if bye_count > 0 and debated_rounds > 0:
        avg_per_round = total / debated_rounds
        total += avg_per_round * bye_count

    return total

def select_bye_team(teams: List[Team], round_num: int) -> Team:
    """
    Selects the team to receive a BYE for the round following Tabroom rules:
    - Team must not have already received a bye in preliminary rounds (single bye rule).
    - In Rounds 1-2 (preset/random, round_num <= 1 in 0-indexed): selected at random among eligible teams.
    - In Rounds 3+ (power-matched, round_num > 1 in 0-indexed): selected from the lowest score bracket,
      specifically the lowest-seeded team (lowest score, lowest speaker points, lowest Buchholz).
    """
    eligible = [
        t for t in teams
        if not getattr(t, 'bye_rounds', None) and -1 not in getattr(t, 'opponent_history', [])
    ]
    if not eligible:
        eligible = list(teams)

    if round_num <= 1:
        idx = int(lcg_random() * len(eligible)) if eligible else 0
        return eligible[idx]

    eligible.sort(
        key=lambda t: (
            t.score,
            get_speaker_points(t),
            getattr(t, 'buchholz', 0.0),
            -t.id
        )
    )
    return eligible[0]

def select_pull_up_team(top_seed: Team, lower_bracket_teams: List[Team], round_num: int) -> Optional[Tuple[Team, int]]:
    """
    Select the best team to pull up from lower bracket to face the higher bracket's top seed.
    Implements Tabroom rule: 'Worst average opponent seed' (lowest Buchholz / easiest schedule so far)
    with constraints: no repeat opponent, no same-school clash, side compatibility, no repeat pull-up.
    Returns (chosen_team, original_index) or None.
    """
    if not lower_bracket_teams:
        return None

    t1_inst = (getattr(top_seed, 'institution', None) or '').strip().lower()
    has_t1_inst = bool(t1_inst and t1_inst not in ('unknown', 'none', ''))
    top_seed_pref = calculate_side_preference(top_seed)

    eligible = []
    for i, cand in enumerate(lower_bracket_teams):
        if cand.id not in top_seed.opponent_history:
            eligible.append((cand, i))

    if not eligible:
        # Check swappable repeat if no non-repeat exists
        for i, cand in enumerate(lower_bracket_teams):
            hist = top_seed.side_history.get(cand.id, [])
            if 'Aff' not in hist or 'Neg' not in hist:
                eligible.append((cand, i))

    if not eligible:
        return None

    def sort_key(item):
        team, _ = item
        pulls = len(getattr(team, 'pulled_up_rounds', []))
        
        cand_inst = (getattr(team, 'institution', None) or '').strip().lower()
        same_school = 1 if (has_t1_inst and cand_inst and cand_inst not in ('unknown', 'none', '') and cand_inst == t1_inst) else 0
        
        cand_pref = calculate_side_preference(team)
        side_clash = 1 if ((top_seed_pref > 0 and cand_pref > 0) or (top_seed_pref < 0 and cand_pref < 0)) else 0
        
        # Tabroom 'Worst average opponent seed' = lowest buchholz (faced weakest opposition so far)
        buchholz = getattr(team, 'buchholz', 0.0)
        sp = get_speaker_points(team)
        score = getattr(team, 'score', 0.0)
        
        return (pulls, same_school, side_clash, buchholz, sp, score, team.id)

    eligible.sort(key=sort_key)
    return eligible[0]

def determine_sides(t1: Team, t2: Team, is_swappable: bool) -> Tuple[Team, Team]:
    """
    Determine which team is Aff and which is Neg.
    Returns (Aff_Team, Neg_Team).
    """
    if is_swappable:
        # Force swap based on history
        can_play_aff = "Aff" not in t1.side_history.get(t2.id, [])
        can_play_neg = "Neg" not in t1.side_history.get(t2.id, [])
        
        if can_play_aff and not can_play_neg:
            return t1, t2
        elif can_play_neg and not can_play_aff:
            return t2, t1
            
    # Standard preference logic
    t1_pref = calculate_side_preference(t1)
    t2_pref = calculate_side_preference(t2)
    
    if t1_pref > t2_pref:
        return t1, t2
    elif t2_pref > t1_pref:
        return t2, t1
    else:
        if lcg_random() < 0.5:
            return t1, t2
        else:
            return t2, t1



def update_buchholz(teams: List[Team]):
    """
    Update Buchholz scores for all teams based on current opponents.
    """
    for t in teams:
        buchholz = 0
        for opp_id in t.opponent_history:
            if opp_id != -1: # Ignore bye
                opp = next((tm for tm in teams if tm.id == opp_id), None)
                if opp:
                    buchholz += opp.score
        t.buchholz = buchholz

def pair_round(teams: List[Team], round_num: int, use_buchholz: bool = False, pairing_scheme: str = 'high-low') -> List[Tuple[Team, Team]]:
    """
    Pair teams for a round using Swiss system with floating and side constraints.
    Supports Tabroom 'high-low' (default) and 'high-high' pairing schemes.
    Returns list of (Aff, Neg) tuples.
    """
    # Update Buchholz before pairing to use for sorting
    if use_buchholz:
        update_buchholz(teams)
    
    # Filter out dropped teams
    teams_to_pair = [t for t in teams if not getattr(t, 'is_dropped', False)]
    if len(teams_to_pair) < 2:
        return []

    # Tabroom Bye Resolution if odd number of teams
    bye_team = None
    if len(teams_to_pair) % 2 != 0:
        bye_team = select_bye_team(teams_to_pair, round_num)
        teams_to_pair = [t for t in teams_to_pair if t.id != bye_team.id]

    manual_shuffle(teams_to_pair)
    
    
    # Group by score
    score_groups = defaultdict(list)
    if round_num > 1:
        # Rounds 3+: Group teams by their current scores
        for t in teams_to_pair:
            score_groups[t.score].append(t)
    else:
        # Rounds 0-1: Don't consider scores, treat all teams as one group for random pairing
        # Create new list with same team references (shallow copy) to avoid mutating original list
        for t in teams_to_pair:
            score_groups[0].append(t)

    sorted_scores = sorted(score_groups.keys(), reverse=True)

    # Tabroom Pull-Up Resolution for power-matched rounds:
    # If a bracket has an odd count, pull up the best candidate from lower bracket(s)
    # based on worst average opponent seed (lowest Buchholz / easiest schedule)
    if round_num > 1 and pairing_scheme != 'random':
        for score in sorted_scores:
            if use_buchholz:
                score_groups[score].sort(key=lambda t: (t.score, get_speaker_points(t), t.buchholz, -t.id), reverse=True)
            else:
                score_groups[score].sort(key=lambda t: (t.score, get_speaker_points(t), -t.id), reverse=True)

        for i in range(len(sorted_scores) - 1):
            curr_score = sorted_scores[i]
            curr_group = score_groups[curr_score]

            if len(curr_group) % 2 != 0:
                top_seed = curr_group[0]
                for j in range(i + 1, len(sorted_scores)):
                    lower_score = sorted_scores[j]
                    lower_group = score_groups[lower_score]
                    if not lower_group:
                        continue

                    chosen = select_pull_up_team(top_seed, lower_group, round_num + 1)
                    if chosen:
                        pulled_team, orig_idx = chosen
                        lower_group.pop(orig_idx)
                        if not hasattr(pulled_team, 'pulled_up_rounds'):
                            pulled_team.pulled_up_rounds = []
                        pulled_team.pulled_up_rounds.append(round_num + 1)
                        # Append as lowest seed of current group so top seed hits pull-up in High-Low
                        curr_group.append(pulled_team)
                        break

    round_pairs = []
    floaters = []
    
    for score in sorted_scores:
        group = score_groups[score]
        # Add floaters from previous higher score groups
        group.extend(floaters)
        floaters = []
        
        # Sort by rank (or random if preferred, but usually rank is used for pairing order)
        # For Round 1 and 2, or if pairing_scheme == 'random', we want random pairing, so we skip the sort
        # (teams are already shuffled)
        if round_num > 1 and pairing_scheme != 'random':
            # If true_rank is 0 (real tournament), it won't affect sorting much, 
            # effectively random within score/buchholz groups due to initial shuffle.
            if use_buchholz:
                group.sort(key=lambda t: (t.score, get_speaker_points(t), t.buchholz, -t.id), reverse=True)
            else:
                group.sort(key=lambda t: (t.score, get_speaker_points(t), -t.id), reverse=True)
        
        while group:
            t1 = group.pop(0)
            
            opponent, opponent_idx, is_swappable = find_best_opponent(t1, group, pairing_scheme=pairing_scheme)
            
            if opponent:
                group.pop(opponent_idx)
                aff, neg = determine_sides(t1, opponent, is_swappable)
                round_pairs.append((aff, neg))
            else:
                floaters.append(t1)
                
    # Handle remaining floaters (bottom group)
    if floaters:
        # Try to pair them amongst themselves if possible (should be handled by loop, but if odd number?)
        # Or if they are repeats of each other?
        # For simulation, if we really can't pair, we force a pair or give bye.
        
        while len(floaters) >= 2:
            t1 = floaters.pop(0)
            # Just take the next one, even if repeat, to keep tournament moving
            t2 = floaters.pop(0)
            
            # Sides
            aff, neg = determine_sides(t1, t2, is_swappable=False)
            round_pairs.append((aff, neg))
                    
        if floaters:
            # Fallback bye for remaining floater
            f_bye = floaters[0]
            f_bye.score += 1.0
            f_bye.wins += 1
            f_bye.history.append("W")
            f_bye.opponent_history.append(-1)
            if not hasattr(f_bye, 'bye_rounds') or f_bye.bye_rounds is None:
                f_bye.bye_rounds = []
            f_bye.bye_rounds.append(round_num + 1)
            round_pairs.append((f_bye, None))

    if bye_team is not None:
        if not hasattr(bye_team, 'bye_rounds') or bye_team.bye_rounds is None:
            bye_team.bye_rounds = []
        bye_team.bye_rounds.append(round_num + 1)
        bye_team.score += 1.0
        bye_team.wins += 1
        bye_team.history.append("W")
        bye_team.opponent_history.append(-1)
        round_pairs.append((bye_team, None))

    return round_pairs

def run_tournament(
    num_teams: int,
    num_rounds: int,
    debug_ranks: List[int] = [],
    use_buchholz: bool = False,
    win_model: str = 'elo',
) -> List[Team]:
    teams = [Team(id=i, true_rank=i+1) for i in range(num_teams)]
    
    for round_num in range(num_rounds):
        pairs = pair_round(teams, round_num, use_buchholz=use_buchholz)
        for t1, t2 in pairs:
            if t2 is None:
                # Bye match already scored in pair_round
                continue
            # Debug logging
            if t1.true_rank in debug_ranks or t2.true_rank in debug_ranks:
                print(
                    f"R{round_num+1}: Rank {t1.true_rank} ({t1.score}) vs "
                    f"Rank {t2.true_rank} ({t2.score})"
                )
            
            # t1 is Aff, t2 is Neg
            s1, s2 = simulate_match(t1, t2, win_model)
            t1.score += s1
            t2.score += s2
            # Record opponents for Buchholz
            t1.opponent_history.append(t2.id)
            t2.opponent_history.append(t1.id)
            # Update side counts and last side
            t1.aff_count += 1
            t2.neg_count += 1
            t1.last_side = "Aff"
            t2.last_side = "Neg"
            # Ensure side_history entries exist
            t1.side_history.setdefault(t2.id, []).append("Aff")
            t2.side_history.setdefault(t1.id, []).append("Neg")
            # Update win counts
            if s1 > s2:
                t1.wins += 1
                t1.history.append("W")
                t2.history.append("L")
            elif s2 > s1:
                t2.wins += 1
                t2.history.append("W")
                t1.history.append("L")

        if use_buchholz:
            for t in teams:
                t.buchholz = sum(op.score for op in teams if op.id in t.opponent_history)
    
    # Sort teams by score (descending), then buchholz (descending) for final standings
    teams.sort(key=lambda t: (t.score, t.buchholz), reverse=True)
    return teams

def main():
    from swiss_utils import (create_base_parser, add_tournament_args, add_common_args,
                             add_simulations_arg, print_simulation_header, print_progress)
    
    parser = create_base_parser("Simulate Swiss Tournament and calculate Top-N probabilities.")
    add_tournament_args(parser)
    parser.add_argument("top_n", type=int, help="Top N positions to track")
    add_simulations_arg(parser)
    parser.add_argument("--debug-ranks", type=int, nargs='+', help="Ranks to debug/trace")
    add_common_args(parser)
    
    args = parser.parse_args()
    
    NUM_TEAMS = args.teams
    NUM_ROUNDS = args.rounds
    TOP_N = args.top_n
    NUM_SIMULATIONS = args.simulations
    DEBUG_RANKS = args.debug_ranks if args.debug_ranks else []
    USE_BUCHHOLZ = not args.donotuse_buchholz_pairing
    WIN_MODEL = args.win_model
    
    # Track how often each rank finishes in top N
    top_n_counts = {rank: 0 for rank in range(1, NUM_TEAMS + 1)}
    
    print_simulation_header(NUM_TEAMS, NUM_ROUNDS, NUM_SIMULATIONS, USE_BUCHHOLZ, WIN_MODEL)
    
    for i in range(NUM_SIMULATIONS):
        print_progress(i, NUM_SIMULATIONS)
        final_standings = run_tournament(NUM_TEAMS, NUM_ROUNDS, DEBUG_RANKS if i == 0 else [], USE_BUCHHOLZ, WIN_MODEL)
        top_teams = final_standings[:TOP_N]
        
        if i == 0 and DEBUG_RANKS:
            print("\nDebug Results (Sim 1):")
            for rank in DEBUG_RANKS:
                team = next((t for t in final_standings if t.true_rank == rank), None)
                if team:
                    print(f"Rank {rank}: Score {team.score}, Buchholz {team.buchholz}, Wins {team.wins}")
                    print(f"  Opponents: {[t.true_rank for t in final_standings if t.id in team.opponents]}")
            print("-" * 20)
            
        for t in top_teams:
            top_n_counts[t.true_rank] += 1
            
        if (i+1) % 100 == 0:
            print(f"Completed {i+1} simulations...", end='\r')
            
    print(f"\nProbability of finishing in Top {TOP_N}")
    print("Rank | Probability")
    print("-----|------------")
    for rank in range(1, NUM_TEAMS + 1):
        prob = top_n_counts[rank] / NUM_SIMULATIONS
        if prob > 0.0001: # Only print relevant ones to avoid clutter
            print(f"{rank:4d} | {prob:.2%}")

if __name__ == "__main__":
    main()
