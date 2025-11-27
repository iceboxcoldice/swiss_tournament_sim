# Policy Debate Tournament Simulation Tools

A collection of Python scripts to simulate **Policy Debate tournaments** using Swiss-system pairing rules. Policy Debate tournaments closely follow Swiss system conventions with additional side constraints (Affirmative/Negative) and specific pairing rules.

## 📋 Tournament Manager

`tournament_manager.py` is a command-line tool for running and managing real-world tournaments. It lets you initialize a tournament, generate pairings round-by-round, record match results, and view current standings. Unlike the simulation scripts, this tool does **not** perform Monte-Carlo simulations; it simply tracks the actual progress of a live tournament.

**Features:**
- **Elimination Rounds**: Support for single-elimination brackets after preliminary rounds
- **Historical Standings**: View standings as they were after any specific round
- **Flexible Reporting**: Interactive, file-based, or single-match result entry
- **Export/Import**: Export tournament state and results to files

**Basic Usage:**
```bash
# Initialize tournament (8 teams, 4 prelim rounds, 2 elim rounds = semifinals + finals)
./tournament_manager.py init 8 4 --elim-rounds 2 --names teams.txt

# Generate pairings for round 1
./tournament_manager.py pair 1

# Report results
./tournament_manager.py report 1 --file results.txt

# View current standings
./tournament_manager.py standings

# View standings after round 2
./tournament_manager.py standings 2
```


## 🌐 Web Application

**Try it online:** [https://iceboxcoldice.github.io/swiss_tournament_sim/](https://iceboxcoldice.github.io/swiss_tournament_sim/)

Run tournament simulations directly in your browser - no installation required! The web app provides an intuitive tabbed interface for all simulation tools:

- **Head-to-Head Probability**: Calculate win probability between teams with specific histories
- **Top N Probability**: Determine probability of each rank finishing in top N positions
- **Win Distribution**: Analyze win distribution for teams with specific true ranks
- **Rank from Wins**: Find rank distribution for teams with specific win counts
- **Rank from History**: Discover rank distribution for teams with specific win/loss sequences


## Policy Debate & Swiss System Alignment

Policy Debate tournament pairing rules align with traditional Swiss system pairing:
*   **Score-based pairing**: Teams with similar win/loss records compete against each other
*   **Floating**: Teams can be paired up or down to adjacent score brackets when necessary
*   **Avoid repeats**: Teams should not face the same opponent twice
*   **Side constraints**: Unique to Policy Debate - teams alternate between Affirmative (Aff) and Negative (Neg) sides, with rules to balance side assignments

## Features

*   **Policy Debate Pairing Logic**: Implements Swiss pairing with Policy Debate-specific rules:
    *   Score groups
    *   Floating (pairing up/down)
    *   Side constraints (Aff/Neg) and balancing
    *   Side alternation and swap-side repeats to avoid floating
    *   Buchholz scoring (optional)
*   **Monte Carlo Simulation**: Run thousands of tournaments to generate statistically significant probability distributions.
*   **Win Models**:
    *   `elo`: Standard Elo-based probability (default).
    *   `linear`: Simple linear probability based on rank difference.
    *   `deterministic`: Higher rank always wins.

## Scripts

### 1. `swiss_sim.py`
Simulates tournaments to calculate the probability of each team rank finishing in the Top N positions.

**Usage:**
```bash
python3 swiss_sim.py <teams> <rounds> <top_n> [simulations] [options]
```

**Example:**
Calculate the probability of finishing in the Top 32 for a 128-team, 7-round tournament:
```bash
python3 swiss_sim.py 128 7 32 10000 --win-model elo
```

To disable Buchholz pairing:
```bash
python3 swiss_sim.py 128 7 32 10000 --donotuse-buchholz-pairing
```

---

### 2. `win_distribution_from_true_rank.py`
Calculates the distribution of total wins for a team with a specific "true rank" (initial strength).

**Usage:**
```bash
python3 win_distribution_from_true_rank.py <teams> <rounds> <true_rank> [simulations] [options]
```

**Example:**
See how many wins the 8th best team is likely to get:
```bash
python3 win_distribution_from_true_rank.py 128 7 8 10000
```

---

### 3. `true_rank_distribution_from_wins.py`
Calculates the distribution of "true ranks" for teams that finish with a specific win count. (e.g., "If a team wins 5 games, how strong are they likely to be?")

**Usage:**
```bash
python3 true_rank_distribution_from_wins.py <teams> <rounds> <wins> [simulations] [options]
```

**Example:**
Analyze the strength of teams that finish with 5 wins:
```bash
python3 true_rank_distribution_from_wins.py 128 7 5 10000
```

---

### 4. `true_rank_distribution_from_history.py`
Calculates the distribution of "true ranks" for teams that have a specific *sequence* of wins and losses. Useful for analyzing how early wins vs. late wins affect the strength of schedule and final standing.

**Usage:**
```bash
python3 true_rank_distribution_from_history.py <teams> <rounds> <history_string> [simulations] [options]
```

**Example:**
Analyze teams that started with 2 wins, lost 1, then won 2 (partial history):
```bash
python3 true_rank_distribution_from_history.py 128 7 "WWLWW" 10000
```

---

### 5. `head_to_head_probability.py`
Calculates the probability of one team beating another when they have specific win/loss histories. Useful for predicting matchup outcomes based on tournament performance.

**Usage:**
```bash
python3 head_to_head_probability.py <teams> <rounds> <history_a> <history_b> [simulations] [options]
```

**Example:**
Calculate the probability that a team with "W W" history beats a team with "W L" history:
```bash
python3 head_to_head_probability.py 128 5 "W W" "W L" 1000
```

**Adaptive Mode:**
Omit the simulations count to automatically determine the number needed for stable results:
```bash
python3 head_to_head_probability.py 128 5 "W W" "W L"
```

Specify minimum matchups needed (default: 100):
```bash
```bash
python3 head_to_head_probability.py 167 7 "W W L" "W L W" --min-matchups 200
```

---

### 6. `top_n_probability_from_history.py`
Calculates the probability of finishing in the top N positions given a specific win/loss history. Useful for determining advancement chances based on current tournament performance.

**Usage:**
```bash
python3 top_n_probability_from_history.py <teams> <rounds> <history_string> <top_n> [simulations] [options]
```

**Example:**
Calculate the probability of finishing in the top 16 with a "WWL" (2-1) record:
```bash
python3 top_n_probability_from_history.py 64 5 "WWL" 16 1000
```

**Output:**
- Probability percentage of finishing in top N
- Number of teams with matching history that finished in top N
- Average teams per tournament with the given history

## Common Options

All scripts support the following optional arguments:

*   `--win-model`:
    *   `elo` (default): Uses Elo rating (2000 - 50 * rank) to determine win probability.
    *   `linear`: Probability = 0.5 + (rank_diff / (2 * max_rank)).
    *   `deterministic`: Better rank always wins.
*   `--donotuse-buchholz-pairing`: Disable Buchholz score (sum of opponents' scores) as a tiebreaker *during* pairing. By default, Buchholz pairing is **enabled**.

## Implementation Notes

### Pairing Logic
*   **Rounds 0-1**: Teams are paired randomly without considering scores (all teams treated as one group).
*   **Rounds 2+**: Teams are grouped by score and paired within groups (standard Swiss pairing).
*   **List Handling**: The pairing function creates a shallow copy of the teams list to avoid mutating the original list structure during pairing, while preserving references to team objects for score updates.

### Sorting
*   After all rounds complete, teams are sorted by:
    1. Score (descending)
    2. Buchholz score (descending, as tiebreaker)
*   This ensures accurate identification of top performers for probability calculations.

## Requirements

*   Python 3.6+
*   No external dependencies (standard library only).
