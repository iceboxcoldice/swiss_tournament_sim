const fs = require('fs');
const path = require('path');

// Mock DOM environment
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        clear: () => { store = {}; },
        removeItem: (key) => { delete store[key]; }
    };
})();

global.window = {
    location: { hash: '' },
    localStorage: localStorageMock
};
global.document = {
    getElementById: () => ({ value: '', addEventListener: () => { } }),
    createElement: () => ({}),
};
global.localStorage = localStorageMock;
global.Blob = class Blob { constructor(content) { this.content = content; } };
global.URL = { createObjectURL: () => 'blob:url', revokeObjectURL: () => { } };

// Load tournament.js content
const tournamentJsContent = fs.readFileSync(path.join(__dirname, '../docs/manager/tournament.js'), 'utf8');

// Evaluate tournament.js in the global context
// We append assignments to ensure classes are available globally
const codeToRun = tournamentJsContent + '\n' +
    'global.TournamentManager = TournamentManager;\n' +
    'global.Team = Team;\n' +
    'global.Judge = Judge;';

eval(codeToRun);

// Test Suite
async function runTests() {
    console.log('Starting Judge Management Tests...\n');
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            failed++;
        }
    }

    try {
        // 1. Initialize Tournament
        console.log('Test 1: Initialize Tournament');
        const tm = new TournamentManager();
        tm.init(4, 2, 0, [
            { name: 'Team A' }, { name: 'Team B' }, { name: 'Team C' }, { name: 'Team D' }
        ]);
        assert(tm.teams.length === 4, 'Teams initialized');
        assert(tm.judges.length === 0, 'Judges list starts empty');

        // 2. Add Judges
        console.log('\nTest 2: Add Judges');
        const judge1 = await tm.addJudge('Judge Judy', 'TV Court');
        assert(judge1.id === 1, 'First judge has ID 1');
        assert(judge1.name === 'Judge Judy', 'Judge name correct');
        assert(judge1.institution === 'TV Court', 'Judge institution correct');

        const judge2 = await tm.addJudge('Judge Dredd'); // Default institution
        assert(judge2.id === 2, 'Second judge has ID 2');
        assert(judge2.institution === 'Tournament Hire', 'Default institution correct');

        assert(tm.judges.length === 2, 'Two judges added');

        // 3. Pair Round 1
        console.log('\nTest 3: Pair Round 1');
        tm.pairRound(1);
        const matches = tm.getRoundMatches(1);
        assert(matches.length === 2, 'Round 1 paired with 2 matches');
        assert(matches[0].judge_id === null, 'Match 1 starts with no judge');

        // 4. Assign Judge
        console.log('\nTest 4: Assign Judge');
        const match1 = matches[0];
        await tm.assignJudgeToMatch(match1.match_id, judge1.id);

        assert(match1.judge_id === judge1.id, 'Match 1 has judge 1 assigned');
        assert(judge1.matches_judged.includes(match1.match_id), 'Judge 1 record includes match 1');
        assert(judge1.matches_judged.length === 1, 'Judge 1 has 1 match judged');

        // 5. Change Judge Assignment
        console.log('\nTest 5: Change Judge Assignment');
        await tm.assignJudgeToMatch(match1.match_id, judge2.id);

        assert(match1.judge_id === judge2.id, 'Match 1 now has judge 2 assigned');
        assert(!judge1.matches_judged.includes(match1.match_id), 'Judge 1 record no longer includes match 1');
        assert(judge2.matches_judged.includes(match1.match_id), 'Judge 2 record includes match 1');

        // 6. Unassign Judge
        console.log('\nTest 6: Unassign Judge');
        await tm.unassignJudgeFromMatch(match1.match_id);

        assert(match1.judge_id === null, 'Match 1 has no judge assigned');
        assert(!judge2.matches_judged.includes(match1.match_id), 'Judge 2 record no longer includes match 1');

        // 7. Remove Judge Validation
        console.log('\nTest 7: Remove Judge Validation');
        // Assign judge 1 back to match 1
        await tm.assignJudgeToMatch(match1.match_id, judge1.id);

        try {
            await tm.removeJudge(judge1.id);
            assert(false, 'Should not allow removing judge with assigned matches');
        } catch (e) {
            assert(e.message.includes('assigned to'), 'Correctly prevented removing active judge');
        }

        // Unassign and remove
        await tm.unassignJudgeFromMatch(match1.match_id);
        await tm.removeJudge(judge1.id);
        assert(tm.judges.length === 1, 'Judge removed successfully after unassignment');
        assert(tm.judges[0].id === 2, 'Remaining judge is Judge 2');

        // 8. Export/Import Persistence
        console.log('\nTest 8: Export/Import Persistence');
        // Add a judge and assign to a match
        const judge3 = await tm.addJudge('Judge Persistence', 'Memory Lane');
        await tm.assignJudgeToMatch(matches[1].match_id, judge3.id);

        const exportedData = tm.exportData();
        assert(exportedData.judges.length === 2, 'Exported data includes 2 judges');
        assert(exportedData.judges.find(j => j.id === judge3.id).matches_judged.length === 1, 'Exported judge has match history');

        // Create new manager and import
        const tm2 = new TournamentManager();
        tm2.importData(exportedData);

        assert(tm2.judges.length === 2, 'Imported 2 judges');
        const importedJudge3 = tm2.judges.find(j => j.id === judge3.id);
        assert(importedJudge3.name === 'Judge Persistence', 'Imported judge name correct');
        assert(importedJudge3.matches_judged.length === 1, 'Imported judge match history correct');

        const importedMatch = tm2.data.matches.find(m => m.match_id === matches[1].match_id);
        assert(importedMatch.judge_id === judge3.id, 'Imported match has correct judge assigned');

    } catch (error) {
        console.error('Test crashed:', error);
        failed++;
    }

    console.log(`\nSummary: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) process.exit(1);
}

runTests();
