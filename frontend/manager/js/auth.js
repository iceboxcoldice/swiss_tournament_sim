import {
    tournament, uiState, dom, showNotification, showHub
} from './state.js';

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

let refreshAfterAuth = null;
export function setAuthRefreshCallback(fn) { refreshAfterAuth = fn; }

export function isSuperAdmin() {
    if (!uiState.currentUser || !uiState.currentUser.email) return false;
    const email = uiState.currentUser.email.toLowerCase().trim();
    return email === 'coldice@gmail.com' || uiState.isSuperAdminUser;
}

export async function checkSuperAdminStatus() {
    const backendUrl = (tournament.getEffectiveBackendUrl && tournament.getEffectiveBackendUrl()) || tournament.backendUrl || '';
    if (!backendUrl || !uiState.currentUser) {
        uiState.isSuperAdminUser = false;
        return;
    }
    try {
        const res = await fetch(`${backendUrl}/api/user/super_admin_status`, {
            headers: tournament.getAuthHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            uiState.isSuperAdminUser = !!data.is_super_admin;
        }
    } catch (e) {
        console.warn("Could not check super admin status:", e);
    }
}

export function getUserRole() {
    // Local mode always has full access
    if (!tournament.backendUrl) return 'admin';

    if (!uiState.currentUser) return 'public';

    // Super Admin check: Global admin across all tournaments
    if (isSuperAdmin()) return 'admin';

    const authData = tournament?.data?.auth;
    if (!authData) return 'public';

    const userEmail = uiState.currentUser?.email;
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

export function parseJwt(token) {
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

export function updateAuthUI() {
    const signInBtn = document.querySelector('.g_id_signin');
    const userProfile = document.getElementById('user-profile');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');

    if (uiState.currentUser) {
        if (signInBtn) signInBtn.style.display = 'none';
        if (userProfile) {
            userProfile.style.display = 'inline-flex';
            userName.innerText = uiState.currentUser.name || uiState.currentUser.email || 'User';
            if (uiState.currentUser.picture) {
                userAvatar.src = uiState.currentUser.picture;
                userAvatar.style.display = 'inline-block';
            } else {
                userAvatar.style.display = 'none';
            }
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

export async function handleCredentialResponse(response) {
    const token = response.credential;
    localStorage.setItem('googleAuthToken', token);
    uiState.currentUser = parseJwt(token);
    await checkSuperAdminStatus();
    updateAuthUI();
    // Refresh current view to apply role-based access
    if (refreshAfterAuth) refreshAfterAuth();
}
window.handleCredentialResponse = handleCredentialResponse;
window.signOut = signOut;

export function signOut() {
    localStorage.removeItem('googleAuthToken');
    uiState.currentUser = null;
    uiState.isSuperAdminUser = false;
    updateAuthUI();
    if (refreshAfterAuth) refreshAfterAuth();
}

// Check for existing token on load
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


