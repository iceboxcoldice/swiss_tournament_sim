# Tournament Manager

A command-line tool for managing live Swiss-system tournaments with support for pairing generation, result reporting, and standings tracking.

## Overview

`tournament_manager.py` is a practical tournament management tool that maintains tournament state in a JSON file. Unlike the simulation scripts in this repository, this tool is designed for managing real tournaments with actual participants.

## Quick Start

```bash
# Initialize a tournament with 8 teams and 5 rounds
./tournament_manager.py init 8 5

# Generate pairings for Round 1
./tournament_manager.py pair 1

# Report a single match result (Round 1, Match 1, Team 0 (Aff) vs Team 1 (Neg), Aff wins)
# Note: Teams are numbered starting from 0
# In each match, one team is Affirmative (Aff) and one is Negative (Neg)
./tournament_manager.py report 1 1 0 1 A

# View current standings
./tournament_manager.py standings
```

## Commands

### `init` - Initialize Tournament

Create a new tournament with specified teams and rounds.

```bash
./tournament_manager.py init <num_teams> <num_rounds> [--names FILE] [--force]
```

**Arguments:**
- `num_teams`: Number of teams in the tournament
- `num_rounds`: Number of rounds to be played
- `--names FILE`: Optional file containing team names (one per line)
- `--force`: Overwrite existing tournament file

**Example:**
```bash
# Create tournament with 16 teams and 6 rounds
./tournament_manager.py init 16 6

# Create tournament with custom team names
./tournament_manager.py init 8 5 --names teams.txt
```

**Example teams.txt format:**
```
Harvard Debate Team
Yale Debate Team
Princeton Debate Team
Stanford Debate Team
MIT Debate Team
Columbia Debate Team
UChicago Debate Team
Berkeley Debate Team
```

### `pair` - Generate Pairings

Generate pairings for a specific round using Swiss pairing logic.

```bash
./tournament_manager.py pair <round_number>
```

**Rules:**
- Round 1 must be paired first
- Round 2 can be paired without Round 1 results
- Round 3+ requires all previous round results to be complete
- Cannot skip rounds (must pair sequentially)

**Example:**
```bash
./tournament_manager.py pair 1
./tournament_manager.py pair 2  # Allowed even if Round 1 incomplete
./tournament_manager.py pair 3  # Requires Round 2 results
```

### `report` - Record Results

Report match results for a round. Supports three modes: single match, file input, and interactive.

#### Single Match Mode

```bash
./tournament_manager.py report <round> <match_id> <aff_id> <neg_id> <outcome> [--force]
```

**Arguments:**
- `round`: Round number
- `match_id`: Match ID (required)
- `aff_id`: Affirmative team ID (optional, for consistency check)
- `neg_id`: Negative team ID (optional, for consistency check)
- `outcome`: Result - `A` (Aff wins) or `N` (Neg wins)
- `--force`: Overwrite existing result

**Example:**
```bash
# Report Match 1 result (Aff wins)
./tournament_manager.py report 1 1 0 1 A

# Overwrite existing result
./tournament_manager.py report 1 1 0 1 N --force
```

#### File Input Mode

```bash
./tournament_manager.py report <round> --file RESULTS_FILE [--force]
```

**File Format:**
```
Round MatchID AffID NegID Outcome
1 1 0 1 A
1 2 2 3 N
1 3 4 5 A
```

Each line contains:
- `Round`: Round number
- `MatchID`: Match ID from the pairing
- `AffID`: Affirmative team ID (for consistency check)
- `NegID`: Negative team ID (for consistency check)
- `Outcome`: `A` (Aff wins) or `N` (Neg wins)

**Example:**
```bash
./tournament_manager.py report 1 --file round1_results.txt
```

**Example round1_results.txt:**
```
# Example results file for Round 1
# Format: Round MatchID AffID NegID Outcome
# Outcome: A (Aff wins) or N (Neg wins)

1 1 0 1 A
1 2 2 3 N
1 3 4 5 A
1 4 6 7 N
```

**Using 'all' as Round Specifier:**

You can use `all` instead of a round number to process results from all rounds in the file:

```bash
# Process results from all rounds in the file
./tournament_manager.py report all --file all_results.txt
```

This is useful when:
- Importing results from multiple rounds at once
- Re-importing exported results after `reinit`
- Batch updating results across rounds

**Note:** The `all` specifier:
- Only works with `--file` mode
- Processes all rounds found in the file
- Updates `current_round` to the highest fully complete round
- Does not require previous rounds to be complete (similar to `--force`)

#### Interactive Mode

```bash
./tournament_manager.py report <round>
```

Prompts for each match result interactively. Type `q` or `exit` to quit early.

**Example:**
```bash
./tournament_manager.py report 1
# Follow prompts to enter results for each match
```

#### Using `--force` for Flexible Reporting

The `--force` flag provides two important capabilities:

1. **Overwrite existing results**: Change a result that was already reported
2. **Bypass previous round completion requirement**: Report results for later rounds even if earlier rounds are incomplete

**Examples:**
```bash
# Overwrite an existing result
./tournament_manager.py report 1 1 0 1 N --force

# Report Round 3 results even if Round 1 or 2 are incomplete
./tournament_manager.py report 3 --file round3_results.txt --force

# Useful after reinit with partial results
./tournament_manager.py reinit --pairings backup.txt --results partial_results.txt
./tournament_manager.py report 2 --file round2_results.txt --force
```

**Note:** By default, the `report` command requires all previous rounds (1 to N-1) to be complete before reporting Round N results. Use `--force` to override this validation when needed.

### `standings` - View Standings

Display current tournament standings sorted by score, Buchholz, and wins.

```bash
./tournament_manager.py standings
```

**Output:**
```
--- Current Standings ---
Rank  Name                 Wins  Score  Buchholz
--------------------------------------------------
1     Team 1               3     3      5
2     Team 2               2     2      4
3     Team 3               2     2      3
...
```

### `export` - Export Results and Pairings

Export tournament data to files for backup, sharing, or editing.

```bash
./tournament_manager.py export [-o OUTPUT_FILE]
```

**Arguments:**
- `-o, --output OUTPUT_FILE`: Output filename for results (default: `results_export.txt`)

**Generated Files:**
1. **Results file** (`OUTPUT_FILE`): Machine-readable format for re-importing
2. **Pairings file** (`OUTPUT_FILE_pairings.txt`): Human-readable match list

**Results File Format:**
- Reported matches appear as active lines
- Unreported matches appear as commented templates with team names
- Can be edited and re-imported using `report --file`

**Example:**
```bash
# Export current tournament state
./tournament_manager.py export

# Export to custom filename
./tournament_manager.py export -o round3_backup.txt
```

**Example results_export.txt:**
```
# Exported results from tournament
# Format: Round MatchID AffID NegID Outcome
# Outcome: A (Aff wins) or N (Neg wins)
# Uncomment and edit lines below to report results

# Round 1
1 1 0 2 A
1 2 1 3 N

# Round 2
# 2 3 0 1 A_or_N  # Team 1 vs Team 2
# 2 4 2 3 A_or_N  # Team 3 vs Team 4
```

**Example results_export_pairings.txt:**
```
# Tournament Pairings
# Format: Round MatchID | Aff Team vs Neg Team | Result

======================================================================
Round 1
======================================================================

Match  1 | Team 1               (Aff) vs Team 3               (Neg) | Winner: A
Match  2 | Team 2               (Aff) vs Team 4               (Neg) | Winner: N

======================================================================
Round 2
======================================================================

Match  3 | Team 1               (Aff) vs Team 2               (Neg) | Not reported
Match  4 | Team 4               (Aff) vs Team 3               (Neg) | Not reported
```

**Use Cases:**
- **Backup**: Save tournament state at key points
- **Sharing**: Distribute pairings to participants
- **Editing**: Use results file as template for entering results
- **Re-import**: Results file can be edited and re-imported idempotently

### `reinit` - Reconstruct Tournament

Reconstruct a tournament from pairing and results files. Useful for disaster recovery, migration, or creating tournaments from external data.

```bash
./tournament_manager.py reinit --pairings PAIRING_FILE [--results RESULTS_FILE] [--names NAMES_FILE] [--force]
```

**Arguments:**
- `--pairings, -p PAIRING_FILE`: Required. File containing match pairings
- `--results, -r RESULTS_FILE`: Optional. File containing match results
- `--names NAMES_FILE`: Optional. File with team names (one per line, indexed by team ID)
- `--force`: Overwrite existing tournament

**Pairing File Format:**
Simple format with one match per line:
```
# Format: Round MatchID AffID NegID
1 1 0 1
1 2 2 3
2 3 0 2
2 4 1 3
```

**Note:** This is a simple machine-readable format, not the formatted pairings file from `export`. You can create this manually or extract from spreadsheets.

**Results File Format:**
Same as `report --file` format:
```
# Format: Round MatchID AffID NegID Outcome
1 1 0 1 A
1 2 2 3 N
```

**Validation:**
The command performs comprehensive consistency checks:
- Match IDs must be unique globally
- Round numbers must be sequential (1, 2, 3, ...)
- All match IDs in results must exist in pairings
- Team IDs in results must match pairings
- Outcomes must be A or N

**Example:**
```bash
# Reconstruct from pairings only
./tournament_manager.py reinit --pairings backup_pairings.txt

# Reconstruct with results
./tournament_manager.py reinit --pairings backup.txt --results backup.txt

# Overwrite existing tournament
./tournament_manager.py reinit -p pairings.txt -r results.txt --force
```

**Use Cases:**
- **Disaster Recovery**: Restore tournament from exported files
- **Migration**: Move tournament between systems
- **Manual Creation**: Create tournament from spreadsheet data
- **Testing**: Quickly set up test scenarios

## Tournament State

Tournament data is stored in `tournament.json` with the following structure:

- **config**: Tournament settings (num_teams, num_rounds)
- **current_round**: Last completed round number
- **rounds**: Array of round data with pairings and results
- **teams**: Team statistics (scores, wins, Buchholz, side history)

## Features

### Consistency Checks

- **Match ID validation**: Ensures match exists in the specified round
- **Team ID verification**: Optional checks that Aff/Neg IDs match stored pairings
- **Result completeness**: Validates all previous round results before pairing new rounds

### Thread-Safe Updates

- Uses threading locks for safe concurrent access
- Automatically recalculates all team statistics when results are updated
- Supports force-overwriting results with proper stat recalculation

### Swiss Pairing Logic

- Pairs teams with similar records
- Balances Aff/Neg sides
- Uses Buchholz tiebreaker for standings
- Avoids repeat matchups when possible

## Workflow Example

```bash
# 1. Initialize tournament
./tournament_manager.py init 8 4 --names teams.txt

# 2. Pair Round 1
./tournament_manager.py pair 1

# 3. Export pairings for distribution
./tournament_manager.py export -o round1.txt
# Distribute round1_pairings.txt to participants

# 4. Report Round 1 results
./tournament_manager.py report 1 --file round1.txt

# 5. Check standings
./tournament_manager.py standings

# 6. Pair Round 2 (can do before Round 1 results if needed)
./tournament_manager.py pair 2

# 7. Report Round 2 results interactively
./tournament_manager.py report 2

# 8. Continue for remaining rounds...
./tournament_manager.py pair 3
./tournament_manager.py report 3 1 0 2 A
./tournament_manager.py report 3 2 1 3 N
# ... report remaining matches

# 9. Final standings
./tournament_manager.py standings

# 10. Export final results for records
./tournament_manager.py export -o final_results.txt
```

## Error Handling

The tool provides clear error messages for common issues:

- **Missing pairings**: "Error: Pairings for Round X have not been generated yet."
- **Incomplete results**: Lists all unreported matches before blocking pairing
- **ID mismatches**: "Error: Aff ID mismatch for Match X (expected Y, got Z)"
- **Duplicate results**: "Error: Result for Match X already recorded. Use --force to overwrite."

## Tips

1. **Use Match IDs**: When reporting results, use match IDs as the primary identifier for simplicity
2. **Batch reporting**: Use file input mode for efficient bulk result entry
3. **Verify pairings**: Always check pairings before distributing to participants
4. **Backup data**: Keep copies of `tournament.json` at key points
5. **Force flag**: Use `--force` carefully when overwriting results - stats will be recalculated

## Differences from Simulation Tools

Unlike `swiss_sim.py` and other simulation scripts:
- Manages real tournaments, not simulations
- Stores persistent state in JSON
- Supports interactive result entry
- Provides consistency checks and validation
- Designed for live tournament operations
