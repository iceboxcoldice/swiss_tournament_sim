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

async function testTabroomFlighting() {
    console.log("Testing Tabroom Flighting & Room Scheduling in JavaScript...\n");

    const tm = new TournamentManager();
    const teamDetails = Array.from({ length: 8 }, (_, i) => ({
        name: `Team ${i + 1}`,
        institution: `School ${i + 1}`
    }));

    await tm.init(8, 3, 0, teamDetails, 'high-low');

    // Configure 2 flights and 2 rooms
    tm.data.config.flighted = true;
    tm.data.config.num_flights = 2;
    tm.data.config.rooms = ["Room 101", "Room 102"];
    tm.data.rooms = ["Room 101", "Room 102"];

    await tm.pairRound(1);
    const round1Matches = tm.data.matches.filter(m => m.round_num === 1);
    assert.strictEqual(round1Matches.length, 4, "Expected 4 matches in round 1");

    // Flight 1 (Flight A)
    const m1 = round1Matches[0];
    const m2 = round1Matches[1];
    assert.strictEqual(m1.flight, 1, "Match 1 should be Flight 1");
    assert.strictEqual(m1.room, "Room 101", "Match 1 should be Room 101");
    assert.strictEqual(m2.flight, 1, "Match 2 should be Flight 1");
    assert.strictEqual(m2.room, "Room 102", "Match 2 should be Room 102");

    // Flight 2 (Flight B)
    const m3 = round1Matches[2];
    const m4 = round1Matches[3];
    assert.strictEqual(m3.flight, 2, "Match 3 should be Flight 2");
    assert.strictEqual(m3.room, "Room 101", "Match 3 should be Room 101");
    assert.strictEqual(m4.flight, 2, "Match 4 should be Flight 2");
    assert.strictEqual(m4.room, "Room 102", "Match 4 should be Room 102");

    console.log(`✓ Match 1: Flight ${m1.flight} (A) in ${m1.room}`);
    console.log(`✓ Match 2: Flight ${m2.flight} (A) in ${m2.room}`);
    console.log(`✓ Match 3: Flight ${m3.flight} (B) in ${m3.room}`);
    console.log(`✓ Match 4: Flight ${m4.flight} (B) in ${m4.room}`);

    console.log("\nAll JavaScript Tabroom Flighting & Room Scheduling tests PASSED! ✅");
}

testTabroomFlighting().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
