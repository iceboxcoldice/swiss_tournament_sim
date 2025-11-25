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
        if (roundNum <= this.data.current_round + 1 && roundNum > 1) {
            // Check if previous round is complete (except Round 2)
            if (roundNum > 2) {
                const prevRound = roundNum - 1;
                const prevMatches = this.data.matches.filter(m => m.round_num === prevRound);
                if (prevMatches.some(m => m.result === null)) {
                    throw new Error(`Round ${prevRound} is not complete`);
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

    // Swiss pairing algorithm
    generateSwissPairings(roundNum) {
        const teams = [...this.teams];

        if (roundNum === 1) {
            // Random pairing for round 1
            this.shuffleArray(teams);
            const pairs = [];

            // Handle odd number of teams (bye)
            if (teams.length % 2 !== 0) {
                const byeTeam = teams.pop(); // Last team gets a bye
                // Note: Bye handling would need to be implemented in match creation
                // For now, we just skip pairing this team
            }

            for (let i = 0; i < teams.length; i += 2) {
                pairs.push([teams[i], teams[i + 1]]);
            }
            return pairs;
        }

        // Sort by score, then Buchholz
        teams.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.buchholz - a.buchholz;
        });

        // Group by score brackets
        const brackets = {};
        for (const team of teams) {
            const key = team.score;
            if (!brackets[key]) brackets[key] = [];
            brackets[key].push(team);
        }

        const pairs = [];
        const paired = new Set();

        // Pair within brackets
        for (const bracket of Object.values(brackets)) {
            // Sort by side balance (prefer alternating sides)
            bracket.sort((a, b) => {
                const aDiff = Math.abs(a.aff_count - a.neg_count);
                const bDiff = Math.abs(b.aff_count - b.neg_count);
                return aDiff - bDiff;
            });

            for (let i = 0; i < bracket.length; i++) {
                if (paired.has(bracket[i].id)) continue;

                for (let j = i + 1; j < bracket.length; j++) {
                    if (paired.has(bracket[j].id)) continue;

                    const team1 = bracket[i];
                    const team2 = bracket[j];

                    // Check if they've played before
                    if (team1.opponents.includes(team2.id)) continue;

                    // Determine sides based on balance
                    let aff, neg;
                    if (team1.aff_count < team1.neg_count) {
                        aff = team1;
                        neg = team2;
                    } else if (team2.aff_count < team2.neg_count) {
                        aff = team2;
                        neg = team1;
                    } else {
                        // Equal balance, alternate
                        aff = team1;
                        neg = team2;
                    }

                    pairs.push([aff, neg]);
                    paired.add(team1.id);
                    paired.add(team2.id);
                    break;
                }
            }
        }

        return pairs;
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
        }

        // Calculate from matches
        for (const match of this.data.matches) {
            const affTeam = this.teams.find(t => t.id === match.aff_id);
            const negTeam = this.teams.find(t => t.id === match.neg_id);

            affTeam.aff_count++;
            negTeam.neg_count++;
            affTeam.opponents.push(negTeam.id);
            negTeam.opponents.push(affTeam.id);

            if (match.result === 'A') {
                affTeam.wins++;
                affTeam.score++;
            } else if (match.result === 'N') {
                negTeam.wins++;
                negTeam.score++;
            }
        }

        // Calculate Buchholz (sum of opponents' scores)
        for (const team of this.teams) {
            team.buchholz = team.opponents.reduce((sum, oppId) => {
                const opp = this.teams.find(t => t.id === oppId);
                return sum + (opp ? opp.score : 0);
            }, 0);
        }

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
                neg_count: t.neg_count
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
