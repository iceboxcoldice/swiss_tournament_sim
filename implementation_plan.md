# Swiss Tournament Simulation Plan

## Goal
Create a Python program to simulate a Swiss-system tournament and calculate the probability of a team with a specific rank finishing in the top N positions.

## Core Components

### 1. Team Model
- **Attributes**:
    - `id`: Unique identifier.
    - `true_rank`: The inherent strength/rank of the team (used to determine match outcomes).
    - `score`: Current tournament score.
    - `opponents`: List of teams played against (to avoid repeat matchups).
    - `buchholz`: Tie-breaking score (sum of opponents' scores).

### 2. Match Simulation
- **Logic**:
    - Probability of Team A beating Team B depends on their `true_rank` difference.
    - Simple model: Higher rank has higher probability (e.g., Bradley-Terry model or simple sigmoid function of rank difference).

### 3. Swiss Pairing Logic (with Floating)
- **Rules**:
    - Group teams by score.
    - **Randomly pair teams within the same score group.**
    - If a group has an odd number of teams, "float" one team down to the next score group.
    - Avoid repeat matchups.

### 4. Tournament Simulation
- **Parameters**:
    - `num_teams`: Total number of teams.
    - `num_rounds`: Number of rounds to play.
    - `top_n`: The target top N positions.
    - `num_simulations`: Number of Monte Carlo iterations.

### 5. Output
- Calculate the percentage of times a team of `true_rank` $R$ finishes in the top $N$.
- Display probabilities for all ranks or specific ranks of interest.

## Proposed File Structure
- `swiss_sim.py`: Main script containing classes and simulation logic.

## Verification
- Run the script with small parameters to verify pairing logic (no repeats, correct score groups).
- Run with large `num_simulations` to check if results are statistically reasonable (better teams should have higher probabilities).
