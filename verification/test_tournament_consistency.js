// Mock localStorage
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
    console.log("Starting Consistency Test...");

    const tm = new TournamentManager();

    // 1. Init
    console.log("1. Initializing tournament...");
    tm.init(4, 3, ['A', 'B', 'C', 'D']);
    console.log("   Init complete. Checking consistency...");
    tm.checkConsistency(); // Should pass
    console.log("   Passed.");

    // 2. Pair Round 1
    console.log("2. Pairing Round 1...");
    const pairs1 = tm.pairRound(1);
    console.log(`   Paired ${pairs1.length} matches.`);
    tm.checkConsistency(); // Should pass
    console.log("   Passed.");

    // 3. Report Result (Match 1)
    console.log("3. Reporting Match 1 result...");
    const m1 = tm.data.matches[0];
    tm.reportResult(m1.match_id, 'A');
    tm.checkConsistency(); // Should pass
    console.log("   Passed.");

    // 4. Update Result (Match 1) - Correction
    console.log("4. Updating Match 1 result (Correction)...");
    tm.updateResult(m1.match_id, 'N');
    tm.checkConsistency(); // Should pass
    console.log("   Passed.");

    // Check if old line is commented out
    const lines = tm.data.result_file_content.split('\n');
    const commented = lines.filter(l => l.trim().startsWith('#') && l.includes('Updated/Corrected'));
    if (commented.length === 0) {
        throw new Error("Failed: Old result line not commented out.");
    }
    console.log("   Old result commented out correctly.");

    // 5. Unsubmit Result (Match 1)
    console.log("5. Unsubmitting Match 1 result...");
    tm.updateResult(m1.match_id, null);
    tm.checkConsistency(); // Should pass
    console.log("   Passed.");

    // Check if result is null in JSON and file content has no active line for this match
    if (m1.result !== null) throw new Error("Match result not null");
    // Validate redundancy logic ensures no active line
    try {
        tm.validateResultRedundancy(tm.data.matches, tm.data.result_file_content);
    } catch (e) {
        throw new Error("Validation failed after unsubmit: " + e.message);
    }

    // 6. Simulate Inconsistency
    console.log("6. Simulating Inconsistency (Manual Tampering)...");
    // Manually change a result in JSON without updating file content
    m1.result = 'A';
    // Now check consistency - should fail
    try {
        tm.checkConsistency();
        throw new Error("Failed: Consistency check should have failed!");
    } catch (e) {
        if (e.message.includes("Redundancy check failed")) {
            console.log("   Caught expected error: " + e.message);
        } else {
            throw e;
        }
    }

    console.log("All tests passed!");
}

runTest();
