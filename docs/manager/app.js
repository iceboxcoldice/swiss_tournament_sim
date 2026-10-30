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
const hubSection = document.getElementById('hubSection');
const hubBtn = document.getElementById('hubBtn');
const newTournamentHubBtn = document.getElementById('newTournamentHubBtn');
const tournamentHubGrid = document.getElementById('tournamentHubGrid');

// Team Modal Elements
const teamModal = document.getElementById('teamModal');
const teamModalForm = document.getElementById('teamModalForm');
const closeTeamModalBtn = document.getElementById('closeTeamModalBtn');
const teamIdInput = document.getElementById('teamIdInput');
const teamNameInput = document.getElementById('teamNameInput');
const teamInstitutionInput = document.getElementById('teamInstitutionInput');
const member1NameInput = document.getElementById('member1NameInput');
const member1EmailInput = document.getElementById('member1EmailInput');
const member2NameInput = document.getElementById('member2NameInput');
const member2EmailInput = document.getElementById('member2EmailInput');
const teamModalTitle = document.getElementById('teamModalTitle');

let activeTab = null;
let navigationHistory = []; // Track navigation history for back button

// Loading Spinner Utilities
function showLoading(message = 'Syncing with cloud...') {
    const overlay = document.getElementById('loadingOverlay');
    const msgElement = document.getElementById('loadingMessage');
    if (overlay && msgElement) {
        msgElement.innerText = message;
        overlay.classList.remove('hidden');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

// Sync Indicator Logic
const syncIndicator = document.getElementById('syncIndicator');
tournament.onSyncStatusChange = (isSyncing) => {
    if (isSyncing) {
        syncIndicator.classList.remove('sync-complete');
        syncIndicator.classList.add('visible');
    } else {
        syncIndicator.classList.add('sync-complete');
        setTimeout(() => {
            syncIndicator.classList.remove('visible');
        }, 2000);
    }
};
// Auth State Management
let currentUser = null;

let isSuperAdminUser = false;

function isSuperAdmin() {
    if (!currentUser || !currentUser.email) return false;
    const email = currentUser.email.toLowerCase().trim();
    return email === 'coldice@gmail.com' || isSuperAdminUser;
}

async function checkSuperAdminStatus() {
    const backendUrl = tournament.getEffectiveBackendUrl ? tournament.getEffectiveBackendUrl() : (tournament.backendUrl || '');
    if (!backendUrl || !currentUser) {
        isSuperAdminUser = false;
        return;
    }
    try {
        const res = await fetch(`${backendUrl}/api/user/super_admin_status`, {
            headers: tournament.getAuthHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            isSuperAdminUser = !!data.is_super_admin;
        }
    } catch (e) {
        console.warn("Could not check super admin status:", e);
    }
}

function getUserRole() {
    // Local mode always has full access
    if (!tournament.backendUrl) return 'admin';

    if (!currentUser) return 'public';

    // Super Admin check: Global admin across all tournaments
    if (isSuperAdmin()) return 'admin';

    const authData = tournament?.data?.auth;
    if (!authData) return 'public';

    const userEmail = currentUser?.email;
    if (!userEmail) return 'public';
    const email = userEmail.toLowerCase();

    // Admin check
    if (authData.admins) {
        if (authData.admins.some(a => a.toLowerCase() === email)) return 'admin';
    }

    // Judge check
    if (authData.judges) {
        for (const [id, j_email] of Object.entries(authData.judges)) {
            if (j_email && j_email.toLowerCase() === email) return 'judge';
        }
    }

    // Coach check
    if (authData.coaches) {
        if (authData.coaches[email]) return 'coach';
    }

    return 'participant';
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4 !== 0) {
            base64 += '=';
        }
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

function updateAuthUI() {
    const signInBtn = document.querySelector('.g_id_signin');
    const userProfile = document.getElementById('user-profile');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');

    if (currentUser) {
        if (signInBtn) signInBtn.style.display = 'none';
        if (userProfile) {
            userProfile.style.display = 'flex';
            userName.innerText = currentUser.name;
            userAvatar.src = currentUser.picture;
        }
    } else {
        if (signInBtn) signInBtn.style.display = 'block';
        if (userProfile) userProfile.style.display = 'none';

        // Render Google button if library is loaded but button is empty
        if (typeof google !== 'undefined' && signInBtn && signInBtn.innerHTML === '') {
            google.accounts.id.renderButton(signInBtn, { theme: 'outline', size: 'medium' });
        }
    }
}

async function handleCredentialResponse(response) {
    const token = response.credential;
    localStorage.setItem('googleAuthToken', token);
    currentUser = parseJwt(token);
    await checkSuperAdminStatus();
    updateAuthUI();
    // Refresh current view to apply role-based access
    initUI();
}
window.handleCredentialResponse = handleCredentialResponse;

function signOut() {
    localStorage.removeItem('googleAuthToken');
    currentUser = null;
    isSuperAdminUser = false;
    updateAuthUI();
    initUI();
}

// Check for existing token on load
const existingToken = localStorage.getItem('googleAuthToken');
if (existingToken) {
    currentUser = parseJwt(existingToken);
    // If token is invalid/expired, clear it
    if (!currentUser || (currentUser.exp * 1000) < Date.now()) {
        signOut();
    } else {
        updateAuthUI();
    }
}

// Listen for sync completion to refresh UI if needed
window.addEventListener('tournamentSyncComplete', () => {
    updateDashboard();
});

function setButtonsLoading(selector, loading) {
    const buttons = document.querySelectorAll(selector);
    buttons.forEach(btn => {
        if (loading) {
            btn.classList.add('btn-loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('btn-loading');
            btn.disabled = false;
        }
    });
}

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
async function initUI() {
    if (tournament.data) {
        showDashboard();

        // Handle initial hash
        const hash = window.location.hash.substring(1);
        if (hash) {
            if (hash.startsWith('round')) {
                showRound(parseInt(hash.replace('round', '')));
            } else if (hash === 'standings') {
                showStandings();
            } else if (hash === 'entries') {
                showEntries();
            } else if (hash === 'judges') {
                showJudges();
            } else if (hash.startsWith('team')) {
                showTeamDetails(parseInt(hash.replace('team', '')));
            } else if (hash.startsWith('judge')) {
                showJudgeDetails(parseInt(hash.replace('judge', '')));
            } else {
                showStandings();
            }
        } else {
            showStandings();
        }
    } else {
        showHub();
    }
}

function showSetup() {
    hubSection.classList.add('hidden');
    setupSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    hubBtn.classList.remove('hidden'); // Show hub btn so user can go back

    if (setupForm) setupForm.reset();
    const teamData = document.getElementById('teamData');
    if (teamData) teamData.value = '';
}

function showHub() {
    hubSection.classList.remove('hidden');
    setupSection.classList.add('hidden');
    dashboardSection.classList.add('hidden');
    hubBtn.classList.add('hidden'); // Already on Hub

    // Unset active tournament so a refresh stays on the Hub
    tournament.data = null;
    tournament.tournamentId = null;
    localStorage.removeItem('tournamentId');

    // Clear URL query param if present
    if (window.location.search.includes('tournament_id')) {
        const url = new URL(window.location);
        url.searchParams.delete('tournament_id');
        window.history.replaceState({}, '', url);
    }

    fetchTournaments();
}

function showDashboard() {
    hubSection.classList.add('hidden');
    setupSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    hubBtn.classList.remove('hidden');
    updateDashboard();
}

// Setup Form Handler
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const numTeamsInput = parseInt(document.getElementById('numTeams').value);
    const numTeams = isNaN(numTeamsInput) ? 0 : numTeamsInput;
    const numPrelimRounds = parseInt(document.getElementById('numRounds').value);
    const numElimRounds = parseInt(document.getElementById('numElimRounds').value) || 0;
    const teamDataText = document.getElementById('teamData').value;

    // Parse team data: Format is "Team Name | Institution | Member 1 | Member 2"
    const teamDetails = [];
    const lines = teamDataText.split('\n').map(l => l.trim()).filter(l => l);

    if (numTeams > 0) {
        for (let i = 0; i < numTeams; i++) {
            if (i < lines.length && lines[i]) {
                const parts = lines[i].split('|').map(p => p.trim());
                teamDetails.push({
                    name: parts[0] || `Team ${i + 1}`,
                    institution: parts[1] || 'Unknown',
                    members: [
                        { name: parts[2] || `Member 1`, email: parts[3] || '' },
                        { name: parts[4] || `Member 2`, email: parts[5] || '' }
                    ]
                });
            } else {
                // No data for this team, use defaults
                teamDetails.push({
                    name: `Team ${i + 1}`,
                    institution: 'Unknown',
                    members: [
                        { name: `Member 1`, email: '' },
                        { name: `Member 2`, email: '' }
                    ]
                });
            }
        }
    } else if (lines.length > 0) {
        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split('|').map(p => p.trim());
            teamDetails.push({
                name: parts[0] || `Team ${i + 1}`,
                institution: parts[1] || 'Unknown',
                members: [
                    { name: parts[2] || `Member 1`, email: parts[3] || '' },
                    { name: parts[4] || `Member 2`, email: parts[5] || '' }
                ]
            });
        }
    }

    const success = await tournament.init(teamDetails.length, numPrelimRounds, numElimRounds, teamDetails);

    if (success) {
        // Clear navigation history and hash for fresh start
        navigationHistory = [];
        window.location.hash = '';

        if (tournament.data && tournament.data.status === 'pending') {
            showNotification(
                'Submitted for Approval',
                `Tournament request for "${tournament.tournamentId}" submitted! It is currently pending approval by the platform Super Admin.`
            );
        }

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
        let url = backendUrlInput.value.trim();
        if (url) {
            // Normalize URL protocol and strip trailing slashes
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            if (url.includes('.appspot.com') && url.startsWith('http://')) {
                url = url.replace('http://', 'https://');
            }
            url = url.replace(/\/+$/, '');

            showLoading('Connecting to backend...');
            try {
                const response = await fetch(`${url}/api/health`);
                if (response.ok) {
                    tournament.setBackendUrl(url);
                    localStorage.setItem('backendUrl', url);
                    updateConnectionStatus(true);
                    backendConfigModal.classList.add('hidden');
                    showNotification('Connected', 'Successfully connected to backend.');

                    // Fetch latest data from cloud instead of relying on stale local data
                    await tournament.loadFromStorage();
                    initUI();
                } else {
                    showNotification('Error', 'Failed to connect to backend. Check URL.');
                }
            } catch (e) {
                showNotification('Error', 'Failed to connect to backend. ' + e.message);
            } finally {
                hideLoading();
            }
        } else {
            // Clear backend and explicitly stay in local mode
            tournament.setBackendUrl(null);
            localStorage.setItem('backendUrl', 'local');
            updateConnectionStatus(false);
            backendConfigModal.classList.add('hidden');
            initUI();
        }
    });
}

function updateConnectionStatus(connected) {
    if (connectionStatus) {
        if (connected) {
            const urlText = tournament.backendUrl ? `: ${tournament.backendUrl}` : '';
            connectionStatus.textContent = `Cloud Connected${urlText}`;
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
        lines.push(`Team ${i} | Institution ${i} | Member ${i}A | participant${i}a@example.com | Member ${i}B | participant${i}b@example.com`);
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
        async () => {
            showLoading('Resetting tournament...');
            try {
                await tournament.clearStorage(true);
                location.reload();
            } catch (e) {
                showNotification('Error', 'Failed to reset tournament: ' + e.message);
            } finally {
                hideLoading();
            }
        }
    );
});

// Close Tournament Handler
const closeTournamentBtnEl = document.getElementById('closeTournamentBtn');
if (closeTournamentBtnEl) {
    closeTournamentBtnEl.addEventListener('click', () => {
        showConfirm(
            'Close Tournament',
            'Are you sure you want to close this tournament? This will commit all judge match records to their global profiles and mark the tournament as finished. This action is final.',
            async () => {
                showLoading("Closing tournament...");
                try {
                    const result = await tournament.closeTournament();
                    showNotification("Success", result.message || "Tournament closed successfully!");
                    updateDashboard();
                } catch (e) {
                    showNotification("Error", e.message);
                } finally {
                    hideLoading();
                }
            }
        );
    });
}

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
    if (!tournament || !tournament.data || !tournament.data.config) {
        console.log('updateDashboard: No tournament data available to render.');
        return;
    }
    // Update tournament info
    const { num_teams, num_prelim_rounds, num_elim_rounds, num_rounds } = tournament.data.config;
    const { current_round } = tournament.data;
    const roundsText = num_elim_rounds > 0
        ? `${num_prelim_rounds} prelim + ${num_elim_rounds} elim rounds`
        : `${num_rounds} rounds`;

    const tournamentName = tournament.tournamentId
        ? tournament.tournamentId.replace(/-/g, ' ').toUpperCase()
        : 'Tournament';

    let adminStr = '';
    if (tournament.data.auth && tournament.data.auth.admins && tournament.data.auth.admins.length > 0) {
        adminStr = ` • Admin: ${tournament.data.auth.admins[0].toLowerCase()}`;
    }

    let closedStr = tournament.data.is_closed ? ' <span class="closed-badge" style="background:#ef4444; color:white; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.7rem; vertical-align:middle; text-transform:uppercase; margin-left:0.5rem; font-weight:600;">Closed</span>' : '';
    let pendingStr = tournament.data.status === 'pending' ? ' <span class="pending-badge" style="background:#f59e0b; color:white; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.7rem; vertical-align:middle; text-transform:uppercase; margin-left:0.5rem; font-weight:600;">Pending Approval</span>' : '';
    tournamentInfo.innerHTML = `${tournamentName} — ${num_teams} teams • ${roundsText} • Current: Round ${current_round}${adminStr}${closedStr}${pendingStr}`;
    // Render tabs
    renderTabs();

    if (tournament.data.status === 'pending') {
        const canApprove = isSuperAdmin();
        const banner = document.createElement('div');
        banner.className = 'pending-approval-banner card';
        banner.style.cssText = 'background: #fffbeb; border: 1px solid #f59e0b; color: #92400e; padding: 0.75rem 1rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;';
        banner.innerHTML = `
            <div>
                <strong>⏳ Tournament Pending Super Admin Approval</strong>
                <p style="margin: 0.25rem 0 0 0; font-size: 0.9em;">This tournament request must be approved by a platform Super Admin before rounds can be paired.</p>
            </div>
            ${canApprove ? `<button class="btn btn-primary" onclick="handleApproveTournament('${tournament.tournamentId}').then(() => updateDashboard())">Approve Tournament</button>` : ''}
        `;
        tabContent.prepend(banner);
    }

    // Toggle header buttons based on role
    const role = getUserRole();
    const importBtnEl = document.getElementById('importBtn');
    const backendConfigBtnEl = document.getElementById('backendConfigBtn');

    const closeTournamentBtnEl = document.getElementById('closeTournamentBtn');
    const resetBtnEl = document.getElementById('resetBtn');
    if (role === 'admin') {
        if (importBtnEl) importBtnEl.style.display = 'inline-block';
        if (backendConfigBtnEl) backendConfigBtnEl.style.display = 'inline-block';

        if (tournament.data.is_closed) {
            if (closeTournamentBtnEl) closeTournamentBtnEl.style.display = 'none';
            if (resetBtnEl) resetBtnEl.style.display = 'none';
        } else {
            if (closeTournamentBtnEl) closeTournamentBtnEl.style.display = 'inline-block';
            if (resetBtnEl) resetBtnEl.style.display = 'inline-block';
        }
    } else {
        if (importBtnEl) importBtnEl.style.display = 'none';
        if (backendConfigBtnEl) backendConfigBtnEl.style.display = 'none';
        if (closeTournamentBtnEl) closeTournamentBtnEl.style.display = 'none';
        if (resetBtnEl) resetBtnEl.style.display = 'none';
    }

    if (role === 'coach') {
        const institution = (tournament.data.auth && tournament.data.auth.coaches) ? tournament.data.auth.coaches[currentUser.email.toLowerCase()] : 'Unknown';
        tournamentInfo.innerHTML += ` • <span style="color:var(--primary); font-weight:600">Coach (${institution})</span>`;
    } else if (role === 'judge') {
        tournamentInfo.innerHTML += ` • <span style="color:var(--primary); font-weight:600">Judge</span>`;
    } else if (currentUser && role === 'participant') {
        const reqs = (tournament.data.auth && tournament.data.auth.coach_requests) || {};
        const myReq = reqs[currentUser.email.toLowerCase()];
        const judgeReqs = (tournament.data.auth && tournament.data.auth.judge_requests) || {};
        const myJudgeReq = judgeReqs[currentUser.email.toLowerCase()];

        if (myReq) {
            tournamentInfo.innerHTML += ` • <span style="background: #fef3c7; color: #b45309; padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600;">Coach Request Pending (${myReq.institution})</span>`;
        } else if (myJudgeReq) {
            tournamentInfo.innerHTML += ` • <span style="background: #fef3c7; color: #b45309; padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.75rem; font-weight: 600;">Judge Application Pending</span>`;
        } else if (!tournament.data.is_closed) {
            tournamentInfo.innerHTML += ` <button class="btn btn-sm btn-outline" style="margin-left: 0.5rem; padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="promptCoachRequest()">Request Coach Access</button>`;
        }
    }
}

// Render Dynamic Tabs
function renderTabs() {
    if (!tournament || !tournament.data || !tournament.data.config || !tournament.data.matches) {
        mainTabs.innerHTML = '';
        return;
    }
    const matches = tournament.data.matches;
    const maxPairedRound = matches.length > 0 ? Math.max(...matches.map(m => m.round_num)) : 0;
    console.log('renderTabs called. matches.length:', matches.length, 'maxPairedRound:', maxPairedRound);


    mainTabs.innerHTML = '';

    const role = getUserRole();

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

    // Create Coaches tab
    const coachesBtn = document.createElement('button');
    coachesBtn.className = 'tab-btn';
    coachesBtn.textContent = 'Coaches';
    coachesBtn.onclick = showCoaches;
    mainTabs.appendChild(coachesBtn);

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

    // Create [+] button (Admin Only)
    if (role === 'admin' && !tournament.data.is_closed) {
        const newRoundBtn = document.createElement('button');
        newRoundBtn.className = 'tab-btn new-round-btn';
        newRoundBtn.textContent = '+';
        newRoundBtn.title = 'Generate Next Round';
        newRoundBtn.onclick = handleNewRound;
        mainTabs.appendChild(newRoundBtn);
    }

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
        } else if (hash === 'coaches') {
            showCoaches();
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
    } else if (activeTab === 'coaches') {
        showCoaches();
        return;
    }

    // Default behavior (initial load or invalid state) - show Entries if nothing else is active
    if (!activeTab || activeTab === 'entries') {
        showEntries();
    } else if (activeTab === 'standings') {
        showStandings();
    } else if (activeTab === 'judges') {
        showJudges();
    } else if (activeTab === 'coaches') {
        showCoaches();
    } else if (activeTab.startsWith('round')) {
        const rNum = parseInt(activeTab.replace('round', ''));
        if (rNum <= maxPairedRound) {
            showRound(rNum);
        } else {
            showEntries();
        }
    }
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

    showLoading('Pairing round...');
    try {
        await tournament.pairRound(nextRound);
        // Refresh UI tabs and then focus on the newly created round
        updateDashboard();
        showRound(nextRound);
    } catch (error) {
        showNotification('Error', error.message);
    } finally {
        hideLoading();
    }
}

// Show Round View
function showRound(roundNum, highlightMatchId = null) {
    if (!tournament || !tournament.data || !tournament.data.config) return;
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

    const role = getUserRole();
    let myJudgeId = null;
    if (role === 'judge' && tournament.data?.auth?.judges && currentUser) {
        for (const [idStr, j_email] of Object.entries(tournament.data.auth.judges)) {
            if (j_email === currentUser.email) {
                myJudgeId = parseInt(idStr);
                break;
            }
        }
    }

    tabContent.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>${roundLabel} Pairings ${tournament.data.is_closed ? '<span class="closed-badge" style="background:#ef4444; color:white; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-left:1rem;">CLOSED</span>' : ''}</h3>
                ${role === 'admin' ? `
                <div>
                    <button class="btn btn-secondary" onclick="exportPairings(${roundNum})" title="Export pairings as a CSV file to import into tabular software.">📥 Export CSV</button>
                    ${!tournament.data.is_closed ? `<button class="btn btn-danger" onclick="confirmResetRound(${roundNum})" ${roundNum !== tournament.data.current_round ? 'disabled title="Only the current round can be reset."' : ''}>Reset Round</button>` : ''}
                </div>
                ` : ''}
            </div>
            <div class="pairings-grid">
                ${matches.map(m => {
        const canEditMatch = !tournament.data.is_closed && (role === 'admin' || (role === 'judge' && m.judge_id === myJudgeId));
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
                    ${isPrelimRound && canEditMatch ? `
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
                    ` : (isPrelimRound && hasPoints ? `<span class="speaker-point-value">${points.toFixed(1)}</span>` : '')}
                </div>
            `;
        };

        return `
                        <div class="pairing-item" id="match-${m.match_id}">
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
                                        ${!hasResult ? (canEditMatch ? `
                                            <div class="result-buttons">
                                                <button class="btn btn-success" onclick="reportResult(${m.match_id}, 'A')">Aff Wins</button>
                                                <button class="btn btn-success" onclick="reportResult(${m.match_id}, 'N')">Neg Wins</button>
                                            </div>
                                        ` : '<div class="result-status"><div class="result-winner">Pending</div></div>') : `
                                            <div class="result-status">
                                                <div class="result-winner">Winner: ${m.result === 'A' ? 'Aff' : 'Neg'}</div>
                                                ${canEditMatch ? `
                                                <div class="correction-buttons">
                                                    <button class="btn btn-sm btn-warning" onclick="correctResult(${m.match_id}, '${m.result}')" title="Switch Winner">✏</button>
                                                    <button class="btn btn-sm btn-danger" onclick="unsubmitResult(${m.match_id})" title="Unsubmit Result">✕</button>
                                                </div>
                                                ` : ''}
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
                                                            ${role === 'admin' && !tournament.data.is_closed ? `
                                                            <button class="btn btn-sm btn-warning" onclick="changeJudgeAssignment(${m.match_id})" title="Change Judge">Change</button>
                                                            <button class="btn btn-sm btn-danger" onclick="unassignJudge(${m.match_id})" title="Unassign Judge">✕</button>
                                                            ` : ''}
                                                        ` : (role === 'admin' && !tournament.data.is_closed ? `
                                                            <div class="judge-autocomplete-container">
                                                                <input type="text" 
                                                                    class="judge-search-input" 
                                                                    placeholder="Type to search judge..." 
                                                                    id="judge_search_${m.match_id}" 
                                                                    oninput="filterJudges(this, ${m.match_id})"
                                                                    onfocus="showAllJudges(${m.match_id})"
                                                                    onkeydown="handleJudgeInputKey(event, ${m.match_id})"
                                                                    autocomplete="off">
                                                                <input type="hidden" id="judge_select_${m.match_id}">
                                                                <div class="judge-results" id="judge_results_${m.match_id}"></div>
                                                            </div>
                                                            <button class="btn btn-sm btn-primary" onclick="assignJudge(${m.match_id})">Assign</button>
                                                        ` : `<span style="color:var(--text-muted)">Unassigned</span>`)}
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

    // Handle match highlighting
    if (highlightMatchId) {
        setTimeout(() => {
            const matchElement = document.getElementById(`match-${highlightMatchId}`);
            if (matchElement) {
                matchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                matchElement.classList.add('highlight-match');
                // Remove class after animation completes
                setTimeout(() => {
                    matchElement.classList.remove('highlight-match');
                }, 3000);
            }
        }, 100); // Small delay to ensure DOM is updated
    }
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
async function showEntries() {
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

    const role = getUserRole();
    const isCoach = role === 'coach';
    const isAdmin = role === 'admin';
    const isStarted = !!(tournament.data && (tournament.data.is_started || (tournament.data.matches && tournament.data.matches.length > 0)));
    const canRegister = (isAdmin || isCoach) && !tournament.data.is_closed && !isStarted;
    const canSelfRegister = currentUser && role === 'participant' && !tournament.data.is_closed && !isStarted;
    const canStartTournament = isAdmin && !tournament.data.is_closed && !isStarted;

    let teamRequests = {};
    if (isAdmin || isCoach) {
        try {
            teamRequests = await tournament.fetchTeamRequests();
        } catch (e) {
            teamRequests = (tournament.data && tournament.data.team_requests) || {};
        }
    }
    const teamRequestKeys = Object.keys(teamRequests || {});

    tabContent.innerHTML = `
        ${teamRequestKeys.length > 0 ? `
        <div class="card" style="border: 1px solid #f59e0b; background: #fffdf5; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="color: #b45309; margin: 0;">⏳ Pending Student Team Registrations</h3>
                <span style="background: #fef3c7; color: #b45309; padding: 0.2rem 0.6rem; border-radius: 20px; font-weight: 600; font-size: 0.85rem;">${teamRequestKeys.length} Pending Approval</span>
            </div>
            <p class="text-muted" style="margin-top: 0;">The following student teams have self-registered and require coach/admin verification before being entered into tournament pairings:</p>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Team Name</th>
                        <th>Institution</th>
                        <th>Debater 1</th>
                        <th>Debater 2</th>
                        <th>Submitted By</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${teamRequestKeys.map(k => {
                        const req = teamRequests[k];
                        const m1 = req.members && req.members[0] ? `${req.members[0].name} (${req.members[0].email})` : '—';
                        const m2 = req.members && req.members[1] ? `${req.members[1].name} (${req.members[1].email})` : '—';
                        return `
                            <tr>
                                <td><strong>${req.name}</strong></td>
                                <td><span style="font-weight: 600; color: var(--primary);">${req.institution}</span></td>
                                <td>${m1}</td>
                                <td>${m2}</td>
                                <td class="text-muted" style="font-size: 0.85em;">${req.submitted_by || '—'}</td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button class="btn btn-sm btn-primary" onclick="handleApproveTeamRequest('${k}')">Approve Team</button>
                                        <button class="btn btn-sm btn-danger" onclick="handleRejectTeamRequest('${k}')">Reject</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <h3 style="margin: 0;">Team Entries (${teams.length})</h3>
                    ${!isStarted ? `
                        <span class="badge" style="background: #10b981; color: white; font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 600;">Registration Open</span>
                    ` : `
                        <span class="badge" style="background: #3b82f6; color: white; font-size: 0.8rem; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 600;">Tournament Started (Registration Closed)</span>
                    `}
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    ${canStartTournament ? `
                        <button class="btn btn-success" style="background: #16a34a; font-weight: 600;" onclick="handleStartTournament()">
                            ▶ Start Tournament (Pair R1)
                        </button>
                    ` : ''}
                    ${canRegister ? `<button class="btn btn-primary" onclick="showRegisterTeamForm()">+ Register Team</button>` : ''}
                    ${canSelfRegister ? `<button class="btn btn-primary" onclick="showRegisterTeamForm()">+ Self-Register Team</button>` : ''}
                </div>
            </div>

            ${teams.length === 0 ? `
                <div style="text-align: center; padding: 2.5rem 1rem; background: var(--bg-secondary); border-radius: 8px; border: 1px dashed var(--border-color); margin: 1rem 0;">
                    <p style="font-size: 1.15rem; font-weight: 600; color: var(--text-color); margin-bottom: 0.5rem;">No teams registered yet.</p>
                    <p class="text-muted" style="margin-top: 0; max-width: 520px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                        Registration is open! Approved school coaches can register their teams, and students can submit team entries for coach verification.
                    </p>
                    <div style="display: flex; gap: 0.75rem; justify-content: center; margin-top: 1rem;">
                        ${canRegister ? `<button class="btn btn-primary" onclick="showRegisterTeamForm()">+ Register First Team</button>` : ''}
                        ${canSelfRegister ? `<button class="btn btn-primary" onclick="showRegisterTeamForm()">+ Submit Team Registration</button>` : ''}
                    </div>
                </div>
            ` : `
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
                    ${sortedTeams.map(team => {
                        const isOwnInstitution = isCoach && team.institution === tournament.data.auth.coaches[currentUser.email.toLowerCase()];
                        const rowStyle = isOwnInstitution ? 'background-color: rgba(79, 70, 229, 0.05);' : '';
                        
                        return `
                        <tr style="${rowStyle}">
                            <td>${team.id}</td>
                            <td>
                                <a href="#" onclick="showTeamDetails(${team.id}, 'entries'); return false;" class="team-link"><strong>${team.name}</strong></a>
                                ${isOwnInstitution ? '<span class="badge" style="background:var(--primary); color:white; font-size:0.6rem; margin-left:0.5rem; padding:0.1rem 0.3rem; border-radius:3px;">MY TEAM</span>' : ''}
                            </td>
                            <td>${team.institution || '—'}</td>
                            <td>
                                <div style="display:flex; flex-direction:column; gap:0.2rem">
                                    <a href="#" onclick="showTeamDetails(${team.id}, 'entries'); return false;" class="team-link">${getMemberName(team.members[0])}</a>
                                    ${team.members[0] && team.members[0].email ? `<a href="#" onclick="showUserProfile('${team.members[0].email}', '${getMemberName(team.members[0])}', '${team.institution}'); return false;" class="text-xs" style="color:var(--text-muted); text-decoration:none">View Profile</a>` : ''}
                                </div>
                            </td>
                            <td>
                                <div style="display:flex; flex-direction:column; gap:0.2rem">
                                    <a href="#" onclick="showTeamDetails(${team.id}, 'entries'); return false;" class="team-link">${getMemberName(team.members[1])}</a>
                                    ${team.members[1] && team.members[1].email ? `<a href="#" onclick="showUserProfile('${team.members[1].email}', '${getMemberName(team.members[1])}', '${team.institution}'); return false;" class="text-xs" style="color:var(--text-muted); text-decoration:none">View Profile</a>` : ''}
                                </div>
                            </td>
                            ${canRegister ? `
                            <td style="text-align:right">
                                ${isAdmin || (isCoach && team.institution === tournament.data.auth.coaches[currentUser.email.toLowerCase()]) ? `
                                    <button class="btn btn-sm btn-secondary" onclick="showRegisterTeamForm(${team.id})">Edit</button>
                                ` : ''}
                            </td>
                            ` : ''}
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            `}
        </div>
    `;
}

window.handleStartTournament = async function () {
    const teamCount = (tournament.teams && tournament.teams.length) || 0;
    if (teamCount < 2) {
        showNotification('Cannot Start Tournament', `At least 2 teams must be registered to start the tournament. Currently registered: ${teamCount}`);
        return;
    }
    const confirmed = confirm(
        `Start tournament with ${teamCount} teams?\n\n` +
        `This will permanently CLOSE team registration and generate Round 1 pairings.`
    );
    if (!confirmed) return;

    showLoading('Starting tournament and pairing Round 1...');
    try {
        const res = await tournament.startTournament(true);
        if (res.success) {
            showNotification('Tournament Started', res.message || 'Tournament started! Round 1 pairings are ready.');
            updateDashboard();
            showRound(1);
        } else {
            showNotification('Error', res.error || 'Failed to start tournament');
        }
    } catch (e) {
        showNotification('Error', e.message);
    } finally {
        hideLoading();
    }
};

// Show Judges
async function showJudges() {
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

    const judges = tournament.judges || [];
    const role = getUserRole();
    const isAdmin = role === 'admin';
    const isJudge = role === 'judge';

    let judgeRequests = {};
    if (isAdmin) {
        try {
            judgeRequests = await tournament.fetchJudgeRequests();
        } catch (e) {
            judgeRequests = (tournament.data && tournament.data.auth && tournament.data.auth.judge_requests) || {};
        }
    }
    const judgeRequestKeys = Object.keys(judgeRequests || {}).sort();

    const myJudgeReq = (currentUser && tournament.data && tournament.data.auth && tournament.data.auth.judge_requests)
        ? tournament.data.auth.judge_requests[currentUser.email.toLowerCase()]
        : null;

    tabContent.innerHTML = `
        ${!isAdmin && myJudgeReq ? `
        <div class="card" style="border: 1px solid #f59e0b; background: #fffdf5; margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.5rem;">⏳</span>
                <div>
                    <h4 style="margin: 0 0 0.25rem 0; color: #b45309;">Judge Application Pending</h4>
                    <p class="text-muted" style="margin: 0; font-size: 0.9em;">
                        Your application to judge for <strong>${myJudgeReq.institution || 'Tournament Hire'}</strong> has been submitted and is awaiting administrator review. Once approved, you can enter ballots for assigned rounds.
                    </p>
                </div>
            </div>
        </div>
        ` : ''}

        ${!isAdmin && !isJudge && !myJudgeReq && !tournament.data.is_closed ? `
        <div class="card" style="border: 1px dashed var(--primary); background: rgba(79, 70, 229, 0.04); margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
                <h4 style="margin: 0 0 0.25rem 0; color: var(--primary);">Want to judge at this tournament?</h4>
                <p class="text-muted" style="margin: 0; font-size: 0.9em;">Volunteer or apply as a hired/school judge to hear rounds and enter debate ballots.</p>
            </div>
            <button class="btn btn-primary" onclick="promptJudgeRequest()">Volunteer / Apply as Judge</button>
        </div>
        ` : ''}

        ${isAdmin && judgeRequestKeys.length > 0 ? `
        <div class="card" style="border: 1px solid #f59e0b; background: #fffdf5; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="color: #b45309; margin: 0;">⏳ Pending Judge Applications</h3>
                <span style="background: #fef3c7; color: #b45309; padding: 0.2rem 0.6rem; border-radius: 20px; font-weight: 600; font-size: 0.85rem;">${judgeRequestKeys.length} Pending</span>
            </div>
            <p class="text-muted" style="margin-top: 0;">The following debaters/coaches have volunteered or applied to judge debates for this tournament:</p>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Applicant</th>
                        <th>Email</th>
                        <th>Institution</th>
                        <th>Paradigm / Philosophy</th>
                        <th>Requested At</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${judgeRequestKeys.map(email => {
                        const req = judgeRequests[email] || {};
                        const formattedDate = req.requested_at ? new Date(req.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                        const paradigmSnippet = req.paradigm ? (req.paradigm.length > 40 ? req.paradigm.substring(0, 40) + '...' : req.paradigm) : '<span class="text-muted">—</span>';
                        return `
                            <tr>
                                <td><strong>${req.name || '—'}</strong></td>
                                <td style="font-family: monospace;">${email}</td>
                                <td><span style="font-weight: 600; color: var(--primary);">${req.institution || 'Tournament Hire'}</span></td>
                                <td>${paradigmSnippet}</td>
                                <td class="text-muted" style="font-size: 0.85em;">${formattedDate}</td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button class="btn btn-sm btn-primary" onclick="handleApproveJudgeRequest('${email.replace(/'/g, "\\'")}')">Approve</button>
                                        <button class="btn btn-sm btn-danger" onclick="handleRejectJudgeRequest('${email.replace(/'/g, "\\'")}')">Decline</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3>Judges</h3>
                ${isAdmin && !tournament.data.is_closed ? '<button class="btn btn-primary" onclick="showAddJudgeForm()">+ Add Judge</button>' : ''}
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
                            <th>Email</th>
                            <th>Matches Judged</th>
                            ${isAdmin ? '<th>Actions</th>' : ''}
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
                                <td>${judge.institution || 'Tournament Hire'}</td>
                                <td class="judge-email-cell">
                                    <span class="${judge.email ? 'text-dark' : 'text-muted'}" style="font-size: 0.9em; font-family: monospace;">
                                        ${judge.email || '—'}
                                    </span>
                                </td>
                                <td>${judge.matches_judged.length}</td>
                                ${isAdmin ? `
                                <td>
                                    <button 
                                        class="btn btn-sm btn-danger" 
                                        onclick="deleteJudge(${judge.id})"
                                        ${judge.matches_judged.length > 0 ? 'disabled title="Cannot delete judge with assigned matches"' : ''}
                                    >
                                        Delete
                                    </button>
                                </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        ${isAdmin ? `
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
                <div class="form-group">
                    <label for="judgeEmail">Email Address</label>
                    <input type="email" id="judgeEmail" placeholder="Judge's email for login account">
                </div>
                <div style="display: flex; gap: 1rem;">
                    <button type="submit" class="btn btn-primary">Add Judge</button>
                    <button type="button" class="btn btn-secondary" onclick="hideAddJudgeForm()">Cancel</button>
                </div>
            </form>
        </div>
        ` : ''}
    `;
}

// Show Coaches (Admin Only)
async function showCoaches() {
    activeTab = 'coaches';
    window.location.hash = 'coaches';

    // Add to navigation history
    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    // Update active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.textContent === 'Coaches') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const role = getUserRole();
    const isAdmin = role === 'admin';
    const isCoach = role === 'coach';

    let coaches = {};
    let coachRequests = {};
    try {
        coaches = await tournament.fetchCoaches();
        if (isAdmin) {
            coachRequests = await tournament.fetchCoachRequests();
        }
    } catch (e) {
        coaches = (tournament.data && tournament.data.auth && tournament.data.auth.coaches) || {};
        if (isAdmin) {
            coachRequests = (tournament.data && tournament.data.auth && tournament.data.auth.coach_requests) || {};
        }
    }

    const coachEmails = Object.keys(coaches || {}).sort();
    const requestEmails = Object.keys(coachRequests || {}).sort();

    const myReq = (currentUser && tournament.data && tournament.data.auth && tournament.data.auth.coach_requests)
        ? tournament.data.auth.coach_requests[currentUser.email.toLowerCase()]
        : null;

    tabContent.innerHTML = `
        ${!isAdmin && myReq ? `
        <div class="card" style="border: 1px solid #f59e0b; background: #fffdf5; margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.5rem;">⏳</span>
                <div>
                    <h4 style="margin: 0 0 0.25rem 0; color: #b45309;">Coach Access Request Pending</h4>
                    <p class="text-muted" style="margin: 0; font-size: 0.9em;">
                        Your coaching request for <strong>${myReq.institution}</strong> is awaiting approval by the tournament administrator. Once approved, you can register and manage your school's teams.
                    </p>
                </div>
            </div>
        </div>
        ` : ''}

        ${!isAdmin && !isCoach && !myReq && !tournament.data.is_closed ? `
        <div class="card" style="border: 1px dashed var(--primary); background: rgba(79, 70, 229, 0.04); margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div>
                <h4 style="margin: 0 0 0.25rem 0; color: var(--primary);">Are you a school coach?</h4>
                <p class="text-muted" style="margin: 0; font-size: 0.9em;">Request coaching access to register your school's teams and approve student entries.</p>
            </div>
            <button class="btn btn-primary" onclick="promptCoachRequest()">Request Coach Access</button>
        </div>
        ` : ''}

        ${isAdmin && requestEmails.length > 0 ? `
        <div class="card" style="border: 1px solid #f59e0b; background: #fffdf5; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="color: #b45309; margin: 0;">⏳ Pending Coach Requests</h3>
                <span style="background: #fef3c7; color: #b45309; padding: 0.2rem 0.6rem; border-radius: 20px; font-weight: 600; font-size: 0.85rem;">${requestEmails.length} Pending</span>
            </div>
            <p class="text-muted" style="margin-top: 0;">The following accounts have requested coaching access to register and manage teams for their institutions:</p>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>Applicant</th>
                        <th>Email</th>
                        <th>Requested Institution</th>
                        <th>Requested At</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${requestEmails.map(email => {
                        const req = coachRequests[email] || {};
                        const formattedDate = req.requested_at ? new Date(req.requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                        return `
                            <tr>
                                <td><strong>${req.name || '—'}</strong></td>
                                <td style="font-family: monospace;">${email}</td>
                                <td><span style="font-weight: 600; color: var(--primary);">${req.institution || '—'}</span></td>
                                <td class="text-muted" style="font-size: 0.85em;">${formattedDate}</td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button class="btn btn-sm btn-primary" onclick="handleApproveCoachRequest('${email.replace(/'/g, "\\'")}')">Approve</button>
                                        <button class="btn btn-sm btn-danger" onclick="handleRejectCoachRequest('${email.replace(/'/g, "\\'")}')">Reject</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3>School Coaches</h3>
                ${isAdmin && !tournament.data.is_closed ? '<button class="btn btn-primary" onclick="showAddCoachForm()">+ Add Coach</button>' : ''}
            </div>
            <p class="text-muted">Total Coaches: ${coachEmails.length}</p>
            
            ${coachEmails.length === 0 ? `
                <p class="text-muted" style="text-align: center; padding: 2rem;">
                    No coaches registered yet.${isAdmin ? ' Click "Add Coach" to grant school coaches permission to register and edit their school\'s teams.' : ''}
                </p>
            ` : `
                <table class="standings-table">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Institution</th>
                            ${isAdmin ? '<th>Actions</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${coachEmails.map(email => `
                            <tr>
                                <td>
                                    <a href="#" onclick="showUserProfile('${email.replace(/'/g, "\\'")}', '${email.replace(/'/g, "\\'")}', '${(coaches[email] || '').replace(/'/g, "\\'")}'); return false;" class="team-link">
                                        <strong style="font-family: monospace;">${email}</strong>
                                    </a>
                                </td>
                                <td><span style="font-weight: 600; color: var(--primary);">${coaches[email] || '—'}</span></td>
                                ${isAdmin ? `
                                <td>
                                    <button 
                                        class="btn btn-sm btn-danger" 
                                        onclick="deleteCoach('${email.replace(/'/g, "\\'")}')"
                                    >
                                        Delete
                                    </button>
                                </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>

        <!-- Add Coach Form (hidden by default) -->
        <div id="addCoachForm" class="card hidden" style="margin-top: 1rem;">
            <h4>Add School Coach</h4>
            <form onsubmit="submitAddCoach(event)">
                <div class="form-group">
                    <label for="coachEmail">Coach Email *</label>
                    <input type="email" id="coachEmail" required placeholder="e.g. coach@school.edu">
                </div>
                <div class="form-group">
                    <label for="coachInstitution">Institution *</label>
                    <input type="text" id="coachInstitution" required placeholder="e.g. Dartmouth">
                </div>
                <div style="display: flex; gap: 1rem;">
                    <button type="submit" class="btn btn-primary">Add Coach</button>
                    <button type="button" class="btn btn-secondary" onclick="hideAddCoachForm()">Cancel</button>
                </div>
            </form>
        </div>
    `;
}

// Show Standings
function showStandings() {
    if (!tournament || !tournament.data || !tournament.data.config) {
        tabContent.innerHTML = '<div class="card"><p class="text-muted">No data available yet. Please initialize the tournament.</p></div>';
        return;
    }
    activeTab = 'standings';
    window.location.hash = 'standings';

    // Add to navigation history
    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    // Update active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.textContent === 'Standings') {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const standings = tournament.getStandings(); // Get full standings for initial check

    if (!standings || standings.every(t => t.score === 0)) {
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
window.reportResult = async function (matchId, outcome) {
    try {
        await tournament.reportResult(matchId, outcome);
        // Refresh UI immediately (optimistic)
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
window.submitSpeakerPoint = async function (matchId, index) {
    const inputId = `sp_input_${matchId}_${index}`;
    const input = document.getElementById(inputId);
    const value = parseFloat(input.value);

    if (isNaN(value) || value < 0 || value > 30) {
        showNotification('Invalid Input', 'Speaker points must be between 0 and 30.');
        return;
    }

    const match = tournament.data.matches.find(m => m.match_id === parseInt(matchId));
    if (!match) return;

    const currentSP = match.speaker_points || { affPoints: [null, null], negPoints: [null, null] };
    const newSP = {
        affPoints: [...currentSP.affPoints],
        negPoints: [...currentSP.negPoints]
    };

    if (index === 'aff_0') newSP.affPoints[0] = value;
    if (index === 'aff_1') newSP.affPoints[1] = value;
    if (index === 'neg_0') newSP.negPoints[0] = value;
    if (index === 'neg_1') newSP.negPoints[1] = value;

    try {
        await tournament.updateResult(parseInt(matchId), match.result, newSP);
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
        async () => {
            try {
                await tournament.updateResult(matchId, newOutcome);
                const activeRound = parseInt(activeTab.replace('round', ''));
                showRound(activeRound);
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
        async () => {
            try {
                await tournament.updateResult(matchId, null);
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
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 2rem;">
                <div>
                    <h3 style="margin:0">Team Details: ${team.name}</h3>
                    <p class="text-muted" style="margin-top:0.5rem">ID: ${team.id} | ${team.institution || 'No Institution'}</p>
                </div>
                <button class="btn btn-secondary" onclick="goBack()">${backLabel}</button>
            </div>

            <div class="stats-grid" style="margin-bottom: 2rem;">
                <div class="stat-card">
                    <div class="stat-label">Win/Loss</div>
                    <div class="stat-value">${team.wins} - ${team.history.length - team.wins}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Score</div>
                    <div class="stat-value">${team.score.toFixed(1)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Buchholz</div>
                    <div class="stat-value">${team.buchholz.toFixed(1)}</div>
                </div>
            </div>

            <div style="margin-top: 2rem;">
                <h4 style="margin-bottom: 1rem;">Members</h4>
                <div class="members-list" style="display:grid; grid-template-columns: 1fr 1fr; gap:1.5rem">
                    ${team.members.map((m, idx) => `
                        <div class="member-profile-card" style="padding: 1.5rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; display:flex; flex-direction:column; gap:0.5rem">
                            <span style="font-weight: 600; font-size: 1.1em">${getMemberName(m)}</span>
                            ${m.email ? `
                                <span class="text-muted text-sm">${m.email}</span>
                                <button class="btn btn-sm btn-secondary" style="margin-top:0.5rem" onclick="showUserProfile('${m.email}', '${getMemberName(m)}', '${team.institution}')">View Participant Profile</button>
                            ` : '<span class="text-xs text-muted">No email registered</span>'}
                        </div>
                    `).join('')}
                </div>
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
    console.log('goBack called. Current history:', JSON.stringify(navigationHistory));
    console.log('Current activeTab:', activeTab);

    // Remove current view from history
    navigationHistory.pop();

    // Find the previous non-team view or a different team view
    let previousView = null;
    while (navigationHistory.length > 0) {
        const historyItem = navigationHistory.pop();
        console.log('Checking history item:', historyItem);
        if (historyItem !== activeTab) {
            previousView = historyItem;
            break;
        }
    }

    console.log('Found previousView:', previousView);

    // Navigate to previous view or default to standings
    if (previousView) {
        if (previousView.startsWith('round')) {
            const roundNum = parseInt(previousView.replace('round', ''));
            showRound(roundNum);
        } else if (previousView === 'standings') {
            showStandings();
        } else if (previousView === 'entries') {
            showEntries();
        } else if (previousView === 'judges') {
            showJudges();
        } else if (previousView.startsWith('team')) {
            const teamId = parseInt(previousView.replace('team', ''));
            showTeamDetails(teamId);
        } else if (previousView.startsWith('judge')) {
            const judgeId = parseInt(previousView.replace('judge', ''));
            showJudgeDetails(judgeId);
        }
    } else {
        console.log('No previous view found, defaulting to standings');
        showStandings();
    }
};

// Note: Judge Management Functions are defined near the end of the file

window.deleteJudge = function (judgeId) {
    const judge = tournament.judges.find(j => j.id === judgeId);
    if (!judge) return;

    showConfirm(
        'Delete Judge',
        `Are you sure you want to delete judge "${judge.name}"?`,
        async () => {
            try {
                await tournament.removeJudge(judgeId);
                showJudges();
                showNotification('Success', `Judge "${judge.name}" deleted successfully!`);
            } catch (error) {
                showNotification('Error', error.message);
            }
        }
    );
};



// Judge Assignment Functions
async function assignJudge(matchId) {
    const selectElement = document.getElementById(`judge_select_${matchId}`);
    if (!selectElement) return;

    const judgeId = parseInt(selectElement.value);
    if (!judgeId) {
        showNotification('Error', 'Please select a judge');
        return;
    }

    showLoading('Assigning judge...');
    try {
        await tournament.assignJudgeToMatch(matchId, judgeId);
        // Refresh the current round view
        const match = tournament.data.matches.find(m => m.match_id === matchId);
        if (match) {
            showRound(match.round_num);
        }
        const judge = tournament.judges.find(j => j.id === judgeId);
        showNotification('Success', `Judge "${judge.name}" assigned to Match ${matchId}`);
    } catch (error) {
        showNotification('Error', error.message);
    } finally {
        hideLoading();
    }
}

async function unassignJudge(matchId) {
    showLoading('Unassigning judge...');
    try {
        await tournament.unassignJudgeFromMatch(matchId);
        // Refresh the current round view
        const match = tournament.data.matches.find(m => m.match_id === matchId);
        if (match) {
            showRound(match.round_num);
        }
        showNotification('Success', `Judge unassigned from Match ${matchId}`);
    } catch (error) {
        showNotification('Error', error.message);
    } finally {
        hideLoading();
    }
}

async function changeJudgeAssignment(matchId) {
    // Unassign current judge and refresh to show dropdown
    await unassignJudge(matchId);
};

// Hub Navigation Logic
if (hubBtn) {
    hubBtn.addEventListener('click', () => {
        showHub();
    });
}

newTournamentHubBtn.addEventListener('click', () => {
    const newId = prompt("Enter a unique ID for the new tournament (no spaces, e.g., 'spring-2026'):");
    if (newId && newId.trim()) {
        const cleanId = newId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        tournament.setTournamentId(cleanId);
        tournament.data = null; // Clear existing data for fresh setup
        showSetup();
        fetchTournaments(); // Refresh hub in background
    }
});

async function fetchTournaments() {
    let cloudTournaments = [];
    let localTournaments = getLocalTournaments();

    // Only query backend if explicitly configured or running on a local server
    const effectiveBackendUrl = tournament.getEffectiveBackendUrl ? tournament.getEffectiveBackendUrl() : tournament.backendUrl;

    if (effectiveBackendUrl) {
        // Try to fetch from cloud/backend first
        try {
            const url = `${effectiveBackendUrl}/api/tournaments`;
            const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
            if (response.ok) {
                const result = await response.json().catch(() => null);
                cloudTournaments = (result && result.tournaments) || [];
            }
        } catch (e) {
            console.warn("Could not fetch tournaments from backend:", e.message);
        }
    }

    // Merge lists. Determine unique IDs first to prevent duplicates.
    const allTournaments = [];
    const seenIds = new Set();

    // Add cloud tournaments (now objects: {id, admins})
    for (const t of cloudTournaments) {
        // Handle backwards compatibility if it returns strings
        const tId = typeof t === 'string' ? t : t.id;
        if (!seenIds.has(tId)) {
            seenIds.add(tId);
            allTournaments.push(typeof t === 'string' ? { id: t, admins: [] } : t);
        }
    }

    // Add local tournaments (strings) as fallback
    for (const tId of localTournaments) {
        if (!seenIds.has(tId)) {
            seenIds.add(tId);
            // We can try to peek at local storage to find the admin
            let admins = [];
            try {
                const raw = localStorage.getItem(`tournamentData_${tId}`);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed.auth && parsed.auth.admins) {
                        admins = parsed.auth.admins;
                    }
                }
            } catch (e) { }
            allTournaments.push({ id: tId, admins: admins });
        }
    }

    let registeredUsers = [];
    if (isSuperAdmin()) {
        try {
            registeredUsers = await tournament.getRegisteredUsers();
        } catch (e) {
            console.warn("Could not fetch registered users:", e);
        }
    }

    if (tournamentHubGrid) {
        renderHubGrid(allTournaments, registeredUsers);
    }
}

function getLocalTournaments() {
    const ids = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('tournamentData_')) {
            const id = key.replace('tournamentData_', '');
            if (id && id !== 'undefined' && id !== 'null') {
                ids.push(id);
            }
        }
    }
    // Also include the legacy 'tournamentData' if it exists and isn't already found
    if (localStorage.getItem('tournamentData') && !ids.includes('default')) {
        ids.push('default');
    }
    return ids;
}

function renderHubGrid(tournaments, registeredUsers = []) {
    if (!tournamentHubGrid) return;
    tournamentHubGrid.innerHTML = '';

    if (!tournaments || tournaments.length === 0) {
        tournamentHubGrid.innerHTML = '<div class="loading-placeholder">No tournaments found. Create one to get started!</div>';
        return;
    }

    // Sort by id
    tournaments.sort((a, b) => {
        const idA = a.id || '';
        const idB = b.id || '';
        return idA.localeCompare(idB);
    });

    const pending = tournaments.filter(t => t.status === 'pending');
    const active = tournaments.filter(t => !t.is_closed && t.status !== 'pending');
    const closed = tournaments.filter(t => t.is_closed && t.status !== 'pending');

    const renderPendingUsersSection = (users) => {
        if (!users || users.length === 0 || !isSuperAdmin()) return '';
        const pendingUsers = users.filter(u => u.status === 'pending');
        if (pendingUsers.length === 0) return '';

        return `
            <div class="hub-category">
                <h2 style="margin: 2rem 0 1rem 0; padding-bottom: 0.5rem; border-bottom: 2px solid #3b82f6; display: flex; justify-content: space-between; align-items: center; color: #1d4ed8;">
                    👥 User Registration Requests (Testing Mode)
                    <span style="font-size: 0.8rem; background: #dbeafe; color: #1d4ed8; padding: 0.2rem 0.6rem; border-radius: 20px;">${pendingUsers.length}</span>
                </h2>
                <div class="tournament-grid">
                    ${pendingUsers.map(u => `
                        <div class="tournament-card" style="border-color: #3b82f6; background: #eff6ff;">
                            <div class="tournament-id" style="color: #1d4ed8;">${u.email}</div>
                            <h3>${u.name || u.email.split('@')[0]}</h3>
                            <div class="text-muted" style="font-size: 0.85em; margin-top: 0.25rem;">
                                ${u.institution ? `🏫 ${u.institution}` : 'Platform user'}
                            </div>
                            <div style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                                <button class="btn btn-sm btn-primary" onclick="handleApproveUser('${u.email}')">Approve User</button>
                                <button class="btn btn-sm btn-danger" onclick="handleRejectUser('${u.email}')">Reject</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };

    const renderPendingSection = (list) => {
        if (list.length === 0) return '';
        const canApprove = isSuperAdmin();
        return `
            <div class="hub-category">
                <h2 style="margin: 2rem 0 1rem 0; padding-bottom: 0.5rem; border-bottom: 2px solid #f59e0b; display: flex; justify-content: space-between; align-items: center; color: #b45309;">
                    ⏳ Pending Approval Requests
                    <span style="font-size: 0.8rem; background: #fef3c7; color: #b45309; padding: 0.2rem 0.6rem; border-radius: 20px;">${list.length}</span>
                </h2>
                <div class="tournament-grid">
                    ${list.map(t => {
            const tId = t.id;
            const reqDisplay = t.requested_by ? `<div class="text-muted" style="font-size: 0.85em; margin-top: 0.25rem;">👤 Requested by: ${t.requested_by}</div>` : '';
            const activeStyle = (tId === tournament.tournamentId && tournament.data)
                ? 'border-color: #f59e0b; background: rgba(245, 158, 11, 0.08);'
                : 'border-color: #f59e0b; background: #fffdf5;';

            return `
                            <div class="tournament-card" style="${activeStyle}" onclick="handleManageTournament('${tId}')">
                                <div class="tournament-id" style="color: #b45309;">${tId}</div>
                                <h3>${tId.replace(/-/g, ' ').toUpperCase()}</h3>
                                ${reqDisplay}
                                <div style="margin-top: 0.5rem;">
                                    <span style="background:#f59e0b; color:white; padding:0.15rem 0.45rem; border-radius:3px; font-size:0.7rem; font-weight:600;">PENDING APPROVAL</span>
                                </div>
                                <div class="tournament-meta" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: space-between; align-items: center;">
                                    <span>Review Details →</span>
                                    ${canApprove ? `
                                        <div style="display: flex; gap: 0.35rem;" onclick="event.stopPropagation();">
                                            <button class="btn btn-sm btn-primary" onclick="handleApproveTournament('${tId}')">Approve</button>
                                            <button class="btn btn-sm btn-danger" onclick="handleRejectTournament('${tId}')">Reject</button>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    };

    const renderSection = (title, list, isOpen = true) => {
        if (list.length === 0) return '';

        const sectionId = `hub-section-${title.toLowerCase()}`;
        return `
            <div class="hub-category">
                <h2 style="margin: 2rem 0 1rem 0; padding-bottom: 0.5rem; border-bottom: 2px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    ${title}
                    <span style="font-size: 0.8rem; background: #eee; padding: 0.2rem 0.6rem; border-radius: 20px;">${list.length}</span>
                </h2>
                <div class="tournament-grid">
                    ${list.map(t => {
            const tId = t.id;
            const admins = t.admins || [];
            const adminDisplay = admins.length > 0
                ? `<div class="text-muted" style="font-size: 0.85em; margin-top: 0.25rem;">👤 Admin: ${admins[0]}</div>`
                : '';
            const activeStyle = (tId === tournament.tournamentId && tournament.data)
                ? 'border-color: var(--primary); background: rgba(79, 70, 229, 0.05);'
                : '';

            return `
                            <div class="tournament-card" style="${activeStyle}" onclick="handleManageTournament('${tId}')">
                                <div class="tournament-id">${tId}</div>
                                <h3>${tId.replace(/-/g, ' ').toUpperCase()}</h3>
                                ${adminDisplay}
                                ${t.is_closed ? '<div style="margin-top: 0.5rem;"><span class="closed-badge" style="background:#6b7280; color:white; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.7rem; text-transform:uppercase; font-weight:600;">Closed</span></div>' : ''}
                                <div class="tournament-meta">
                                    <span>${t.is_closed ? 'View Results' : 'Manage Tournament'} →</span>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    };

    tournamentHubGrid.innerHTML = `
        ${renderPendingUsersSection(registeredUsers)}
        ${renderPendingSection(pending)}
        ${renderSection('Active Tournaments', active)}
        ${renderSection('Closed Archive', closed)}
    `;
}

window.handleApproveUser = async (email) => {
    showLoading(`Approving user ${email}...`);
    try {
        await tournament.approveUser(email);
        showNotification('Success', `User ${email} has been approved!`);
        await fetchTournaments();
    } catch (e) {
        showNotification('Error', e.message);
    } finally {
        hideLoading();
    }
};

window.handleRejectUser = (email) => {
    showConfirm(
        'Reject User Registration',
        `Are you sure you want to reject user registration for "${email}"?`,
        async () => {
            showLoading(`Rejecting user ${email}...`);
            try {
                await tournament.rejectUser(email);
                showNotification('Success', `User ${email} registration rejected.`);
                await fetchTournaments();
            } catch (e) {
                showNotification('Error', e.message);
            } finally {
                hideLoading();
            }
        }
    );
};

window.handleApproveTournament = async (tId) => {
    showLoading(`Approving tournament ${tId}...`);
    try {
        await tournament.approveTournament(tId);
        showNotification('Success', `Tournament "${tId}" has been approved!`);
        await fetchTournaments();
        if (tournament.tournamentId === tId && tournament.data) {
            tournament.data.status = 'approved';
            updateDashboard();
        }
    } catch (e) {
        showNotification('Error', e.message);
    } finally {
        hideLoading();
    }
};

window.handleRejectTournament = (tId) => {
    showConfirm(
        'Reject Tournament Request',
        `Are you sure you want to reject and remove tournament request "${tId}"?`,
        async () => {
            showLoading(`Rejecting tournament ${tId}...`);
            try {
                await tournament.rejectTournament(tId);
                showNotification('Success', `Tournament "${tId}" request rejected.`);
                await fetchTournaments();
                if (tournament.tournamentId === tId) {
                    showHub();
                }
            } catch (e) {
                showNotification('Error', e.message);
            } finally {
                hideLoading();
            }
        }
    );
};

window.handleManageTournament = async (tId) => {
    showLoading(`Loading ${tId}...`);
    try {
        tournament.setTournamentId(tId);
        await tournament.loadFromStorage();
        await initUI();
    } finally {
        hideLoading();
    }
};


// Handle browser back/forward navigation
window.addEventListener('hashchange', () => {
    if (tournament.data) {
        updateDashboard();
    }
});

// Initialize on load
(async () => {
    try {
        await tournament.ready;
        if (tournament.backendUrl) {
            await fetchTournaments();
        }
    } catch (e) {
        console.error('Initial load failed:', e);
    }
    initUI();
})();


// Judge Management Functions (moved outside showTeamDetails)
window.showAddJudgeForm = function () {
    const form = document.getElementById('addJudgeForm');
    if (form) {
        form.classList.remove('hidden');
        document.getElementById('judgeName').focus();
    }
};

window.hideAddJudgeForm = function () {
    const form = document.getElementById('addJudgeForm');
    if (form) {
        form.classList.add('hidden');
        // Clear form fields
        document.getElementById('judgeName').value = '';
        document.getElementById('judgeInstitution').value = '';
    }
};

window.submitAddJudge = async function (event) {
    event.preventDefault();

    const name = document.getElementById('judgeName').value.trim();
    const institution = document.getElementById('judgeInstitution').value.trim();
    const emailInput = document.getElementById('judgeEmail');
    const email = emailInput ? emailInput.value.trim() : '';

    try {
        await tournament.addJudge(name, institution, email);
        hideAddJudgeForm(); // Hide form after successful add
        showJudges(); // Refresh the view
        showNotification('Success', `Judge "${name}" added successfully!`);
    } catch (error) {
        showNotification('Error', error.message);
    }
};

window.deleteJudge = function (judgeId) {
    const judge = tournament.judges.find(j => j.id === judgeId);
    if (!judge) return;

    showConfirm(
        'Delete Judge',
        `Are you sure you want to delete judge "${judge.name}"?`,
        async () => {
            try {
                await tournament.removeJudge(judgeId);
                showJudges(); // Refresh the view
                showNotification('Success', `Judge "${judge.name}" deleted successfully!`);
            } catch (error) {
                showNotification('Error', error.message);
            }
        }
    );
};

// Coach Management Functions
window.showAddCoachForm = function () {
    const form = document.getElementById('addCoachForm');
    if (form) {
        form.classList.remove('hidden');
        document.getElementById('coachEmail').focus();
    }
};

window.hideAddCoachForm = function () {
    const form = document.getElementById('addCoachForm');
    if (form) {
        form.classList.add('hidden');
        document.getElementById('coachEmail').value = '';
        document.getElementById('coachInstitution').value = '';
    }
};

window.submitAddCoach = async function (event) {
    event.preventDefault();

    const email = document.getElementById('coachEmail').value.trim();
    const institution = document.getElementById('coachInstitution').value.trim();

    try {
        await tournament.addCoach(email, institution);
        hideAddCoachForm();
        await showCoaches();
        showNotification('Success', `Coach "${email}" added for ${institution}!`);
    } catch (error) {
        showNotification('Error', error.message);
    }
};

window.deleteCoach = function (email) {
    showConfirm(
        'Delete Coach',
        `Are you sure you want to remove coach "${email}"?`,
        async () => {
            try {
                await tournament.removeCoach(email);
                await showCoaches();
                showNotification('Success', `Coach "${email}" removed successfully!`);
            } catch (error) {
                showNotification('Error', error.message);
            }
        }
    );
};

window.promptCoachRequest = function () {
    if (!currentUser) {
        showNotification('Login Required', 'Please sign in with Google to request coach access for this tournament.');
        return;
    }
    const inst = prompt("Enter the name of your school or institution (e.g., 'Harvard', 'Dartmouth'):");
    if (!inst || !inst.trim()) return;

    showLoading("Submitting coach request...");
    tournament.requestCoachAccess(inst.trim())
        .then(res => {
            showNotification("Success", res.message || "Coach request submitted!");
            updateDashboard();
        })
        .catch(err => {
            showNotification("Error", err.message);
        })
        .finally(() => {
            hideLoading();
        });
};

window.handleApproveCoachRequest = async function (email) {
    showLoading(`Approving coach ${email}...`);
    try {
        const res = await tournament.approveCoachRequest(email);
        showNotification("Success", res.message || `Coach ${email} approved!`);
        await showCoaches();
    } catch (e) {
        showNotification("Error", e.message);
    } finally {
        hideLoading();
    }
};

window.handleRejectCoachRequest = function (email) {
    showConfirm(
        'Reject Coach Request',
        `Are you sure you want to reject the coaching request for "${email}"?`,
        async () => {
            showLoading(`Rejecting coach request...`);
            try {
                const res = await tournament.rejectCoachRequest(email);
                showNotification("Success", res.message || `Request for ${email} rejected.`);
                await showCoaches();
            } catch (e) {
                showNotification("Error", e.message);
            } finally {
                hideLoading();
            }
        }
    );
};

window.promptJudgeRequest = async function () {
    if (!currentUser) {
        showNotification('Login Required', 'Please sign in with Google to volunteer as a judge.');
        return;
    }
    const inst = prompt("Enter your school or affiliation (leave blank for 'Tournament Hire'):", "Tournament Hire");
    if (inst === null) return;

    const paradigm = prompt("Optional: Enter your judging paradigm or philosophy notes (or URL):", "");
    if (paradigm === null) return;

    showLoading("Submitting judge application...");
    try {
        const res = await tournament.requestJudgeAccess((inst || '').trim() || 'Tournament Hire', (paradigm || '').trim());
        showNotification("Success", res.message || "Judge application submitted!");
        updateDashboard();
        await showJudges();
    } catch (err) {
        showNotification("Error", err.message);
    } finally {
        hideLoading();
    }
};

window.handleApproveJudgeRequest = async function (email) {
    showLoading(`Approving judge ${email}...`);
    try {
        const res = await tournament.approveJudgeRequest(email);
        showNotification("Success", res.message || `Judge ${email} approved!`);
        updateDashboard();
        await showJudges();
    } catch (err) {
        showNotification("Error", err.message);
    } finally {
        hideLoading();
    }
};

window.handleRejectJudgeRequest = function (email) {
    showConfirm(
        'Decline Judge Application',
        `Are you sure you want to decline the judge application for "${email}"?`,
        async () => {
            showLoading(`Declining judge application...`);
            try {
                const res = await tournament.rejectJudgeRequest(email);
                showNotification("Success", res.message || "Judge application declined.");
                updateDashboard();
                await showJudges();
            } catch (err) {
                showNotification("Error", err.message);
            } finally {
                hideLoading();
            }
        }
    );
};

window.toggleParadigmEdit = function () {
    const display = document.getElementById('paradigmDisplay');
    const edit = document.getElementById('paradigmEdit');
    if (display && edit) {
        display.classList.toggle('hidden');
        edit.classList.toggle('hidden');
    }
};

window.saveParadigm = async function () {
    const textarea = document.getElementById('paradigmTextarea');
    const newParadigm = textarea.value.trim();

    showLoading("Saving paradigm...");
    try {
        await tournament.updateGlobalParadigm(newParadigm);

        // Update display
        const display = document.getElementById('paradigmDisplay');
        display.innerHTML = newParadigm || '<em class="text-muted">No paradigm provided yet.</em>';

        toggleParadigmEdit();
        showNotification("Success", "Global paradigm updated!");
    } catch (e) {
        showNotification("Error", e.message);
    } finally {
        hideLoading();
    }
};

window.showJudgeDetails = function (judgeId) {
    const judge = tournament.judges.find(j => j.id === judgeId);
    if (!judge) {
        showNotification('Error', 'Judge not found');
        return;
    }
    showUserProfile(judge.email, judge.name, judge.institution, judgeId);
};

window.showUserProfile = async function (email, displayName, institution, judgeId = null) {
    activeTab = judgeId ? `judge${judgeId}` : `profile_${email}`;
    window.location.hash = activeTab;

    if (navigationHistory[navigationHistory.length - 1] !== activeTab) {
        navigationHistory.push(activeTab);
    }

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    let globalProfile = { paradigm: "", history: [], aliases: [] };
    if (email) {
        globalProfile = await tournament.fetchJudgeProfile(email);
    }
    const globalParadigm = globalProfile.paradigm || "";
    const allHistory = globalProfile.history || [];
    const aliases = globalProfile.aliases || [];

    const judgingHistory = allHistory.filter(h => h.type !== 'participation');
    const debatingHistory = allHistory.filter(h => h.type === 'participation');

    const canEdit = currentUser && currentUser.email && email &&
        currentUser.email.toLowerCase() === email.toLowerCase();

    // Local matches for this tournament if looking at a judge
    const judgedMatches = judgeId ? tournament.data.matches.filter(m => m.judge_id === judgeId) : [];

    tabContent.innerHTML = `
        <div class="card">
            <button class="btn btn-secondary" onclick="goBack()" style="margin-bottom: 1rem;">← Back</button>
            
            <h3>User Profile: ${displayName}</h3>
            ${email ? `<p class="text-muted" style="margin-top:-0.5rem">${email}</p>` : ''}
            
            <div class="stats-grid" style="margin-top: 1.5rem; margin-bottom: 2rem;">
                <div class="stat-card">
                    <div class="stat-label">Institution</div>
                    <div class="stat-value">${institution || 'Unknown'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Judging Record</div>
                    <div class="stat-value">${judgingHistory.length} rounds</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Debating Record</div>
                    <div class="stat-value">${debatingHistory.length} rounds</div>
                </div>
            </div>

            <div class="paradigm-section" style="margin-top: 2rem; padding: 1.5rem; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0;">Judge Paradigm</h4>
                    ${canEdit ? `<button class="btn btn-sm" onclick="toggleParadigmEdit()">Edit Paradigm</button>` : ''}
                </div>
                
                <div id="paradigmDisplay" style="white-space: pre-wrap; font-size: 0.95em; line-height: 1.6; color: #374151;">
                    ${globalParadigm || '<em class="text-muted">No paradigm provided yet.</em>'}
                </div>

                ${canEdit ? `
                <div id="paradigmEdit" class="hidden">
                    <textarea id="paradigmTextarea" class="form-control" style="width: 100%; min-height: 200px; margin-bottom: 1rem; font-family: inherit;">${globalParadigm}</textarea>
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn btn-secondary btn-sm" onclick="toggleParadigmEdit()">Cancel</button>
                        <button class="btn btn-primary btn-sm" onclick="saveParadigm()">Save Paradigm</button>
                    </div>
                </div>
                ` : ''}
            </div>

            ${canEdit ? `
            <div class="alias-section" style="margin-top: 2rem; padding: 1.5rem; border: 1px dashed #cbd5e1; border-radius: 8px;">
                <h4>Linked Email Aliases</h4>
                <p class="text-sm text-muted">Link secondary emails to consolidate your judging and debating history into this primary account.</p>
                <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                    <input type="email" id="aliasEmailInput" class="form-control" placeholder="secondary@email.com" style="flex:1">
                    <button class="btn btn-secondary" onclick="linkSecondaryEmail()">Link Email</button>
                </div>
                ${aliases.length > 0 ? `
                    <ul style="margin-top:1rem; font-size:0.9em;">
                        ${aliases.map(a => `<li>${a}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
            ` : ''}

            ${judgedMatches.length > 0 ? `
                <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Judging History (This Tournament)</h4>
                <table class="standings-table">
                    <thead><tr><th>Round</th><th>Match ID</th><th>Aff Team</th><th>Neg Team</th><th>Decision</th></tr></thead>
                    <tbody>
                        ${judgedMatches.map(match => {
                            const affTeam = tournament.teams.find(t => t.id === match.aff_id);
                            const negTeam = tournament.teams.find(t => t.id === match.neg_id);
                            const roundLabel = match.round_num <= tournament.data.config.num_prelim_rounds
                                ? `Round ${match.round_num}`
                                : getElimRoundLabel(match.round_num - tournament.data.config.num_prelim_rounds, tournament.data.config.num_elim_rounds);
                            return `<tr><td>${roundLabel}</td><td>${match.match_id}</td><td>${affTeam ? affTeam.name : 'Unknown'}</td><td>${negTeam ? negTeam.name : 'Unknown'}</td><td>${match.result === 'A' ? 'Aff' : match.result === 'N' ? 'Neg' : 'Pending'}</td></tr>`;
                        }).join('')}
                    </tbody>
                </table>
            ` : ''}

            ${judgingHistory.length > 0 ? `
                <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Lifetime Judging Record</h4>
                <div style="overflow-x: auto;">
                    <table class="standings-table">
                        <thead><tr><th>Tournament</th><th>Round</th><th>Aff Team</th><th>Neg Team</th><th>Decision</th><th>Date</th></tr></thead>
                        <tbody>
                            ${judgingHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).map(record => `
                                <tr><td>${record.tournament_name || record.tournament_id}</td><td>${record.round_num}</td><td>${record.aff_name}</td><td>${record.neg_name}</td><td>${record.result === 'A' ? 'Aff' : record.result === 'N' ? 'Neg' : record.result}</td><td>${record.date || 'N/A'}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            ${debatingHistory.length > 0 ? `
                <h4 style="margin-top: 2rem; margin-bottom: 1rem;">Lifetime Debating Record</h4>
                <div style="overflow-x: auto;">
                    <table class="standings-table">
                        <thead><tr><th>Tournament</th><th>Round</th><th>My Team</th><th>Opponent</th><th>Side</th><th>Result</th><th>Date</th></tr></thead>
                        <tbody>
                            ${debatingHistory.sort((a, b) => new Date(b.date) - new Date(a.date)).map(record => `
                                <tr style="background: ${record.result === 'Win' ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)'}">
                                    <td>${record.tournament_name || record.tournament_id}</td>
                                    <td>${record.round_num}</td>
                                    <td>${record.team_name}</td>
                                    <td>${record.opponent}</td>
                                    <td>${record.side}</td>
                                    <td style="font-weight:bold; color: ${record.result === 'Win' ? '#16a34a' : '#dc2626'}">${record.result}</td>
                                    <td>${record.date || 'N/A'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}
        </div>
    `;
};




window.assignJudge = async function (matchId) {
    const selectElement = document.getElementById(`judge_select_${matchId}`);
    if (!selectElement) return;

    const val = selectElement.value;
    const judgeId = parseInt(val);

    if (val === "" || isNaN(judgeId)) {
        showNotification('Error', 'Please select a judge from the search results');
        return;
    }

    try {
        await tournament.assignJudgeToMatch(matchId, judgeId);
        const match = tournament.data.matches.find(m => m.match_id === matchId);
        if (match) showRound(match.round_num);
        const judge = tournament.judges.find(j => j.id === judgeId);
        showNotification('Success', `Judge "${judge.name}" assigned to Match ${matchId}`);
    } catch (error) {
        showNotification('Error', error.message);
    }
};
window.linkSecondaryEmail = async function () {
    const input = document.getElementById('aliasEmailInput');
    const email = input.value.trim();
    if (!email) return;

    showLoading(`Linking ${email}...`);
    try {
        const backendUrl = tournament.getEffectiveBackendUrl ? tournament.getEffectiveBackendUrl() : (tournament.backendUrl || '');
        const response = await fetch(`${backendUrl}/api/user/link_email`, {
            method: 'POST',
            headers: tournament.getAuthHeaders(),
            body: JSON.stringify({ secondary_email: email })
        });

        if (response.ok) {
            showNotification('Success', `Successfully linked ${email}!`);
            // Refresh profile view
            const data = await response.json();
            const prof = data.profile;
            showUserProfile(currentUser.email, currentUser.name, null); 
        } else {
            const err = await response.json();
            showNotification('Error', err.error || 'Failed to link email');
        }
    } catch (e) {
        showNotification('Error', 'Network error linking email');
    } finally {
        hideLoading();
    }
};

// Team Modal Logic
window.showRegisterTeamForm = function (teamId = null) {
    if (tournament.data && (tournament.data.is_started || (tournament.data.matches && tournament.data.matches.length > 0))) {
        showNotification('Registration Closed', 'Team registration is closed because the tournament has already started.');
        return;
    }
    const role = getUserRole();
    if (!currentUser && role !== 'admin') {
        showNotification('Login Required', 'Please sign in with Google to register a team.');
        return;
    }

    teamModalForm.reset();
    teamIdInput.value = teamId !== null ? teamId : '';

    const subtitleEl = document.getElementById('teamModalSubtitle');
    const hintEl = document.getElementById('teamInstitutionHint');
    const datalist = document.getElementById('approvedInstitutionsList');
    const submitBtn = teamModalForm.querySelector('button[type="submit"]');

    // Populate approved institutions datalist
    const approvedCoaches = (tournament.data && tournament.data.auth && tournament.data.auth.coaches) || {};
    const approvedInstitutions = Array.from(new Set(Object.values(approvedCoaches))).sort();
    if (datalist) {
        datalist.innerHTML = approvedInstitutions.map(inst => `<option value="${inst}">`).join('');
    }

    if (role === 'participant') {
        // Student self-registration under an approved coach
        teamModalTitle.textContent = 'Register Team (Requires Coach Approval)';
        if (subtitleEl) {
            subtitleEl.textContent = 'Select an institution with an approved coach. Your coach will review and approve your entry.';
            subtitleEl.style.display = 'block';
        }
        if (hintEl) {
            hintEl.textContent = approvedInstitutions.length > 0 
                ? `Approved coaches available for: ${approvedInstitutions.join(', ')}` 
                : 'No approved school coaches yet. An institutional coach must be registered before student teams can self-register.';
            hintEl.style.display = 'block';
        }
        if (submitBtn) submitBtn.textContent = 'Submit for Coach Approval';

        teamInstitutionInput.readOnly = false;
        teamInstitutionInput.style.backgroundColor = '';

        // Pre-fill Member 1 with logged in student info
        if (currentUser) {
            member1NameInput.value = currentUser.name || '';
            member1EmailInput.value = currentUser.email || '';
        }
    } else if (role === 'coach') {
        teamModalTitle.textContent = teamId !== null ? 'Edit Team' : 'Register New Team';
        if (subtitleEl) subtitleEl.style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';
        if (submitBtn) submitBtn.textContent = teamId !== null ? 'Update Team' : 'Save Team';

        const coachInst = tournament.data.auth.coaches[currentUser.email.toLowerCase()];
        teamInstitutionInput.value = coachInst;
        teamInstitutionInput.readOnly = true;
        teamInstitutionInput.style.backgroundColor = '#f3f4f6';
    } else {
        // Admin
        teamModalTitle.textContent = teamId !== null ? 'Edit Team' : 'Register New Team';
        if (subtitleEl) subtitleEl.style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';
        if (submitBtn) submitBtn.textContent = teamId !== null ? 'Update Team' : 'Save Team';

        teamInstitutionInput.readOnly = false;
        teamInstitutionInput.style.backgroundColor = '';
    }

    if (teamId !== null) {
        const team = tournament.teams.find(t => t.id === teamId);
        if (team) {
            teamNameInput.value = team.name;
            teamInstitutionInput.value = team.institution;
            if (team.members[0]) {
                member1NameInput.value = typeof team.members[0] === 'string' ? team.members[0] : team.members[0].name;
                member1EmailInput.value = team.members[0].email || '';
            }
            if (team.members[1]) {
                member2NameInput.value = typeof team.members[1] === 'string' ? team.members[1] : team.members[1].name;
                member2EmailInput.value = team.members[1].email || '';
            }
        }
    }

    teamModal.classList.remove('hidden');
};

closeTeamModalBtn.onclick = () => teamModal.classList.add('hidden');

teamModalForm.onsubmit = async (e) => {
    e.preventDefault();
    const role = getUserRole();
    const teamId = teamIdInput.value ? parseInt(teamIdInput.value) : null;
    
    const teamData = {
        id: teamId,
        name: teamNameInput.value.trim(),
        institution: teamInstitutionInput.value.trim(),
        members: [
            { name: member1NameInput.value.trim(), email: member1EmailInput.value.trim().toLowerCase() },
            { name: member2NameInput.value.trim(), email: member2EmailInput.value.trim().toLowerCase() }
        ]
    };

    if (role === 'participant') {
        showLoading('Submitting team for coach verification...');
        try {
            const result = await tournament.submitTeamRequest(teamData);
            teamModal.classList.add('hidden');
            showNotification('Success', result.message || 'Team registration submitted to your coach!');
            await tournament.loadFromStorage();
            initUI();
        } catch (error) {
            showNotification('Error', error.message);
        } finally {
            hideLoading();
        }
        return;
    }

    showLoading('Saving team...');
    try {
        const backendUrl = tournament.getEffectiveBackendUrl ? tournament.getEffectiveBackendUrl() : (tournament.backendUrl || '');
        const response = await fetch(`${backendUrl}/api/t/${tournament.tournamentId}/register_team`, {
            method: 'POST',
            headers: tournament.getAuthHeaders(),
            body: JSON.stringify(teamData)
        });

        if (response.ok) {
            teamModal.classList.add('hidden');
            showNotification('Success', 'Team registered successfully!');
            await tournament.loadFromStorage();
            initUI();
        } else {
            const err = await response.json();
            showNotification('Error', err.error || 'Failed to register team');
        }
    } catch (error) {
        showNotification('Error', 'Network error registering team');
    } finally {
        hideLoading();
    }
};

window.handleApproveTeamRequest = async function(requestId) {
    showLoading('Approving team registration...');
    try {
        const res = await tournament.approveTeamRequest(requestId);
        showNotification('Success', res.message || 'Team registration approved!');
        await tournament.loadFromStorage();
        showEntries();
    } catch (e) {
        showNotification('Error', e.message);
    } finally {
        hideLoading();
    }
};

window.handleRejectTeamRequest = function(requestId) {
    showConfirm(
        'Reject Team Registration',
        'Are you sure you want to decline this student team registration request?',
        async () => {
            showLoading('Declining team registration...');
            try {
                const res = await tournament.rejectTeamRequest(requestId);
                showNotification('Success', res.message || 'Team registration request declined.');
                await tournament.loadFromStorage();
                showEntries();
            } catch (e) {
                showNotification('Error', e.message);
            } finally {
                hideLoading();
            }
        }
    );
};

window.unassignJudge = async function (matchId) {
    try {
        await tournament.unassignJudgeFromMatch(matchId);
        const match = tournament.data.matches.find(m => m.match_id === matchId);
        if (match) showRound(match.round_num);
        showNotification('Success', `Judge unassigned from Match ${matchId}`);
    } catch (error) {
        showNotification('Error', error.message);
    }
};

window.changeJudgeAssignment = function (matchId) {
    // Unassign current judge and refresh to show dropdown
    unassignJudge(matchId);
};

// Judge Autocomplete Functions
window.filterJudges = function (input, matchId) {
    const filter = input.value.toLowerCase();
    const resultsDiv = document.getElementById(`judge_results_${matchId}`);
    const hiddenInput = document.getElementById(`judge_select_${matchId}`);

    // Clear previous selection if user is typing
    if (hiddenInput.value && input.value !== input.getAttribute('data-selected-name')) {
        hiddenInput.value = '';
    }

    // Filter judges
    const filteredJudges = tournament.judges.filter(judge =>
        judge.name.toLowerCase().includes(filter) ||
        judge.institution.toLowerCase().includes(filter)
    );

    renderJudgeResults(filteredJudges, matchId, resultsDiv);
};

window.showAllJudges = function (matchId) {
    const resultsDiv = document.getElementById(`judge_results_${matchId}`);
    renderJudgeResults(tournament.judges, matchId, resultsDiv);
};

function renderJudgeResults(judges, matchId, resultsDiv) {
    resultsDiv.innerHTML = '';

    if (judges.length === 0) {
        resultsDiv.style.display = 'none';
        return;
    }

    judges.forEach(judge => {
        const div = document.createElement('div');
        div.className = 'judge-result-item';
        div.textContent = `${judge.name} (${judge.institution})`;
        div.dataset.judgeId = judge.id;
        div.dataset.judgeName = judge.name;
        div.onclick = function () {
            selectJudge(judge, matchId);
        };
        resultsDiv.appendChild(div);
    });

    resultsDiv.style.display = 'block';

    // Close dropdown when clicking outside
    document.addEventListener('click', function closeDropdown(e) {
        if (!resultsDiv.contains(e.target) && e.target.id !== `judge_search_${matchId}`) {
            resultsDiv.style.display = 'none';
            document.removeEventListener('click', closeDropdown);
        }
    });
}

window.selectJudge = function (judge, matchId) {
    const input = document.getElementById(`judge_search_${matchId}`);
    const hiddenInput = document.getElementById(`judge_select_${matchId}`);
    const resultsDiv = document.getElementById(`judge_results_${matchId}`);

    input.value = judge.name;
    input.setAttribute('data-selected-name', judge.name); // Store name to check against typing
    hiddenInput.value = judge.id;
    resultsDiv.style.display = 'none';
};

window.handleJudgeInputKey = function (event, matchId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const hiddenInput = document.getElementById(`judge_select_${matchId}`);
        const resultsDiv = document.getElementById(`judge_results_${matchId}`);

        // If no judge selected yet, try to select the first visible result
        if (!hiddenInput.value && resultsDiv.style.display !== 'none') {
            const firstResult = resultsDiv.querySelector('.judge-result-item');
            if (firstResult) {
                const judge = {
                    id: parseInt(firstResult.dataset.judgeId),
                    name: firstResult.dataset.judgeName
                };
                selectJudge(judge, matchId);
            }
        }

        // Trigger assignment
        assignJudge(matchId);
    }
};
