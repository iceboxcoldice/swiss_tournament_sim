// Detailed test to check seeding logic
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
    console.log("Detailed Seeding Test...\n");

    const tm = new TournamentManager();

    // Init with 8 teams, 2 prelim rounds, 2 elim rounds
    console.log("1. Initializing tournament...");
    tm.init(8, 2, 2, ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F', 'Team G', 'Team H']);

    // Pair Round 1
    console.log("\n2. Pairing Round 1...");
    tm.pairRound(1);
    const r1Matches = tm.data.matches.filter(m => m.round_num === 1);
    console.log("Round 1 Matches:");
    r1Matches.forEach(m => {
        console.log(`  Match ${m.match_id}: ${m.aff_name} vs ${m.neg_name}`);
    });

    // Report Round 1 results - make specific teams win
    console.log("\n3. Reporting Round 1 results (A, B, C, D win)...");
    r1Matches.forEach((m, idx) => {
        // First 4 matches: Aff wins, Last 4: Neg wins
        const outcome = idx < 4 ? 'A' : 'N';
        tm.reportResult(m.match_id, outcome);
        const winner = outcome === 'A' ? m.aff_name : m.neg_name;
        console.log(`  Match ${m.match_id}: ${winner} wins`);
    });

    // Check standings after Round 1
    console.log("\n4. Standings after Round 1:");
    let standings = tm.getStandings();
    standings.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name} - W:${t.wins} Score:${t.score} Buch:${t.buchholz.toFixed(1)}`);
    });

    // Pair Round 2
    console.log("\n5. Pairing Round 2...");
    tm.pairRound(2);
    const r2Matches = tm.data.matches.filter(m => m.round_num === 2);
    console.log("Round 2 Matches:");
    r2Matches.forEach(m => {
        console.log(`  Match ${m.match_id}: ${m.aff_name} vs ${m.neg_name}`);
    });

    // Report Round 2 results
    console.log("\n6. Reporting Round 2 results...");
    r2Matches.forEach((m, idx) => {
        const outcome = idx % 2 === 0 ? 'A' : 'N';
        tm.reportResult(m.match_id, outcome);
        const winner = outcome === 'A' ? m.aff_name : m.neg_name;
        console.log(`  Match ${m.match_id}: ${winner} wins`);
    });

    // Check final standings before break
    console.log("\n7. FINAL STANDINGS BEFORE BREAK:");
    standings = tm.getStandings();
    standings.forEach((t, i) => {
        console.log(`  ${i + 1}. ${t.name} - W:${t.wins} Score:${t.score} Buch:${t.buchholz.toFixed(1)}`);
    });

    console.log("\n8. Top 4 teams that SHOULD break:");
    const top4 = standings.slice(0, 4);
    top4.forEach((t, i) => {
        console.log(`  Seed ${i + 1}: ${t.name}`);
    });

    // Pair Round 3 (Elim 1)
    console.log("\n9. Pairing Elimination Round 1...");
    tm.pairRound(3);
    const r3Matches = tm.data.matches.filter(m => m.round_num === 3);

    console.log("\n10. ACTUAL SEEDS ASSIGNED:");
    const brokenTeams = tm.teams.filter(t => t.break_seed !== null).sort((a, b) => a.break_seed - b.break_seed);
    brokenTeams.forEach(t => {
        console.log(`  Seed ${t.break_seed}: ${t.name}`);
    });

    console.log("\n11. Elimination Round 1 Pairings:");
    r3Matches.forEach(m => {
        const affTeam = tm.teams.find(t => t.id === m.aff_id);
        const negTeam = tm.teams.find(t => t.id === m.neg_id);
        console.log(`  Match ${m.match_id}: ${affTeam.name} (Seed ${affTeam.break_seed}) vs ${negTeam.name} (Seed ${negTeam.break_seed})`);
    });
}

runTest();
