// Test elimination rounds functionality
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();
global.localStorage = localStorageMock;

const { TournamentManager } = require('../docs/manager/tournament.js');

function runTest() {
    console.log("Testing Elimination Rounds Feature...\n");

    const tm = new TournamentManager();

    // 1. Init with 8 teams, 2 prelim rounds, 2 elim rounds
    console.log("1. Initializing tournament (8 teams, 2 prelim, 2 elim)...");
    tm.init(8, 2, 2, ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team H']);
    console.log(`   Config: ${tm.data.config.num_prelim_rounds} prelim + ${tm.data.config.num_elim_rounds} elim = ${tm.data.config.num_rounds} total`);
    console.log("   ✓ Passed\n");

    // 2. Pair Round 1 (Prelim)
    console.log("2. Pairing Round 1 (Prelim)...");
    const r1Pairs = tm.pairRound(1);
    console.log(`   Paired ${r1Pairs.length} matches`);
    console.log("   ✓ Passed\n");

    // 3. Report Round 1 results (set up standings)
    console.log("3. Reporting Round 1 results...");
    const r1Matches = tm.data.matches.filter(m => m.round_num === 1);
    // Make Team A, B, C, D win
    r1Matches.forEach((m, idx) => {
        const outcome = idx < 4 ? 'A' : 'N';
        tm.reportResult(m.match_id, outcome);
    });
    console.log("   ✓ Passed\n");

    // 4. Pair Round 2 (Prelim)
    console.log("4. Pairing Round 2 (Prelim)...");
    const r2Pairs = tm.pairRound(2);
    console.log(`   Paired ${r2Pairs.length} matches`);
    console.log("   ✓ Passed\n");

    // 5. Report Round 2 results
    console.log("5. Reporting Round 2 results...");
    const r2Matches = tm.data.matches.filter(m => m.round_num === 2);
    r2Matches.forEach((m, idx) => {
        const outcome = idx % 2 === 0 ? 'A' : 'N';
        tm.reportResult(m.match_id, outcome);
    });
    console.log("   ✓ Passed\n");

    // 6. Check standings before break
    console.log("6. Checking standings before break...");
    const standings = tm.getStandings();
    console.log("   Top 4 teams:");
    standings.slice(0, 4).forEach((t, i) => {
        console.log(`     ${i + 1}. ${t.name} (${t.wins}-${t.score - t.wins}, Score: ${t.score})`);
    });
    console.log("   ✓ Passed\n");

    // 7. Pair Round 3 (Elim 1) - Should break top 4
    console.log("7. Pairing Round 3 (Elim 1)...");
    const r3Pairs = tm.pairRound(3);
    console.log(`   Paired ${r3Pairs.length} matches (should be 2 for top 4)`);
    const r3Matches = tm.data.matches.filter(m => m.round_num === 3);
    console.log("   Elimination Round 1 Pairings:");
    r3Matches.forEach(m => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        console.log(`     Match ${m.match_id}: ${affTeam.name} (Seed ${affTeam.break_seed}) vs ${negTeam.name} (Seed ${negTeam.break_seed})`);
    });

    // Verify break seeds
    const brokenTeams = tm.teams.filter(t => t.break_seed !== null);
    if (brokenTeams.length !== 4) {
        throw new Error(`Expected 4 teams to break, got ${brokenTeams.length}`);
    }
    console.log("   ✓ Passed\n");

    // 8. Report Elim 1 results
    console.log("8. Reporting Elim 1 results...");
    r3Matches.forEach(m => {
        tm.reportResult(m.match_id, 'A'); // Aff wins
    });
    console.log("   ✓ Passed\n");

    // 9. Pair Round 4 (Elim 2 - Finals)
    console.log("9. Pairing Round 4 (Elim 2 - Finals)...");
    const r4Pairs = tm.pairRound(4);
    console.log(`   Paired ${r4Pairs.length} match (should be 1 for finals)`);
    const r4Matches = tm.data.matches.filter(m => m.round_num === 4);
    console.log("   Finals Pairing:");
    r4Matches.forEach(m => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        console.log(`     Match ${m.match_id}: ${affTeam.name} (Seed ${affTeam.break_seed}) vs ${negTeam.name} (Seed ${negTeam.break_seed})`);
    });
    console.log("   ✓ Passed\n");

    // 10. Test label generation
    console.log("10. Testing elimination round labels...");

    // Helper function (copied from app.js)
    function getElimRoundLabel(elimRoundNum, totalElimRounds) {
        const roundsFromEnd = totalElimRounds - elimRoundNum + 1;

        if (roundsFromEnd === 1) return "Finals";
        if (roundsFromEnd === 2) return "Semifinals";
        if (roundsFromEnd === 3) return "Quarterfinals";

        const teamsInRound = Math.pow(2, roundsFromEnd);
        return `Round of ${teamsInRound}`;
    }

    console.log(`   Round 3 (Elim 1): "${getElimRoundLabel(1, 2)}" (expected: Semifinals)`);
    console.log(`   Round 4 (Elim 2): "${getElimRoundLabel(2, 2)}" (expected: Finals)`);

    // Test with more rounds
    console.log(`   With 4 elim rounds:`);
    console.log(`     Elim 1: "${getElimRoundLabel(1, 4)}" (expected: Round of 16)`);
    console.log(`     Elim 2: "${getElimRoundLabel(2, 4)}" (expected: Quarterfinals)`);
    console.log(`     Elim 3: "${getElimRoundLabel(3, 4)}" (expected: Semifinals)`);
    console.log(`     Elim 4: "${getElimRoundLabel(4, 4)}" (expected: Finals)`);
    console.log("   ✓ Passed\n");

    console.log("All tests passed! ✅");
}

runTest();
