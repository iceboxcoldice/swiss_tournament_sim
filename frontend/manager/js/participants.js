import {
    tournament, uiState, dom, showLoading, hideLoading, showConfirm, showNotification
} from './state.js';
import { getUserRole } from './auth.js';
import { showRound, updateDashboard } from './rounds.js';
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

// Show Entries (Team List)
export async function showEntries() {
    uiState.activeTab = 'entries';
    window.location.hash = 'entries';

    // Add to navigation history (avoid duplicates of current view)
    if (uiState.navigationHistory[uiState.navigationHistory.length - 1] !== uiState.activeTab) {
        uiState.navigationHistory.push(uiState.activeTab);
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
    const canSelfRegister = uiState.currentUser && role === 'participant' && !tournament.data.is_closed && !isStarted;
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
                        const isOwnInstitution = isCoach && team.institution === tournament.data.auth.coaches[uiState.currentUser.email.toLowerCase()];
                        const rowStyle = isOwnInstitution ? 'background-color: rgba(79, 70, 229, 0.05);' : '';
                        
                        return `
                        <tr style="${rowStyle}">
                            <td>${team.id}</td>
                            <td>
                                <a href="#" onclick="showTeamDetails(${team.id}, 'entries'); return false;" class="team-link"><strong>${team.name}</strong></a>
                                ${team.is_dropped ? '<span class="badge" style="background:#ef4444; color:white; font-size:0.6rem; margin-left:0.5rem; padding:0.1rem 0.3rem; border-radius:3px;">DROPPED</span>' : ''}
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
                                <div style="display:inline-flex; gap:0.3rem">
                                    ${isAdmin || (isCoach && team.institution === tournament.data.auth.coaches[uiState.currentUser.email.toLowerCase()]) ? `
                                        <button class="btn btn-sm btn-secondary" onclick="showRegisterTeamForm(${team.id})">Edit</button>
                                    ` : ''}
                                    ${isAdmin && !tournament.data.is_closed ? `
                                        ${!team.is_dropped 
                                            ? `<button class="btn btn-sm btn-danger" onclick="confirmDropTeam(${team.id})" title="Drop team from tournament">Drop</button>`
                                            : `<button class="btn btn-sm btn-warning" onclick="confirmReinstateTeam(${team.id})" title="Reinstate team">Reinstate</button>`
                                        }
                                    ` : ''}
                                </div>
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
export async function showJudges() {
    uiState.activeTab = 'judges';
    window.location.hash = 'judges';

    // Add to navigation history (avoid duplicates of current view)
    if (uiState.navigationHistory[uiState.navigationHistory.length - 1] !== uiState.activeTab) {
        uiState.navigationHistory.push(uiState.activeTab);
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

    const myJudgeReq = (uiState.currentUser && tournament.data && tournament.data.auth && tournament.data.auth.judge_requests)
        ? tournament.data.auth.judge_requests[uiState.currentUser.email.toLowerCase()]
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
export async function showCoaches() {
    uiState.activeTab = 'coaches';
    window.location.hash = 'coaches';

    // Add to navigation history
    if (uiState.navigationHistory[uiState.navigationHistory.length - 1] !== uiState.activeTab) {
        uiState.navigationHistory.push(uiState.activeTab);
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

    const myReq = (uiState.currentUser && tournament.data && tournament.data.auth && tournament.data.auth.coach_requests)
        ? tournament.data.auth.coach_requests[uiState.currentUser.email.toLowerCase()]
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
    if (!uiState.currentUser) {
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
    if (!uiState.currentUser) {
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

export const showJudgeDetails = window.showJudgeDetails = function (judgeId) {
    const judge = tournament.judges.find(j => j.id === judgeId);
    if (!judge) {
        showNotification('Error', 'Judge not found');
        return;
    }
    showUserProfile(judge.email, judge.name, judge.institution, judgeId);
};

export const showUserProfile = window.showUserProfile = async function (email, displayName, institution, judgeId = null) {
    uiState.activeTab = judgeId ? `judge${judgeId}` : `profile_${email}`;
    window.location.hash = uiState.activeTab;

    if (uiState.navigationHistory[uiState.navigationHistory.length - 1] !== uiState.activeTab) {
        uiState.navigationHistory.push(uiState.activeTab);
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

    const canEdit = uiState.currentUser && uiState.currentUser.email && email &&
        uiState.currentUser.email.toLowerCase() === email.toLowerCase();

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

    const conflict = tournament.checkJudgeConflict ? tournament.checkJudgeConflict(judgeId, matchId) : { hasConflict: false };
    let force = false;
    if (conflict.hasConflict) {
        const proceed = confirm(`⚠️ Tabroom Conflict Detected:\n${conflict.reason}\n\nDo you want to force this assignment anyway?`);
        if (!proceed) return;
        force = true;
    }

    try {
        await tournament.assignJudgeToMatch(matchId, judgeId, force);
        const match = tournament.data.matches.find(m => m.match_id === matchId);
        if (match) showRound(match.round_num);
        const judge = tournament.judges.find(j => j.id === judgeId);
        showNotification('Success', `Judge "${judge.name}" assigned to Match ${matchId}`);
    } catch (error) {
        showNotification('Error', error.message);
    }
};

window.triggerAutoAssignJudges = async function(roundNum) {
    if (!tournament) return;
    showLoading('Auto-assigning unconflicted judges...');
    try {
        const assignments = await tournament.autoAssignJudges(roundNum);
        showRound(roundNum);
        if (assignments && assignments.length > 0) {
            showNotification('Success', `Auto-assigned ${assignments.length} judges without conflicts!`);
        } else {
            showNotification('Info', 'All matches are already assigned or no unconflicted judges were available.');
        }
    } catch (err) {
        showNotification('Error', err.message);
    } finally {
        hideLoading();
    }
};
window.linkSecondaryEmail = async function () {
    const input = document.getElementById('aliasEmailInput');
    const email = input.value.trim();
    if (!email) return;

    showLoading(`Linking ${email}...`);
    try {
        const backendUrl = (tournament.getEffectiveBackendUrl && tournament.getEffectiveBackendUrl()) || tournament.backendUrl || '';
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
            showUserProfile(uiState.currentUser.email, uiState.currentUser.name, null); 
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
    if (!uiState.currentUser && role !== 'admin') {
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
        if (uiState.currentUser) {
            member1NameInput.value = uiState.currentUser.name || '';
            member1EmailInput.value = uiState.currentUser.email || '';
        }
    } else if (role === 'coach') {
        teamModalTitle.textContent = teamId !== null ? 'Edit Team' : 'Register New Team';
        if (subtitleEl) subtitleEl.style.display = 'none';
        if (hintEl) hintEl.style.display = 'none';
        if (submitBtn) submitBtn.textContent = teamId !== null ? 'Update Team' : 'Save Team';

        const coachInst = tournament.data.auth.coaches[uiState.currentUser.email.toLowerCase()];
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
        const backendUrl = (tournament.getEffectiveBackendUrl && tournament.getEffectiveBackendUrl()) || tournament.backendUrl || '';
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

export function renderJudgeResults(judges, matchId, resultsDiv) {
    resultsDiv.innerHTML = '';

    if (judges.length === 0) {
        resultsDiv.style.display = 'none';
        return;
    }

    judges.forEach(judge => {
        const div = document.createElement('div');
        div.className = 'judge-result-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        const conflict = tournament.checkJudgeConflict ? tournament.checkJudgeConflict(judge.id, matchId) : { hasConflict: false };
        let conflictHtml = '';
        if (conflict.hasConflict) {
            conflictHtml = `<span class="badge" style="background:#ef4444; color:white; font-size:0.7rem; padding:1px 5px; border-radius:3px; margin-left:6px;" title="${conflict.reason}">⚠️ CONFLICT</span>`;
        }

        div.innerHTML = `<span>${judge.name} (${judge.institution})</span>${conflictHtml}`;
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

