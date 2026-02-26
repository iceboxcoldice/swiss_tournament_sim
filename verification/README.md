# Verification Suite

This directory contains regression tests and verification scripts for the Swiss Tournament Sim project. These tests ensure the correctness of the tournament management logic, judge assignments, and bracket generation.

## Prerequisites

- **Python 3.x**
- **Node.js**

## Running JavaScript Tests (Tournament Manager UI Logic)

These tests use Node.js to verify the core logic in `docs/manager/tournament.js`. They mock `localStorage` and other browser environments to run in the terminal.

### Elimination and Bracket Tests
```bash
# Test 16-team break to Quarterfinals/Semifinals/Finals
node verification/test_16team_break.js

# Test 8-team break logic
node verification/test_elimination_rounds.js

# Test 32-team bracket structure
node verification/test_32_team_bracket.js
```

### Judge Management
```bash
# Verify judge assignments and institution conflicts
node verification/test_judge_management.js
```

## Running Python Tests (Tournament Manager CLI Logic)

These tests verify the behavior of `tournament_manager.py`.

### Pairing and Data Integrity
```bash
# Verify Swiss pairing logic and round blocking
python3 verification/verify_pair_logic.py

# Verify tournament export/import and data persistence
python3 verification/verify_export.py

# Verify global match ID uniqueness across rounds
python3 verification/verify_global_ids.py

# Verify re-initialization from external files
python3 verification/verify_reinit.py
```

### Shell Integration Tests
```bash
# Comprehensive end-to-end test of elimination rounds
bash verification/test_python_elim.sh

# Verify historical standings retrieval
bash verification/test_standings_history.sh
```

---

> [!IMPORTANT]
> Some tests create temporary files like `r1_results.txt` or `tournament.json`. Most scripts perform automatic cleanup, but if a test fails, you may need to manually delete these files before re-running.
