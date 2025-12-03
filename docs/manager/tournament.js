// Tournament Manager Core Logic
// Ported from Python tournament_manager.py

class Team {
    constructor(id, name, institution = '', members = []) {
        this.id = id;
        this.name = name;
        this.institution = institution || 'Unknown';
        // Each member has {name: string, id: number}
        this.members = members.length === 2 ? members : [
            { name: `Member 1`, id: 1 },
            { name: `Member 2`, id: 2 }
        ];
        this.wins = 0;
        this.score = 0;
        this.buchholz = 0;
        this.opponents = [];
        this.aff_count = 0;
        this.neg_count = 0;
        this.last_side = null;
        this.side_history = {}; // opponentId -> list of sides ('Aff'/'Neg')
        this.break_seed = null; // Seed for elimination rounds
        // Speaker points history: array of {round: number, points: [number, number]}
        this.speaker_points_history = [];
    }
}

class Judge {
    constructor(id, name, institution = '') {
        this.id = id;
        this.name = name;
        this.institution = institution || 'Tournament Hire';
        this.matches_judged = []; // Array of match IDs
    }
}

class TournamentManager {
    constructor() {
        this.data = null;
        this.teams = [];
        this.judges = [];
        this.backendUrl = null;
        this.loadFromStorage();
    }

    setBackendUrl(url) {
        this.backendUrl = url;
    }

    async loadFromStorage() {
        // Try to load backend URL first
        const savedUrl = localStorage.getItem('backendUrl');
        if (savedUrl) {
            this.backendUrl = savedUrl;
        }

        if (this.backendUrl) {
            // Cloud Mode
            try {
                const response = await fetch(`${this.backendUrl}/api/data`);
                if (response.ok) {
                    const data = await response.json();
                    this.data = data;
                    this.reconstructObjects();
                    return;
                }
            } catch (e) {
                console.error("Failed to load from cloud:", e);
                // Fallback to local? Or just show error?
                // For now, let's fallback to local but keep URL set
            }
        }

        // Local Mode
        const storedData = localStorage.getItem('tournamentData');
        if (storedData) {
            this.data = JSON.parse(storedData);
            this.reconstructObjects();
        }
    }

    async saveToStorage() {
        if (!this.data) return;

        // Always save local backup
        localStorage.setItem('tournamentData', JSON.stringify(this.data));

        // If Cloud Mode, sync to backend
        // Note: This is tricky because backend expects specific API calls (init, pair, report)
        // rather than a full state dump.
        // Ideally, we should refactor frontend to call API endpoints instead of manipulating state directly.
        // But for this migration, we might need a "sync" endpoint or just rely on the specific actions.

        // However, since we are modifying the actions (init, pair, report) to call API,
        // we might not need a generic saveToStorage for cloud.
    }

    reconstructObjects() {
        if (!this.data) return;

        this.teams = this.data.teams.map(t => {
            const team = new Team(t.id, t.name, t.institution, t.members);
            Object.assign(team, t);
            return team;
        });

        // Reconstruct judges if present
        if (this.data.judges) {
            this.judges = this.data.judges.map(j => new Judge(j.id, j.name, j.institution));
        }
    }

    // Initialize new tournament
    // teamDetails: array of {name, institution, members: [{name}, {name}]}
    async init(numTeams, numPrelimRounds, numElimRounds, teamDetails = []) {
        if (this.backendUrl) {
            // Cloud Mode
            try {
                const response = await fetch(`${this.backendUrl}/api/init`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        num_teams: numTeams,
                        rounds: numPrelimRounds,
                        elim_rounds: numElimRounds,
                        teams: teamDetails // We might need to update backend to accept team details
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Backend init successful:', result);

                    // Reload full data from backend
                    const dataResponse = await fetch(`${this.backendUrl}/api/data`);
                    if (dataResponse.ok) {
                        const data = await dataResponse.json();
                        this.data = data;
                        this.reconstructObjects();
                        console.log('Data loaded from backend after init');
                        return true;
                    } else {
                        console.error('Failed to load data after init');
                        return false;
                    }
                } else {
                    const error = await response.json();
                    throw new Error(error.error || 'Backend init failed');
                }
            } catch (e) {
                console.error("Cloud init failed:", e);
                alert("Failed to initialize tournament on cloud: " + e.message);
                return false;
            }
        }

        // Local Mode
        this.teams = [];
        this.judges = [];
        for (let i = 0; i < numTeams; i++) {
            const detail = teamDetails[i] || {};
            const name = detail.name || `Team ${i + 1}`;
            const institution = detail.institution || 'Unknown';
            const members = detail.members && detail.members.length === 2
                ? detail.members.map((m, idx) => ({ name: m.name || `Member ${idx + 1}`, id: idx + 1 }))
                : [{ name: `Member 1`, id: 1 }, { name: `Member 2`, id: 2 }];

            this.teams.push(new Team(i, name, institution, members));
        }

        this.data = {
            config: {
                num_teams: numTeams,
                num_prelim_rounds: numPrelimRounds,
                num_elim_rounds: numElimRounds,
                num_rounds: numPrelimRounds + numElimRounds // Total rounds
            },
            current_round: 0,
            rounds: Array.from({ length: numPrelimRounds + numElimRounds }, (_, i) => ({ round_num: i + 1 })),
            matches: [],
            next_match_id: 1,
            next_judge_id: 1,
            pairing_file_content: "# Format: Round MatchID AffID NegID\n",
            result_file_content: "# Format: Round MatchID AffID NegID Outcome JudgeID [Aff1Pts Aff2Pts Neg1Pts Neg2Pts]\n# JudgeID: Use -1 if no judge assigned\n"
        };

        this.saveToStorage();
        return true;
    }

    // Generate pairings for a round using Swiss system
    async pairRound(roundNum) {
        if (this.backendUrl) {
            // Cloud Mode
            try {
                const response = await fetch(`${this.backendUrl}/api/pair`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ round: roundNum })
                });

                if (response.ok) {
                    const result = await response.json();
                    await this.loadFromStorage();
                    return result.matches;
                } else {
                    const err = await response.json();
                    throw new Error(err.error || 'Backend pairing failed');
                }
            } catch (e) {
                console.error("Cloud pairing failed:", e);
                alert("Failed to pair round on cloud: " + e.message);
                throw e;
            }
        }

        // Local Mode
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
        let pairs;
        if (roundNum <= this.data.config.num_prelim_rounds) {
            pairs = this.generateSwissPairings(roundNum);
        } else {
            pairs = this.generateElimPairings(roundNum);
        }

        // Create match objects
        const newMatches = [];
        for (const [aff, neg] of pairs) {
            const match = {
                match_id: this.data.next_match_id++,
                round_num: roundNum,
                aff_id: aff.id,
                neg_id: neg.id,
                aff_name: aff.name,
                neg_name: neg.name,
                result: null,
                judge_id: null
            };
            this.data.matches.push(match);
            newMatches.push(match);
        }

        // Update pairing file content
        for (const m of newMatches) {
            this.data.pairing_file_content += `${m.round_num} ${m.match_id} ${m.aff_id} ${m.neg_id}\n`;
        }

        this.saveToStorage();
        return pairs;
    }

    // Add a new judge
    addJudge(name, institution = '') {
        if (!name || name.trim() === '') {
            throw new Error('Judge name is required');
        }

        // Check for duplicate names
        if (this.judges.some(j => j.name.toLowerCase() === name.toLowerCase())) {
            throw new Error(`Judge with name "${name}" already exists`);
        }

        const judge = new Judge(this.data.next_judge_id++, name.trim(), institution.trim());
        this.judges.push(judge);
        this.saveToStorage();
        return judge;
    }

    // Remove a judge
    removeJudge(judgeId) {
        const judge = this.judges.find(j => j.id === judgeId);
        if (!judge) {
            throw new Error(`Judge ${judgeId} not found`);
        }

        // Check if judge is assigned to any matches
        if (judge.matches_judged.length > 0) {
            throw new Error(`Cannot remove judge "${judge.name}" - they are assigned to ${judge.matches_judged.length} match(es)`);
        }

        this.judges = this.judges.filter(j => j.id !== judgeId);
        this.saveToStorage();
    }

    // Assign a judge to a match
    assignJudgeToMatch(matchId, judgeId) {
        const match = this.data.matches.find(m => m.match_id === matchId);
        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        const judge = this.judges.find(j => j.id === judgeId);
        if (!judge) {
            throw new Error(`Judge ${judgeId} not found`);
        }

        // If match already has a judge, unassign them first
        if (match.judge_id !== null) {
            this.unassignJudgeFromMatch(matchId);
        }

        // Assign the new judge
        match.judge_id = judgeId;
        if (!judge.matches_judged.includes(matchId)) {
            judge.matches_judged.push(matchId);
        }

        this.saveToStorage();
    }

    // Unassign a judge from a match
    unassignJudgeFromMatch(matchId) {
        const match = this.data.matches.find(m => m.match_id === matchId);
        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        if (match.judge_id !== null) {
            const judge = this.judges.find(j => j.id === match.judge_id);
            if (judge) {
                judge.matches_judged = judge.matches_judged.filter(mid => mid !== matchId);
            }
            match.judge_id = null;
            this.saveToStorage();
        }
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

    // Generate Elimination Pairings (High vs Low)
    generateElimPairingsBeforeAffNegOrder(roundNum) {
        const { num_prelim_rounds, num_elim_rounds } = this.data.config;
        const elimRoundIdx = roundNum - num_prelim_rounds;

        // Validate break size
        const breakSize = Math.pow(2, num_elim_rounds);
        if (this.teams.length < breakSize) {
            throw new Error(`Not enough teams for ${num_elim_rounds} elimination rounds (Need ${breakSize}, have ${this.teams.length})`);
        }

        let activeTeams = [];

        if (elimRoundIdx === 1) {
            // First elim round: Check if break_seeds already assigned (display mode) or need to assign (pairing mode)
            const teamsWithSeeds = this.teams.filter(t => t.break_seed !== null && t.break_seed <= breakSize);

            if (teamsWithSeeds.length === breakSize) {
                // Break seeds already assigned - use existing seeds (display mode)
                activeTeams = teamsWithSeeds.sort((a, b) => a.break_seed - b.break_seed);
            } else {
                // Initial pairing - calculate from preliminary standings
                const prelimStandings = this.getPreliminaryStandings();
                // Get actual team references (not copies) from this.teams
                activeTeams = prelimStandings.slice(0, breakSize).map(t =>
                    this.teams.find(team => team.id === t.id)
                );

                // Assign seeds based on preliminary standings
                activeTeams.forEach((team, index) => {
                    team.break_seed = index + 1;
                });
            }
        } else {
            // Subsequent rounds: Get winners from previous round
            const prevRound = roundNum - 1;
            const prevMatches = this.data.matches.filter(m => m.round_num === prevRound);

            // Check completeness
            if (prevMatches.some(m => m.result === null)) {
                throw new Error(`Round ${prevRound} is not complete`);
            }

            // Collect winners
            activeTeams = prevMatches.map(m => {
                return m.result === 'A' ? this.teams.find(t => t.id === m.aff_id)
                    : this.teams.find(t => t.id === m.neg_id);
            });

            // In elimination round, don't sort by break seed 
            // // activeTeams.sort((a, b) => a.break_seed - b.break_seed);
        }

        // Pair using standard bracket structure
        const pairs = [];
        const numPairs = activeTeams.length / 2;

        if (elimRoundIdx === 1) {
            // First round: Standard bracket structure using recursive half-assignment
            // Algorithm: Recursively split seeds into halves until each group has 1 seed
            // Base case: [1,8] → pair them
            // Recursive: [1,4,5,8] → split into [1,8] and [4,5], recurse on each

            const n = activeTeams.length;

            // Recursive function to generate bracket pairings
            // Input: array of seed indices
            // Output: array of [high, low] pairing indices in bracket order
            const generateBracketPairings = (seeds) => {
                if (seeds.length === 2) {
                    // Base case: pair the two seeds
                    return [[seeds[0], seeds[1]]];
                }

                // Recursive case: split into two halves
                const half = seeds.length / 2;
                const topHalf = [];
                const bottomHalf = [];

                // Distribute seeds into halves using alternating pattern
                // Pattern: (1,n)→top, (2,n-1)→bottom, (3,n-2)→bottom, (4,n-3)→top, ...
                for (let i = 0; i < half; i++) {
                    const highSeed = seeds[i];
                    const lowSeed = seeds[seeds.length - 1 - i];

                    // Use modulo 4 pattern for assignment
                    if (i % 4 === 0 || i % 4 === 3) {
                        topHalf.push(highSeed);
                        topHalf.push(lowSeed);
                    } else {
                        bottomHalf.push(highSeed);
                        bottomHalf.push(lowSeed);
                    }
                }

                // Sort each half
                topHalf.sort((a, b) => a - b);
                bottomHalf.sort((a, b) => a - b);

                // Recursively generate pairings for each half
                const topPairings = generateBracketPairings(topHalf);
                const bottomPairings = generateBracketPairings(bottomHalf);

                // Reverse bottom pairings for correct order
                bottomPairings.reverse();

                // Combine
                return [...topPairings, ...bottomPairings];
            };

            // Generate seed indices array [0, 1, 2, ..., n-1]
            const seedIndices = Array.from({ length: n }, (_, i) => i);

            // Generate all pairings
            const allPairings = generateBracketPairings(seedIndices);

            const allPairingsSwapped = []
            for (let p = 0; p < allPairings.length; p++) {
                if (p % 2 === 0) {
                    allPairingsSwapped.push(allPairings[p])
                } else {
                    allPairingsSwapped.push(allPairings[p].reverse())
                }
            }
            // Create the pairs
            for (const [highIdx, lowIdx] of allPairings) {
                pairs.push([activeTeams[highIdx], activeTeams[lowIdx]]);
            }
        } else {
            // Subsequent rounds: Pair winners sequentially (already in correct bracket order)
            for (let i = 0; i < numPairs; i++) {
                const team1 = activeTeams[i * 2];
                const team2 = activeTeams[i * 2 + 1];
                pairs.push([team1, team2]);
            }
        }

        return pairs;
    }

    // generate Elim Match pairing [aff_team, neg_team]
    generateElimPairings(roundNum) {
        const match_pairs = [];
        const pairs = this.generateElimPairingsBeforeAffNegOrder(roundNum);
        pairs.forEach(pair => {
            const [aff, neg] = this.determineSides(pair[0], pair[1], false);
            match_pairs.push([aff, neg]);
        });
        return match_pairs;
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

    // Report result for a match
    // speakerPoints: {affPoints: [p1, p2], negPoints: [p3, p4]} (optional)
    async reportResult(matchId, outcome, speakerPoints = null) {
        if (this.backendUrl) {
            // Cloud Mode
            try {
                const response = await fetch(`${this.backendUrl}/api/report`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        match_id: matchId,
                        result: outcome,
                        speaker_points: speakerPoints
                    })
                });

                if (response.ok) {
                    await this.loadFromStorage(); // Reload data from backend after successful report
                    return true;
                } else {
                    const err = await response.json();
                    throw new Error(err.error || 'Backend report failed');
                }
            } catch (e) {
                console.error("Cloud report failed:", e);
                alert("Failed to report result on cloud: " + e.message);
                return false;
            }
        }

        // Local Mode
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

        // Build result line with judge_id (always included, -1 if none)
        const judgeId = (match.judge_id !== null && match.judge_id !== undefined) ? match.judge_id : -1;

        let spString = "";
        // Use provided points or existing points in match
        const pointsToLog = speakerPoints || match.speaker_points;

        if (pointsToLog) {
            // If new points provided, store them
            if (speakerPoints) {
                this.storeSpeakerPoints(matchId, speakerPoints);
            }

            // Format for file: Aff1 Aff2 Neg1 Neg2
            const a1 = pointsToLog.affPoints[0] !== null ? pointsToLog.affPoints[0] : "null";
            const a2 = pointsToLog.affPoints[1] !== null ? pointsToLog.affPoints[1] : "null";
            const n1 = pointsToLog.negPoints[0] !== null ? pointsToLog.negPoints[0] : "null";
            const n2 = pointsToLog.negPoints[1] !== null ? pointsToLog.negPoints[1] : "null";
            spString = ` ${a1} ${a2} ${n1} ${n2}`;
        }

        // Update result file content: Round MatchID AffID NegID Outcome JudgeID [SP1 SP2 SP3 SP4]
        this.data.result_file_content += `${match.round_num} ${match.match_id} ${match.aff_id} ${match.neg_id} ${outcome} ${judgeId}${spString}\n`;

        this.recalculateStats();
        this.saveToStorage();
        return true;
    }

    // Update match result (allows overwrite)
    async updateResult(matchId, newOutcome, speakerPoints = null) {
        if (this.backendUrl) {
            // Cloud Mode - Reuse report endpoint as it handles updates
            // The backend report endpoint should handle updating existing results
            return this.reportResult(matchId, newOutcome, speakerPoints);
        }

        // Local Mode
        const match = this.data.matches.find(m => m.match_id === matchId);
        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        if (newOutcome !== null && newOutcome !== 'A' && newOutcome !== 'N') {
            throw new Error(`Invalid outcome: ${newOutcome}`);
        }

        match.result = newOutcome;

        // Update result file content: Comment out old lines for this match
        const lines = this.data.result_file_content.split('\n');
        const newLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line; // Already comment or empty

            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                const mid = Number(parts[1]);
                if (mid === matchId) {
                    return `# ${line} # Updated/Corrected`; // Comment out
                }
            }
            return line;
        });

        this.data.result_file_content = newLines.join('\n');

        // Append new result if exists
        if (newOutcome !== null) {
            const judgeId = (match.judge_id !== null && match.judge_id !== undefined) ? match.judge_id : -1;

            let spString = "";
            // Use provided points or existing points in match
            const pointsToLog = speakerPoints || match.speaker_points;

            if (pointsToLog) {
                // If new points provided, store them
                if (speakerPoints) {
                    this.storeSpeakerPoints(matchId, speakerPoints);
                }

                const sp = pointsToLog;
                const a1 = sp.affPoints[0] !== null ? sp.affPoints[0] : "null";
                const a2 = sp.affPoints[1] !== null ? sp.affPoints[1] : "null";
                const n1 = sp.negPoints[0] !== null ? sp.negPoints[0] : "null";
                const n2 = sp.negPoints[1] !== null ? sp.negPoints[1] : "null";
                spString = ` ${a1} ${a2} ${n1} ${n2}`;
            }

            if (!this.data.result_file_content.endsWith('\n')) this.data.result_file_content += '\n';
            this.data.result_file_content += `${match.round_num} ${match.match_id} ${match.aff_id} ${match.neg_id} ${newOutcome} ${judgeId}${spString}\n`;
        }

        this.recalculateStats();
        this.saveToStorage();
        return true;
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

    // Get preliminary standings (only considering preliminary rounds)
    getPreliminaryStandings() {
        const { num_prelim_rounds } = this.data.config;

        // Create temporary team stats based only on preliminary rounds
        const prelimStats = this.teams.map(team => {
            const prelimMatches = this.data.matches.filter(m =>
                m.round_num <= num_prelim_rounds &&
                (m.aff_id === team.id || m.neg_id === team.id)
            );

            let wins = 0;
            let score = 0;
            const opponentIds = [];

            prelimMatches.forEach(match => {
                if (match.result === null) return;

                const isAff = match.aff_id === team.id;
                const won = (isAff && match.result === 'A') || (!isAff && match.result === 'N');

                if (won) {
                    wins++;
                    score++;
                }

                // Track opponents for Buchholz
                opponentIds.push(isAff ? match.neg_id : match.aff_id);
            });

            // Calculate Buchholz based on preliminary opponents only
            let buchholz = 0;
            opponentIds.forEach(oppId => {
                const opponent = this.teams.find(t => t.id === oppId);
                if (opponent) {
                    // Count opponent's preliminary wins
                    const oppPrelimMatches = this.data.matches.filter(m =>
                        m.round_num <= num_prelim_rounds &&
                        (m.aff_id === oppId || m.neg_id === oppId) &&
                        m.result !== null
                    );
                    const oppWins = oppPrelimMatches.filter(m =>
                        (m.aff_id === oppId && m.result === 'A') ||
                        (m.neg_id === oppId && m.result === 'N')
                    ).length;
                    buchholz += oppWins;
                }
            });

            return {
                ...team,
                prelim_wins: wins,
                prelim_score: score,
                prelim_buchholz: buchholz
            };
        });

        // Sort by preliminary stats
        prelimStats.sort((a, b) => {
            if (b.prelim_score !== a.prelim_score) return b.prelim_score - a.prelim_score;
            if (b.prelim_buchholz !== a.prelim_buchholz) return b.prelim_buchholz - a.prelim_buchholz;
            return b.prelim_wins - a.prelim_wins;
        });

        return prelimStats;
    }

    // Get matches for a round
    getRoundMatches(roundNum) {
        return this.data.matches.filter(m => m.round_num === roundNum);
    }

    // Store speaker points for a match
    // speakerPoints: {affPoints: [number, number], negPoints: [number, number]}
    storeSpeakerPoints(matchId, speakerPoints) {
        const match = this.data.matches.find(m => m.match_id === matchId);
        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        // Validate speaker points (0-30 range), skip null values
        const allPoints = [...speakerPoints.affPoints, ...speakerPoints.negPoints];
        for (const points of allPoints) {
            if (points !== null && points !== undefined && (points < 0 || points > 30)) {
                throw new Error(`Speaker points must be between 0 and 30, got ${points}`);
            }
        }

        // Store in match object
        match.speaker_points = speakerPoints;

        // Update team speaker points history
        const affTeam = this.teams.find(t => t.id === match.aff_id);
        const negTeam = this.teams.find(t => t.id === match.neg_id);

        // Remove existing entry for this round if it exists
        affTeam.speaker_points_history = affTeam.speaker_points_history.filter(
            entry => entry.round !== match.round_num
        );
        negTeam.speaker_points_history = negTeam.speaker_points_history.filter(
            entry => entry.round !== match.round_num
        );

        // Add new entry
        affTeam.speaker_points_history.push({
            round: match.round_num,
            points: speakerPoints.affPoints
        });
        negTeam.speaker_points_history.push({
            round: match.round_num,
            points: speakerPoints.negPoints
        });

        // If match already has a result, update the result file to include new points
        if (match.result !== null) {
            this.updateResult(matchId, match.result);
        } else {
            this.saveToStorage();
        }
    }

    // Get participant standings
    // method: 'total' | 'drop-1' | 'drop-2'
    getParticipantStandings(method = 'total') {
        const participants = [];

        for (const team of this.teams) {
            for (let memberIdx = 0; memberIdx < team.members.length; memberIdx++) {
                const member = team.members[memberIdx];

                // Collect all speaker points for this member from preliminary rounds only
                const prelimPoints = team.speaker_points_history
                    .filter(entry => entry.round <= this.data.config.num_prelim_rounds)
                    .map(entry => entry.points[memberIdx])
                    .filter(p => p !== undefined && p !== null);

                if (prelimPoints.length === 0) continue; // Skip if no points recorded

                let adjustedScore = 0;
                const totalPoints = prelimPoints.reduce((sum, p) => sum + p, 0);

                if (method === 'total') {
                    adjustedScore = totalPoints;
                } else if (method === 'drop-1') {
                    if (prelimPoints.length <= 2) {
                        adjustedScore = totalPoints; // Not enough to drop
                    } else {
                        const sorted = [...prelimPoints].sort((a, b) => a - b);
                        // Drop lowest and highest
                        adjustedScore = sorted.slice(1, -1).reduce((sum, p) => sum + p, 0);
                    }
                } else if (method === 'drop-2') {
                    if (prelimPoints.length <= 4) {
                        adjustedScore = totalPoints; // Not enough to drop
                    } else {
                        const sorted = [...prelimPoints].sort((a, b) => a - b);
                        // Drop two lowest and two highest
                        adjustedScore = sorted.slice(2, -2).reduce((sum, p) => sum + p, 0);
                    }
                }

                participants.push({
                    teamId: team.id,
                    teamName: team.name,
                    institution: team.institution,
                    memberId: member.id,
                    memberName: member.name,
                    totalPoints: totalPoints,
                    adjustedScore: adjustedScore,
                    roundScores: prelimPoints
                });
            }
        }

        // Sort by adjusted score descending
        participants.sort((a, b) => {
            if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            return a.memberName.localeCompare(b.memberName);
        });

        return participants;
    }

    // Check if preliminary rounds are complete
    arePrelimRoundsComplete() {
        const { num_prelim_rounds } = this.data.config;
        for (let r = 1; r <= num_prelim_rounds; r++) {
            const roundMatches = this.data.matches.filter(m => m.round_num === r);
            if (roundMatches.length === 0 || roundMatches.some(m => m.result === null)) {
                return false;
            }
        }
        return true;
    }


    // Export tournament data
    exportData() {
        // Ensure content exists (migration)
        if (!this.data.pairing_file_content) this.data.pairing_file_content = this.generatePairingFileContent();
        if (!this.data.result_file_content) this.data.result_file_content = this.generateResultFileContent();

        return {
            ...this.data,
            teams: this.teams.map(t => ({
                id: t.id,
                name: t.name,
                institution: t.institution,
                members: t.members,
                wins: t.wins,
                score: t.score,
                buchholz: t.buchholz,
                opponents: t.opponents,
                aff_count: t.aff_count,
                neg_count: t.neg_count,
                last_side: t.last_side,
                side_history: t.side_history,
                break_seed: t.break_seed,
                speaker_points_history: t.speaker_points_history
            })),
            judges: this.judges.map(j => ({
                id: j.id,
                name: j.name,
                institution: j.institution,
                matches_judged: j.matches_judged
            }))
        };
    }

    // Import tournament data
    importData(data) {
        this.data = data;

        // Migration: Generate if missing
        if (!this.data.pairing_file_content) this.data.pairing_file_content = this.generatePairingFileContent();
        if (!this.data.result_file_content) this.data.result_file_content = this.generateResultFileContent();
        if (!this.data.next_judge_id) this.data.next_judge_id = 1;

        // Validate redundancy
        this.validatePairingRedundancy(this.data.matches, this.data.pairing_file_content);
        this.validateResultRedundancy(this.data.matches, this.data.result_file_content);

        this.teams = data.teams.map(t => {
            // Migration: Handle old tournaments without new fields
            const institution = t.institution || 'Unknown';
            const members = t.members && t.members.length === 2
                ? t.members
                : [{ name: 'Member 1', id: 1 }, { name: 'Member 2', id: 2 }];

            const team = new Team(t.id, t.name, institution, members);
            team.wins = t.wins;
            team.score = t.score;
            team.buchholz = t.buchholz;
            team.opponents = t.opponents;
            team.aff_count = t.aff_count;
            team.neg_count = t.neg_count;
            team.last_side = t.last_side || null;
            team.side_history = t.side_history || {};
            team.break_seed = t.break_seed || null;
            team.speaker_points_history = t.speaker_points_history || [];
            return team;
        });

        // Import judges (migration: handle old tournaments without judges)
        this.judges = (data.judges || []).map(j => {
            const judge = new Judge(j.id, j.name, j.institution);
            judge.matches_judged = j.matches_judged || [];
            return judge;
        });

        this.saveToStorage();
    }

    // LocalStorage persistence
    saveToStorage() {
        this.checkConsistency();
        const data = this.exportData();
        localStorage.setItem('tournament_data', JSON.stringify(data));
    }

    // Check consistency between JSON data and redundant file content
    checkConsistency() {
        if (this.data) {
            // Ensure fields exist
            if (!this.data.pairing_file_content) this.data.pairing_file_content = this.generatePairingFileContent();
            if (!this.data.result_file_content) this.data.result_file_content = this.generateResultFileContent();

            this.validatePairingRedundancy(this.data.matches, this.data.pairing_file_content);
            this.validateResultRedundancy(this.data.matches, this.data.result_file_content);
        }
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

    // Generate pairing file content
    generatePairingFileContent() {
        let content = "# Format: Round MatchID AffID NegID\n";
        const sortedMatches = [...this.data.matches].sort((a, b) => a.match_id - b.match_id);
        for (const m of sortedMatches) {
            content += `${m.round_num} ${m.match_id} ${m.aff_id} ${m.neg_id}\n`;
        }
        return content;
    }

    // Generate result file content
    generateResultFileContent() {
        let content = "# Format: Round MatchID AffID NegID Outcome\n";
        const sortedMatches = [...this.data.matches].sort((a, b) => a.match_id - b.match_id);
        for (const m of sortedMatches) {
            if (m.result !== null) {
                content += `${m.round_num} ${m.match_id} ${m.aff_id} ${m.neg_id} ${m.result}\n`;
            }
        }
        return content;
    }

    // Validate pairing redundancy
    validatePairingRedundancy(matches, content) {
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        if (lines.length !== matches.length) {
            throw new Error(`Redundancy check failed: Pairing file has ${lines.length} matches, JSON has ${matches.length}`);
        }
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 4) continue;
            const [r, mid, aff, neg] = parts.map(Number);

            const match = matches.find(m => m.match_id === mid);
            if (!match) throw new Error(`Redundancy check failed: Match ${mid} in pairing file not found in JSON`);
            if (match.round_num !== r) throw new Error(`Redundancy check failed: Match ${mid} round mismatch (File: ${r}, JSON: ${match.round_num})`);
            if (match.aff_id !== aff) throw new Error(`Redundancy check failed: Match ${mid} Aff ID mismatch (File: ${aff}, JSON: ${match.aff_id})`);
            if (match.neg_id !== neg) throw new Error(`Redundancy check failed: Match ${mid} Neg ID mismatch (File: ${neg}, JSON: ${match.neg_id})`);
        }
    }

    // Validate result redundancy
    validateResultRedundancy(matches, content) {
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        const matchesWithResults = matches.filter(m => m.result !== null);

        if (lines.length !== matchesWithResults.length) {
            throw new Error(`Redundancy check failed: Result file has ${lines.length} results, JSON has ${matchesWithResults.length}`);
        }

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 5) continue;
            const r = Number(parts[0]);
            const mid = Number(parts[1]);
            const aff = Number(parts[2]);
            const neg = Number(parts[3]);
            const outcome = parts[4];

            const match = matches.find(m => m.match_id === mid);
            if (!match) throw new Error(`Redundancy check failed: Match ${mid} in result file not found in JSON`);
            if (match.round_num !== r) throw new Error(`Redundancy check failed: Match ${mid} round mismatch`);
            if (match.aff_id !== aff) throw new Error(`Redundancy check failed: Match ${mid} Aff ID mismatch`);
            if (match.neg_id !== neg) throw new Error(`Redundancy check failed: Match ${mid} Neg ID mismatch`);
            if (match.result !== outcome) throw new Error(`Redundancy check failed: Match ${mid} outcome mismatch (File: ${outcome}, JSON: ${match.result})`);
        }
    }

    // Utility: Shuffle array
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

// Export for Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TournamentManager, Team };
}
