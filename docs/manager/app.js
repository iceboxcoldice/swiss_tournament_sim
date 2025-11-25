// UI Controller for Tournament Manager
const tournament = new TournamentManager();

// DOM Elements
const setupSection = document.getElementById('setupSection');
const dashboardSection = document.getElementById('dashboardSection');
const setupForm = document.getElementById('setupForm');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const tournamentInfo = document.getElementById('tournamentInfo');
const confirmModal = document.getElementById('confirmModal');
const cancelResetBtn = document.getElementById('cancelResetBtn');
const confirmResetBtn = document.getElementById('confirmResetBtn');
const notificationModal = document.getElementById('notificationModal');
const notificationTitle = document.getElementById('notificationTitle');
const notificationMessage = document.getElementById('notificationMessage');
const notificationOkBtn = document.getElementById('notificationOkBtn');
const mainTabs = document.getElementById('mainTabs');
const tabContent = document.getElementById('tabContent');

let activeTab = null;
let navigationHistory = []; // Track navigation history for back button

// Initialize UI
function initUI() {
    if (tournament.data) {
        showDashboard();
    } else {
        showSetup();
    }
}

function showSetup() {
    setupSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
}

function showDashboard() {
    setupSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    updateDashboard();
}

// Setup Form Handler
setupForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const numTeams = parseInt(document.getElementById('numTeams').value);
    const numRounds = parseInt(document.getElementById('numRounds').value);
    const teamNamesText = document.getElementById('teamNames').value;
    const teamNames = teamNamesText.split('\n').map(n => n.trim()).filter(n => n);

    tournament.init(numTeams, numRounds, teamNames);

    // Clear navigation history and hash for fresh start
    navigationHistory = [];
    window.location.hash = '';
    activeTab = null;

    showDashboard();
});

// Generic Confirmation Modal
// confirmModal, cancelResetBtn, confirmResetBtn are already declared at the top

let onConfirmCallback = null;

function showConfirm(title, message, callback) {
    // Update modal content (assuming simple structure for now, might need HTML update)
    // For now, we'll just use the existing modal structure but repurpose it.
    // Ideally, index.html should be updated to have generic IDs, but we can map them here.

    // Check if we need to update HTML structure first. 
    // The current HTML structure for confirmModal is likely specific to Reset.
    // Let's assume we will update index.html to make it generic.

    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;

    onConfirmCallback = callback;
    confirmModal.classList.remove('hidden');
}

cancelResetBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    onConfirmCallback = null;
});

confirmResetBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    if (onConfirmCallback) {
        onConfirmCallback();
        onConfirmCallback = null;
    }
});

// Reset Tournament Handler
resetBtn.addEventListener('click', () => {
    showConfirm(
        'Reset Tournament',
        'Are you sure you want to reset the tournament? This cannot be undone.',
        () => {
            tournament.clearStorage();
            location.reload();
        }
    );
});

// Close modal when clicking outside
confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
        confirmModal.classList.add('hidden');
    }
});

// Notification Modal Handler
notificationOkBtn.addEventListener('click', () => {
    notificationModal.classList.add('hidden');
});

notificationModal.addEventListener('click', (e) => {
    if (e.target === notificationModal) {
        notificationModal.classList.add('hidden');
    }
});

function showNotification(title, message) {
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    notificationModal.classList.remove('hidden');
}

// Export Handler
exportBtn.addEventListener('click', () => {
    const data = tournament.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// Import Handler
importBtn.addEventListener('click', () => {
    importFile.click();
});

importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            tournament.importData(data);

            // Clear navigation history and hash for fresh start
            navigationHistory = [];
            window.location.hash = '';
            activeTab = null;

            showDashboard();
        } catch (error) {
            showNotification('Import Error', error.message);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
});

// Update Dashboard
function updateDashboard() {
    // Update tournament info
    const { num_teams, num_rounds } = tournament.data.config;
    const { current_round } = tournament.data;
    tournamentInfo.textContent = `${num_teams} teams • ${num_rounds} rounds • Current: Round ${current_round}`;

    // Render tabs
    renderTabs();
}

// Render Dynamic Tabs
function renderTabs() {
    const matches = tournament.data.matches;
    const maxPairedRound = matches.length > 0 ? Math.max(...matches.map(m => m.round_num)) : 0;

    mainTabs.innerHTML = '';

    // Create round tabs
    for (let r = 1; r <= maxPairedRound; r++) {
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.textContent = `Round ${r}`;
        btn.onclick = () => showRound(r);
        mainTabs.appendChild(btn);
    }

    // Create [+] button
    const newRoundBtn = document.createElement('button');
    newRoundBtn.className = 'tab-btn new-round-btn';
    newRoundBtn.textContent = '+';
    newRoundBtn.title = 'Generate Next Round';
    newRoundBtn.onclick = handleNewRound;
    mainTabs.appendChild(newRoundBtn);

    // Create Standings tab
    const standingsBtn = document.createElement('button');
    standingsBtn.className = 'tab-btn';
    standingsBtn.textContent = 'Standings';
    standingsBtn.onclick = showStandings;
    mainTabs.appendChild(standingsBtn);

    // Handle URL hash or active tab
    const hash = window.location.hash.slice(1); // Remove '#'

    if (hash) {
        // Route based on hash
        if (hash.startsWith('round')) {
            const roundNum = parseInt(hash.replace('round', ''));
            if (roundNum <= maxPairedRound) {
                showRound(roundNum);
                return;
            }
        } else if (hash === 'standings') {
            showStandings();
            return;
        } else if (hash.startsWith('team')) {
            const teamId = parseInt(hash.replace('team', ''));
            showTeamDetails(teamId);
            return;
        }
    } else if (activeTab && activeTab.startsWith('round')) {
        const roundNum = parseInt(activeTab.replace('round', ''));
        if (roundNum <= maxPairedRound) {
            showRound(roundNum);
            return;
        }
    } else if (activeTab === 'standings') {
        showStandings();
        return;
    } else if (activeTab && activeTab.startsWith('team')) {
        const teamId = parseInt(activeTab.replace('team', ''));
        showTeamDetails(teamId);
        return;
    }

    // Default behavior (initial load or invalid state)
    if (maxPairedRound > 0) {
        showRound(maxPairedRound);
    } else {
        showStandings();
    }
}

// Handle New Round Button
function handleNewRound() {
    // Calculate next round based on existing matches
    const { config } = tournament.data;
    const maxRound = tournament.data.matches.reduce((max, m) => Math.max(max, m.round_num), 0);
    const nextRound = maxRound + 1;

    // Check if we can pair
    if (nextRound > config.num_rounds) {
        showNotification('All Rounds Complete', 'All rounds have been paired!');
        return;
    }

    // Check if previous round is complete (except Round 2)
    if (nextRound > 2) {
        const prevRound = nextRound - 1;
        const prevMatches = tournament.data.matches.filter(m => m.round_num === prevRound);
        if (prevMatches.some(m => m.result === null)) {
            showNotification('Round Incomplete', `Please complete all results for Round ${prevRound} before generating Round ${nextRound}.`);
            return;
        }
    }

    try {
        tournament.pairRound(nextRound);
        activeTab = `round${nextRound}`; // Focus on newly created round
        updateDashboard();
    } catch (error) {
        showNotification('Error', error.message);
    }
}

// Show Round View
function showRound(roundNum) {
    activeTab = `round${roundNum}`;
    window.location.hash = `round${roundNum}`;

    // Add to navigation history (avoid duplicates of current view)
    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    // Update active tab button
    const tabs = mainTabs.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        if (btn.textContent === `Round ${roundNum}`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const matches = tournament.getRoundMatches(roundNum);

    tabContent.innerHTML = `
        <div class="card">
            <h3>Round ${roundNum} Pairings</h3>
            <div class="pairings-grid">
                ${matches.map(m => {
        const hasResult = m.result !== null;

        return `
                        <div class="pairing-item">
                            <div class="pairing-teams">
                                <div><a href="#" onclick="showTeamDetails(${m.aff_id}, 'round${roundNum}'); return false;" class="team-link team-aff">${m.aff_name}</a> (Aff) ${m.result === 'A' ? '✓' : ''}</div>
                                <div>vs</div>
                                <div><a href="#" onclick="showTeamDetails(${m.neg_id}, 'round${roundNum}'); return false;" class="team-link team-neg">${m.neg_name}</a> (Neg) ${m.result === 'N' ? '✓' : ''}</div>
                            </div>
                            <div class="match-controls">
                                <span class="match-id">Match ${m.match_id}</span>
                                ${!hasResult ? `
                                    <div class="result-buttons">
                                        <button class="btn btn-success" onclick="reportResult(${m.match_id}, 'A')">Aff Wins</button>
                                        <button class="btn btn-success" onclick="reportResult(${m.match_id}, 'N')">Neg Wins</button>
                                    </div>
                                ` : `
                                    <div class="result-status">
                                        Winner: ${m.result === 'A' ? 'Aff' : 'Neg'}
                                        <div class="correction-buttons">
                                            <button class="btn btn-sm btn-warning" onclick="correctResult(${m.match_id}, '${m.result}')" title="Switch Winner">⇄</button>
                                            <button class="btn btn-sm btn-danger" onclick="unsubmitResult(${m.match_id})" title="Unsubmit Result">✕</button>
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;
}

// Show Standings
function showStandings() {
    activeTab = 'standings';
    window.location.hash = 'standings';

    // Add to navigation history (avoid duplicates of current view)
    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    // Update active tab button
    const tabs = mainTabs.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        if (btn.textContent === 'Standings') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const standings = tournament.getStandings();

    if (standings.every(t => t.score === 0)) {
        tabContent.innerHTML = '<div class="card"><p class="text-muted">No results yet. Generate pairings and enter results to see standings.</p></div>';
        return;
    }

    tabContent.innerHTML = `
        <div class="card">
            <h3>Current Standings</h3>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Team</th>
                        <th>Wins</th>
                        <th>Score</th>
                        <th>Buchholz</th>
                        <th>Aff/Neg</th>
                    </tr>
                </thead>
                <tbody>
                    ${standings.map((team, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><a href="#" onclick="showTeamDetails(${team.id}, 'standings'); return false;" class="team-link"><strong>${team.name}</strong></a></td>
                            <td>${team.wins}</td>
                            <td>${team.score.toFixed(1)}</td>
                            <td>${team.buchholz.toFixed(1)}</td>
                            <td>${team.aff_count}/${team.neg_count}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Report Result
window.reportResult = function (matchId, outcome) {
    try {
        tournament.reportResult(matchId, outcome);
        updateDashboard();
    } catch (error) {
        showNotification('Error', error.message);
    }
};

// Correct Result (Switch Winner)
window.correctResult = function (matchId, currentResult) {
    const newOutcome = currentResult === 'A' ? 'N' : 'A';
    showConfirm(
        'Switch Winner',
        'Are you sure you want to switch the winner? This will update standings but preserve existing pairings.',
        () => {
            try {
                tournament.updateResult(matchId, newOutcome);
                updateDashboard();
            } catch (error) {
                showNotification('Error', error.message);
            }
        }
    );
};

// Unsubmit Result
window.unsubmitResult = function (matchId) {
    showConfirm(
        'Unsubmit Result',
        'Are you sure you want to remove this result? This will update standings but preserve existing pairings.',
        () => {
            try {
                tournament.updateResult(matchId, null);
                updateDashboard();
            } catch (error) {
                showNotification('Error', error.message);
            }
        }
    );
};

// Show Team Details
window.showTeamDetails = function (teamId, previousView = null) {
    const team = tournament.teams.find(t => t.id === teamId);
    if (!team) return;

    activeTab = `team${teamId}`;
    window.location.hash = `team${teamId}`;

    // Add to navigation history (avoid duplicates of current view)
    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    // Update active tab button (clear all active states)
    const tabs = mainTabs.querySelectorAll('.tab-btn');
    tabs.forEach(btn => btn.classList.remove('active'));

    // Get all matches for this team
    const teamMatches = tournament.data.matches.filter(m =>
        m.aff_id === teamId || m.neg_id === teamId
    ).sort((a, b) => a.round_num - b.round_num);

    // HEAD-TO-HEAD RECORDS SECTION (currently hidden from display)
    // Uncomment this entire block to re-enable head-to-head records
    /*
    // Calculate head-to-head records
    const h2hRecords = {};
    teamMatches.forEach(match => {
        const isAff = match.aff_id === teamId;
        const oppId = isAff ? match.neg_id : match.aff_id;
        const oppName = isAff ? match.neg_name : match.aff_name;

        if (!h2hRecords[oppId]) {
            h2hRecords[oppId] = { name: oppName, wins: 0, losses: 0, pending: 0 };
        }

        if (match.result === null) {
            h2hRecords[oppId].pending++;
        } else {
            const won = (isAff && match.result === 'A') || (!isAff && match.result === 'N');
            if (won) {
                h2hRecords[oppId].wins++;
            } else {
                h2hRecords[oppId].losses++;
            }
        }
    });
    */

    // Determine back button action from navigation history
    let backAction = 'goBack()';
    let backLabel = '← Back';

    // Find the previous view from history (skip current team page)
    const currentIndex = navigationHistory.length - 1;
    previousView = null;

    for (let i = currentIndex - 1; i >= 0; i--) {
        const historyItem = navigationHistory[i];
        if (historyItem !== activeTab && !historyItem.startsWith('team')) {
            previousView = historyItem;
            break;
        } else if (historyItem.startsWith('team') && historyItem !== activeTab) {
            // Found a different team page
            previousView = historyItem;
            break;
        }
    }

    // Set label based on previous view
    if (previousView) {
        if (previousView.startsWith('round')) {
            const roundNum = parseInt(previousView.replace('round', ''));
            backLabel = `← Back to Round ${roundNum}`;
        } else if (previousView === 'standings') {
            backLabel = '← Back to Standings';
        } else if (previousView.startsWith('team')) {
            const prevTeamId = parseInt(previousView.replace('team', ''));
            const prevTeam = tournament.teams.find(t => t.id === prevTeamId);
            backLabel = prevTeam ? `← Back to ${prevTeam.name}` : '← Back';
        }
    } else {
        // No previous view found, default to standings
        backLabel = '← Back to Standings';
    }

    tabContent.innerHTML = `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3>Team Details: ${team.name}</h3>
                <button class="btn btn-secondary" onclick="${backAction}">${backLabel}</button>
            </div>

            <div class="team-stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Record</div>
                    <div class="stat-value">${team.wins}-${teamMatches.filter(m => m.result !== null).length - team.wins}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Score</div>
                    <div class="stat-value">${team.score.toFixed(1)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Buchholz</div>
                    <div class="stat-value">${team.buchholz.toFixed(1)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Side Balance</div>
                    <div class="stat-value">${team.aff_count} Aff / ${team.neg_count} Neg</div>
                </div>
            </div>

            <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Match History</h4>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Round</th>
                        <th>Side</th>
                        <th>Opponent</th>
                        <th>Result</th>
                    </tr>
                </thead>
                <tbody>
                    ${teamMatches.map(match => {
        const isAff = match.aff_id === teamId;
        const oppId = isAff ? match.neg_id : match.aff_id;
        const oppName = isAff ? match.neg_name : match.aff_name;
        const side = isAff ? 'Aff' : 'Neg';

        let result = '—';
        let resultClass = '';
        if (match.result !== null) {
            const won = (isAff && match.result === 'A') || (!isAff && match.result === 'N');
            result = won ? 'Win' : 'Loss';
            resultClass = won ? 'result-win' : 'result-loss';
        }

        return `
                            <tr>
                                <td>Round ${match.round_num}</td>
                                <td>${side}</td>
                                <td><a href="#" onclick="showTeamDetails(${oppId}); return false;" class="team-link">${oppName}</a></td>
                                <td class="${resultClass}">${result}</td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>

            <!-- HEAD-TO-HEAD RECORDS DISPLAY (currently hidden)
            <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Head-to-Head Records</h4>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Opponent</th>
                        <th>Wins</th>
                        <th>Losses</th>
                        <th>Pending</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(h2hRecords).map(([oppId, record]) => `
                        <tr>
                            <td><a href="#" onclick="showTeamDetails(${oppId}); return false;" class="team-link">${record.name}</a></td>
                            <td>${record.wins}</td>
                            <td>${record.losses}</td>
                            <td>${record.pending}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            -->

        </div>
    `;
};

// Go back to previous view
window.goBack = function () {
    // Remove current view from history
    navigationHistory.pop();

    // Find the previous non-team view or a different team view
    let previousView = null;
    while (navigationHistory.length > 0) {
        const historyItem = navigationHistory.pop();
        if (historyItem !== activeTab) {
            previousView = historyItem;
            break;
        }
    }

    // Navigate to previous view or default to standings
    if (previousView) {
        if (previousView.startsWith('round')) {
            const roundNum = parseInt(previousView.replace('round', ''));
            showRound(roundNum);
        } else if (previousView === 'standings') {
            showStandings();
        } else if (previousView.startsWith('team')) {
            const teamId = parseInt(previousView.replace('team', ''));
            showTeamDetails(teamId);
        }
    } else {
        showStandings();
    }
};

// Handle browser back/forward navigation
window.addEventListener('hashchange', () => {
    if (tournament.data) {
        updateDashboard();
    }
});

// Initialize on load
initUI();
