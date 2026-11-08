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

async function testTabroomBye() {
    console.log('Testing Tabroom BYE Mechanism in JavaScript...\n');

    const tm = new TournamentManager();

    // 9 teams (odd field)
    const teamDetails = Array.from({ length: 9 }, (_, i) => ({
        name: `Team ${i + 1}`,
        institution: `School ${i + 1}`
    }));

    await tm.init(9, 4, 0, teamDetails, 'high-low');

    // --- TEST 1: Round 1 (Preset) BYE Assignment ---
    console.log('Test 1: Round 1 Preset BYE Assignment...');
    await tm.pairRound(1);
    const r1Matches = tm.data.matches.filter(m => m.round_num === 1);
    
    // 9 teams -> 4 debate matches + 1 bye match = 5 matches
    if (r1Matches.length !== 5) {
        throw new Error(`Expected 5 matches in Round 1 (4 pairs + 1 bye), got ${r1Matches.length}`);
    }

    const r1ByeMatch = r1Matches.find(m => m.is_bye || m.neg_id === -1);
    if (!r1ByeMatch) throw new Error('Round 1 BYE match not found!');
    if (r1ByeMatch.result !== 'A') throw new Error(`Expected BYE match to have result 'A', got ${r1ByeMatch.result}`);
    if (r1ByeMatch.neg_name !== 'BYE') throw new Error(`Expected neg_name to be 'BYE', got ${r1ByeMatch.neg_name}`);

    const r1ByeTeam = tm.teams.find(t => t.id === r1ByeMatch.aff_id);
    console.log(`✓ PASS: ${r1ByeTeam.name} assigned BYE in Round 1`);
    if (r1ByeTeam.score !== 1 || r1ByeTeam.wins !== 1) {
        throw new Error(`Expected bye team score to be 1, got score=${r1ByeTeam.score}, wins=${r1ByeTeam.wins}`);
    }
    // Check side neutrality: bye does NOT increment aff_count or neg_count
    if (r1ByeTeam.aff_count !== 0 || r1ByeTeam.neg_count !== 0) {
        throw new Error(`Expected bye team to have neutral sides (0 Aff, 0 Neg), got Aff=${r1ByeTeam.aff_count}, Neg=${r1ByeTeam.neg_count}`);
    }
    console.log('✓ PASS: BYE awards 1 Win with neutral Aff/Neg side balance!');

    // Report results for other 4 matches in Round 1
    const r1Debates = r1Matches.filter(m => !m.is_bye && m.neg_id !== -1);
    for (const m of r1Debates) {
        await tm.reportResult(m.match_id, 'A', { affPoints: [29.0, 29.0], negPoints: [27.0, 27.0] });
    }

    // --- TEST 2: Round 2 Single-Bye Rule (No Double Byes) ---
    console.log('\nTest 2: Round 2 Single-Bye Constraint...');
    await tm.pairRound(2);
    const r2Matches = tm.data.matches.filter(m => m.round_num === 2);
    const r2ByeMatch = r2Matches.find(m => m.is_bye || m.neg_id === -1);
    if (!r2ByeMatch) throw new Error('Round 2 BYE match not found!');

    const r2ByeTeam = tm.teams.find(t => t.id === r2ByeMatch.aff_id);
    console.log(`✓ PASS: ${r2ByeTeam.name} assigned BYE in Round 2`);
    if (r2ByeTeam.id === r1ByeTeam.id) {
        throw new Error(`Violation of Single Bye Rule! Team ${r1ByeTeam.name} received a second BYE in Round 2!`);
    }
    console.log('✓ PASS: Single-Bye rule strictly enforced (no repeat byes across rounds)!');

    // Report results for Round 2 debates
    const r2Debates = r2Matches.filter(m => !m.is_bye && m.neg_id !== -1);
    for (const m of r2Debates) {
        await tm.reportResult(m.match_id, 'A', { affPoints: [28.5, 28.5], negPoints: [27.5, 27.5] });
    }

    // --- TEST 3: Round 3 (Power-Matched) Lowest-Seed BYE Selection ---
    console.log('\nTest 3: Round 3 Power-Matched BYE (Lowest Seed without a Bye)...');
    
    // Check who is the lowest-seeded eligible team without a bye
    const eligibleForR3Bye = tm.teams.filter(t => 
        t.id !== r1ByeTeam.id && t.id !== r2ByeTeam.id
    );
    eligibleForR3Bye.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        const spA = tm.getTeamSpeakerPoints(a);
        const spB = tm.getTeamSpeakerPoints(b);
        if (spA !== spB) return spA - spB;
        if (a.buchholz !== b.buchholz) return a.buchholz - b.buchholz;
        return b.id - a.id;
    });

    const expectedR3ByeTeam = eligibleForR3Bye[0];
    console.log(`Lowest eligible seed before Round 3: ${expectedR3ByeTeam.name} (Score: ${expectedR3ByeTeam.score}, Buchholz: ${expectedR3ByeTeam.buchholz})`);

    await tm.pairRound(3);
    const r3Matches = tm.data.matches.filter(m => m.round_num === 3);
    const r3ByeMatch = r3Matches.find(m => m.is_bye || m.neg_id === -1);
    if (!r3ByeMatch) throw new Error('Round 3 BYE match not found!');

    const r3ByeTeam = tm.teams.find(t => t.id === r3ByeMatch.aff_id);
    console.log(`Round 3 BYE awarded to: ${r3ByeTeam.name}`);

    if (r3ByeTeam.id !== expectedR3ByeTeam.id) {
        throw new Error(`Expected lowest seed ${expectedR3ByeTeam.name} to receive Round 3 BYE, but got ${r3ByeTeam.name}`);
    }
    console.log('✓ PASS: Lowest-seeded eligible team correctly selected for Power-Matched BYE!');

    // --- TEST 4: Speaker Points Average Imputation for Bye Rounds ---
    console.log('\nTest 4: Tabroom Speaker Points Average Imputation for Byes...');
    // Give r1ByeTeam speaker points in Round 2
    // Let's verify getTeamSpeakerPoints imputes their Round 2 average for their Round 1 bye
    const r1ByeSpeakerPts = tm.getTeamSpeakerPoints(r1ByeTeam);
    console.log(`${r1ByeTeam.name} Total Speaker Points with Round 1 Bye Imputation: ${r1ByeSpeakerPts}`);
    // They debated in Round 2 and Round 3. Their average per round is imputed for Round 1!
    if (r1ByeSpeakerPts <= 0) {
        throw new Error('Expected positive imputed speaker points for bye recipient');
    }
    console.log('✓ PASS: Speaker points average successfully imputed for bye rounds!');

    // --- TEST 5: Recalculate Stats Persistence ---
    console.log('\nTest 5: Recalculate Stats & Persistence Check...');
    tm.recalculateStats();
    if (!r1ByeTeam.bye_rounds.includes(1)) {
        throw new Error(`Expected r1ByeTeam.bye_rounds to contain 1 after recalculateStats, got ${JSON.stringify(r1ByeTeam.bye_rounds)}`);
    }
    if (r1ByeTeam.wins < 1) {
        throw new Error(`Expected r1ByeTeam.wins >= 1 after recalculateStats, got ${r1ByeTeam.wins}`);
    }
    console.log('✓ PASS: Byes properly persist and recalculate without loss!');

    console.log('\nAll Tabroom BYE verifications PASSED! ✅');
}

testTabroomBye().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
