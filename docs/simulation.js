// simulation.js - Core simulation logic

// Team class
class Team {
    constructor(id, trueRank) {
        this.id = id;
        this.trueRank = trueRank;
        this.score = 0;
        this.opponents = new Set();
        this.history = [];
        this.opponentHistory = [];
        this.buchholz = 0;
        this.wins = 0;
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
function simulateMatch(teamA, teamB, winModel) {
    const probA = probabilityOfWin(teamA, teamB, winModel);
    return Math.random() < probA ? [1, 0] : [0, 1];
}

// Pair teams for a round
function pairRound(teams, roundNum, useBuchholz) {
    const teamsCopy = [...teams];

    // Shuffle for randomization
    for (let i = teamsCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
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
    const remaining = [];

    for (const score of sortedScores) {
        const group = [...scoreGroups[score], ...remaining];
        remaining.length = 0;

        while (group.length >= 2) {
            const t1 = group.shift();
            let opponentIdx = -1;

            for (let i = 0; i < group.length; i++) {
                if (!t1.opponents.has(group[i].id)) {
                    opponentIdx = i;
                    break;
                }
            }

            if (opponentIdx >= 0) {
                const t2 = group.splice(opponentIdx, 1)[0];
                pairs.push([t1, t2]);
            } else if (group.length > 0) {
                const t2 = group.shift();
                pairs.push([t1, t2]);
            } else {
                remaining.push(t1);
            }
        }

        remaining.push(...group);
    }

    // Handle bye
    if (remaining.length > 0) {
        remaining[0].score += 1;
        remaining[0].wins += 1;
        remaining[0].history.push('W');
        remaining[0].opponents.add(-1);
        remaining[0].opponentHistory.push(-1);
    }

    return pairs;
}

// Run a tournament
function runTournament(numTeams, numRounds, useBuchholz, winModel) {
    const teams = Array.from({ length: numTeams }, (_, i) => new Team(i, i + 1));

    for (let round = 0; round < numRounds; round++) {
        const pairs = pairRound(teams, round, useBuchholz);

        for (const [t1, t2] of pairs) {
            const [s1, s2] = simulateMatch(t1, t2, winModel);
            t1.score += s1;
            t2.score += s2;
            t1.opponents.add(t2.id);
            t2.opponents.add(t1.id);
            t1.opponentHistory.push(t2.id);
            t2.opponentHistory.push(t1.id);

            if (s1 > s2) {
                t1.wins += 1;
                t1.history.push('W');
                t2.history.push('L');
            } else {
                t2.wins += 1;
                t2.history.push('W');
                t1.history.push('L');
            }
        }
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
    const { numTeams, numRounds, historyA, historyB, minMatchups, useBuchholz, winModel } = params;

    let totalSims = 0;
    let matchupCount = 0;
    let teamAWins = 0;
    let teamBWins = 0;
    const teamARanks = [];
    const teamBRanks = [];

    const batchSize = 100;
    const maxSims = 50000;

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

                        const probA = probabilityOfWin(teamA, teamB, winModel);
                        if (Math.random() < probA) {
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
