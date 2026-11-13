import {
    tournament, uiState, dom, hooks, showLoading, hideLoading, showConfirm, showNotification,
    updateConnectionStatus, showSetup, showHub, showDashboard
} from './state.js';
import { checkSuperAdminStatus, updateAuthUI, setAuthRefreshCallback } from './auth.js';
import { fetchTournaments } from './hub.js';
import { updateDashboard, showRound } from './rounds.js';
import { showStandings, showTeamDetails } from './standings.js';
import { showEntries, showJudges, showJudgeDetails } from './participants.js';

const {
    setupSection, dashboardSection, setupForm, resetBtn, exportBtn, importBtn, importFile,
    tournamentInfo, confirmModal, cancelResetBtn, confirmResetBtn, notificationModal,
    notificationTitle, notificationMessage, notificationOkBtn, mainTabs, tabContent,
    hubSection, hubBtn, newTournamentHubBtn, tournamentHubGrid, teamModal, teamModalForm,
    closeTeamModalBtn, teamIdInput, teamNameInput, teamInstitutionInput, member1NameInput,
    member1EmailInput, member2NameInput, member2EmailInput, teamModalTitle, syncIndicator,
    toolsDropdownBtn, toolsDropdownMenu, backendConfigBtn, backendConfigModal, backendUrlInput,
    saveBackendBtn, closeBackendBtn, disconnectBackendBtn, connectionStatus, closeTournamentBtnEl
} = dom;

hooks.fetchTournaments = fetchTournaments;
hooks.updateDashboard = updateDashboard;
setAuthRefreshCallback((syncEvent = false) => {
    if (syncEvent) {
        if (!hubSection.classList.contains('hidden')) {
            fetchTournaments();
        } else {
            updateDashboard();
        }
    } else {
        initUI();
    }
});

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

const existingToken = localStorage.getItem('googleAuthToken');
if (existingToken) {
    uiState.currentUser = parseJwt(existingToken);
    // If token is invalid/expired, clear it
    if (!uiState.currentUser || (uiState.currentUser.exp * 1000) < Date.now()) {
        signOut();
    } else {
        updateAuthUI();
    }
}

// Listen for sync completion to refresh UI if needed
window.addEventListener('tournamentSyncComplete', () => {
    updateDashboard();
});

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


// Setup Form Handler
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const numTeamsInput = parseInt(document.getElementById('numTeams').value);
    const numTeams = isNaN(numTeamsInput) ? 0 : numTeamsInput;
    const numPrelimRounds = parseInt(document.getElementById('numRounds').value);
    const numElimRounds = parseInt(document.getElementById('numElimRounds').value) || 0;
    const pairingSchemeInput = document.getElementById('pairingScheme');
    const pairingScheme = pairingSchemeInput ? pairingSchemeInput.value : 'high-low';
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

    const success = await tournament.init(teamDetails.length, numPrelimRounds, numElimRounds, teamDetails, pairingScheme);

    if (success) {
        // Clear navigation history and hash for fresh start
        uiState.navigationHistory = [];
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


// Tools Dropdown Toggle
if (toolsDropdownBtn && toolsDropdownMenu) {
    toolsDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toolsDropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!toolsDropdownMenu.contains(e.target) && e.target !== toolsDropdownBtn) {
            toolsDropdownMenu.classList.add('hidden');
        }
    });

    toolsDropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            toolsDropdownMenu.classList.add('hidden');
        });
    });
}

if (connectionStatus) {
    connectionStatus.addEventListener('click', () => {
        if (backendConfigBtn) backendConfigBtn.click();
    });
}

console.log('Backend elements:', {
    toolsDropdownBtn,
    toolsDropdownMenu,
    backendConfigBtn,
    backendConfigModal,
    backendUrlInput,
    saveBackendBtn,
    closeBackendBtn,
    disconnectBackendBtn,
    connectionStatus
});

// Initialize backend config
const savedBackendUrl = localStorage.getItem('backendUrl');
if (savedBackendUrl && savedBackendUrl !== 'local') {
    tournament.setBackendUrl(savedBackendUrl);
    updateConnectionStatus(true);
} else if (savedBackendUrl === 'local') {
    tournament.disconnectBackend();
    updateConnectionStatus(false);
} else {
    const autoBackend = tournament.getEffectiveBackendUrl();
    if (autoBackend) {
        tournament.setBackendUrl(autoBackend);
        updateConnectionStatus(true);
    } else {
        tournament.disconnectBackend();
        updateConnectionStatus(false);
    }
}

if (backendConfigBtn) {
    console.log('Attaching click listener to backendConfigBtn');
    backendConfigBtn.addEventListener('click', () => {
        console.log('Cloud button clicked!');
        console.log('Modal before:', backendConfigModal.className);
        backendUrlInput.value = tournament.backendUrl || '';
        const isConnected = !!tournament.backendUrl;
        if (disconnectBackendBtn) {
            disconnectBackendBtn.style.display = isConnected ? 'inline-block' : 'none';
        }
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

if (disconnectBackendBtn) {
    disconnectBackendBtn.addEventListener('click', async () => {
        tournament.disconnectBackend();
        updateConnectionStatus(false);
        backendUrlInput.value = '';
        backendConfigModal.classList.add('hidden');
        showNotification('Switched to Local Mode', 'Disconnected from cloud backend. Now running in Local Mode.');
        await tournament.loadFromStorage();
        initUI();
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
            tournament.disconnectBackend();
            updateConnectionStatus(false);
            backendConfigModal.classList.add('hidden');
            showNotification('Switched to Local Mode', 'Disconnected from cloud backend. Now running in Local Mode.');
            await tournament.loadFromStorage();
            initUI();
        }
    });
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

cancelResetBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    uiState.onConfirmCallback = null;
});

confirmResetBtn.addEventListener('click', () => {
    confirmModal.classList.add('hidden');
    if (uiState.onConfirmCallback) {
        uiState.onConfirmCallback();
        uiState.onConfirmCallback = null;
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
            uiState.navigationHistory = [];
            window.location.hash = '';
            uiState.activeTab = null;

            showDashboard();
        } catch (error) {
            showNotification('Import Error', error.message);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
});


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


