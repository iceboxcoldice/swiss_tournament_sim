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

// Reset Tournament Handler
resetBtn.addEventListener('click', () => {
    confirmModal.classList.remove('hidden');
});

cancelResetBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
});

confirmResetBtn.addEventListener('click', () => {
    tournament.clearStorage();
    location.reload();
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
    if (maxPairedRound > 0) {
        showRound(maxPairedRound);
    } else {
        showStandings();
    }
}

// Handle New Round Button
function handleNewRound() {
    const { current_round, config } = tournament.data;
    const nextRound = current_round + 1;

    // Check if we can pair
    if (nextRound > config.num_rounds) {
        showNotification('All Rounds Complete', 'All rounds have been paired!');
        return;
    }

    // Check if previous round is complete (for all next rounds > 1)
    if (nextRound > 1) {
        const prevRound = nextRound - 1;
        const prevMatches = tournament.data.matches.filter(m => m.round_num === prevRound);
        if (prevMatches.some(m => m.result === null)) {
            showNotification('Round Incomplete', `Please complete all results for Round ${prevRound} before generating Round ${nextRound}.`);
            return;
        }
    }

    try {
        tournament.pairRound(nextRound);
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
                                    <div class="result-status">Winner: ${winner}</div>
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
        const match = tournament.data.matches.find(m => m.match_id === matchId);
        updateDashboard();
        // Stay on current round view
        if (activeTab && activeTab.startsWith('round')) {
            const roundNum = parseInt(activeTab.replace('round', ''));
            showRound(roundNum);
        }
    } catch (error) {
        showNotification('Error', error.message);
    }
};

// Initialize on load
initUI();
