const assert = require('assert');

// Mock localStorage for Node.js environment
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

async function testTabroomPanelAndRFD() {
    console.log("Testing Tabroom Multi-Judge Elim Panels & RFDs in JavaScript...\n");

    const tm = new TournamentManager();
    const teamDetails = [
        { name: "Stanford A", institution: "Stanford" },
        { name: "Yale B", institution: "Yale" }
    ];

    // 2 teams, 1 prelim round, 1 elim round (elim_panel_size = 3)
    await tm.init(2, 1, 1, teamDetails, 'high-low');
    tm.data.config.elim_panel_size = 3;

    tm.judges = [
        { id: 1, name: "Judge One", institution: "Tournament Hire", matches_judged: [] },
        { id: 2, name: "Judge Two", institution: "Tournament Hire", matches_judged: [] },
        { id: 3, name: "Judge Three", institution: "Tournament Hire", matches_judged: [] }
    ];

    // Round 1 (prelim)
    await tm.startTournament(true);
    const m1 = tm.data.matches[0];
    await tm.reportResult(m1.match_id, 'A');

    // Round 2 (Elimination Round / Finals)
    await tm.pairRound(2);
    const elimMatch = tm.data.matches.find(m => m.round_num === 2);
    assert(elimMatch, "Elimination match should exist");

    // Test 1: Auto-assign elimination panel
    console.log("Test 1: Auto-assign 3-judge elimination panel...");
    const assignments = await tm.autoAssignJudges(2);
    assert.strictEqual(assignments.length, 1);
    assert.strictEqual(elimMatch.panel.length, 3, "Expected 3 judges assigned to elimination panel");
    console.log(`✓ PASS: Elim match assigned 3-judge panel: [${elimMatch.panel.join(', ')}]`);

    // Test 2: Panel Voting & Majority Decision
    console.log("\nTest 2: Panel Voting & RFD Recording...");

    // Judge 1 votes Aff
    await tm.reportResult(elimMatch.match_id, 'A', null, 1, "Aff won framework");
    assert.strictEqual(elimMatch.result, null, "Result should still be pending after 1 vote");

    // Judge 2 votes Neg
    await tm.reportResult(elimMatch.match_id, 'N', null, 2, "Neg CP solves all");
    assert.strictEqual(elimMatch.result, null, "Result should still be pending at 1-1");

    // Judge 3 votes Aff
    await tm.reportResult(elimMatch.match_id, 'A', null, 3, "Aff impact outweighs");

    // Check final majority resolution
    assert.strictEqual(elimMatch.result, 'A', "Aff should win with 2-1 majority");
    assert.strictEqual(elimMatch.decision, '2-1', "Decision should be recorded as 2-1");
    assert.strictEqual(Object.keys(elimMatch.ballots).length, 3);
    assert.strictEqual(elimMatch.ballots['1'].rfd, "Aff won framework");
    assert.strictEqual(elimMatch.ballots['2'].rfd, "Neg CP solves all");
    assert.strictEqual(elimMatch.ballots['3'].rfd, "Aff impact outweighs");

    console.log("✓ PASS: 3-judge panel resolved to 2-1 majority win for Affirmative!");
    console.log("✓ PASS: All judge ballots, votes, and RFDs verified in JavaScript!");

    console.log("\nAll JavaScript Tabroom Panel & RFD tests PASSED! ✅");
}

testTabroomPanelAndRFD().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
