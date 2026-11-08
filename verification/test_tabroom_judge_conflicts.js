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

const { TournamentManager } = require('../frontend/manager/tournament.js');

async function testTabroomJudgeConflicts() {
    console.log("Testing Tabroom Judge Conflicts & Auto-Assignment in JavaScript...\n");

    const tm = new TournamentManager();
    const teamDetails = [
        { name: "Stanford A", institution: "Stanford" },
        { name: "Yale B", institution: "Yale" },
        { name: "Harvard C", institution: "Harvard" },
        { name: "Princeton D", institution: "Princeton" }
    ];

    await tm.init(4, 2, 0, teamDetails, 'high-low');

    tm.judges = [
        { id: 101, name: "Alice (Stanford)", institution: "Stanford", matches_judged: [] },
        { id: 102, name: "Bob (Harvard)", institution: "Harvard", matches_judged: [] },
        { id: 103, name: "Charlie (Clean)", institution: "Tournament Hire", matches_judged: [] }
    ];

    await tm.startTournament(true); // Creates Round 1 pairings
    assert.strictEqual(tm.data.matches.length, 2, "Expected 2 matches in round 1");

    const match1 = tm.data.matches[0];
    const match2 = tm.data.matches[1];

    console.log(`Round 1 Match 1: Team ${match1.aff_id} vs Team ${match1.neg_id}`);
    console.log(`Round 1 Match 2: Team ${match2.aff_id} vs Team ${match2.neg_id}`);

    // Test 1: Check School Conflicts
    console.log("\nTest 1: School Conflict Detection...");
    const stanfordMatch = tm.data.matches.find(m => m.aff_id === 0 || m.neg_id === 0);
    const harvardMatch = tm.data.matches.find(m => m.aff_id === 2 || m.neg_id === 2);
    const stanfordJudge = tm.judges.find(j => j.institution === "Stanford");
    const harvardJudge = tm.judges.find(j => j.institution === "Harvard");

    const conflict1 = tm.checkJudgeConflict(stanfordJudge.id, stanfordMatch.match_id);
    assert.strictEqual(conflict1.hasConflict, true, "Expected school conflict for Stanford judge on Stanford match");
    console.log(`✓ PASS: Correctly detected Stanford conflict: "${conflict1.reason}"`);

    const conflict2 = tm.checkJudgeConflict(harvardJudge.id, harvardMatch.match_id);
    assert.strictEqual(conflict2.hasConflict, true, "Expected school conflict for Harvard judge on Harvard match");
    console.log(`✓ PASS: Correctly detected Harvard conflict: "${conflict2.reason}"`);

    // Test 2: Clean Hire Judge
    console.log("\nTest 2: Clean Hire Judge...");
    const cleanJudge = tm.judges.find(j => j.institution === "Tournament Hire");
    const cleanConflict = tm.checkJudgeConflict(cleanJudge.id, match1.match_id);
    assert.strictEqual(cleanConflict.hasConflict, false, "Expected no conflict for Tournament Hire judge");
    console.log("✓ PASS: Tournament Hire judge has no conflict!");

    // Test 3: Auto-assign judges
    console.log("\nTest 3: Auto-Assign Judges (Conflict Avoidance)...");
    const assignments = await tm.autoAssignJudges(1);
    assert.strictEqual(assignments.length, 2, "Expected 2 judges auto-assigned");

    for (const m of tm.data.matches) {
        assert.notStrictEqual(m.judge_id, null, `Match ${m.match_id} should have an assigned judge`);
        const judge = tm.judges.find(j => j.id === m.judge_id);
        const conflict = tm.checkJudgeConflict(judge.id, m.match_id);
        assert.strictEqual(conflict.hasConflict, false, `Assigned judge ${judge.name} should NOT have a conflict!`);
        console.log(`✓ Match ${m.match_id} assigned to ${judge.name} (${judge.institution}) - 0 conflicts!`);
    }

    console.log("\nAll JavaScript Tabroom Judge Conflict tests PASSED! ✅");
}

testTabroomJudgeConflicts().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
