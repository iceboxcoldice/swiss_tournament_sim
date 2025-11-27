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
    history: list = field(default_factory=list)  # Win/Loss sequence ("W"/"L")
    opponent_history: list = field(default_factory=list)  # List of opponent IDs by round
    break_seed: Optional[int] = None # Seed for elimination rounds
    
    def __hash__(self):
        return hash(self.id)

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
    if random.random() < prob_a:
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

def find_best_opponent(t1: Team, group: List[Team]) -> Tuple[Optional[Team], int, bool]:
    """
    Find best opponent for t1 in the group.
    Returns (opponent, index, is_swappable_repeat).
    """
    t1_pref = calculate_side_preference(t1)
    
    best_non_repeat = None
    best_non_repeat_idx = -1
    
    best_swappable = None
    best_swappable_idx = -1
    
    for i, candidate in enumerate(group):
        if candidate.id not in t1.opponent_history:
            # Priority 1: Non-repeat
            best_non_repeat = candidate
            best_non_repeat_idx = i
            break # Strict Swiss: take first valid
        else:
            # Check for swappable repeat
            if best_swappable is None:
                can_play_aff = "Aff" not in t1.side_history.get(candidate.id, [])
                can_play_neg = "Neg" not in t1.side_history.get(candidate.id, [])
                
                if can_play_aff or can_play_neg:
                    best_swappable = candidate
                    best_swappable_idx = i
    
    if best_non_repeat:
        return best_non_repeat, best_non_repeat_idx, False
    elif best_swappable:
        return best_swappable, best_swappable_idx, True
        
    return None, -1, False

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
        if random.random() < 0.5:
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

def pair_round(teams: List[Team], round_num: int, use_buchholz: bool = False) -> List[Tuple[Team, Team]]:
    """
    Pair teams for a round using Swiss system with floating and side constraints.
    Returns list of (Aff, Neg) tuples.
    """
    # Update Buchholz before pairing to use for sorting
    if use_buchholz:
        update_buchholz(teams)
    
    # Shuffle teams first to randomize order within score groups
    random.shuffle(teams)
    
    
    # Group by score
    score_groups = defaultdict(list)
    if round_num > 1:
        # Rounds 2+: Group teams by their current scores
        for t in teams:
            score_groups[t.score].append(t)
    else:
        # Rounds 0-1: Don't consider scores, treat all teams as one group for random pairing
        # Create new list with same team references (shallow copy) to avoid mutating original list
        for t in teams:
            score_groups[0].append(t)

    sorted_scores = sorted(score_groups.keys(), reverse=True)

    round_pairs = []
    floaters = []
    
    for score in sorted_scores:
        group = score_groups[score]
        # Add floaters from previous higher score groups
        group.extend(floaters)
        floaters = []
        
        # Sort by rank (or random if preferred, but usually rank is used for pairing order)
        # For Round 1 and 2, we want random pairing, so we skip the sort
        # (teams are already shuffled)
        if round_num > 1:
            # If true_rank is 0 (real tournament), it won't affect sorting much, 
            # effectively random within score/buchholz groups due to initial shuffle.
            if use_buchholz:
                group.sort(key=lambda t: (t.score, t.buchholz, -t.true_rank), reverse=True)
            else:
                group.sort(key=lambda t: (t.score, -t.true_rank), reverse=True)
        
        while group:
            t1 = group.pop(0)
            
            opponent, opponent_idx, is_swappable = find_best_opponent(t1, group)
            
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
            # Bye
            bye_team = floaters[0]
            bye_team.score += 1.0
            bye_team.opponent_history.append(-1)
            # Bye usually doesn't count for sides, or counts as free Aff? 
            # Let's ignore side effect for bye in this sim
            
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
