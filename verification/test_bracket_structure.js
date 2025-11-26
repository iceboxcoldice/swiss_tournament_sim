// Test bracket structure with 8 teams (quarterfinals)
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
    console.log("Testing 8-Team Bracket Structure...\n");

    const tm = new TournamentManager();

    // Init with 16 teams, 4 prelim rounds, 3 elim rounds (8 teams break)
    console.log("1. Initializing tournament with 16 teams...");
    const teamNames = Array.from({ length: 16 }, (_, i) => `Team ${String.fromCharCode(65 + i)}`);
    tm.init(16, 4, 3, teamNames);

    // Simulate 4 prelim rounds with controlled results
    console.log("\n2. Simulating 4 preliminary rounds...");
    for (let round = 1; round <= 4; round++) {
        tm.pairRound(round);
        const matches = tm.data.matches.filter(m => m.round_num === round);

        // Report results - alternate winners to create varied standings
        matches.forEach((m, idx) => {
            const outcome = (idx + round) % 2 === 0 ? 'A' : 'N';
            tm.reportResult(m.match_id, outcome);
        });
        console.log(`  Round ${round} complete`);
    }

    // Check final standings
    console.log("\n3. Final Standings (Top 8 break to elimination):");
    const standings = tm.getStandings();
    const top8 = standings.slice(0, 8);
    top8.forEach((t, i) => {
        console.log(`  Seed ${i + 1}: ${t.name} (${t.wins}-${4 - t.wins}, Score: ${t.score}, Buch: ${t.buchholz.toFixed(1)})`);
    });

    // Pair Elimination Round 1 (Quarterfinals)
    console.log("\n4. Pairing Quarterfinals (Elimination Round 1)...");
    tm.pairRound(5);
    const quarterfinals = tm.data.matches.filter(m => m.round_num === 5);

    console.log("\n5. QUARTERFINAL BRACKET (Top to Bottom):");
    console.log("   Expected: 1v8, 4v5, 3v6, 2v7");
    console.log("   Actual:");
    quarterfinals.forEach((m, idx) => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);

        // Display with higher seed first
        const firstTeam = affTeam.break_seed < negTeam.break_seed ? affTeam : negTeam;
        const secondTeam = affTeam.break_seed < negTeam.break_seed ? negTeam : affTeam;

        console.log(`   Match ${idx + 1}: Seed ${firstTeam.break_seed} (${firstTeam.name}) vs Seed ${secondTeam.break_seed} (${secondTeam.name})`);
    });

    // Verify the bracket structure
    console.log("\n6. Verification:");
    const expectedPairings = [
        [1, 8],  // Top of bracket
        [4, 5],  // Top half, second match
        [3, 6],  // Bottom half, first match
        [2, 7]   // Bottom of bracket
    ];

    let allCorrect = true;
    quarterfinals.forEach((m, idx) => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        const seeds = [affTeam.break_seed, negTeam.break_seed].sort((a, b) => a - b);

        const expected = expectedPairings[idx];
        const isCorrect = seeds[0] === expected[0] && seeds[1] === expected[1];

        console.log(`   Match ${idx + 1}: ${isCorrect ? '✓' : '✗'} Expected ${expected[0]}v${expected[1]}, Got ${seeds[0]}v${seeds[1]}`);

        if (!isCorrect) allCorrect = false;
    });

    console.log(`\n${allCorrect ? '✓ PASS' : '✗ FAIL'}: Bracket structure is ${allCorrect ? 'correct' : 'incorrect'}!`);
}

runTest();
