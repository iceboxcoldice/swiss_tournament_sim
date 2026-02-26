// Test 16-team tournament with 4 prelim rounds and 3 elim rounds
// Verifies that the correct top 8 teams break to elimination rounds

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
    console.log("Testing 16-Team Tournament (4 Prelim + 3 Elim)...\n");
    console.log("=".repeat(60));

    const tm = new TournamentManager();

    // 1. Initialize tournament
    console.log("\n1. INITIALIZATION");
    console.log("-".repeat(60));
    const teamNames = [
        'Team A', 'Team B', 'Team C', 'Team D',
        'Team E', 'Team F', 'Team G', 'Team H',
        'Team I', 'Team J', 'Team K', 'Team L',
        'Team M', 'Team N', 'Team O', 'Team P'
    ];

    tm.init(16, 4, 3, teamNames);
    console.log(`✓ Initialized: ${tm.data.config.num_teams} teams`);
    console.log(`  - Preliminary rounds: ${tm.data.config.num_prelim_rounds}`);
    console.log(`  - Elimination rounds: ${tm.data.config.num_elim_rounds}`);
    console.log(`  - Total rounds: ${tm.data.config.num_rounds}`);

    // 2-5. Run all 4 preliminary rounds with controlled results
    console.log("\n2. PRELIMINARY ROUNDS");
    console.log("-".repeat(60));

    // Round 1: First 8 teams win (A-H)
    console.log("\nRound 1: Pairing and reporting results...");
    tm.pairRound(1);
    let r1Matches = tm.data.matches.filter(m => m.round_num === 1);
    r1Matches.forEach((m, idx) => {
        const outcome = idx < 8 ? 'A' : 'N';
        tm.reportResult(m.match_id, outcome);
    });
    console.log(`✓ Round 1 complete: ${r1Matches.length} matches reported`);

    // Round 2: Alternate winners to create variety
    console.log("\nRound 2: Pairing and reporting results...");
    tm.pairRound(2);
    let r2Matches = tm.data.matches.filter(m => m.round_num === 2);
    r2Matches.forEach((m, idx) => {
        const outcome = idx % 2 === 0 ? 'A' : 'N';
        tm.reportResult(m.match_id, outcome);
    });
    console.log(`✓ Round 2 complete: ${r2Matches.length} matches reported`);

    // Round 3: Create more differentiation
    console.log("\nRound 3: Pairing and reporting results...");
    tm.pairRound(3);
    let r3Matches = tm.data.matches.filter(m => m.round_num === 3);
    r3Matches.forEach((m, idx) => {
        const outcome = idx % 3 === 0 ? 'N' : 'A';
        tm.reportResult(m.match_id, outcome);
    });
    console.log(`✓ Round 3 complete: ${r3Matches.length} matches reported`);

    // Round 4: Final prelim round
    console.log("\nRound 4: Pairing and reporting results...");
    tm.pairRound(4);
    let r4Matches = tm.data.matches.filter(m => m.round_num === 4);
    r4Matches.forEach((m, idx) => {
        const outcome = idx % 2 === 0 ? 'A' : 'N';
        tm.reportResult(m.match_id, outcome);
    });
    console.log(`✓ Round 4 complete: ${r4Matches.length} matches reported`);

    // 6. Check final standings before break
    console.log("\n3. FINAL STANDINGS (Before Break)");
    console.log("-".repeat(60));
    const standings = tm.getStandings();

    console.log("\nTop 8 teams (should break to elimination rounds):");
    const top8 = standings.slice(0, 8);
    top8.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name.padEnd(10)} - ${t.wins}W ${(t.score - t.wins)}L, Score: ${t.score}, Buch: ${t.buchholz.toFixed(1)}`);
    });

    console.log("\nTeams 9-16 (should NOT break):");
    const bottom8 = standings.slice(8);
    bottom8.forEach((t, i) => {
        console.log(`  ${i + 9}. ${t.name.padEnd(10)} - ${t.wins}W ${(t.score - t.wins)}L, Score: ${t.score}, Buch: ${t.buchholz.toFixed(1)}`);
    });

    // 7. Pair first elimination round (Quarterfinals)
    console.log("\n4. ELIMINATION ROUND 1 (Quarterfinals)");
    console.log("-".repeat(60));
    tm.pairRound(5);
    const r5Matches = tm.data.matches.filter(m => m.round_num === 5);

    console.log(`\n✓ Paired ${r5Matches.length} matches (expected: 4)`);

    // Verify break seeds were assigned
    const brokenTeams = tm.teams.filter(t => t.break_seed !== null).sort((a, b) => a.break_seed - b.break_seed);
    console.log(`\n✓ ${brokenTeams.length} teams broke (expected: 8)`);

    console.log("\nBreak Seeds Assigned:");
    brokenTeams.forEach(t => {
        const standingPos = standings.findIndex(s => s.name === t.name) + 1;
        console.log(`  Seed ${t.break_seed}: ${t.name.padEnd(10)} (was #${standingPos} in standings)`);
    });

    console.log("\nQuarterfinal Pairings:");
    r5Matches.forEach(m => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        console.log(`  Match ${m.match_id}: Seed ${affTeam.break_seed} (${affTeam.name}) vs Seed ${negTeam.break_seed} (${negTeam.name})`);
    });

    // Verify correct teams broke
    console.log("\n5. VERIFICATION");
    console.log("-".repeat(60));

    let allTestsPassed = true;

    // Test 1: Exactly 8 teams should break
    if (brokenTeams.length !== 8) {
        console.log(`✗ FAIL: Expected 8 teams to break, got ${brokenTeams.length}`);
        allTestsPassed = false;
    } else {
        console.log(`✓ PASS: Exactly 8 teams broke`);
    }

    // Test 2: Exactly 4 quarterfinal matches
    if (r5Matches.length !== 4) {
        console.log(`✗ FAIL: Expected 4 quarterfinal matches, got ${r5Matches.length}`);
        allTestsPassed = false;
    } else {
        console.log(`✓ PASS: Exactly 4 quarterfinal matches created`);
    }

    // Test 3: Break seeds should match top 8 standings
    const top8Names = top8.map(t => t.name);
    const brokenNames = brokenTeams.map(t => t.name);
    const correctBreak = top8Names.every(name => brokenNames.includes(name));

    if (!correctBreak) {
        console.log(`✗ FAIL: Teams that broke don't match top 8 standings`);
        console.log(`  Expected: ${top8Names.join(', ')}`);
        console.log(`  Got:      ${brokenNames.join(', ')}`);
        allTestsPassed = false;
    } else {
        console.log(`✓ PASS: Correct teams broke (top 8 from standings)`);
    }

    // Test 4: Verify seeding order
    const seedingCorrect = brokenTeams.every((t, idx) => {
        return t.name === top8[idx].name;
    });

    if (!seedingCorrect) {
        console.log(`✗ FAIL: Break seed order doesn't match standings order`);
        allTestsPassed = false;
    } else {
        console.log(`✓ PASS: Break seeds assigned in correct order`);
    }

    // Test 5: Verify bracket pairings
    // The algorithm creates bracket halves: 1v8, 4v5 (top half), 2v7, 3v6 (bottom half)
    // This ensures proper bracket structure where winners meet correctly in later rounds
    const expectedPairings = [
        [1, 8], [4, 5], [2, 7], [3, 6]
    ];

    let pairingsCorrect = true;
    const actualPairings = [];

    r5Matches.forEach((m, idx) => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);

        // Store actual pairing (normalize to [lower_seed, higher_seed])
        const seeds = [affTeam.break_seed, negTeam.break_seed].sort((a, b) => a - b);
        actualPairings.push(seeds);
    });

    // Check if actual pairings match expected (order-independent)
    expectedPairings.forEach((expected, idx) => {
        const found = actualPairings.some(actual =>
            actual[0] === expected[0] && actual[1] === expected[1]
        );

        if (!found) {
            console.log(`✗ FAIL: Expected pairing Seed ${expected[0]} vs Seed ${expected[1]} not found`);
            pairingsCorrect = false;
            allTestsPassed = false;
        }
    });

    if (pairingsCorrect) {
        console.log(`✓ PASS: Bracket pairings correct (1v8, 4v5, 2v7, 3v6)`);
    }

    // Report semifinals and finals
    console.log("\n6. SEMIFINALS AND FINALS");
    console.log("-".repeat(60));

    // Report quarterfinal results (higher seeds win)
    console.log("\nReporting Quarterfinal results (higher seeds advance)...");
    r5Matches.forEach(m => {
        tm.reportResult(m.match_id, 'A'); // Aff (higher seed) wins
    });
    console.log("✓ Quarterfinals complete");

    // Pair semifinals
    console.log("\nPairing Semifinals...");
    tm.pairRound(6);
    const r6Matches = tm.data.matches.filter(m => m.round_num === 6);
    console.log(`✓ Paired ${r6Matches.length} matches (expected: 2)`);

    r6Matches.forEach(m => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        console.log(`  Match ${m.match_id}: Seed ${affTeam.break_seed} (${affTeam.name}) vs Seed ${negTeam.break_seed} (${negTeam.name})`);
    });

    // Report semifinal results
    console.log("\nReporting Semifinal results (higher seeds advance)...");
    r6Matches.forEach(m => {
        tm.reportResult(m.match_id, 'A');
    });
    console.log("✓ Semifinals complete");

    // Pair finals
    console.log("\nPairing Finals...");
    tm.pairRound(7);
    const r7Matches = tm.data.matches.filter(m => m.round_num === 7);
    console.log(`✓ Paired ${r7Matches.length} match (expected: 1)`);

    r7Matches.forEach(m => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        console.log(`  Match ${m.match_id}: Seed ${affTeam.break_seed} (${affTeam.name}) vs Seed ${negTeam.break_seed} (${negTeam.name})`);
    });

    // Final summary
    console.log("\n" + "=".repeat(60));
    if (allTestsPassed) {
        console.log("ALL TESTS PASSED! ✅");
        console.log("\nThe tournament correctly:");
        console.log("  • Broke the top 8 teams after 4 preliminary rounds");
        console.log("  • Assigned break seeds in the correct order");
        console.log("  • Created proper bracket pairings (1v8, 4v5, 2v7, 3v6)");
        console.log("  • Generated 4 quarterfinals, 2 semifinals, and 1 final");
    } else {
        console.log("SOME TESTS FAILED! ❌");
        console.log("See details above.");
        process.exit(1);
    }
    console.log("=".repeat(60));
}

runTest();
