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

async function testDropTeam() {
    console.log('Testing Tabroom Team Drop & Reinstate Functionality in JavaScript...\n');

    const tm = new TournamentManager();

    // 8 teams: Teams 1-8
    const teamDetails = Array.from({ length: 8 }, (_, i) => ({
        name: `Team ${i + 1}`,
        institution: `School ${i + 1}`
    }));

    await tm.init(8, 4, 1, teamDetails, 'high-low');

    // --- TEST 1: Round 1 normal pairing ---
    console.log('Test 1: Round 1 Normal Pairing (8 teams)...');
    await tm.pairRound(1);
    const r1Matches = tm.data.matches.filter(m => m.round_num === 1);
    if (r1Matches.length !== 4) throw new Error(`Expected 4 matches in R1, got ${r1Matches.length}`);

    // Report results for Round 1
    for (const m of r1Matches) {
        await tm.reportResult(m.match_id, 'A', { affPoints: [29.0, 29.0], negPoints: [27.0, 27.0] });
    }
    console.log('✓ PASS: Round 1 complete with 8 teams.');

    // --- TEST 2: Mid-Tournament Drop (Between Rounds) ---
    console.log('\nTest 2: Drop Team 8 before Round 2 pairing...');
    await tm.dropTeam(7); // Team 8 has ID 7

    const team8 = tm.teams.find(t => t.id === 7);
    if (!team8.is_dropped) throw new Error('Expected team8.is_dropped to be true');
    console.log(`✓ PASS: Team 8 successfully marked as dropped (${team8.is_dropped})`);

    // --- TEST 3: Pairing Round 2 with 7 active teams (Odd Field -> Automatic Tabroom BYE) ---
    console.log('\nTest 3: Pairing Round 2 (7 active teams -> 3 debates + 1 BYE)...');
    await tm.pairRound(2);
    const r2Matches = tm.data.matches.filter(m => m.round_num === 2);
    
    // 7 teams -> 3 debates + 1 bye = 4 matches
    if (r2Matches.length !== 4) {
        throw new Error(`Expected 4 matches in R2 (3 debates + 1 bye), got ${r2Matches.length}`);
    }

    // Verify dropped Team 8 is NOT in any Round 2 match
    const team8InR2 = r2Matches.some(m => m.aff_id === 7 || m.neg_id === 7);
    if (team8InR2) throw new Error('Dropped Team 8 was incorrectly paired in Round 2!');
    console.log('✓ PASS: Dropped Team 8 completely excluded from Round 2 pairings!');

    const r2Bye = r2Matches.find(m => m.is_bye || m.neg_id === -1);
    if (!r2Bye) throw new Error('Expected 1 BYE match in Round 2 for odd active field!');
    console.log(`✓ PASS: Odd field of 7 active teams automatically triggered Tabroom BYE for ${r2Bye.aff_name}!`);

    // --- TEST 4: Drop Team Mid-Round with Active Match (Forfeit Conversion) ---
    console.log('\nTest 4: Mid-round drop with active match (Automatic Forfeit Win)...');
    // Find an active match in Round 2 (not the bye)
    const activeMatch = r2Matches.find(m => !m.is_bye && m.result === null);
    if (!activeMatch) throw new Error('No active match found in Round 2');
    
    const teamToDropMidRound = activeMatch.aff_id;
    const opponentTeamId = activeMatch.neg_id;
    console.log(`Dropping team ID ${teamToDropMidRound} while Match ${activeMatch.match_id} is in progress...`);

    await tm.dropTeam(teamToDropMidRound);

    // Verify match was immediately converted to Forfeit Win for opponent (Neg)
    if (activeMatch.result !== 'N') {
        throw new Error(`Expected Neg to win by forfeit, got result=${activeMatch.result}`);
    }
    if (!activeMatch.is_forfeit) {
        throw new Error('Expected activeMatch.is_forfeit to be true');
    }
    const oppTeam = tm.teams.find(t => t.id === opponentTeamId);
    console.log(`✓ PASS: Match ${activeMatch.match_id} automatically recorded as Forfeit Win for ${oppTeam.name}!`);

    // --- TEST 5: Reinstate Team ---
    console.log('\nTest 5: Reinstating dropped team...');
    await tm.reinstateTeam(teamToDropMidRound);
    const reinstatedTeam = tm.teams.find(t => t.id === teamToDropMidRound);
    if (reinstatedTeam.is_dropped) {
        throw new Error('Expected reinstatedTeam.is_dropped to be false');
    }
    console.log(`✓ PASS: Team "${reinstatedTeam.name}" successfully reinstated!`);

    console.log('\nAll Team Drop & Reinstate tests PASSED! ✅');
}

testDropTeam().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
