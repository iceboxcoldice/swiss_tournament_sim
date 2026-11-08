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

async function testTabroomPullUp() {
    console.log('Testing Tabroom Odd-Bracket Pull-Up Functionality...\n');

    const tm = new TournamentManager();

    // 10 teams:
    // 5 teams with 2 wins (IDs 0, 1, 2, 3, 4) - ODD bracket!
    // 5 teams with 1 win  (IDs 5, 6, 7, 8, 9) - ODD bracket!
    const teamDetails = Array.from({ length: 10 }, (_, i) => ({
        name: `Team ${i + 1}`,
        institution: `School ${i + 1}`
    }));

    await tm.init(10, 4, 0, teamDetails, 'high-low');

    // Setup 2-0 bracket (5 teams)
    for (let i = 0; i < 5; i++) {
        tm.teams[i].score = 2;
        tm.teams[i].wins = 2;
    }

    // Setup 1-1 bracket (5 teams)
    for (let i = 5; i < 10; i++) {
        tm.teams[i].score = 1;
        tm.teams[i].wins = 1;
    }

    // Give 2-0 teams speaker points to establish hierarchy:
    // Team 1 (ID 0): 59 pts (Seed 1 in 2-0 bracket)
    // Team 2 (ID 1): 58 pts (Seed 2)
    // Team 3 (ID 2): 57 pts (Seed 3)
    // Team 4 (ID 3): 56 pts (Seed 4)
    // Team 5 (ID 4): 55 pts (Seed 5)
    for (let i = 0; i < 5; i++) {
        tm.teams[i].speaker_points_history = [{ round: 1, points: [30 - i * 0.5, 30 - i * 0.5] }];
    }

    // Give 1-1 teams opponents whose scores produce distinct Buchholz values:
    // Team 6 (ID 5): played Team 1 (score 2) and Team 2 (score 2) -> Buchholz = 4.0
    // Team 7 (ID 6): played Team 2 (score 2) and Team 10 (score 1) -> Buchholz = 3.0
    // Team 8 (ID 7): played Team 3 (score 2) and an opponent with 0 wins -> Buchholz = 2.0
    // Team 9 (ID 8): played Team 10 (score 1) -> Buchholz = 1.0
    // Team 10 (ID 9): played opponents with 0 wins -> Buchholz = 0.0 (EASIEST schedule!)
    tm.teams[5].opponents = [0, 1];
    tm.teams[6].opponents = [1, 9];
    tm.teams[7].opponents = [2];
    tm.teams[8].opponents = [9];
    tm.teams[9].opponents = [];

    // Generate Round 3 pairings
    console.log('Generating Round 3 pairings (2-0 bracket has 5 teams, 1-1 has 5 teams)...');
    const pairs = tm.generateSwissPairings(3);

    console.log('\nGenerated Pairings:');
    pairs.forEach(([aff, neg], idx) => {
        const affPull = (aff.pulled_up_rounds || []).includes(3) ? ' [PULL-UP]' : '';
        const negPull = (neg.pulled_up_rounds || []).includes(3) ? ' [PULL-UP]' : '';
        console.log(`  Match ${idx + 1}: ${aff.name}${affPull} (Score: ${aff.score}) vs ${neg.name}${negPull} (Score: ${neg.score})`);
    });

    // Verification 1: Who got pulled up?
    // Team 10 (ID 9) had the worst average opponent seed (lowest Buchholz = 0.5)
    console.log('\nChecking pull-up selection...');
    if (!tm.teams[9].pulled_up_rounds.includes(3)) {
        throw new Error(`Expected Team 10 (ID 9) with lowest Buchholz (0.5) to be pulled up, but pulled_up_rounds is: ${JSON.stringify(tm.teams[9].pulled_up_rounds)}`);
    }
    console.log('✓ PASS: Team 10 (worst average opponent seed) was successfully selected for pull-up!');

    // Verification 2: Under Tabroom High-Low, Seed 1 of higher bracket (Team 1, ID 0)
    // MUST be paired against the pulled-up team (Team 10, ID 9)!
    const seed1Match = pairs.find(([a, n]) => a.id === 0 || n.id === 0);
    if (!seed1Match) throw new Error('Match containing Seed 1 not found!');

    const seed1Opponent = seed1Match[0].id === 0 ? seed1Match[1] : seed1Match[0];
    console.log(`Seed 1 (Team 1) is paired against: ${seed1Opponent.name} (ID ${seed1Opponent.id})`);

    if (seed1Opponent.id !== 9) {
        throw new Error(`Expected Seed 1 (ID 0) to debate pulled-up Team 10 (ID 9), but got ID ${seed1Opponent.id}`);
    }
    console.log('✓ PASS: Seed 1 of higher bracket correctly debates the pulled-up team!');

    // Verification 3: No other teams in 2-0 bracket were left unpaired or floating
    const topMatches = pairs.filter(([a, n]) => (a.score === 2 || a.id === 9) && (n.score === 2 || n.id === 9));
    if (topMatches.length !== 3) {
        throw new Error(`Expected exactly 3 matches for 6 teams in 2-0 bracket (5 + 1 pullup), got ${topMatches.length}`);
    }
    console.log('✓ PASS: Exactly 3 matches created for the 6 teams in top bracket!');

    console.log('\nAll Tabroom pull-up verifications PASSED! ✅');
}

testTabroomPullUp().catch(err => {
    console.error('FAIL:', err);
    process.exit(1);
});
