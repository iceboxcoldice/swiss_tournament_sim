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

    // Show appropriate tab
    if (activeTab && activeTab.startsWith('round')) {
        const roundNum = parseInt(activeTab.replace('round', ''));
        // Verify round still exists (it should)
        if (roundNum <= maxPairedRound) {
            showRound(roundNum);
            return;
        }
    } else if (activeTab === 'standings') {
        showStandings();
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
        const winner = m.result === 'A' ? m.aff_name : (m.result === 'N' ? m.neg_name : null);

        return `
                        <div class="pairing-item">
                            <div class="pairing-teams">
                                <div><span class="team team-aff">${m.aff_name}</span> (Aff) ${m.result === 'A' ? '✓' : ''}</div>
                                <div>vs</div>
                                <div><span class="team team-neg">${m.neg_name}</span> (Neg) ${m.result === 'N' ? '✓' : ''}</div>
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
                            <td><strong>${team.name}</strong></td>
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

// Initialize on load
initUI();
