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

// Helper: Get elimination round label
function getElimRoundLabel(elimRoundNum, totalElimRounds) {
    const roundsFromEnd = totalElimRounds - elimRoundNum + 1;

    if (roundsFromEnd === 1) return "Finals";
    if (roundsFromEnd === 2) return "Semifinals";
    if (roundsFromEnd === 3) return "Quarterfinals";

    // For earlier rounds, use "Round of N"
    const teamsInRound = Math.pow(2, roundsFromEnd);
    return `Round of ${teamsInRound}`;
}

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
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const numTeams = parseInt(document.getElementById('numTeams').value);
    const numPrelimRounds = parseInt(document.getElementById('numRounds').value);
    const numElimRounds = parseInt(document.getElementById('numElimRounds').value);
    const teamDataText = document.getElementById('teamData').value;

    // Parse team data: Format is "Team Name | Institution | Member 1 | Member 2"
    const teamDetails = [];
    const lines = teamDataText.split('\n').map(l => l.trim()).filter(l => l);

    for (let i = 0; i < numTeams; i++) {
        if (i < lines.length && lines[i]) {
            const parts = lines[i].split('|').map(p => p.trim());
            teamDetails.push({
                name: parts[0] || `Team ${i + 1}`,
                institution: parts[1] || 'Unknown',
                members: [
                    { name: parts[2] || `Member 1` },
                    { name: parts[3] || `Member 2` }
                ]
            });
        } else {
            // No data for this team, use defaults
            teamDetails.push({
                name: `Team ${i + 1}`,
                institution: 'Unknown',
                members: [
                    { name: `Member 1` },
                    { name: `Member 2` }
                ]
            });
        }
    }

    const success = await tournament.init(numTeams, numPrelimRounds, numElimRounds, teamDetails);

    if (success) {
        // Clear navigation history and hash for fresh start
        navigationHistory = [];
        window.location.hash = '';

        showDashboard();
    }
});

// Backend Configuration
const backendConfigBtn = document.getElementById('backendConfigBtn');
const backendConfigModal = document.getElementById('backendConfigModal');
const backendUrlInput = document.getElementById('backendUrlInput');
const saveBackendBtn = document.getElementById('saveBackendBtn');
const closeBackendBtn = document.getElementById('closeBackendBtn');
const connectionStatus = document.getElementById('connectionStatus');

console.log('Backend elements:', {
    backendConfigBtn,
    backendConfigModal,
    backendUrlInput,
    saveBackendBtn,
    closeBackendBtn,
    connectionStatus
});

// Initialize backend config
const savedBackendUrl = localStorage.getItem('backendUrl');
if (savedBackendUrl) {
    tournament.setBackendUrl(savedBackendUrl);
    updateConnectionStatus(true);
}

if (backendConfigBtn) {
    console.log('Attaching click listener to backendConfigBtn');
    backendConfigBtn.addEventListener('click', () => {
        console.log('Cloud button clicked!');
        console.log('Modal before:', backendConfigModal.className);
        backendUrlInput.value = tournament.backendUrl || '';
        backendConfigModal.classList.remove('hidden');
        console.log('Modal after:', backendConfigModal.className);
    });
} else {
    console.error('backendConfigBtn not found!');
}

if (closeBackendBtn) {
    closeBackendBtn.addEventListener('click', () => {
        backendConfigModal.classList.add('hidden');
    });
}

if (saveBackendBtn) {
    saveBackendBtn.addEventListener('click', async () => {
        const url = backendUrlInput.value.trim();
        if (url) {
            // Test connection
            try {
                const response = await fetch(`${url}/api/health`);
                if (response.ok) {
                    tournament.setBackendUrl(url);
                    localStorage.setItem('backendUrl', url);
                    updateConnectionStatus(true);
                    backendConfigModal.classList.add('hidden');
                    showNotification('Connected', 'Successfully connected to backend.');

                    // Sync data?
                    // For now, just refresh UI if we switch to cloud
                    initUI();
                } else {
                    showNotification('Error', 'Failed to connect to backend. Check URL.');
                }
            } catch (e) {
                showNotification('Error', 'Failed to connect to backend. ' + e.message);
            }
        } else {
            // Clear backend
            tournament.setBackendUrl(null);
            localStorage.removeItem('backendUrl');
            updateConnectionStatus(false);
            backendConfigModal.classList.add('hidden');
            initUI();
        }
    });
}

function updateConnectionStatus(connected) {
    if (connectionStatus) {
        if (connected) {
            connectionStatus.textContent = 'Cloud Connected';
            connectionStatus.className = 'text-green-500 text-sm font-medium';
        } else {
            connectionStatus.textContent = 'Local Mode';
            connectionStatus.className = 'text-gray-500 text-sm font-medium';
        }
    }
}

// Auto-populate button handler
document.getElementById('autoPopulateBtn').addEventListener('click', () => {
    const numTeams = parseInt(document.getElementById('numTeams').value) || 8;
    const teamDataTextarea = document.getElementById('teamData');

    const lines = [];
    for (let i = 1; i <= numTeams; i++) {
        lines.push(`Team ${i} | Institution ${i} | Member ${i}A | Member ${i}B`);
    }

    teamDataTextarea.value = lines.join('\n');
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
    const { num_teams, num_prelim_rounds, num_elim_rounds, num_rounds } = tournament.data.config;
    const { current_round } = tournament.data;
    const roundsText = num_elim_rounds > 0
        ? `${num_prelim_rounds} prelim + ${num_elim_rounds} elim rounds`
        : `${num_rounds} rounds`;
    tournamentInfo.textContent = `${num_teams} teams • ${roundsText} • Current: Round ${current_round}`;

    // Render tabs
    renderTabs();
}

// Render Dynamic Tabs
function renderTabs() {
    const matches = tournament.data.matches;
    const maxPairedRound = matches.length > 0 ? Math.max(...matches.map(m => m.round_num)) : 0;

    mainTabs.innerHTML = '';

    // Create Entries tab
    const entriesBtn = document.createElement('button');
    entriesBtn.className = 'tab-btn';
    entriesBtn.textContent = 'Entries';
    entriesBtn.onclick = showEntries;
    mainTabs.appendChild(entriesBtn);

    // Create Judges tab
    const judgesBtn = document.createElement('button');
    judgesBtn.className = 'tab-btn';
    judgesBtn.textContent = 'Judges';
    judgesBtn.onclick = showJudges;
    mainTabs.appendChild(judgesBtn);

    // Create round tabs
    const { num_prelim_rounds, num_elim_rounds } = tournament.data.config;
    for (let r = 1; r <= maxPairedRound; r++) {
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        if (r <= num_prelim_rounds) {
            btn.textContent = `Round ${r}`;
        } else {
            const elimNum = r - num_prelim_rounds;
            btn.textContent = getElimRoundLabel(elimNum, num_elim_rounds);
        }
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
        if (hash === 'entries') {
            showEntries();
            return;
        } else if (hash === 'judges') {
            showJudges();
            return;
        } else if (hash.startsWith('round')) {
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
        } else if (hash.startsWith('judge')) {
            const judgeId = parseInt(hash.replace('judge', ''));
            showJudgeDetails(judgeId);
            return;
        }
    } else if (activeTab && activeTab.startsWith('round')) {
        const roundNum = parseInt(activeTab.replace('round', ''));
        if (roundNum <= maxPairedRound) {
            showRound(roundNum);
            return;
        }
    } else if (activeTab === 'entries') {
        showEntries();
        return;
    } else if (activeTab === 'judges') {
        showJudges();
        return;
    }

    // Default behavior (initial load or invalid state) - show Entries
    showEntries();
}

// Handle New Round Button
async function handleNewRound() {
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
        await tournament.pairRound(nextRound);
        // Refresh UI tabs and then focus on the newly created round
        updateDashboard();
        showRound(nextRound);
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

    // Determine round label
    const { num_prelim_rounds, num_elim_rounds } = tournament.data.config;
    let roundLabel;
    let tabLabel;
    if (roundNum <= num_prelim_rounds) {
        roundLabel = `Round ${roundNum}`;
        tabLabel = `Round ${roundNum}`;
    } else {
        const elimNum = roundNum - num_prelim_rounds;
        const elimLabel = getElimRoundLabel(elimNum, num_elim_rounds);
        roundLabel = elimLabel;
        tabLabel = elimLabel;
    }

    // Update active tab button
    const tabs = mainTabs.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        if (btn.textContent === tabLabel) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const matches = tournament.getRoundMatches(roundNum);
    const isPrelimRound = roundNum <= num_prelim_rounds;

    tabContent.innerHTML = `
        <div class="card">
            <h3>${roundLabel} Pairings</h3>
            <div class="pairings-grid">
                ${matches.map(m => {
        const hasResult = m.result !== null;

        // Get team members for speaker points
        const affTeam = tournament.teams.find(t => t.id === m.aff_id);
        const negTeam = tournament.teams.find(t => t.id === m.neg_id);

        // Get existing speaker points if any
        const existingSP = m.speaker_points || null;
        const affPoints = existingSP ? existingSP.affPoints : [null, null];
        const negPoints = existingSP ? existingSP.negPoints : [null, null];

        // Helper function to render member with speaker points
        const renderMember = (member, points, matchId, index, teamId) => {
            const hasPoints = points !== null && points !== undefined;
            const inputId = `sp_input_${matchId}_${index}`;
            const memberName = (member && member.name) ? member.name : member;

            return `
                <div class="member-item" id="sp_item_${matchId}_${index}">
                    <span class="member-name">
                        <a href="#" onclick="showTeamDetails(${teamId}, 'round${roundNum}'); return false;" class="team-link">${memberName}</a>
                    </span>
                    ${isPrelimRound ? `
                        ${!hasPoints ? `
                            <button class="btn btn-sm btn-success" onclick="showSpeakerPointInput('${matchId}', '${index}')" title="Add Speaker Points">+</button>
                        ` : `
                            <span class="speaker-point-value">${points.toFixed(1)}</span>
                            <div class="correction-buttons">
                                <button class="btn btn-sm btn-warning" onclick="showSpeakerPointInput('${matchId}', '${index}')" title="Edit">✏</button>
                                <button class="btn btn-sm btn-danger" onclick="unsubmitSpeakerPoint('${matchId}', '${index}')" title="Unsubmit">✕</button>
                            </div>
                        `}
                        <div class="speaker-point-input-container hidden" id="${inputId}_container">
                            <input type="number" 
                                id="${inputId}" 
                                class="speaker-points-input-inline" 
                                min="0" max="30" step="0.1"
                                value="${hasPoints ? points : ''}"
                                placeholder="0-30"
                                onblur="submitSpeakerPoint('${matchId}', '${index}')">
                        </div>
                    ` : ''}
                </div>
            `;
        };

        return `
                        <div class="pairing-item">
                            <div class="pairing-sections">
                                <div class="team-section team-aff-section">
                                    <div class="team-header">
                                        <a href="#" onclick="showTeamDetails(${m.aff_id}, 'round${roundNum}'); return false;" class="team-link team-aff">${m.aff_name}</a> 
                                        <span class="side-label">(Aff)</span>
                                        ${m.result === 'A' ? '<span class="win-indicator">✓</span>' : ''}
                                    </div>
                                    <div class="members-list">
                                        ${renderMember(affTeam.members[0], affPoints[0], m.match_id, 'aff_0', m.aff_id)}
                                        ${renderMember(affTeam.members[1], affPoints[1], m.match_id, 'aff_1', m.aff_id)}
                                    </div>
                                </div>
                                
                                <div class="team-section team-neg-section">
                                    <div class="team-header">
                                        <a href="#" onclick="showTeamDetails(${m.neg_id}, 'round${roundNum}'); return false;" class="team-link team-neg">${m.neg_name}</a>
                                        <span class="side-label">(Neg)</span>
                                        ${m.result === 'N' ? '<span class="win-indicator">✓</span>' : ''}
                                    </div>
                                    <div class="members-list">
                                        ${renderMember(negTeam.members[0], negPoints[0], m.match_id, 'neg_0', m.neg_id)}
                                        ${renderMember(negTeam.members[1], negPoints[1], m.match_id, 'neg_1', m.neg_id)}
                                    </div>
                                </div>
                                
                                <div class="match-section">
                                    <div class="match-header">
                                        <span class="match-id">Match ${m.match_id}</span>
                                    </div>
                                    <div class="match-content">
                                        ${!hasResult ? `
                                            <div class="result-buttons">
                                                <button class="btn btn-success" onclick="reportResult(${m.match_id}, 'A')">Aff Wins</button>
                                                <button class="btn btn-success" onclick="reportResult(${m.match_id}, 'N')">Neg Wins</button>
                                            </div>
                                        ` : `
                                            <div class="result-status">
                                                <div class="result-winner">Winner: ${m.result === 'A' ? 'Aff' : 'Neg'}</div>
                                                <div class="correction-buttons">
                                                    <button class="btn btn-sm btn-warning" onclick="correctResult(${m.match_id}, '${m.result}')" title="Switch Winner">✏</button>
                                                    <button class="btn btn-sm btn-danger" onclick="unsubmitResult(${m.match_id})" title="Unsubmit Result">✕</button>
                                                </div>
                                            </div>
                                        `}
                                        
                                        <!-- Judge Assignment -->
                                        <div class="judge-assignment" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Judge:</label>
                                            ${(() => {
                const assignedJudge = m.judge_id ? tournament.judges.find(j => j.id === m.judge_id) : null;
                return `
                                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                                        ${assignedJudge ? `
                                                            <span>
                                                                <a href="#" onclick="showJudgeDetails(${assignedJudge.id}); return false;" class="team-link">
                                                                    ${assignedJudge.name}
                                                                </a>
                                                                (${assignedJudge.institution})
                                                            </span>
                                                            <button class="btn btn-sm btn-warning" onclick="changeJudgeAssignment(${m.match_id})" title="Change Judge">Change</button>
                                                            <button class="btn btn-sm btn-danger" onclick="unassignJudge(${m.match_id})" title="Unassign Judge">✕</button>
                                                        ` : `
                                                            <select id="judge_select_${m.match_id}" style="flex: 1;">
                                                                <option value="">-- Select Judge --</option>
                                                                ${tournament.judges.map(judge => `
                                                                    <option value="${judge.id}">${judge.name} (${judge.institution})</option>
                                                                `).join('')}
                                                            </select>
                                                            <button class="btn btn-sm btn-primary" onclick="assignJudge(${m.match_id})">Assign</button>
                                                        `}
                                                    </div>
                                                `;
            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;
}

// Generate Bracket HTML
function generateBracketHTML() {
    const { num_prelim_rounds, num_elim_rounds } = tournament.data.config;

    // Check if prelims are complete
    const prelimMatches = tournament.data.matches.filter(m => m.round_num <= num_prelim_rounds);
    const prelimsComplete = prelimMatches.length > 0 && prelimMatches.every(m => m.result !== null);

    if (!prelimsComplete || num_elim_rounds === 0) {
        return ''; // No bracket to show
    }

    // Build bracket structure
    const rounds = [];
    for (let i = 1; i <= num_elim_rounds; i++) {
        const roundNum = num_prelim_rounds + i;
        const matches = tournament.data.matches.filter(m => m.round_num === roundNum);
        let pairs = [];
        try {
            pairs = matches.length > 0 ? tournament.generateElimPairingsBeforeAffNegOrder(roundNum) : [];
        } catch (error) {
            console.error(error);
        }
        const label = getElimRoundLabel(i, num_elim_rounds);
        rounds.push({ roundNum, matches, pairs, label });
    }

    // Generate HTML
    let html = '<div class="card" style="margin-bottom: 2rem;"><h3>Elimination Bracket</h3><div class="bracket">';

    rounds.forEach((round, idx) => {
        html += `<div class="bracket-round">`;
        html += `<div class="bracket-round-label">${round.label}</div>`;
        html += `<div class="bracket-matches">`;

        round.pairs.forEach(pair => {
            const firstTeam = pair[0];
            const secondTeam = pair[1];

            // Find the match for these two teams
            const match = round.matches.find(m =>
                (m.aff_id === firstTeam.id && m.neg_id === secondTeam.id) ||
                (m.aff_id === secondTeam.id && m.neg_id === firstTeam.id)
            );

            if (!match) {
                console.error(`No match found for teams ${firstTeam.id} (${firstTeam.name}) and ${secondTeam.id} (${secondTeam.name}) in round ${round.roundNum}`);
                return;
            }

            const firstSide = (match.aff_id === firstTeam.id) ? 'Aff' : 'Neg';
            const firstWon = firstSide === 'Aff' ? match.result === 'A' : match.result === 'N';
            const secondSide = firstSide === 'Aff' ? 'Neg' : 'Aff';
            const secondWon = firstSide === 'Neg' ? match.result === 'A' : match.result === 'N';
            const hasResult = match.result !== null;

            html += `<div class="bracket-match">`;
            html += `<div class="bracket-team ${firstWon ? 'winner' : ''} ${hasResult && !firstWon ? 'loser' : ''}">`;
            html += `<span class="seed">${firstTeam.break_seed}</span>`;
            html += `<span class="team-name"><a href="#" onclick="showTeamDetails(${firstTeam.id}, 'standings'); return false;" class="team-link" style="color: inherit; text-decoration: none;">${firstTeam.name}</a></span>`;
            html += `<span class="side-label">${firstSide}</span>`;
            if (firstWon) html += `<span class="win-indicator">✓</span>`;
            html += `</div>`;
            html += `<div class="bracket-team ${secondWon ? 'winner' : ''} ${hasResult && !secondWon ? 'loser' : ''}">`;
            html += `<span class="seed">${secondTeam.break_seed}</span>`;
            html += `<span class="team-name"><a href="#" onclick="showTeamDetails(${secondTeam.id}, 'standings'); return false;" class="team-link" style="color: inherit; text-decoration: none;">${secondTeam.name}</a></span>`;
            html += `<span class="side-label">${secondSide}</span>`;
            if (secondWon) html += `<span class="win-indicator">✓</span>`;
            html += `</div>`;
            html += `</div>`;
        });

        html += `</div>`;
        html += `</div>`;
    });

    html += '</div></div>';
    return html;
}

// Show Entries (Team List)
function showEntries() {
    activeTab = 'entries';
    window.location.hash = 'entries';

    // Add to navigation history (avoid duplicates of current view)
    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    // Update active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.textContent === 'Entries') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const teams = tournament.teams;

    // Helper to get member name safely
    const getMemberName = (member) => {
        if (typeof member === 'string') return member;
        if (member && member.name) return member.name;
        return 'Unknown';
    };

    // Sorting state
    if (!window.entriesSort) {
        window.entriesSort = { column: 'id', direction: 'asc' };
    }

    // Sort teams
    const sortedTeams = [...teams].sort((a, b) => {
        const col = window.entriesSort.column;
        let valA, valB;

        if (col === 'id') {
            valA = a.id;
            valB = b.id;
        } else if (col === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
        } else if (col === 'institution') {
            valA = (a.institution || '').toLowerCase();
            valB = (b.institution || '').toLowerCase();
        } else if (col === 'member1') {
            valA = getMemberName(a.members[0]).toLowerCase();
            valB = getMemberName(b.members[0]).toLowerCase();
        } else if (col === 'member2') {
            valA = getMemberName(a.members[1]).toLowerCase();
            valB = getMemberName(b.members[1]).toLowerCase();
        }

        if (valA < valB) return window.entriesSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return window.entriesSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const getSortIndicator = (col) => {
        if (window.entriesSort.column !== col) return '↕';
        return window.entriesSort.direction === 'asc' ? '↑' : '↓';
    };

    window.sortEntries = (col) => {
        if (window.entriesSort.column === col) {
            window.entriesSort.direction = window.entriesSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            window.entriesSort.column = col;
            window.entriesSort.direction = 'asc';
        }
        showEntries();
    };

    tabContent.innerHTML = `
        <div class="card">
            <h3>Team Entries List</h3>
            <p class="text-muted">Total Teams: ${teams.length}</p>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th onclick="sortEntries('id')" style="cursor: pointer;">ID ${getSortIndicator('id')}</th>
                        <th onclick="sortEntries('name')" style="cursor: pointer;">Team Name ${getSortIndicator('name')}</th>
                        <th onclick="sortEntries('institution')" style="cursor: pointer;">Institution ${getSortIndicator('institution')}</th>
                        <th onclick="sortEntries('member1')" style="cursor: pointer;">Member 1 ${getSortIndicator('member1')}</th>
                        <th onclick="sortEntries('member2')" style="cursor: pointer;">Member 2 ${getSortIndicator('member2')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedTeams.map(team => `
                        <tr>
                            <td>${team.id}</td>
                            <td><a href="#" onclick="showTeamDetails(${team.id}, 'entries'); return false;" class="team-link"><strong>${team.name}</strong></a></td>
                            <td>${team.institution || '—'}</td>
                            <td><a href="#" onclick="showTeamDetails(${team.id}, 'entries'); return false;" class="team-link">${getMemberName(team.members[0])}</a></td>
                            <td><a href="#" onclick="showTeamDetails(${team.id}, 'entries'); return false;" class="team-link">${getMemberName(team.members[1])}</a></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Show Judges
function showJudges() {
    activeTab = 'judges';
    window.location.hash = 'judges';

    // Add to navigation history (avoid duplicates of current view)
    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    // Update active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.textContent === 'Judges') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const judges = tournament.judges;

    tabContent.innerHTML = `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3>Judges</h3>
                <button class="btn btn-primary" onclick="showAddJudgeForm()">+ Add Judge</button>
            </div>
            <p class="text-muted">Total Judges: ${judges.length}</p>
            
            ${judges.length === 0 ? `
                <p class="text-muted" style="text-align: center; padding: 2rem;">
                    No judges added yet. Click "Add Judge" to get started.
                </p>
            ` : `
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Institution</th>
                            <th>Matches Judged</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${judges.map(judge => `
                            <tr>
                                <td>${judge.id}</td>
                                <td>
                                    <a href="#" onclick="showJudgeDetails(${judge.id}); return false;" class="team-link">
                                        <strong>${judge.name}</strong>
                                    </a>
                                </td>
                                <td>${judge.institution}</td>
                                <td>${judge.matches_judged.length}</td>
                                <td>
                                    <button 
                                        class="btn btn-sm btn-danger" 
                                        onclick="deleteJudge(${judge.id})"
                                        ${judge.matches_judged.length > 0 ? 'disabled title="Cannot delete judge with assigned matches"' : ''}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <!-- Add Judge Form (hidden by default) -->
        <div id="addJudgeForm" class="card hidden" style="margin-top: 1rem;">
            <h4>Add New Judge</h4>
            <form onsubmit="submitAddJudge(event)">
                <div class="form-group">
                    <label for="judgeName">Judge Name *</label>
                    <input type="text" id="judgeName" required placeholder="Enter judge name">
                </div>
                <div class="form-group">
                    <label for="judgeInstitution">Institution</label>
                    <input type="text" id="judgeInstitution" placeholder="Leave blank for 'Tournament Hire'">
                </div>
                <div style="display: flex; gap: 1rem;">
                    <button type="submit" class="btn btn-primary">Add Judge</button>
                    <button type="button" class="btn btn-secondary" onclick="hideAddJudgeForm()">Cancel</button>
                </div>
            </form>
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

    // Update active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === 'standings') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const standings = tournament.getStandings(); // Get full standings for initial check

    if (standings.every(t => t.score === 0)) {
        tabContent.innerHTML = '<div class="card"><p class="text-muted">No results yet. Generate pairings and enter results to see standings.</p></div>';
        return;
    }

    // Generate bracket if applicable
    const bracketHTML = generateBracketHTML();

    // Determine standings title and which standings to show
    const { num_elim_rounds } = tournament.data.config;
    const showTabs = bracketHTML && num_elim_rounds > 0;

    const prelimStandings = showTabs ? tournament.getPreliminaryStandings() : null;
    const overallStandings = standings;

    // Generate standings table HTML
    const generateStandingsTable = (standingsData, isPrelim) => `
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
                ${standingsData.map((team, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><a href="#" onclick="showTeamDetails(${team.id}, 'standings'); return false;" class="team-link"><strong>${team.name}</strong></a></td>
                        <td>${isPrelim ? team.prelim_wins : team.wins}</td>
                        <td>${isPrelim ? team.prelim_score.toFixed(1) : team.score.toFixed(1)}</td>
                        <td>${isPrelim ? team.prelim_buchholz.toFixed(1) : team.buchholz.toFixed(1)}</td>
                        <td>${team.aff_count}/${team.neg_count}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // Check if we should show participant standings
    const prelimsComplete = tournament.arePrelimRoundsComplete();
    let participantStandingsHTML = '';

    if (prelimsComplete) {
        participantStandingsHTML = `
            <div class="card" style="margin-top: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>Participant Standings</h3>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <label for="participantMethod" style="margin: 0; font-weight: normal;">Calculation:</label>
                        <select id="participantMethod" onchange="updateParticipantStandings()" style="width: auto; padding: 0.5rem;">
                            <option value="total">Total Points</option>
                            <option value="drop-1">Drop High/Low</option>
                            <option value="drop-2">Drop 2 High/2 Low</option>
                        </select>
                    </div>
                </div>
                <div id="participantStandingsTable"></div>
            </div>
        `;
    }

    if (showTabs) {
        // Show both preliminary and overall standings with tabs
        tabContent.innerHTML = `
            ${bracketHTML}
            <div class="card">
                <h3>Standings</h3>
                <div class="sub-tabs">
                    <button class="sub-tab-btn active" onclick="switchStandingsTab('prelim')">Preliminary</button>
                    <button class="sub-tab-btn" onclick="switchStandingsTab('overall')">Overall</button>
                </div>
                <div id="standings-prelim" class="standings-tab-content">
                    ${generateStandingsTable(prelimStandings, true)}
                </div>
                <div id="standings-overall" class="standings-tab-content hidden">
                    ${generateStandingsTable(overallStandings, false)}
                </div>
            </div>
            ${participantStandingsHTML}
        `;
    } else {
        // Show only current standings (no tabs)
        tabContent.innerHTML = `
            <div class="card">
                <h3>Current Standings</h3>
                ${generateStandingsTable(overallStandings, false)}
            </div>
            ${participantStandingsHTML}
        `;
    }

    // Initialize participant standings if shown
    if (prelimsComplete) {
        updateParticipantStandings();
    }
}

// Switch between preliminary and overall standings tabs
window.switchStandingsTab = function (tabName) {
    const prelimTab = document.getElementById('standings-prelim');
    const overallTab = document.getElementById('standings-overall');
    const buttons = document.querySelectorAll('.sub-tab-btn');

    if (tabName === 'prelim') {
        prelimTab.classList.remove('hidden');
        overallTab.classList.add('hidden');
        buttons[0].classList.add('active');
        buttons[1].classList.remove('active');
    } else {
        prelimTab.classList.add('hidden');
        overallTab.classList.remove('hidden');
        buttons[0].classList.remove('active');
        buttons[1].classList.add('active');
    }
};

// Update participant standings based on selected method
window.updateParticipantStandings = function () {
    const method = document.getElementById('participantMethod').value;
    const participants = tournament.getParticipantStandings(method);

    const tableContainer = document.getElementById('participantStandingsTable');

    if (participants.length === 0) {
        tableContainer.innerHTML = '<p class="text-muted">No speaker points recorded yet.</p>';
        return;
    }

    tableContainer.innerHTML = `
        <table class="standings-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Participant</th>
                    <th>Team</th>
                    <th>Institution</th>
                    <th>Total Points</th>
                    <th>Adjusted Score</th>
                    <th>Round Scores</th>
                </tr>
            </thead>
            <tbody>
                ${participants.map((p, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><strong>${p.memberName}</strong></td>
                        <td><a href="#" onclick="showTeamDetails(${p.teamId}, 'standings'); return false;" class="team-link">${p.teamName}</a></td>
                        <td>${p.institution}</td>
                        <td>${p.totalPoints.toFixed(1)}</td>
                        <td><strong>${p.adjustedScore.toFixed(1)}</strong></td>
                        <td>${p.roundScores.map(s => s.toFixed(1)).join(', ')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
};

// Report Result
window.reportResult = function (matchId, outcome) {
    try {
        tournament.reportResult(matchId, outcome);
        updateDashboard();
    } catch (error) {
        showNotification('Error', error.message);
    }
};

// Show Speaker Point Input for Individual Participant
window.showSpeakerPointInput = function (matchId, index) {
    const inputContainer = document.getElementById(`sp_input_${matchId}_${index}_container`);
    const item = document.getElementById(`sp_item_${matchId}_${index}`);

    // Hide the display elements
    const displayElements = item.querySelectorAll('.btn, .speaker-point-value, .correction-buttons');
    displayElements.forEach(el => el.style.display = 'none');

    // Show input container
    inputContainer.classList.remove('hidden');

    // Focus the input
    const input = document.getElementById(`sp_input_${matchId}_${index}`);
    input.focus();
};

// Submit Speaker Point for Individual Participant
window.submitSpeakerPoint = function (matchId, index) {
    // Submit Speaker Point for Individual Participant
    window.submitSpeakerPoint = async function (matchId, index) {
        const inputId = `sp_input_${matchId}_${index}`;
        const input = document.getElementById(inputId);
        const value = parseFloat(input.value);

        if (isNaN(value) || value < 0 || value > 30) {
            showNotification('Invalid Input', 'Speaker points must be between 0 and 30.');
            return;
        }

        // Get current match data to preserve other points
        const match = tournament.data.matches.find(m => m.match_id === parseInt(matchId));
        if (!match) return;

        // Construct speaker points object
        const currentSP = match.speaker_points || { affPoints: [null, null], negPoints: [null, null] };
        const newSP = {
            affPoints: [...currentSP.affPoints],
            negPoints: [...currentSP.negPoints]
        };

        // Update specific point
        if (index === 'aff_0') newSP.affPoints[0] = value;
        if (index === 'aff_1') newSP.affPoints[1] = value;
        if (index === 'neg_0') newSP.negPoints[0] = value;
        if (index === 'neg_1') newSP.negPoints[1] = value;

        try {
            await tournament.updateResult(parseInt(matchId), match.result, newSP);
            // Refresh view
            const activeRound = parseInt(activeTab.replace('round', ''));
            showRound(activeRound);
        } catch (error) {
            showNotification('Error', error.message);
        }
    };

    // Cancel Speaker Point Input
    window.cancelSpeakerPointInput = function (matchId, index) {
        const inputContainer = document.getElementById(`sp_input_${matchId}_${index}_container`);
        const item = document.getElementById(`sp_item_${matchId}_${index}`);

        // Hide input container
        inputContainer.classList.add('hidden');

        // Show the display elements
        const displayElements = item.querySelectorAll('.btn, .speaker-point-value, .correction-buttons');
        displayElements.forEach(el => el.style.display = '');
    };

    // Correct Result (Switch Winner)
    window.correctResult = function (matchId, currentResult) {
        const newOutcome = currentResult === 'A' ? 'N' : 'A';
        showConfirm(
            'Switch Winner',
            'Are you sure you want to switch the winner? This will update standings but preserve existing pairings.',
            async () => { // Made callback async
                try {
                    await tournament.updateResult(matchId, newOutcome); // Added await
                    // Refresh view
                    const activeRound = parseInt(activeTab.replace('round', ''));
                    showRound(activeRound); // Changed updateDashboard to showRound
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

        // Determine back button action from navigation history
        let backAction = 'goBack()';
        let backLabel = '← Back';

        // Find the previous view from history (skip current team page)
        const currentIndex = navigationHistory.length - 1;
        // let previousView = null;

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
        // Set label and active tab based on previous view
        if (previousView) {
            if (previousView.startsWith('round')) {
                const roundNum = parseInt(previousView.replace('round', ''));
                backLabel = `← Back to Round ${roundNum}`;

                // Highlight the specific round tab
                const roundTabBtn = Array.from(tabs).find(btn => btn.textContent === `Round ${roundNum}`);
                if (roundTabBtn) roundTabBtn.classList.add('active');

            } else if (previousView === 'standings') {
                backLabel = '← Back to Standings';

                // Highlight Standings tab
                const standingsTabBtn = Array.from(tabs).find(btn => btn.textContent === 'Standings');
                if (standingsTabBtn) standingsTabBtn.classList.add('active');

            } else if (previousView === 'entries') {
                // Highlight Entries tab
                const entriesTabBtn = Array.from(tabs).find(btn => btn.textContent === 'Entries');
                if (entriesTabBtn) entriesTabBtn.classList.add('active');

            } else if (previousView.startsWith('team')) {
                const prevTeamId = parseInt(previousView.replace('team', ''));
                const prevTeam = tournament.teams.find(t => t.id === prevTeamId);
                backLabel = prevTeam ? `← Back to ${prevTeam.name}` : '← Back';

                // Keep the same tab active as the previous team view (recursive check needed or default to standings/entries)
                // For simplicity, if coming from another team, we might not know the original source easily without deeper history analysis.
                // But usually, we can infer or just leave it blank. 
                // Better approach: Check the history before the team chain.

                let sourceView = null;
                for (let i = currentIndex - 1; i >= 0; i--) {
                    const item = navigationHistory[i];
                    if (!item.startsWith('team')) {
                        sourceView = item;
                        break;
                    }
                }

                if (sourceView) {
                    if (sourceView.startsWith('round')) {
                        const rNum = parseInt(sourceView.replace('round', ''));
                        const rBtn = Array.from(tabs).find(btn => btn.textContent === `Round ${rNum}`);
                        if (rBtn) rBtn.classList.add('active');
                    } else if (sourceView === 'standings') {
                        const sBtn = Array.from(tabs).find(btn => btn.textContent === 'Standings');
                        if (sBtn) sBtn.classList.add('active');
                    } else if (sourceView === 'entries') {
                        const eBtn = Array.from(tabs).find(btn => btn.textContent === 'Entries');
                        if (eBtn) eBtn.classList.add('active');
                    }
                }
            }
        } else {
            // No previous view found, default to standings
            backLabel = '← Back to Standings';
            const standingsTabBtn = Array.from(tabs).find(btn => btn.textContent === 'Standings');
            if (standingsTabBtn) standingsTabBtn.classList.add('active');
        }

        // Helper to get member name safely
        const getMemberName = (member) => {
            if (typeof member === 'string') return member;
            if (member && member.name) return member.name;
            return 'Unknown';
        };

        const member1Name = getMemberName(team.members[0]);
        const member2Name = getMemberName(team.members[1]);

        tabContent.innerHTML = `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <div>
                    <h3>Team Details: ${team.name}</h3>
                    <div class="text-muted" style="margin-top: 0.5rem;">
                        <strong>Members:</strong> ${member1Name} & ${member2Name}
                        ${team.institution ? `<br><strong>Institution:</strong> ${team.institution}` : ''}
                    </div>
                </div>
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
                        <th>${member1Name} Points</th>
                        <th>${member2Name} Points</th>
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

            const { num_prelim_rounds, num_elim_rounds } = tournament.data.config;
            let roundLabel = `Round ${match.round_num}`;
            if (match.round_num > num_prelim_rounds) {
                const elimRoundNum = match.round_num - num_prelim_rounds;
                roundLabel = getElimRoundLabel(elimRoundNum, num_elim_rounds);
            }

            // Get speaker points for this round
            const spHistory = team.speaker_points_history.find(h => h.round === match.round_num);
            const points = spHistory ? spHistory.points : [null, null];
            const p1Points = points[0] !== null ? points[0].toFixed(1) : '—';
            const p2Points = points[1] !== null ? points[1].toFixed(1) : '—';

            return `
                            <tr>
                                <td>${roundLabel}</td>
                                <td>${side}</td>
                                <td><a href="#" onclick="showTeamDetails(${oppId}); return false;" class="team-link">${oppName}</a></td>
                                <td class="${resultClass}">${result}</td>
                                <td>${p1Points}</td>
                                <td>${p2Points}</td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
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

    // Judge Management Functions
    function showAddJudgeForm() {
        const form = document.getElementById('addJudgeForm');
        if (form) {
            form.classList.remove('hidden');
            document.getElementById('judgeName').focus();
        }
    }

    function hideAddJudgeForm() {
        const form = document.getElementById('addJudgeForm');
        if (form) {
            form.classList.add('hidden');
            // Clear form
            document.getElementById('judgeName').value = '';
            document.getElementById('judgeInstitution').value = '';
        }
    }

    function submitAddJudge(event) {
        event.preventDefault();

        const name = document.getElementById('judgeName').value.trim();
        const institution = document.getElementById('judgeInstitution').value.trim();

        try {
            tournament.addJudge(name, institution);
            showJudges(); // Refresh the view
            showNotification('Success', `Judge "${name}" added successfully!`);
        } catch (error) {
            showNotification('Error', error.message);
        }
    }

    function deleteJudge(judgeId) {
        const judge = tournament.judges.find(j => j.id === judgeId);
        if (!judge) return;

        showConfirm(
            'Delete Judge',
            `Are you sure you want to delete judge "${judge.name}"?`,
            () => {
                try {
                    tournament.removeJudge(judgeId);
                    showJudges(); // Refresh the view
                    showNotification('Success', `Judge "${judge.name}" deleted successfully!`);
                } catch (error) {
                    showNotification('Error', error.message);
                }
            }
        );
    }

    function showJudgeDetails(judgeId) {
        const judge = tournament.judges.find(j => j.id === judgeId);
        if (!judge) {
            showNotification('Error', 'Judge not found');
            return;
        }

        activeTab = `judge${judgeId}`;
        window.location.hash = `judge${judgeId}`;

        // Add to navigation history
        if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
            navigationHistory.push(activeTab);
        }

        // Update active state (no specific tab for judge details)
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

        // Get matches this judge has judged
        const judgedMatches = tournament.data.matches.filter(m => m.judge_id === judgeId);

        tabContent.innerHTML = `
        <div class="card">
            <button class="btn btn-secondary" onclick="goBack()" style="margin-bottom: 1rem;">← Back</button>
            
            <h3>Judge Details: ${judge.name}</h3>
            
            <div class="stats-grid" style="margin-top: 1.5rem; margin-bottom: 2rem;">
                <div class="stat-card">
                    <div class="stat-label">Institution</div>
                    <div class="stat-value">${judge.institution}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Matches Judged</div>
                    <div class="stat-value">${judge.matches_judged.length}</div>
                </div>
            </div>

            ${judgedMatches.length > 0 ? `
                <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Judging History</h4>
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>Round</th>
                            <th>Match ID</th>
                            <th>Aff Team</th>
                            <th>Neg Team</th>
                            <th>Result</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${judgedMatches.map(match => {
            const affTeam = tournament.teams.find(t => t.id === match.aff_id);
            const negTeam = tournament.teams.find(t => t.id === match.neg_id);
            const roundLabel = match.round_num <= tournament.data.config.num_prelim_rounds
                ? `Round ${match.round_num}`
                : getElimRoundLabel(match.round_num - tournament.data.config.num_prelim_rounds, tournament.data.config.num_elim_rounds);

            return `
                                <tr>
                                    <td>${roundLabel}</td>
                                    <td>${match.match_id}</td>
                                    <td>
                                        <a href="#" onclick="showTeamDetails(${match.aff_id}, 'judge${judgeId}'); return false;" class="team-link">
                                            ${affTeam ? affTeam.name : 'Unknown'}
                                        </a>
                                    </td>
                                    <td>
                                        <a href="#" onclick="showTeamDetails(${match.neg_id}, 'judge${judgeId}'); return false;" class="team-link">
                                            ${negTeam ? negTeam.name : 'Unknown'}
                                        </a>
                                    </td>
                                    <td>${match.result === 'A' ? 'Aff Won' : match.result === 'N' ? 'Neg Won' : 'Pending'}</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            ` : `
                <p class="text-muted" style="text-align: center; padding: 2rem;">
                    This judge has not been assigned to any matches yet.
                </p>
            `}
        </div>
    `;
    }

    // Judge Assignment Functions
    function assignJudge(matchId) {
        const selectElement = document.getElementById(`judge_select_${matchId}`);
        if (!selectElement) return;

        const judgeId = parseInt(selectElement.value);
        if (!judgeId) {
            showNotification('Error', 'Please select a judge');
            return;
        }

        try {
            tournament.assignJudgeToMatch(matchId, judgeId);
            // Refresh the current round view
            const match = tournament.data.matches.find(m => m.match_id === matchId);
            if (match) {
                showRound(match.round_num);
            }
            const judge = tournament.judges.find(j => j.id === judgeId);
            showNotification('Success', `Judge "${judge.name}" assigned to Match ${matchId}`);
        } catch (error) {
            showNotification('Error', error.message);
        }
    }

    function unassignJudge(matchId) {
        try {
            tournament.unassignJudgeFromMatch(matchId);
            // Refresh the current round view
            const match = tournament.data.matches.find(m => m.match_id === matchId);
            if (match) {
                showRound(match.round_num);
            }
            showNotification('Success', `Judge unassigned from Match ${matchId}`);
        } catch (error) {
            showNotification('Error', error.message);
        }
    }

    function changeJudgeAssignment(matchId) {
        // Unassign current judge and refresh to show dropdown
        unassignJudge(matchId);
    }

    // Handle browser back/forward navigation
    window.addEventListener('hashchange', () => {
        if (tournament.data) {
            updateDashboard();
        }
    });

    // Initialize on load
    initUI();
}
