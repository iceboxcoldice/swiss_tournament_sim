// Test bracket structure with 32 teams (Round of 32)
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
    console.log("Testing 32-Team Bracket Structure...\n");

    const tm = new TournamentManager();

    // Init with 64 teams, 5 prelim rounds, 5 elim rounds (32 teams break)
    console.log("1. Initializing tournament with 64 teams...");
    const teamNames = Array.from({ length: 64 }, (_, i) => `Team ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`);
    tm.init(64, 5, 5, teamNames);

    // Simulate 5 prelim rounds with controlled results
    console.log("\n2. Simulating 5 preliminary rounds...");
    for (let round = 1; round <= 5; round++) {
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
    console.log("\n3. Final Standings (Top 32 break to elimination):");
    const standings = tm.getStandings();
    const top32 = standings.slice(0, 32);
    console.log(`  Seeds 1-10:`);
    top32.slice(0, 10).forEach((t, i) => {
        console.log(`    Seed ${i + 1}: ${t.name} (${t.wins}-${5 - t.wins})`);
    });
    console.log(`  ... (seeds 11-22 omitted)`);
    console.log(`  Seeds 23-32:`);
    top32.slice(22, 32).forEach((t, i) => {
        console.log(`    Seed ${i + 23}: ${t.name} (${t.wins}-${5 - t.wins})`);
    });

    // Pair Elimination Round 1 (Round of 32)
    console.log("\n4. Pairing Round of 32 (Elimination Round 1)...");
    tm.pairRound(6);
    const roundOf32 = tm.data.matches.filter(m => m.round_num === 6);

    console.log("\n5. ROUND OF 32 BRACKET (Top to Bottom):");
    console.log("   Key matches to verify:");
    console.log("   - First match should be: 1v32 (seed #1 at TOP)");
    console.log("   - Last match should be: 2v31 (seed #2 at BOTTOM)");
    console.log("");

    // Show first 4 matches
    console.log("   First 4 matches:");
    roundOf32.slice(0, 4).forEach((m, idx) => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);

        const firstTeam = affTeam.break_seed < negTeam.break_seed ? affTeam : negTeam;
        const secondTeam = affTeam.break_seed < negTeam.break_seed ? negTeam : affTeam;

        console.log(`   Match ${idx + 1}: Seed ${firstTeam.break_seed} vs Seed ${secondTeam.break_seed}`);
    });

    console.log("   ...");

    // Show last 4 matches
    console.log("   Last 4 matches:");
    roundOf32.slice(-4).forEach((m, idx) => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);

        const firstTeam = affTeam.break_seed < negTeam.break_seed ? affTeam : negTeam;
        const secondTeam = affTeam.break_seed < negTeam.break_seed ? negTeam : affTeam;

        console.log(`   Match ${13 + idx}: Seed ${firstTeam.break_seed} vs Seed ${secondTeam.break_seed}`);
    });

    // Verify key properties
    console.log("\n6. Verification:");

    // Check first match is 1v32
    const firstMatch = roundOf32[0];
    const firstAff = tm.teams.find(t => t.id === firstMatch.aff_id);
    const firstNeg = tm.teams.find(t => t.id === firstMatch.neg_id);
    const firstSeeds = [firstAff.break_seed, firstNeg.break_seed].sort((a, b) => a - b);
    const firstCorrect = firstSeeds[0] === 1 && firstSeeds[1] === 32;
    console.log(`   First match (1v32): ${firstCorrect ? '✓' : '✗'} Got ${firstSeeds[0]}v${firstSeeds[1]}`);

    // Check last match is 2v31
    const lastMatch = roundOf32[roundOf32.length - 1];
    const lastAff = tm.teams.find(t => t.id === lastMatch.aff_id);
    const lastNeg = tm.teams.find(t => t.id === lastMatch.neg_id);
    const lastSeeds = [lastAff.break_seed, lastNeg.break_seed].sort((a, b) => a - b);
    const lastCorrect = lastSeeds[0] === 2 && lastSeeds[1] === 31;
    console.log(`   Last match (2v31): ${lastCorrect ? '✓' : '✗'} Got ${lastSeeds[0]}v${lastSeeds[1]}`);

    // Verify all matches sum to 33 (standard bracket property)
    let allSumsCorrect = true;
    roundOf32.forEach((m, idx) => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        const sum = affTeam.break_seed + negTeam.break_seed;
        if (sum !== 33) {
            console.log(`   Match ${idx + 1}: ✗ Seeds ${affTeam.break_seed}+${negTeam.break_seed} = ${sum} (expected 33)`);
            allSumsCorrect = false;
        }
    });

    if (allSumsCorrect) {
        console.log(`   All seed sums equal 33: ✓`);
    }

    const allCorrect = firstCorrect && lastCorrect && allSumsCorrect;
    console.log(`\n${allCorrect ? '✓ PASS' : '✗ FAIL'}: 32-team bracket structure is ${allCorrect ? 'correct' : 'incorrect'}!`);
}

runTest();
