const fs = require('fs');
const path = require('path');

// Mock localStorage
global.localStorage = {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { }
};

// Read tournament.js content
const tmPath = path.join(__dirname, 'tournament.js');
const tmCode = fs.readFileSync(tmPath, 'utf8');

// Append test logic
const testCode = `
const manager = new TournamentManager();
manager.init(4, 3);
manager.pairRound(1);
const match = manager.data.matches[0];
console.log('Initial match result:', match.result);

try {
    console.log('Reporting result for match ' + match.match_id);
    manager.reportResult(match.match_id, 'A');
    console.log('After reportResult(A):', manager.data.matches[0].result);
} catch (e) {
    console.error('reportResult failed:', e.message);
}

try {
    manager.reportResult(match.match_id, 'N');
} catch (e) {
    console.log('Expected error for duplicate report:', e.message);
}

try {
    manager.updateResult(match.match_id, 'N');
    console.log('After updateResult(N):', manager.data.matches[0].result);
} catch (e) {
    console.error('updateResult failed:', e.message);
}
`;

// Execute combined code
eval(tmCode + testCode);
