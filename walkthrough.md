# Swiss Tournament Simulation Walkthrough

I have implemented a Python simulation for a Swiss-system tournament to estimate the probability of teams finishing in the top N.

## Implementation Details

### Team & Match Model
- **Team**: Has a `true_rank` (1 is best).
- **Match Probability**: Uses a logistic function based on rank difference.
  $$ P(A \text{ wins}) = \frac{1}{1 + 10^{(R_B - R_A)/400}} $$
  where $R$ is a rating derived from rank ($2000 - 50 \times \text{rank}$).

### Pairing Logic
- **Swiss System**:
    - Teams are grouped by score.
    - Within score groups, teams are paired randomly (shuffled).
    - Floating is handled by a greedy approach: if a team cannot find a valid opponent in its group (or group is odd), it looks at the next available team in the sorted list.
    - Repeat matchups are avoided.

## Simulation Results
Running simulations with:
- **Teams**: 166
- **Rounds**: 7
- **Top N**: 32
- **Simulations**: 10,000 (default)

### Sample Output (100 runs)
```
Probability of finishing in Top 32
Rank | Probability
-----|------------
   1 | 100.00%
   2 | 100.00%
   3 | 100.00%
   4 | 99.00%
   5 | 100.00%
...
  30 | 57.00%
  31 | 51.00%
  32 | 47.00%
  33 | 40.00%
...
  60 | 0.00%
```
The results demonstrate that higher-ranked teams (lower rank number) consistently finish in the top positions, with probabilities tapering off as rank increases. The "floating" logic ensures fair pairings even when score groups are uneven.
