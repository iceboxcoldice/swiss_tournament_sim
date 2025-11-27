"""top_n_probability_from_history.py

Compute the probability of finishing in the top N positions after completing
preliminary rounds with a given win/loss history in a Swiss-system tournament.

Usage example:
    python3 top_n_probability_from_history.py 128 7 "W W L W L" 16 5000 \
        --win-model elo

The script simulates tournaments and tracks how often teams with the exact
given history finish in the top N positions.
"""

import sys
from collections import defaultdict

# Import shared utilities
from swiss_utils import (
    create_base_parser,
    add_tournament_args,
    add_simulations_arg,
    add_common_args,
    print_simulation_header,
    print_progress,
)

# Import core simulation functions and Team class
from swiss_sim import Team, pair_round, simulate_match, run_tournament


def main():
    parser = create_base_parser(
        "Compute top-N probability for a given win/loss history."
    )
    add_tournament_args(parser)
    parser.add_argument(
        "history",
        type=str,
        help="Win/Loss sequence, e.g. 'W L W W L' or 'WWLWL'",
    )
    parser.add_argument(
        "top_n",
        type=int,
        help="Top N positions to track (e.g., 16 for top 16)",
    )
    add_simulations_arg(parser)
    add_common_args(parser)

    args = parser.parse_args()

    NUM_TEAMS = args.teams
    NUM_ROUNDS = args.rounds
    HISTORY_STR = args.history.replace(" ", "").upper()
    TARGET_WINS = HISTORY_STR.count("W")
    TOP_N = args.top_n
    NUM_SIMULATIONS = args.simulations
    USE_BUCHHOLZ = not args.donotuse_buchholz_pairing
    WIN_MODEL = args.win_model

    # Validate top_n
    if TOP_N > NUM_TEAMS:
        print(f"Error: top_n ({TOP_N}) cannot be greater than num_teams ({NUM_TEAMS})")
        sys.exit(1)

    # Track teams with matching history
    total_teams_with_history = 0
    teams_in_top_n = 0

    print_simulation_header(NUM_TEAMS, NUM_ROUNDS, NUM_SIMULATIONS, USE_BUCHHOLZ, WIN_MODEL,
                           f"Analyzing history '{HISTORY_STR}' (target wins={TARGET_WINS}, top N={TOP_N})")

    # Run simulations and track top N probability
    for i in range(NUM_SIMULATIONS):
        print_progress(i, NUM_SIMULATIONS)
        final_teams = run_tournament(
            NUM_TEAMS, NUM_ROUNDS, [], USE_BUCHHOLZ, WIN_MODEL
        )
        
        # final_teams is already sorted by (score, buchholz) descending
        top_n_teams = final_teams[:TOP_N]
        top_n_ids = {team.id for team in top_n_teams}
        
        for team in final_teams:
            # Match the exact prefix of the history
            if len(team.history) >= len(HISTORY_STR) and "".join(team.history[:len(HISTORY_STR)]) == HISTORY_STR:
                total_teams_with_history += 1
                if team.id in top_n_ids:
                    teams_in_top_n += 1

    print(f"Completed {NUM_SIMULATIONS} simulations...\n")
    
    if total_teams_with_history == 0:
        print(f"No team achieved the exact history '{HISTORY_STR}'.")
        sys.exit(0)

    # Calculate probability
    probability = (teams_in_top_n / total_teams_with_history) * 100

    # Print results
    print(f"Top {TOP_N} Probability for Teams with History '{HISTORY_STR}'")
    print(f"(Based on {total_teams_with_history} teams across {NUM_SIMULATIONS} simulations)")
    print()
    print(f"Probability of finishing in top {TOP_N}: {probability:.2f}%")
    print(f"Teams in top {TOP_N}: {teams_in_top_n} / {total_teams_with_history}")
    print()
    
    # Additional statistics
    avg_teams_per_tournament = total_teams_with_history / NUM_SIMULATIONS
    print(f"Average teams per tournament with history '{HISTORY_STR}': {avg_teams_per_tournament:.2f}")


if __name__ == "__main__":
    main()
