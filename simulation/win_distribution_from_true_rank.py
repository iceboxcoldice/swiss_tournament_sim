#!/usr/bin/env python3
"""
Win Distribution Calculator for Swiss Tournament Simulation

Calculates the probability distribution of win counts for a specific ranked team
in a Swiss-system tournament.

Usage:
    python3 win_distribution.py <teams> <rounds> <rank> [simulations] [options]

Example:
    python3 win_distribution.py 128 7 8 10000 --win-model elo
"""

import argparse
from collections import defaultdict

# Import core simulation functions from swiss_sim.py
from swiss_sim import run_tournament
from swiss_utils import (create_base_parser, add_tournament_args, add_common_args, 
                         add_simulations_arg, print_simulation_header, print_progress)

def main():
    parser = create_base_parser("Calculate win distribution for a specific rank in Swiss Tournament.")
    add_tournament_args(parser)
    parser.add_argument("true_rank", type=int, help="True rank to analyze (1 = best team)")
    add_simulations_arg(parser)
    add_common_args(parser)
    
    args = parser.parse_args()
    
    NUM_TEAMS = args.teams
    NUM_ROUNDS = args.rounds
    TARGET_TRUE_RANK = args.true_rank
    NUM_SIMULATIONS = args.simulations
    USE_BUCHHOLZ = not args.donotuse_buchholz_pairing
    WIN_MODEL = args.win_model
    
    # Track win count distribution
    win_counts = defaultdict(int)
    
    print_simulation_header(NUM_TEAMS, NUM_ROUNDS, NUM_SIMULATIONS, USE_BUCHHOLZ, WIN_MODEL,
                           f"Analyzing True Rank {TARGET_TRUE_RANK}")
    
    for i in range(NUM_SIMULATIONS):
        print_progress(i, NUM_SIMULATIONS)
        
        final_standings = run_tournament(NUM_TEAMS, NUM_ROUNDS, [], USE_BUCHHOLZ, WIN_MODEL)
        
        # Find the team with the target true_rank
        target_team = next((t for t in final_standings if t.true_rank == TARGET_TRUE_RANK), None)
        if target_team:
            win_counts[target_team.wins] += 1
    
    print(f"Completed {NUM_SIMULATIONS} simulations...")
    print()
    
    # Print results
    print(f"Win Distribution for True Rank {TARGET_TRUE_RANK}")
    print("Wins | Probability | Count")
    print("-----|-------------|-------")
    
    for wins in sorted(win_counts.keys()):
        probability = (win_counts[wins] / NUM_SIMULATIONS) * 100
        print(f"{wins:4d} | {probability:10.2f}% | {win_counts[wins]:6d}")
    
    # Calculate statistics
    total_wins = sum(wins * count for wins, count in win_counts.items())
    avg_wins = total_wins / NUM_SIMULATIONS
    print()
    print(f"Average wins: {avg_wins:.2f}")
    most_common_wins = max(win_counts, key=win_counts.get)
    most_common_pct = (win_counts[most_common_wins] / NUM_SIMULATIONS) * 100
    print(f"Most common: {most_common_wins} wins ({most_common_pct:.2f}%)")

if __name__ == "__main__":
    main()
