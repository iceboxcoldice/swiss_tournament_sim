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

async function testHighLow() {
    console.log('Testing TournamentManager High-Low Pairing (Tabroom scheme)...');

    const tm = new TournamentManager();
    // Initialize 8 teams
    const teamDetails = [
        { name: 'Team 1 (Seed 1)', institution: 'Harvard' },
        { name: 'Team 2 (Seed 2)', institution: 'Yale' },
        { name: 'Team 3 (Seed 3)', institution: 'Princeton' },
        { name: 'Team 4 (Seed 4)', institution: 'Columbia' },
        { name: 'Team 5 (Seed 5)', institution: 'Dartmouth' },
        { name: 'Team 6 (Seed 6)', institution: 'Brown' },
        { name: 'Team 7 (Seed 7)', institution: 'Cornell' },
        { name: 'Team 8 (Seed 8)', institution: 'Penn' }
    ];

    await tm.init(8, 4, 0, teamDetails, 'high-low');

    // Simulate Round 1 results
    // 1 beats 5, 2 beats 6, 3 beats 7, 4 beats 8
    tm.teams[0].score = 1; tm.teams[0].wins = 1; tm.teams[0].opponents = [4];
    tm.teams[1].score = 1; tm.teams[1].wins = 1; tm.teams[1].opponents = [5];
    tm.teams[2].score = 1; tm.teams[2].wins = 1; tm.teams[2].opponents = [6];
    tm.teams[3].score = 1; tm.teams[3].wins = 1; tm.teams[3].opponents = [7];

    tm.teams[4].score = 0; tm.teams[4].wins = 0; tm.teams[4].opponents = [0];
    tm.teams[5].score = 0; tm.teams[5].wins = 0; tm.teams[5].opponents = [1];
    tm.teams[6].score = 0; tm.teams[6].wins = 0; tm.teams[6].opponents = [2];
    tm.teams[7].score = 0; tm.teams[7].wins = 0; tm.teams[7].opponents = [3];

    // Give teams speaker points to establish strict rank in the 1-0 bracket:
    // Team 1: 59 pts (Rank 1 in 1-0)
    // Team 2: 58 pts (Rank 2 in 1-0)
    // Team 3: 57 pts (Rank 3 in 1-0)
    // Team 4: 56 pts (Rank 4 in 1-0)
    tm.teams[0].speaker_points_history = [{ round: 1, points: [29.5, 29.5] }];
    tm.teams[1].speaker_points_history = [{ round: 1, points: [29.0, 29.0] }];
    tm.teams[2].speaker_points_history = [{ round: 1, points: [28.5, 28.5] }];
    tm.teams[3].speaker_points_history = [{ round: 1, points: [28.0, 28.0] }];

    // Test Round 3 pairing (Power match)
    const pairs = tm.generateSwissPairings(3);

    console.log('\nGenerated High-Low Pairings for Round 3:');
    const topMatches = [];
    pairs.forEach(([aff, neg]) => {
        console.log(`  ${aff.name} (Aff) vs ${neg.name} (Neg)`);
        if (aff.score === 1 && neg.score === 1) {
            topMatches.push([aff.id, neg.id].sort().join('-'));
        }
    });

    // In High-Low:
    // Rank 1 (Team 1, ID 0) should play lowest in bracket Rank 4 (Team 4, ID 3) -> 0-3
    // Rank 2 (Team 2, ID 1) should play Rank 3 (Team 3, ID 2) -> 1-2
    console.log('\nTop bracket match IDs:', topMatches);
    if (!topMatches.includes('0-3')) {
        throw new Error(`Expected Team 1 (Seed 1) vs Team 4 (Seed 4) [0-3], but got: ${JSON.stringify(topMatches)}`);
    }
    if (!topMatches.includes('1-2')) {
        throw new Error(`Expected Team 2 (Seed 2) vs Team 3 (Seed 3) [1-2], but got: ${JSON.stringify(topMatches)}`);
    }

    console.log('✓ PASS: Tabroom High-Low pairing successfully paired 1v4 and 2v3!');

    // Test High-High
    tm.data.config.pairing_scheme = 'high-high';
    const pairsHiHi = tm.generateSwissPairings(3);
    const topMatchesHiHi = [];
    pairsHiHi.forEach(([aff, neg]) => {
        if (aff.score === 1 && neg.score === 1) {
            topMatchesHiHi.push([aff.id, neg.id].sort().join('-'));
        }
    });
    console.log('Top bracket High-High match IDs:', topMatchesHiHi);
    if (!topMatchesHiHi.includes('0-1') || !topMatchesHiHi.includes('2-3')) {
        throw new Error(`Expected 0-1 and 2-3 in High-High, got: ${JSON.stringify(topMatchesHiHi)}`);
    }
    console.log('✓ PASS: High-High pairing successfully paired 1v2 and 3v4!');

    // Test Same-School Protection in High-Low
    console.log('\nTesting Same-School Protection...');
    tm.data.config.pairing_scheme = 'high-low';
    // Make Team 1 and Team 4 from the SAME school ("Harvard")
    tm.teams[0].institution = 'Harvard';
    tm.teams[3].institution = 'Harvard';
    tm.teams[1].institution = 'Yale';
    tm.teams[2].institution = 'Princeton';

    const pairsProtected = tm.generateSwissPairings(3);
    const topMatchesProtected = [];
    pairsProtected.forEach(([aff, neg]) => {
        if (aff.score === 1 && neg.score === 1) {
            topMatchesProtected.push([aff.id, neg.id].sort().join('-'));
        }
    });
    console.log('Top bracket matches with same-school protection:', topMatchesProtected);
    if (topMatchesProtected.includes('0-3')) {
        throw new Error('Team 0 and Team 3 from Harvard should not hit each other!');
    }
    // Team 1 should avoid Team 4 and hit Team 3 instead (0-2), while Team 2 hits Team 4 (1-3)
    if (!topMatchesProtected.includes('0-2') || !topMatchesProtected.includes('1-3')) {
        throw new Error(`Expected 0-2 and 1-3, got: ${JSON.stringify(topMatchesProtected)}`);
    }
    console.log('✓ PASS: Same-school conflict successfully protected (Harvard teams avoided each other)!');

    // Test Round-Specific Mode Override
    console.log('\nTesting Round-Specific Mode Selection (Round 3 High-High override)...');
    // Global config is 'high-low', but director chooses 'high-high' for this specific round:
    tm.teams[0].institution = 'Harvard';
    tm.teams[3].institution = 'Columbia';
    const pairsOverridden = tm.generateSwissPairings(3, 'high-high');
    const topMatchesOverridden = [];
    pairsOverridden.forEach(([aff, neg]) => {
        if (aff.score === 1 && neg.score === 1) {
            topMatchesOverridden.push([aff.id, neg.id].sort().join('-'));
        }
    });
    console.log('Matches with per-round high-high override:', topMatchesOverridden);
    if (!topMatchesOverridden.includes('0-1') || !topMatchesOverridden.includes('2-3')) {
        throw new Error(`Expected 0-1 and 2-3 with high-high override, got: ${JSON.stringify(topMatchesOverridden)}`);
    }
    console.log('✓ PASS: Director per-round selection correctly overrides global setting!');
}

testHighLow().catch(err => {
    console.error('FAIL:', err);
    process.exit(1);
});
