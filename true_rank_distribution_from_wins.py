#!/usr/bin/env python3
"""
Rank Distribution Calculator for Swiss Tournament Simulation

Calculates the probability distribution of final ranks for teams with a specific win count
in a Swiss-system tournament.

Usage:
    python3 rank_by_wins.py <teams> <rounds> <wins> [simulations] [options]

Example:
    python3 rank_by_wins.py 128 7 5 10000 --win-model elo --use-buchholz-pairing
"""

import argparse
from collections import defaultdict

# Import core simulation functions from swiss_sim.py
from swiss_sim import run_tournament
from swiss_utils import (create_base_parser, add_tournament_args, add_common_args,
                         add_simulations_arg, print_simulation_header, print_progress)

def main():
    parser = create_base_parser("Calculate rank distribution for teams with a specific win count.")
    add_tournament_args(parser)
    parser.add_argument("wins", type=int, help="Win count to analyze")
    add_simulations_arg(parser)
    add_common_args(parser)
    
    args = parser.parse_args()
    
    NUM_TEAMS = args.teams
    NUM_ROUNDS = args.rounds
    TARGET_WINS = args.wins
    NUM_SIMULATIONS = args.simulations
    USE_BUCHHOLZ = args.use_buchholz_pairing
    WIN_MODEL = args.win_model
    
    # Track true_rank distribution for teams with target wins
    true_rank_counts = defaultdict(int)
    total_teams_with_wins = 0
    
    print_simulation_header(NUM_TEAMS, NUM_ROUNDS, NUM_SIMULATIONS, USE_BUCHHOLZ, WIN_MODEL,
                           f"Analyzing teams with {TARGET_WINS} wins")
    
    for i in range(NUM_SIMULATIONS):
        print_progress(i, NUM_SIMULATIONS)
        
        final_standings = run_tournament(NUM_TEAMS, NUM_ROUNDS, [], USE_BUCHHOLZ, WIN_MODEL)
        
        # Find all teams with the target win count and record their true_rank
        for team in final_standings:
            if team.wins == TARGET_WINS:
                true_rank_counts[team.true_rank] += 1
                total_teams_with_wins += 1
    
    print(f"Completed {NUM_SIMULATIONS} simulations...")
    print()
    
    if total_teams_with_wins == 0:
        print(f"No teams achieved {TARGET_WINS} wins in any simulation.")
        return
    
    # Print results
    print(f"True Rank (Initial Rank) Distribution for Teams with {TARGET_WINS} Wins")
    print(f"(Based on {total_teams_with_wins} teams across {NUM_SIMULATIONS} simulations)")
    print()
    print("True Rank | Probability | Count")
    print("----------|-------------|-------")
    
    for true_rank in sorted(true_rank_counts.keys()):
        probability = (true_rank_counts[true_rank] / total_teams_with_wins) * 100
        if probability >= 0.01:  # Only show ranks with >0.01% probability
            print(f"{true_rank:9d} | {probability:10.2f}% | {true_rank_counts[true_rank]:6d}")
    
    # Calculate statistics
    avg_true_rank = sum(true_rank * count for true_rank, count in true_rank_counts.items()) / total_teams_with_wins
    best_true_rank = min(true_rank_counts.keys()) if true_rank_counts else 0
    worst_true_rank = max(true_rank_counts.keys()) if true_rank_counts else 0
    
    print()
    print(f"Average true rank: {avg_true_rank:.1f}")
    print(f"Best true rank: {best_true_rank}")
    print(f"Worst true rank: {worst_true_rank}")
    most_common_rank = max(true_rank_counts, key=true_rank_counts.get)
    most_common_pct = (
        true_rank_counts[most_common_rank] / total_teams_with_wins
    ) * 100
    print(f"Most common: True Rank {most_common_rank} ({most_common_pct:.2f}%)")
    print()
    avg_teams = total_teams_with_wins / NUM_SIMULATIONS
    print(
        f"Average teams per tournament with {TARGET_WINS} wins: "
        f"{avg_teams:.2f}"
    )

if __name__ == "__main__":
    main()
