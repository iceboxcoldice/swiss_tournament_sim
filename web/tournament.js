// Tournament Manager Core Logic
// Ported from Python tournament_manager.py

class Team {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.wins = 0;
        this.score = 0;
        this.buchholz = 0;
        this.opponents = [];
        this.aff_count = 0;
        this.neg_count = 0;
        this.last_side = null;
        this.side_history = {}; // opponentId -> list of sides ('Aff'/'Neg')
    }
}

class TournamentManager {
    constructor() {
        this.data = null;
        this.teams = [];
        this.loadFromStorage();
    }

    // Initialize new tournament
    init(numTeams, numRounds, teamNames = []) {
        this.teams = [];
        for (let i = 0; i < numTeams; i++) {
            const name = teamNames[i] || `Team ${i + 1}`;
            this.teams.push(new Team(i, name));
        }

        this.data = {
            config: {
                num_teams: numTeams,
                num_rounds: numRounds
            },
            current_round: 0,
            rounds: Array.from({ length: numRounds }, (_, i) => ({ round_num: i + 1 })),
            matches: [],
            next_match_id: 1
        };

        this.saveToStorage();
        return true;
    }

    // Generate pairings for a round using Swiss system
    pairRound(roundNum) {
        // Check if previous round is complete (except Round 2)
        if (roundNum > 2) {
            for (let r = 1; r < roundNum; r++) {
                const prevMatches = this.data.matches.filter(m => m.round_num === r);
                if (prevMatches.some(m => m.result === null)) {
                    throw new Error(`Round ${r} is not complete`);
                }
            }
        }
        // Check if round already paired
        const existingMatches = this.data.matches.filter(m => m.round_num === roundNum);
        if (existingMatches.length > 0) {
            throw new Error(`Round ${roundNum} already paired`);
        }

        // Generate pairings
        const pairs = this.generateSwissPairings(roundNum);

        // Create match objects
        for (const [aff, neg] of pairs) {
            const match = {
                match_id: this.data.next_match_id++,
                round_num: roundNum,
                aff_id: aff.id,
                neg_id: neg.id,
                aff_name: aff.name,
                neg_name: neg.name,
                result: null
            };
            this.data.matches.push(match);
        }

        this.saveToStorage();
        return pairs;
    }

    // Swiss pairing algorithm – mirrors the Python `pair_round` logic
    generateSwissPairings(roundNum) {
        const teams = [...this.teams];

        // Update Buchholz before pairing (Python does this)
        this.updateBuchholz();

        // Shuffle teams first to randomize order within groups
        this.shuffleArray(teams);

        // Group by score
        const scoreGroups = {};
        if (roundNum > 2) {
            // Rounds 3+: Group teams by their current scores
            for (const team of teams) {
                const key = team.score;
                if (!scoreGroups[key]) scoreGroups[key] = [];
                scoreGroups[key].push(team);
            }
        } else {
            // Rounds 1-2: Don't consider scores, treat all teams as one group
            scoreGroups[0] = teams;
        }

        const sortedScores = Object.keys(scoreGroups).map(Number).sort((a, b) => b - a);

        const pairs = [];
        let floaters = [];

        // Process each score bracket from highest to lowest
        for (const score of sortedScores) {
            let group = scoreGroups[score];
            // Add floaters from previous higher bracket
            group = group.concat(floaters);
            floaters = [];

            // Sort within bracket
            if (roundNum > 2) {
                // Rounds 3+: Sort by Buchholz descending
                // Python: (score, buchholz, -true_rank).
                group.sort((a, b) => {
                    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
                    return a.id - b.id; // Stable tiebreaker
                });
            }
            // Rounds 1-2: Keep shuffled order (random)

            while (group.length > 0) {
                const t1 = group.shift();

                // Find best opponent
                const { opponent, index, isSwappable } = this.findBestOpponent(t1, group);

                if (opponent) {
                    group.splice(index, 1);
                    const [aff, neg] = this.determineSides(t1, opponent, isSwappable);
                    pairs.push([aff, neg]);
                } else {
                    // No opponent found, float this team
                    floaters.push(t1);
                }
            }
        }

        // Handle remaining floaters
        if (floaters.length > 0) {
            while (floaters.length >= 2) {
                const t1 = floaters.shift();
                const t2 = floaters.shift();
                const [aff, neg] = this.determineSides(t1, t2, false);
                pairs.push([aff, neg]);
            }
            // If one team remains, give a bye
            if (floaters.length === 1) {
                const byeTeam = floaters[0];
                byeTeam.score += 1;
                byeTeam.opponents.push(-1);
            }
        }

        return pairs;
    }

    // Helper: Calculate side preference score
    calculateSidePreference(team) {
        let pref = team.neg_count - team.aff_count;
        if (team.last_side === 'Neg') {
            pref += 2.0;
        } else if (team.last_side === 'Aff') {
            pref -= 2.0;
        }
        return pref;
    }

    // Helper: Find best opponent
    findBestOpponent(t1, group) {
        let bestNonRepeat = null;
        let bestNonRepeatIdx = -1;

        let bestSwappable = null;
        let bestSwappableIdx = -1;

        for (let i = 0; i < group.length; i++) {
            const candidate = group[i];

            if (!t1.opponents.includes(candidate.id)) {
                // Priority 1: Non-repeat
                bestNonRepeat = candidate;
                bestNonRepeatIdx = i;
                break; // Strict Swiss: take first valid
            } else {
                // Check for swappable repeat
                if (bestSwappable === null) {
                    const t1History = t1.side_history[candidate.id] || [];
                    const canPlayAff = !t1History.includes('Aff');
                    const canPlayNeg = !t1History.includes('Neg');

                    if (canPlayAff || canPlayNeg) {
                        bestSwappable = candidate;
                        bestSwappableIdx = i;
                    }
                }
            }
        }

        if (bestNonRepeat) {
            return { opponent: bestNonRepeat, index: bestNonRepeatIdx, isSwappable: false };
        } else if (bestSwappable) {
            return { opponent: bestSwappable, index: bestSwappableIdx, isSwappable: true };
        }

        return { opponent: null, index: -1, isSwappable: false };
    }

    // Helper: Determine sides
    determineSides(t1, t2, isSwappable) {
        if (isSwappable) {
            // Force swap based on history
            const t1History = t1.side_history[t2.id] || [];
            const canPlayAff = !t1History.includes('Aff');
            const canPlayNeg = !t1History.includes('Neg');

            if (canPlayAff && !canPlayNeg) return [t1, t2];
            if (canPlayNeg && !canPlayAff) return [t2, t1];
        }

        // Standard preference logic
        const t1Pref = this.calculateSidePreference(t1);
        const t2Pref = this.calculateSidePreference(t2);

        if (t1Pref > t2Pref) return [t1, t2];
        if (t2Pref > t1Pref) return [t2, t1];

        // Random if equal
        return Math.random() < 0.5 ? [t1, t2] : [t2, t1];
    }

    // Update Buchholz scores
    updateBuchholz() {
        for (const team of this.teams) {
            team.buchholz = team.opponents.reduce((sum, oppId) => {
                if (oppId === -1) return sum; // Ignore bye
                const opp = this.teams.find(t => t.id === oppId);
                return sum + (opp ? opp.score : 0);
            }, 0);
        }
    }

    // Report match result
    reportResult(matchId, outcome) {
        const match = this.data.matches.find(m => m.match_id === matchId);
        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        if (match.result !== null) {
            throw new Error(`Match ${matchId} already has a result`);
        }

        if (outcome !== 'A' && outcome !== 'N') {
            throw new Error(`Invalid outcome: ${outcome}`);
        }

        match.result = outcome;
        this.recalculateStats();
        this.saveToStorage();
    }

    // Update match result (allows overwrite)
    updateResult(matchId, newOutcome) {
        const match = this.data.matches.find(m => m.match_id === matchId);
        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        if (newOutcome !== null && newOutcome !== 'A' && newOutcome !== 'N') {
            throw new Error(`Invalid outcome: ${newOutcome}`);
        }

        match.result = newOutcome;
        this.recalculateStats();
        this.saveToStorage();
    }

    // Recalculate all team statistics
    recalculateStats() {
        // Reset stats
        for (const team of this.teams) {
            team.wins = 0;
            team.score = 0;
            team.buchholz = 0;
            team.opponents = [];
            team.aff_count = 0;
            team.neg_count = 0;
            team.last_side = null;
            team.side_history = {};
        }

        // Calculate from matches
        // Sort matches by round to process in order (important for history)
        const sortedMatches = [...this.data.matches].sort((a, b) => a.round_num - b.round_num);

        for (const match of sortedMatches) {
            const affTeam = this.teams.find(t => t.id === match.aff_id);
            const negTeam = this.teams.find(t => t.id === match.neg_id);

            affTeam.aff_count++;
            negTeam.neg_count++;
            affTeam.opponents.push(negTeam.id);
            negTeam.opponents.push(affTeam.id);

            affTeam.last_side = 'Aff';
            negTeam.last_side = 'Neg';

            if (!affTeam.side_history[negTeam.id]) affTeam.side_history[negTeam.id] = [];
            affTeam.side_history[negTeam.id].push('Aff');

            if (!negTeam.side_history[affTeam.id]) negTeam.side_history[affTeam.id] = [];
            negTeam.side_history[affTeam.id].push('Neg');

            if (match.result === 'A') {
                affTeam.wins++;
                affTeam.score++;
            } else if (match.result === 'N') {
                negTeam.wins++;
                negTeam.score++;
            }
        }

        this.updateBuchholz();

        // Update current_round
        for (let r = 1; r <= this.data.config.num_rounds; r++) {
            const roundMatches = this.data.matches.filter(m => m.round_num === r);
            if (roundMatches.length > 0 && roundMatches.every(m => m.result !== null)) {
                this.data.current_round = r;
            } else {
                break;
            }
        }
    }

    // Get standings
    getStandings() {
        const standings = [...this.teams];
        standings.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
            return b.wins - a.wins;
        });
        return standings;
    }

    // Get matches for a round
    getRoundMatches(roundNum) {
        return this.data.matches.filter(m => m.round_num === roundNum);
    }

    // Export tournament data
    exportData() {
        return {
            ...this.data,
            teams: this.teams.map(t => ({
                id: t.id,
                name: t.name,
                wins: t.wins,
                score: t.score,
                buchholz: t.buchholz,
                opponents: t.opponents,
                aff_count: t.aff_count,
                neg_count: t.neg_count,
                last_side: t.last_side,
                side_history: t.side_history
            }))
        };
    }

    // Import tournament data
    importData(data) {
        this.data = data;
        this.teams = data.teams.map(t => {
            const team = new Team(t.id, t.name);
            team.wins = t.wins;
            team.score = t.score;
            team.buchholz = t.buchholz;
            team.opponents = t.opponents;
            team.aff_count = t.aff_count;
            team.neg_count = t.neg_count;
            team.last_side = t.last_side || null;
            team.side_history = t.side_history || {};
            return team;
        });
        this.saveToStorage();
    }

    // LocalStorage persistence
    saveToStorage() {
        const data = this.exportData();
        localStorage.setItem('tournament_data', JSON.stringify(data));
    }

    loadFromStorage() {
        const stored = localStorage.getItem('tournament_data');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.importData(data);
            } catch (e) {
                console.error('Failed to load tournament data:', e);
            }
        }
    }

    clearStorage() {
        localStorage.removeItem('tournament_data');
        this.data = null;
        this.teams = [];
    }

    // Utility: Shuffle array
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
