"""head_to_head_probability.py

Compute the probability of Team A (with history A) beating Team B (with history B)
when they face each other in a Policy Debate tournament.

Usage example:
    python3 head_to_head_probability.py 167 7 "W W L" "W L W" 10000
    
The script runs Monte Carlo simulations and tracks matchups between teams with
the specified win/loss histories. If simulations count is not provided, it will
adaptively determine the number needed for stable results.
"""

import sys
from collections import defaultdict

# Import shared utilities
from swiss_utils import (
    create_base_parser,
    add_tournament_args,
    add_common_args,
    print_simulation_header,
    print_progress,
)

# Import core simulation functions and Team class
from swiss_sim import Team, run_tournament, probability_of_win
import random


def adaptive_simulation(num_teams, num_rounds, history_a, history_b, use_buchholz, win_model, min_matchups=100):
    """
    Adaptively run simulations until we have enough matchups for stable results.
    
    Returns: (total_sims, matchups_data)
    """
    matchups = []
    total_sims = 0
    batch_size = 1000
    max_sims = 50000
    
    print(f"Running adaptive simulation (target: {min_matchups} matchups, max: {max_sims} sims)...")
    
    while total_sims < max_sims:
        # Run a batch of simulations
        for i in range(batch_size):
            teams = run_tournament(num_teams, num_rounds, [], use_buchholz, win_model)
            
            # Find teams with each history
            teams_a = [t for t in teams if len(t.history) >= len(history_a) and 
                      "".join(t.history[:len(history_a)]) == history_a]
            teams_b = [t for t in teams if len(t.history) >= len(history_b) and 
                      "".join(t.history[:len(history_b)]) == history_b]
            
            # Check if any teams with history_a played against teams with history_b
            for team_a in teams_a:
                for team_b in teams_b:
                    if team_b.id in team_a.opponents:
                        # They played each other - simulate the matchup outcome
                        # using probability_of_win based on their true ranks
                        prob_a_wins = probability_of_win(team_a, team_b)
                        a_wins = random.random() < prob_a_wins
                        
                        matchups.append({
                            'team_a_rank': team_a.true_rank,
                            'team_b_rank': team_b.true_rank,
                            'a_wins': a_wins,
                        })
        
        total_sims += batch_size
        
        if len(matchups) >= min_matchups:
            print(f"Reached {len(matchups)} matchups after {total_sims} simulations.")
            break
        
        if total_sims % 5000 == 0:
            print(f"  {total_sims} sims: {len(matchups)} matchups found...")
    
    return total_sims, matchups


def main():
    parser = create_base_parser(
        "Compute head-to-head win probability between two teams with given histories."
    )
    add_tournament_args(parser)
    parser.add_argument(
        "history_a",
        type=str,
        help="Win/Loss sequence for Team A, e.g. 'W W L' or 'WWL'",
    )
    parser.add_argument(
        "history_b",
        type=str,
        help="Win/Loss sequence for Team B, e.g. 'W L W' or 'WLW'",
    )
    parser.add_argument(
        "simulations",
        type=int,
        nargs='?',
        default=None,
        help="Number of simulations (optional, will auto-determine if not provided)",
    )
    add_common_args(parser)

    args = parser.parse_args()

    NUM_TEAMS = args.teams
    NUM_ROUNDS = args.rounds
    HISTORY_A = args.history_a.replace(" ", "").upper()
    HISTORY_B = args.history_b.replace(" ", "").upper()
    NUM_SIMULATIONS = args.simulations
    USE_BUCHHOLZ = not args.donotuse_buchholz_pairing
    WIN_MODEL = args.win_model

    # Validate histories
    if len(HISTORY_A) > NUM_ROUNDS or len(HISTORY_B) > NUM_ROUNDS:
        print(f"Error: History length cannot exceed number of rounds ({NUM_ROUNDS})")
        sys.exit(1)

    # Track matchups
    matchup_count = 0
    team_a_wins = 0
    team_b_wins = 0
    team_a_ranks = []
    team_b_ranks = []

    if NUM_SIMULATIONS is None:
        # Adaptive mode
        print(f"Simulating tournaments with {NUM_TEAMS} teams, {NUM_ROUNDS} rounds...")
        print(f"Analyzing matchups between '{HISTORY_A}' vs '{HISTORY_B}'")
        print(f"Buchholz Pairing: {'Enabled' if USE_BUCHHOLZ else 'Disabled'}")
        print(f"Win Model: {WIN_MODEL}")
        print()
        
        total_sims, matchups = adaptive_simulation(
            NUM_TEAMS, NUM_ROUNDS, HISTORY_A, HISTORY_B, USE_BUCHHOLZ, WIN_MODEL
        )
        
        # Process matchups (using probability_of_win simulation)
        for m in matchups:
            matchup_count += 1
            team_a_ranks.append(m['team_a_rank'])
            team_b_ranks.append(m['team_b_rank'])
            
            if m['a_wins']:
                team_a_wins += 1
            else:
                team_b_wins += 1
        
        NUM_SIMULATIONS = total_sims
    else:
        # Fixed simulation count
        print_simulation_header(NUM_TEAMS, NUM_ROUNDS, NUM_SIMULATIONS, USE_BUCHHOLZ, WIN_MODEL,
                               f"Analyzing matchups between '{HISTORY_A}' vs '{HISTORY_B}'")

        for i in range(NUM_SIMULATIONS):
            print_progress(i, NUM_SIMULATIONS)
            teams = run_tournament(NUM_TEAMS, NUM_ROUNDS, [], USE_BUCHHOLZ, WIN_MODEL)
            
            # Find teams with each history
            teams_a = [t for t in teams if len(t.history) >= len(HISTORY_A) and 
                      "".join(t.history[:len(HISTORY_A)]) == HISTORY_A]
            teams_b = [t for t in teams if len(t.history) >= len(HISTORY_B) and 
                      "".join(t.history[:len(HISTORY_B)]) == HISTORY_B]
            
            # Check if any teams with history_a played against teams with history_b
            for team_a in teams_a:
                for team_b in teams_b:
                    if team_b.id in team_a.opponents:
                        matchup_count += 1
                        team_a_ranks.append(team_a.true_rank)
                        team_b_ranks.append(team_b.true_rank)
                        
                        # Simulate matchup using probability_of_win
                        prob_a_wins = probability_of_win(team_a, team_b)
                        if random.random() < prob_a_wins:
                            team_a_wins += 1
                        else:
                            team_b_wins += 1

    print(f"Completed {NUM_SIMULATIONS} simulations...\n")

    if matchup_count == 0:
        print(f"No matchups found between teams with histories '{HISTORY_A}' and '{HISTORY_B}'.")
        print("Try running more simulations or using different histories.")
        sys.exit(0)

    # Calculate probabilities
    total_matchups = team_a_wins + team_b_wins
    prob_a = (team_a_wins / total_matchups) * 100 if total_matchups > 0 else 0
    prob_b = (team_b_wins / total_matchups) * 100 if total_matchups > 0 else 0

    # Print results
    print("Results:")
    print("--------")
    print(f"Total matchups found: {matchup_count}")
    print(f"Team A ({HISTORY_A}) wins: {team_a_wins} ({prob_a:.2f}%)")
    print(f"Team B ({HISTORY_B}) wins: {team_b_wins} ({prob_b:.2f}%)")
    print()
    
    if team_a_ranks:
        avg_rank_a = sum(team_a_ranks) / len(team_a_ranks)
        avg_rank_b = sum(team_b_ranks) / len(team_b_ranks)
        print(f"Average true rank of Team A: {avg_rank_a:.1f}")
        print(f"Average true rank of Team B: {avg_rank_b:.1f}")
        print()
        print(f"Matchups per simulation: {matchup_count / NUM_SIMULATIONS:.2f}")


if __name__ == "__main__":
    main()
