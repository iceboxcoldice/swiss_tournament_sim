import {
    tournament, uiState, dom, showLoading, hideLoading, showConfirm, showNotification, showDashboard, showHub
} from './state.js';
import { isSuperAdmin, getUserRole } from './auth.js';
import { showStandings } from './standings.js';

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

export async function fetchTournaments() {
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

export function getLocalTournaments() {
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

export function renderHubGrid(tournaments, registeredUsers = []) {
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


