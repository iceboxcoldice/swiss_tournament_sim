"""true_rank_from_history.py

Compute the distribution of initial (true) ranks for a team that exhibits a given
win/loss history in a Swiss‑system tournament.

Usage example:
    python3 true_rank_from_history.py 128 7 "W L W W L" 5000 \
        --win-model elo

The script treats the history as a sequence of wins ("W") and losses ("L").
Only the total number of wins is used to filter teams, because the pairing
logic in the simulator is stochastic and the exact order of wins does not
affect the probability of a particular true rank achieving that win count.
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
        "Compute true‑rank distribution for a given win/loss history."
    )
    add_tournament_args(parser)
    parser.add_argument(
        "history",
        type=str,
        help="Win/Loss sequence, e.g. 'W L W W L' or 'WWLWL'",
    )
    add_simulations_arg(parser)
    add_common_args(parser)

    args = parser.parse_args()

    NUM_TEAMS = args.teams
    NUM_ROUNDS = args.rounds
    HISTORY_STR = args.history.replace(" ", "").upper()
    TARGET_WINS = HISTORY_STR.count("W")
    NUM_SIMULATIONS = args.simulations
    USE_BUCHHOLZ = not args.donotuse_buchholz_pairing
    WIN_MODEL = args.win_model

    # Track true‑rank distribution for teams with target wins
    true_rank_counts = defaultdict(int)
    total_teams_with_wins = 0

    print_simulation_header(NUM_TEAMS, NUM_ROUNDS, NUM_SIMULATIONS, USE_BUCHHOLZ, WIN_MODEL,
                           f"Analyzing history '{HISTORY_STR}' (target wins={TARGET_WINS})")

    # Run simulations and collect true rank distribution matching exact history
    for i in range(NUM_SIMULATIONS):
        print_progress(i, NUM_SIMULATIONS)
        final_teams = run_tournament(
            NUM_TEAMS, NUM_ROUNDS, [], USE_BUCHHOLZ, WIN_MODEL
        )
        for team in final_teams:
            # Match the exact prefix of the history (allow shorter if tournament ends early)
            if len(team.history) >= len(HISTORY_STR) and "".join(team.history[:len(HISTORY_STR)]) == HISTORY_STR:
                true_rank_counts[team.true_rank] += 1
                total_teams_with_wins += 1

    print(f"Completed {NUM_SIMULATIONS} simulations...\n")
    if total_teams_with_wins == 0:
        print(f"No team achieved the exact history '{HISTORY_STR}'.")
        sys.exit(0)

    # Print results
    print(f"True Rank (Initial Rank) Distribution for Teams with {TARGET_WINS} Wins")
    print(f"(Based on {total_teams_with_wins} teams across {NUM_SIMULATIONS} simulations)")
    print()
    print("True Rank | Probability | Count")
    print("----------|-------------|-------")
    
    for true_rank in sorted(true_rank_counts.keys()):
        probability = (true_rank_counts[true_rank] / total_teams_with_wins) * 100
        if probability >= 0.01:
            print(f"{true_rank:9d} | {probability:10.2f}% | {true_rank_counts[true_rank]:6d}")

    # Statistics
    avg_true_rank = sum(true_rank * cnt for true_rank, cnt in true_rank_counts.items()) / total_teams_with_wins
    best_true_rank = min(true_rank_counts) if true_rank_counts else 0
    worst_true_rank = max(true_rank_counts) if true_rank_counts else 0
    most_common = max(true_rank_counts, key=true_rank_counts.get)
    most_common_pct = (true_rank_counts[most_common] / total_teams_with_wins) * 100
    print()
    print(f"Average true rank: {avg_true_rank:.1f}")
    print(f"Best true rank: {best_true_rank}")
    print(f"Worst true rank: {worst_true_rank}")
    print(f"Most common: True Rank {most_common} ({most_common_pct:.2f}%)")
    print()
    avg_teams = total_teams_with_wins / NUM_SIMULATIONS
    print(f"Average teams per tournament with {TARGET_WINS} wins: {avg_teams:.2f}")


if __name__ == "__main__":
    main()
