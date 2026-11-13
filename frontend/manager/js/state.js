// Shared UI state, DOM references, and core utilities
export const tournament = new TournamentManager();

export const uiState = {
    activeTab: null,
    navigationHistory: [],
    currentUser: null,
    isSuperAdminUser: false,
    onConfirmCallback: null,
};

export const dom = {
    setupSection: document.getElementById('setupSection'),
    dashboardSection: document.getElementById('dashboardSection'),
    setupForm: document.getElementById('setupForm'),
    resetBtn: document.getElementById('resetBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    tournamentInfo: document.getElementById('tournamentInfo'),
    confirmModal: document.getElementById('confirmModal'),
    cancelResetBtn: document.getElementById('cancelResetBtn'),
    confirmResetBtn: document.getElementById('confirmResetBtn'),
    notificationModal: document.getElementById('notificationModal'),
    notificationTitle: document.getElementById('notificationTitle'),
    notificationMessage: document.getElementById('notificationMessage'),
    notificationOkBtn: document.getElementById('notificationOkBtn'),
    mainTabs: document.getElementById('mainTabs'),
    tabContent: document.getElementById('tabContent'),
    hubSection: document.getElementById('hubSection'),
    hubBtn: document.getElementById('hubBtn'),
    newTournamentHubBtn: document.getElementById('newTournamentHubBtn'),
    tournamentHubGrid: document.getElementById('tournamentHubGrid'),
    teamModal: document.getElementById('teamModal'),
    teamModalForm: document.getElementById('teamModalForm'),
    closeTeamModalBtn: document.getElementById('closeTeamModalBtn'),
    teamIdInput: document.getElementById('teamIdInput'),
    teamNameInput: document.getElementById('teamNameInput'),
    teamInstitutionInput: document.getElementById('teamInstitutionInput'),
    member1NameInput: document.getElementById('member1NameInput'),
    member1EmailInput: document.getElementById('member1EmailInput'),
    member2NameInput: document.getElementById('member2NameInput'),
    member2EmailInput: document.getElementById('member2EmailInput'),
    teamModalTitle: document.getElementById('teamModalTitle'),
    syncIndicator: document.getElementById('syncIndicator'),
    toolsDropdownBtn: document.getElementById('toolsDropdownBtn'),
    toolsDropdownMenu: document.getElementById('toolsDropdownMenu'),
    backendConfigBtn: document.getElementById('backendConfigBtn'),
    backendConfigModal: document.getElementById('backendConfigModal'),
    backendUrlInput: document.getElementById('backendUrlInput'),
    saveBackendBtn: document.getElementById('saveBackendBtn'),
    closeBackendBtn: document.getElementById('closeBackendBtn'),
    disconnectBackendBtn: document.getElementById('disconnectBackendBtn'),
    connectionStatus: document.getElementById('connectionStatus'),
    closeTournamentBtnEl: document.getElementById('closeTournamentBtn'),
};

// Cross-module callbacks registered by main.js to avoid circular init issues
export const hooks = {
    fetchTournaments: null,
    updateDashboard: null,
};

export function showLoading(message = 'Syncing with cloud...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    if (overlay && text) {
        text.textContent = message;
        overlay.classList.remove('hidden');
    }
}

export function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

export function setButtonsLoading(selector, loading) {
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

export function getElimRoundLabel(elimRoundNum, totalElimRounds) {
    const remainingRounds = totalElimRounds - elimRoundNum;
    if (remainingRounds === 0) return 'Finals';
    if (remainingRounds === 1) return 'Semifinals';
    if (remainingRounds === 2) return 'Quarterfinals';
    if (remainingRounds === 3) return 'Octofinals';
    if (remainingRounds === 4) return 'Double Octofinals';
    return `Elim Round ${elimRoundNum}`;
}

export function showConfirm(title, message, callback) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    uiState.onConfirmCallback = callback;
    dom.confirmModal.classList.remove('hidden');
}

export function showNotification(title, message) {
    dom.notificationTitle.textContent = title;
    dom.notificationMessage.textContent = message;
    dom.notificationModal.classList.remove('hidden');
}

export function updateConnectionStatus(connected) {
    if (dom.connectionStatus) {
        if (connected) {
            let label = 'Cloud Connected';
            if (tournament.backendUrl) {
                try {
                    const host = new URL(tournament.backendUrl).hostname.replace('.appspot.com', '').replace('.uc.r', '');
                    label = `Cloud (${host})`;
                } catch (e) {
                    label = 'Cloud Connected';
                }
            }
            dom.connectionStatus.innerHTML = `<span class="status-dot online"></span> ${label}`;
            dom.connectionStatus.className = 'status-pill online';
            dom.connectionStatus.title = tournament.backendUrl ? `Connected to ${tournament.backendUrl} (Click to configure)` : 'Click to configure Cloud Backend';
            if (dom.disconnectBackendBtn) {
                dom.disconnectBackendBtn.style.display = 'inline-block';
            }
        } else {
            dom.connectionStatus.innerHTML = `<span class="status-dot local"></span> Local Mode`;
            dom.connectionStatus.className = 'status-pill local';
            dom.connectionStatus.title = 'Running locally in browser storage (Click to configure Cloud Backend)';
            if (dom.disconnectBackendBtn) {
                dom.disconnectBackendBtn.style.display = 'none';
            }
        }
    }
}

export function showSetup() {
    dom.hubSection.classList.add('hidden');
    dom.setupSection.classList.remove('hidden');
    dom.dashboardSection.classList.add('hidden');
    dom.hubBtn.classList.remove('hidden');
    if (dom.setupForm) dom.setupForm.reset();
    const teamData = document.getElementById('teamData');
    if (teamData) teamData.value = '';
}

export function showHub() {
    dom.hubSection.classList.remove('hidden');
    dom.setupSection.classList.add('hidden');
    dom.dashboardSection.classList.add('hidden');
    dom.hubBtn.classList.add('hidden');

    tournament.data = null;
    tournament.tournamentId = null;
    localStorage.removeItem('tournamentId');

    if (window.location.search.includes('tournament_id')) {
        const url = new URL(window.location);
        url.searchParams.delete('tournament_id');
        window.history.replaceState({}, '', url);
    }

    if (hooks.fetchTournaments) hooks.fetchTournaments();
}

export function showDashboard() {
    dom.hubSection.classList.add('hidden');
    dom.setupSection.classList.add('hidden');
    dom.dashboardSection.classList.remove('hidden');
    dom.hubBtn.classList.remove('hidden');
    if (hooks.updateDashboard) hooks.updateDashboard();
}
