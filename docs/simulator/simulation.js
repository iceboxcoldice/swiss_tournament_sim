// simulation.js - Core simulation logic

// Consistent LCG-based PRNG for Python/JS alignment
let _seed = 12345;

function setSeed(newSeed) {
    _seed = newSeed;
}

function lcgRandom() {
    // Parameters for LCG (same as used in Python)
    _seed = (_seed * 1664525 + 1013904223) % 4294967296;
    return _seed / 4294967296;
}

// Team class
class Team {
    constructor(id, trueRank) {
        this.id = id;
        this.trueRank = trueRank;
        this.score = 0;
        this.history = [];
        this.opponentHistory = [];
        this.buchholz = 0;
        this.wins = 0;
        this.aff = 0;
        this.neg = 0;
        this.lastSide = null; // 'Aff' or 'Neg'
        this.sideHistory = {}; // OppId -> ['Aff', 'Neg', ...]
    }
}

// Probability of win calculation
function probabilityOfWin(teamA, teamB, winModel = 'elo') {
    if (winModel === 'deterministic') {
        return teamA.trueRank < teamB.trueRank ? 1 : 0;
    }

    if (winModel === 'linear') {
        const maxRank = Math.max(teamA.trueRank, teamB.trueRank);
        const rankDiff = teamB.trueRank - teamA.trueRank;
        return 0.5 + (rankDiff / (2 * maxRank));
    }

    // Elo model (default)
    const ratingA = 2000 - 50 * teamA.trueRank;
    const ratingB = 2000 - 50 * teamB.trueRank;
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Simulate a match
// Simulate a match
function simulateMatch(teamA, teamB, winModel) {
    const probA = probabilityOfWin(teamA, teamB, winModel);
    return lcgRandom() < probA ? [1, 0] : [0, 1];
}

// Calculate side preference score (Positive=Wants Aff, Negative=Wants Neg)
function calculateSidePreference(team) {
    let pref = team.neg - team.aff;
    if (team.lastSide === 'Neg') {
        pref += 2.0;
    } else if (team.lastSide === 'Aff') {
        pref -= 2.0;
    }
    return pref;
}

// Find best opponent for t1 in group
function findBestOpponent(t1, group) {
    let bestNonRepeat = null;
    let bestNonRepeatIdx = -1;
    let bestSwappable = null;
    let bestSwappableIdx = -1;

    for (let i = 0; i < group.length; i++) {
        const candidate = group[i];

        // Check repeat
        if (!t1.opponentHistory.includes(candidate.id)) {
            // Priority 1: Non-repeat
            bestNonRepeat = candidate;
            bestNonRepeatIdx = i;
            break; // Strict Swiss: take first valid
        } else {
            // Check for swappable repeat
            if (bestSwappable === null) {
                const sidesPlayed = t1.sideHistory[candidate.id] || [];
                const canPlayAff = !sidesPlayed.includes('Aff');
                const canPlayNeg = !sidesPlayed.includes('Neg');

                if (canPlayAff || canPlayNeg) {
                    bestSwappable = candidate;
                    bestSwappableIdx = i;
                }
            }
        }
    }

    if (bestNonRepeat) {
        return { opponent: bestNonRepeat, idx: bestNonRepeatIdx, isSwappable: false };
    } else if (bestSwappable) {
        return { opponent: bestSwappable, idx: bestSwappableIdx, isSwappable: true };
    }

    return { opponent: null, idx: -1, isSwappable: false };
}

// Determine sides based on history
function determineSides(teamA, teamB, isSwappable = false) {
    if (isSwappable) {
        const sidesPlayed = teamA.sideHistory[teamB.id] || [];
        const canPlayAff = !sidesPlayed.includes('Aff');
        const canPlayNeg = !sidesPlayed.includes('Neg');

        if (canPlayAff && !canPlayNeg) return [teamA, teamB];
        if (canPlayNeg && !canPlayAff) return [teamB, teamA];
    }

    const prefA = calculateSidePreference(teamA);
    const prefB = calculateSidePreference(teamB);

    if (prefA > prefB) { // A wants Aff more
        return [teamA, teamB];
    } else if (prefB > prefA) { // B wants Aff more
        return [teamB, teamA];
    } else {
        return lcgRandom() < 0.5 ? [teamA, teamB] : [teamB, teamA];
    }
}

// Update Buchholz scores
function updateBuchholz(teams) {
    const teamMap = new Map(teams.map(t => [t.id, t]));
    for (const t of teams) {
        let buchholz = 0;
        for (const oppId of t.opponentHistory) {
            if (oppId !== -1) {
                const opp = teamMap.get(oppId);
                if (opp) {
                    buchholz += opp.score;
                }
            }
        }
        t.buchholz = buchholz;
    }
}

// Pair teams for a round
function pairRound(teams, roundNum, useBuchholz) {
    if (useBuchholz) {
        updateBuchholz(teams);
    }

    const teamsCopy = [...teams];

    // Shuffle for randomization
    for (let i = teamsCopy.length - 1; i > 0; i--) {
        const j = Math.floor(lcgRandom() * (i + 1));
        [teamsCopy[i], teamsCopy[j]] = [teamsCopy[j], teamsCopy[i]];
    }

    // Group by score
    const scoreGroups = {};
    if (roundNum > 1) {
        for (const t of teamsCopy) {
            if (!scoreGroups[t.score]) scoreGroups[t.score] = [];
            scoreGroups[t.score].push(t);
        }
    } else {
        scoreGroups[0] = [...teamsCopy];
    }

    const sortedScores = Object.keys(scoreGroups).map(Number).sort((a, b) => b - a);
    const pairs = [];
    let floaters = [];

    for (const score of sortedScores) {
        const group = [...scoreGroups[score]];
        // Add floaters
        group.push(...floaters);
        floaters = [];

        // Sort
        if (roundNum > 1) {
            group.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                // User-defined logic: Sort by Score, then Buchholz, then Random
                if (useBuchholz && b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
                return 0; // Maintain shuffled order (random)
            });
        }

        while (group.length > 0) {
            const t1 = group.shift();
            const { opponent, idx, isSwappable } = findBestOpponent(t1, group);

            if (opponent) {
                group.splice(idx, 1);
                pairs.push(determineSides(t1, opponent, isSwappable));
            } else {
                floaters.push(t1);
            }
        }
    }

    // Handle floaters
    if (floaters.length > 0) {
        while (floaters.length >= 2) {
            const t1 = floaters.shift();
            // Just take next one
            const t2 = floaters.shift();
            pairs.push(determineSides(t1, t2, false));
        }
        if (floaters.length > 0) {
            // Bye
            floaters[0].score += 1;
            floaters[0].wins += 1;
            floaters[0].history.push('W');
            floaters[0].opponentHistory.push(-1);
        }
    }

    return pairs;
}

// Run a tournament
function runTournament(numTeams, numRounds, useBuchholz, winModel) {
    const teams = Array.from({ length: numTeams }, (_, i) => new Team(i, i + 1));

    for (let round = 0; round < numRounds; round++) {
        const pairs = pairRound(teams, round, useBuchholz);

        for (const [teamA, teamB] of pairs) {
            // teamA is Aff, teamB is Neg (assigned by determineSides)
            teamA.aff++;
            teamB.neg++;
            teamA.lastSide = 'Aff';
            teamB.lastSide = 'Neg';

            // Update side history
            if (!teamA.sideHistory[teamB.id]) teamA.sideHistory[teamB.id] = [];
            teamA.sideHistory[teamB.id].push('Aff');

            if (!teamB.sideHistory[teamA.id]) teamB.sideHistory[teamA.id] = [];
            teamB.sideHistory[teamA.id].push('Neg');

            const [s1, s2] = simulateMatch(teamA, teamB, winModel);
            teamA.score += s1;
            teamB.score += s2;
            teamA.opponentHistory.push(teamB.id);
            teamB.opponentHistory.push(teamA.id);

            if (s1 > s2) {
                teamA.wins += 1;
                teamA.history.push('W');
                teamB.history.push('L');
            } else {
                teamB.wins += 1;
                teamB.history.push('W');
                teamA.history.push('L');
            }
        }
    }
    // Final Buchholz Update (match Python lines 294-297)
    if (useBuchholz) {
        updateBuchholz(teams);
    }

    // Sort by score and buchholz
    teams.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.buchholz - a.buchholz;
    });

    return teams;
}

// Head-to-Head Simulation
async function runHeadToHeadSimulation(params, progressCallback) {
    const { numTeams, numRounds, historyA, historyB, minMatchups, useBuchholz, winModel, maxSimulations } = params;

    let totalSims = 0;
    let matchupCount = 0;
    let teamAWins = 0;
    let teamBWins = 0;
    const teamARanks = [];
    const teamBRanks = [];

    const batchSize = 100;
    const maxSims = maxSimulations || 50000;

    while (totalSims < maxSims && matchupCount < minMatchups) {
        for (let i = 0; i < batchSize; i++) {
            const teams = runTournament(numTeams, numRounds, useBuchholz, winModel);

            const teamsA = teams.filter(t =>
                t.history.length >= historyA.length &&
                t.history.slice(0, historyA.length).join('') === historyA
            );

            const teamsB = teams.filter(t =>
                t.history.length >= historyB.length &&
                t.history.slice(0, historyB.length).join('') === historyB
            );

            const targetRound = historyA.length;

            for (const teamA of teamsA) {
                if (targetRound >= teamA.opponentHistory.length) continue;

                for (const teamB of teamsB) {
                    if (teamA.opponentHistory[targetRound] === teamB.id) {
                        matchupCount++;
                        teamARanks.push(teamA.trueRank);
                        teamBRanks.push(teamB.trueRank);

                        // Use actual match result from tournament history
                        if (teamA.history[targetRound] === 'W') {
                            teamAWins++;
                        } else {
                            teamBWins++;
                        }
                    }
                }
            }
        }

        totalSims += batchSize;
        progressCallback(totalSims, matchupCount);
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    // NOTE: In floating scenarios (e.g. WW vs WL), the WW team is often the "worst" 2-0 team 
    // floating down to play the "best" 1-1 team. So avgRankA (WW) being worse (higher #) 
    // than avgRankB (WL) is actually evaluating the correct specific teams that meet.
    return {
        totalSims,
        matchupCount,
        teamAWins,
        teamBWins,
        avgRankA: teamARanks.length > 0 ? teamARanks.reduce((a, b) => a + b, 0) / teamARanks.length : 0,
        avgRankB: teamBRanks.length > 0 ? teamBRanks.reduce((a, b) => a + b, 0) / teamBRanks.length : 0
    };
}

// Top N Probability Simulation
async function runTopNSimulation(params, progressCallback) {
    const { numTeams, numRounds, topN, numSims, useBuchholz, winModel } = params;

    const topNCounts = new Array(numTeams).fill(0);

    for (let sim = 0; sim < numSims; sim++) {
        const teams = runTournament(numTeams, numRounds, useBuchholz, winModel);

        for (let i = 0; i < Math.min(topN, teams.length); i++) {
            topNCounts[teams[i].trueRank - 1]++;
        }

        if ((sim + 1) % 100 === 0) {
            progressCallback(sim + 1, numSims);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    const probabilities = topNCounts.map(count => (count / numSims) * 100);

    return { probabilities, numSims };
}

// Win Distribution Simulation
async function runWinDistSimulation(params, progressCallback) {
    const { numTeams, numRounds, targetRank, numSims, useBuchholz, winModel } = params;

    const winCounts = {};

    for (let sim = 0; sim < numSims; sim++) {
        const teams = runTournament(numTeams, numRounds, useBuchholz, winModel);
        const targetTeam = teams.find(t => t.trueRank === targetRank);

        if (targetTeam) {
            winCounts[targetTeam.wins] = (winCounts[targetTeam.wins] || 0) + 1;
        }

        if ((sim + 1) % 100 === 0) {
            progressCallback(sim + 1, numSims);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return { winCounts, numSims };
}

// Rank from Wins Simulation
async function runRankFromWinsSimulation(params, progressCallback) {
    const { numTeams, numRounds, targetWins, numSims, useBuchholz, winModel } = params;

    const rankCounts = {};
    let totalTeams = 0;

    for (let sim = 0; sim < numSims; sim++) {
        const teams = runTournament(numTeams, numRounds, useBuchholz, winModel);

        for (const team of teams) {
            if (team.wins === targetWins) {
                rankCounts[team.trueRank] = (rankCounts[team.trueRank] || 0) + 1;
                totalTeams++;
            }
        }

        if ((sim + 1) % 100 === 0) {
            progressCallback(sim + 1, numSims);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return { rankCounts, totalTeams, numSims };
}

// Rank from History Simulation
async function runRankFromHistorySimulation(params, progressCallback) {
    const { numTeams, numRounds, history, numSims, useBuchholz, winModel } = params;

    const rankCounts = {};
    let totalTeams = 0;

    for (let sim = 0; sim < numSims; sim++) {
        const teams = runTournament(numTeams, numRounds, useBuchholz, winModel);

        for (const team of teams) {
            if (team.history.length >= history.length &&
                team.history.slice(0, history.length).join('') === history) {
                rankCounts[team.trueRank] = (rankCounts[team.trueRank] || 0) + 1;
                totalTeams++;
            }
        }

        if ((sim + 1) % 100 === 0) {
            progressCallback(sim + 1, numSims);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return { rankCounts, totalTeams, numSims };
}

// Top-N from History Simulation
async function runTopNFromHistorySimulation(params, progressCallback) {
    const { numTeams, numRounds, history, topN, numSims, useBuchholz, winModel } = params;

    let totalTeamsWithHistory = 0;
    let teamsInTopN = 0;

    for (let sim = 0; sim < numSims; sim++) {
        const teams = runTournament(numTeams, numRounds, useBuchholz, winModel);

        // teams is already sorted by score and buchholz
        const topNTeamIds = new Set(teams.slice(0, topN).map(t => t.id));

        for (const team of teams) {
            if (team.history.length >= history.length &&
                team.history.slice(0, history.length).join('') === history) {
                totalTeamsWithHistory++;
                if (topNTeamIds.has(team.id)) {
                    teamsInTopN++;
                }
            }
        }

        if ((sim + 1) % 100 === 0) {
            progressCallback(sim + 1, numSims);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return { totalTeamsWithHistory, teamsInTopN, numSims };
}

