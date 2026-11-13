import {
    tournament, uiState, dom, showLoading, hideLoading, showConfirm, showNotification,
    setButtonsLoading, getElimRoundLabel
} from './state.js';
import { getUserRole } from './auth.js';
import { showStandings, showTeamDetails } from './standings.js';
import { showEntries, showJudges, showCoaches } from './participants.js';

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

// Update Dashboard
export function updateDashboard() {
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
        const institution = (tournament.data.auth && tournament.data.auth.coaches) ? tournament.data.auth.coaches[uiState.currentUser.email.toLowerCase()] : 'Unknown';
        tournamentInfo.innerHTML += ` • <span style="color:var(--primary); font-weight:600">Coach (${institution})</span>`;
    } else if (role === 'judge') {
        tournamentInfo.innerHTML += ` • <span style="color:var(--primary); font-weight:600">Judge</span>`;
    } else if (uiState.currentUser && role === 'participant') {
        const reqs = (tournament.data.auth && tournament.data.auth.coach_requests) || {};
        const myReq = reqs[uiState.currentUser.email.toLowerCase()];
        const judgeReqs = (tournament.data.auth && tournament.data.auth.judge_requests) || {};
        const myJudgeReq = judgeReqs[uiState.currentUser.email.toLowerCase()];

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
export function renderTabs() {
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
    } else if (uiState.activeTab && uiState.activeTab.startsWith('round')) {
        const roundNum = parseInt(uiState.activeTab.replace('round', ''));
        if (roundNum <= maxPairedRound) {
            showRound(roundNum);
            return;
        }
    } else if (uiState.activeTab === 'entries') {
        showEntries();
        return;
    } else if (uiState.activeTab === 'judges') {
        showJudges();
        return;
    } else if (uiState.activeTab === 'coaches') {
        showCoaches();
        return;
    }

    // Default behavior (initial load or invalid state) - show Entries if nothing else is active
    if (!uiState.activeTab || uiState.activeTab === 'entries') {
        showEntries();
    } else if (uiState.activeTab === 'standings') {
        showStandings();
    } else if (uiState.activeTab === 'judges') {
        showJudges();
    } else if (uiState.activeTab === 'coaches') {
        showCoaches();
    } else if (uiState.activeTab.startsWith('round')) {
        const rNum = parseInt(uiState.activeTab.replace('round', ''));
        if (rNum <= maxPairedRound) {
            showRound(rNum);
        } else {
            showEntries();
        }
    }
}

// Handle New Round Button - Opens configuration modal for Director to choose pairing mode
export function handleNewRound() {
    if (!tournament || !tournament.data || !tournament.data.config) return;
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

    openPairRoundModal(nextRound);
}

// Modal for Director to choose pairing scheme for the round
export function openPairRoundModal(roundNum) {
    const modal = document.getElementById('pairRoundModal');
    const title = document.getElementById('pairRoundModalTitle');
    const desc = document.getElementById('pairRoundModalDesc');
    const schemeGroup = document.getElementById('pairRoundSchemeGroup');
    const select = document.getElementById('roundPairingSchemeSelect');
    const hint = document.getElementById('roundPairingSchemeHint');
    const confirmBtn = document.getElementById('confirmPairRoundBtn');
    const cancelBtn = document.getElementById('cancelPairRoundBtn');

    if (!modal) {
        // Fallback if modal not in DOM
        tournament.pairRound(roundNum)
            .then(() => { updateDashboard(); showRound(roundNum); })
            .catch(err => showNotification('Error', err.message));
        return;
    }

    const { num_prelim_rounds, num_elim_rounds } = tournament.data.config;
    const isPrelim = roundNum <= num_prelim_rounds;
    const defaultScheme = (tournament.data.config && tournament.data.config.pairing_scheme) || 'high-low';

    if (isPrelim) {
        title.textContent = `Pair Round ${roundNum}`;
        desc.textContent = `Select pairing parameters for Round ${roundNum} before generating pairings:`;
        schemeGroup.style.display = 'block';

        if (roundNum <= 2) {
            select.value = 'random';
        } else {
            select.value = defaultScheme;
        }

        const updateHint = () => {
            if (select.value === 'high-low') {
                hint.textContent = 'High-Low: Matches the highest seed vs lowest seed within each win-loss bracket (standard Tabroom power match with same-school protection).';
            } else if (select.value === 'high-high') {
                hint.textContent = 'High-High: Matches the top seed vs 2nd seed in each win-loss bracket (adjacent / strong vs strong elimination).';
            } else {
                hint.textContent = 'Random Draw: Randomly matches teams within win-loss brackets (preset / random draw).';
            }
        };
        select.onchange = updateHint;
        updateHint();
    } else {
        const elimNum = roundNum - num_prelim_rounds;
        const elimLabel = getElimRoundLabel(elimNum, num_elim_rounds);
        title.textContent = `Pair ${elimLabel}`;
        desc.textContent = `Elimination rounds use standard seeded bracket structure (e.g. 1v8, 4v5, 3v6, 2v7) automatically advancing qualifying winners.`;
        schemeGroup.style.display = 'none';
    }

    modal.classList.remove('hidden');

    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
    };

    confirmBtn.onclick = async () => {
        modal.classList.add('hidden');
        const chosenScheme = isPrelim ? select.value : 'high-low';
        showLoading(`Pairing ${isPrelim ? 'Round ' + roundNum : 'elimination round'}...`);
        try {
            await tournament.pairRound(roundNum, chosenScheme);
            updateDashboard();
            showRound(roundNum);
        } catch (error) {
            showNotification('Error', error.message);
        } finally {
            hideLoading();
        }
    };
}

// Show Round View
export function showRound(roundNum, highlightMatchId = null) {
    if (!tournament || !tournament.data || !tournament.data.config) return;
    uiState.activeTab = `round${roundNum}`;
    window.location.hash = `round${roundNum}`;

    // Add to navigation history (avoid duplicates of current view)
    if (uiState.navigationHistory[uiState.navigationHistory.length - 1] !== uiState.activeTab) {
        uiState.navigationHistory.push(uiState.activeTab);
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

    // Determine scheme badge for display
    const roundObj = (tournament.data.rounds || []).find(r => (typeof r === 'object' && r.round_num === roundNum));
    const roundScheme = (roundObj && roundObj.pairing_scheme) || (tournament.data.config && tournament.data.config.pairing_scheme) || 'high-low';
    const schemeBadge = isPrelimRound && roundNum > 2 ? (
        roundScheme === 'high-low' ? '<span class="badge" style="background:#3b82f6; color:white; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-left:0.5rem; vertical-align:middle;">Hi/Lo</span>' :
        roundScheme === 'high-high' ? '<span class="badge" style="background:#f59e0b; color:white; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-left:0.5rem; vertical-align:middle;">Hi/Hi</span>' :
        '<span class="badge" style="background:#8b5cf6; color:white; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-left:0.5rem; vertical-align:middle;">Random</span>'
    ) : (isPrelimRound ? '<span class="badge" style="background:#6b7280; color:white; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-left:0.5rem; vertical-align:middle;">Preset</span>' : '<span class="badge" style="background:#10b981; color:white; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-left:0.5rem; vertical-align:middle;">Elim</span>');

    const role = getUserRole();
    let myJudgeId = null;
    if (role === 'judge' && tournament.data?.auth?.judges && uiState.currentUser) {
        for (const [idStr, j_email] of Object.entries(tournament.data.auth.judges)) {
            if (j_email === uiState.currentUser.email) {
                myJudgeId = parseInt(idStr);
                break;
            }
        }
    }

    tabContent.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3>${roundLabel} Pairings ${schemeBadge} ${tournament.data.is_closed ? '<span class="closed-badge" style="background:#ef4444; color:white; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.8rem; margin-left:1rem;">CLOSED</span>' : ''}</h3>
                ${role === 'admin' ? `
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="btn btn-secondary" onclick="exportPairings(${roundNum})" title="Export pairings as a CSV file to import into tabular software.">📥 Export CSV</button>
                    ${!tournament.data.is_closed ? `
                        <button class="btn btn-primary" onclick="triggerAutoAssignJudges(${roundNum})" title="Automatically assign available unconflicted judges to all unassigned matches in this round">⚖️ Auto-Assign Judges</button>
                        <button class="btn btn-danger" onclick="confirmResetRound(${roundNum})" ${roundNum !== tournament.data.current_round ? 'disabled title="Only the current round can be reset."' : ''}>Reset Round</button>
                    ` : ''}
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

        // Tabroom BYE match rendering
        if (m.is_bye || m.neg_id === -1) {
            return `
                <div class="pairing-item pairing-bye" id="match-${m.match_id}" style="border-left: 4px solid #10b981;">
                    <div class="pairing-sections">
                        <div class="team-section team-aff-section">
                            <div class="team-header">
                                <a href="#" onclick="showTeamDetails(${m.aff_id}, 'round${roundNum}'); return false;" class="team-link team-aff">${m.aff_name}</a> 
                                <span class="badge" style="background:#10b981; color:white; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.75rem; margin-left:0.3rem;" title="Awarded automatic win for odd bracket BYE">BYE</span>
                                <span class="win-indicator">✓</span>
                            </div>
                            <div class="members-list" style="color:var(--text-muted); font-size:0.85rem; margin-top:0.3rem;">
                                ${(affTeam && affTeam.members) ? affTeam.members.map(mb => (mb && mb.name) ? mb.name : mb).join(' & ') : ''}
                            </div>
                        </div>
                        
                        <div class="team-section" style="display:flex; align-items:center; color:var(--text-muted); font-style:italic;">
                            BYE (No Opponent - Automatic Win)
                        </div>
                        
                        <div class="match-section">
                            <div class="match-header">
                                <span class="match-id">Match ${m.match_id}</span>
                            </div>
                            <div class="match-content">
                                <div class="result-status">
                                    <div class="result-winner" style="color:#059669; font-weight:600;">Win (Bye)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        const affIsPullUp = affTeam && (affTeam.pulled_up_rounds || []).includes(roundNum);
        const negIsPullUp = negTeam && (negTeam.pulled_up_rounds || []).includes(roundNum);

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
                                        ${affIsPullUp ? '<span class="badge" style="background:#6366f1; color:white; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.75rem; margin-left:0.3rem;" title="Pulled up from lower bracket">Pull-up</span>' : ''}
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
                                        ${negIsPullUp ? '<span class="badge" style="background:#6366f1; color:white; padding:0.1rem 0.4rem; border-radius:3px; font-size:0.75rem; margin-left:0.3rem;" title="Pulled up from lower bracket">Pull-up</span>' : ''}
                                        <span class="side-label">(Neg)</span>
                                        ${m.result === 'N' ? '<span class="win-indicator">✓</span>' : ''}
                                    </div>
                                    <div class="members-list">
                                        ${renderMember(negTeam.members[0], negPoints[0], m.match_id, 'neg_0', m.neg_id)}
                                        ${renderMember(negTeam.members[1], negPoints[1], m.match_id, 'neg_1', m.neg_id)}
                                    </div>
                                </div>
                                
                                <div class="match-section">
                                    <div class="match-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                                        <span class="match-id">Match ${m.match_id}</span>
                                        <div style="display:flex; gap:0.4rem; align-items:center;">
                                            ${m.flight ? `<span class="flight-badge">✈️ Flight ${m.flight === 1 ? 'A' : 'B'}</span>` : ''}
                                            ${m.room ? `<span class="room-badge">📍 ${m.room}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="match-content">
                                        ${(() => {
                                            const hasPanel = m.panel && m.panel.length > 1;
                                            const decisionBadge = m.decision ? `<span class="badge" style="background:#3b82f6; color:white; font-size:0.75rem; padding:1px 5px; border-radius:3px; margin-left:4px;">${m.decision}</span>` : '';
                                            const hasRFD = m.rfd || (m.ballots && Object.values(m.ballots).some(b => b.rfd));
                                            
                                            let panelHtml = '';
                                            if (hasPanel) {
                                                panelHtml = `
                                                    <div class="panel-section" style="font-size:0.75rem; margin-bottom:0.4rem; padding:0.3rem 0.4rem; background:rgba(255,255,255,0.04); border-radius:4px;">
                                                        <div style="font-weight:600; color:var(--text-muted); margin-bottom:0.2rem;">Panel (${m.panel.length} Judges):</div>
                                                        <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
                                                            ${m.panel.map(jid => {
                                                                const j = tournament.judges.find(x => x.id === jid) || { name: `Judge ${jid}` };
                                                                const b = m.ballots && m.ballots[String(jid)];
                                                                const voteBadge = b ? `<span class="badge" style="background:#10b981; color:white; font-size:0.7rem; padding:0 3px;">${b.vote === 'A' ? 'Aff' : 'Neg'}</span>` : `<span class="badge" style="background:#6b7280; color:white; font-size:0.7rem; padding:0 3px;">Pending</span>`;
                                                                return `<span>${j.name} ${voteBadge}</span>`;
                                                            }).join('')}
                                                        </div>
                                                    </div>
                                                `;
                                            }

                                            return `
                                                ${panelHtml}
                                                ${!hasResult ? (canEditMatch ? `
                                                    <div class="result-buttons" style="display:flex; gap:0.3rem; flex-wrap:wrap;">
                                                        <button class="btn btn-success btn-sm" onclick="reportResult(${m.match_id}, 'A')">Aff Wins</button>
                                                        <button class="btn btn-success btn-sm" onclick="reportResult(${m.match_id}, 'N')">Neg Wins</button>
                                                        <button class="btn btn-secondary btn-sm" onclick="openBallotModal(${m.match_id})" title="Submit Ballot with RFD and Speaker Points">📝 Ballot & RFD</button>
                                                    </div>
                                                ` : '<div class="result-status"><div class="result-winner">Pending</div></div>') : `
                                                    <div class="result-status">
                                                        <div class="result-winner">Winner: ${m.result === 'A' ? 'Aff' : 'Neg'}${m.is_forfeit ? ' (Forfeit)' : ''} ${decisionBadge}</div>
                                                        <div style="display:flex; gap:0.3rem; align-items:center; margin-top:0.3rem;">
                                                            ${hasRFD ? `<button class="btn btn-sm btn-info" onclick="openRFDModal(${m.match_id})" style="font-size:0.75rem; padding:2px 6px;">📝 View RFD</button>` : ''}
                                                            ${canEditMatch ? `
                                                            <div class="correction-buttons">
                                                                <button class="btn btn-sm btn-warning" onclick="correctResult(${m.match_id}, '${m.result}')" title="Switch Winner">✏</button>
                                                                <button class="btn btn-sm btn-danger" onclick="unsubmitResult(${m.match_id})" title="Unsubmit Result">✕</button>
                                                            </div>
                                                            ` : ''}
                                                        </div>
                                                    </div>
                                                `}
                                            `;
                                        })()}
                                        
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
                                                                ${(() => {
                                                                    const conflict = tournament.checkJudgeConflict ? tournament.checkJudgeConflict(assignedJudge.id, m.match_id) : { hasConflict: false };
                                                                    return conflict.hasConflict ? `<span class="badge" style="background:#ef4444; color:white; font-size:0.7rem; padding:1px 4px; border-radius:3px; margin-left:4px;" title="${conflict.reason}">⚠️ CONFLICT</span>` : '';
                                                                })()}
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
export function generateBracketHTML() {
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
        const activeRound = parseInt(uiState.activeTab.replace('round', ''));
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
                const activeRound = parseInt(uiState.activeTab.replace('round', ''));
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


window.openBallotModal = function(matchId) {
    const match = tournament.data.matches.find(m => m.match_id === matchId);
    if (!match) return;

    const affTeam = tournament.teams.find(t => t.id === match.aff_id);
    const negTeam = tournament.teams.find(t => t.id === match.neg_id);
    const affName = affTeam ? affTeam.name : `Team ${match.aff_id}`;
    const negName = negTeam ? negTeam.name : `Team ${match.neg_id}`;

    let modal = document.getElementById('ballotRFDModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ballotRFDModal';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:10000;';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-card" style="background:var(--bg-card, #1e293b); color:var(--text-main, #f8fafc); padding:1.5rem; border-radius:8px; width:90%; max-width:550px; max-height:90vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.5); border:1px solid var(--border-color, #334155);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid var(--border-color, #334155); padding-bottom:0.5rem;">
                <h3 style="margin:0;">Submit Ballot — Match ${matchId}</h3>
                <button onclick="document.getElementById('ballotRFDModal').style.display='none'" style="background:none; border:none; color:var(--text-muted, #94a3b8); font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            
            <div style="margin-bottom:1rem; font-size:0.95rem;">
                <strong>Affirmative:</strong> ${affName}<br>
                <strong>Negative:</strong> ${negName}
            </div>

            <div style="margin-bottom:1rem;">
                <label style="display:block; font-weight:600; margin-bottom:0.4rem;">Select Winner:</label>
                <div style="display:flex; gap:1rem;">
                    <label style="cursor:pointer;"><input type="radio" name="ballot_vote_${matchId}" value="A" checked> <strong>Affirmative</strong> (${affName})</label>
                    <label style="cursor:pointer;"><input type="radio" name="ballot_vote_${matchId}" value="N"> <strong>Negative</strong> (${negName})</label>
                </div>
            </div>

            <div style="margin-bottom:1rem;">
                <label style="display:block; font-weight:600; margin-bottom:0.3rem;">Reason for Decision (RFD):</label>
                <textarea id="ballot_rfd_${matchId}" rows="4" style="width:100%; border-radius:4px; border:1px solid var(--border-color, #475569); background:var(--bg-input, #0f172a); color:inherit; padding:0.5rem;" placeholder="Explain the decision, key arguments, and paradigm considerations...">${match.rfd || ''}</textarea>
            </div>

            <div style="margin-bottom:1rem;">
                <label style="display:block; font-weight:600; margin-bottom:0.3rem;">Constructive Feedback for Aff (${affName}):</label>
                <textarea id="ballot_aff_notes_${matchId}" rows="2" style="width:100%; border-radius:4px; border:1px solid var(--border-color, #475569); background:var(--bg-input, #0f172a); color:inherit; padding:0.5rem;" placeholder="Notes for Affirmative debaters...">${(match.comments && match.comments.aff) || ''}</textarea>
            </div>

            <div style="margin-bottom:1rem;">
                <label style="display:block; font-weight:600; margin-bottom:0.3rem;">Constructive Feedback for Neg (${negName}):</label>
                <textarea id="ballot_neg_notes_${matchId}" rows="2" style="width:100%; border-radius:4px; border:1px solid var(--border-color, #475569); background:var(--bg-input, #0f172a); color:inherit; padding:0.5rem;" placeholder="Notes for Negative debaters...">${(match.comments && match.comments.neg) || ''}</textarea>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.5rem;">
                <button class="btn btn-secondary" onclick="document.getElementById('ballotRFDModal').style.display='none'">Cancel</button>
                <button class="btn btn-primary" onclick="submitBallotWithRFD(${matchId})">Submit Ballot</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
};

window.submitBallotWithRFD = async function(matchId) {
    const radios = document.getElementsByName(`ballot_vote_${matchId}`);
    let vote = 'A';
    for (const r of radios) {
        if (r.checked) { vote = r.value; break; }
    }
    const rfd = document.getElementById(`ballot_rfd_${matchId}`).value.trim();
    const affNotes = document.getElementById(`ballot_aff_notes_${matchId}`).value.trim();
    const negNotes = document.getElementById(`ballot_neg_notes_${matchId}`).value.trim();
    const comments = { aff: affNotes, neg: negNotes };

    showLoading('Submitting ballot...');
    try {
        await tournament.reportResult(matchId, vote, null, null, rfd, comments);
        document.getElementById('ballotRFDModal').style.display = 'none';
        const match = tournament.data.matches.find(m => m.match_id === matchId);
        if (match) showRound(match.round_num);
        showNotification('Success', `Ballot submitted with RFD for Match ${matchId}!`);
    } catch (err) {
        showNotification('Error', err.message);
    } finally {
        hideLoading();
    }
};

window.openRFDModal = function(matchId) {
    const match = tournament.data.matches.find(m => m.match_id === matchId);
    if (!match) return;

    const affTeam = tournament.teams.find(t => t.id === match.aff_id);
    const negTeam = tournament.teams.find(t => t.id === match.neg_id);
    const affName = affTeam ? affTeam.name : `Team ${match.aff_id}`;
    const negName = negTeam ? negTeam.name : `Team ${match.neg_id}`;

    let modal = document.getElementById('viewRFDModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'viewRFDModal';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index:10000;';
        document.body.appendChild(modal);
    }

    const ballots = match.ballots || {};
    const ballotEntries = Object.values(ballots);

    let ballotsHtml = '';
    if (ballotEntries.length > 0) {
        ballotsHtml = ballotEntries.map((b) => {
            const judge = tournament.judges.find(j => j.id === b.judge_id) || { name: `Judge ${b.judge_id}` };
            return `
                <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color, #334155); border-radius:6px; padding:0.8rem; margin-bottom:0.8rem;">
                    <div style="font-weight:600; margin-bottom:0.3rem;">
                        ${judge.name} &mdash; Voted: <span class="badge" style="background:#10b981; color:white; padding:1px 4px; font-size:0.75rem;">${b.vote === 'A' ? 'Aff' : 'Neg'}</span>
                    </div>
                    ${b.rfd ? `<div style="margin-bottom:0.4rem; font-size:0.9rem;"><strong>RFD:</strong> ${b.rfd}</div>` : ''}
                    ${b.comments && b.comments.aff ? `<div style="font-size:0.85rem; color:var(--text-muted);"><strong>Aff Notes:</strong> ${b.comments.aff}</div>` : ''}
                    ${b.comments && b.comments.neg ? `<div style="font-size:0.85rem; color:var(--text-muted);"><strong>Neg Notes:</strong> ${b.comments.neg}</div>` : ''}
                </div>
            `;
        }).join('');
    } else {
        ballotsHtml = `
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color, #334155); border-radius:6px; padding:0.8rem; margin-bottom:0.8rem;">
                <div style="margin-bottom:0.4rem; font-size:0.9rem;"><strong>RFD:</strong> ${match.rfd || 'No written RFD recorded.'}</div>
                ${match.comments && match.comments.aff ? `<div style="font-size:0.85rem; color:var(--text-muted);"><strong>Aff Notes:</strong> ${match.comments.aff}</div>` : ''}
                ${match.comments && match.comments.neg ? `<div style="font-size:0.85rem; color:var(--text-muted);"><strong>Neg Notes:</strong> ${match.comments.neg}</div>` : ''}
            </div>
        `;
    }

    modal.innerHTML = `
        <div class="modal-card" style="background:var(--bg-card, #1e293b); color:var(--text-main, #f8fafc); padding:1.5rem; border-radius:8px; width:90%; max-width:600px; max-height:85vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.5); border:1px solid var(--border-color, #334155);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid var(--border-color, #334155); padding-bottom:0.5rem;">
                <h3 style="margin:0;">Reason for Decision & Ballots &mdash; Match ${matchId}</h3>
                <button onclick="document.getElementById('viewRFDModal').style.display='none'" style="background:none; border:none; color:var(--text-muted, #94a3b8); font-size:1.5rem; cursor:pointer;">&times;</button>
            </div>
            <div style="margin-bottom:0.8rem; font-size:0.9rem;">
                <strong>Debate:</strong> ${affName} (Aff) vs ${negName} (Neg) &bull; Winner: <strong>${match.result === 'A' ? 'Aff' : 'Neg'}</strong> ${match.decision ? `(${match.decision})` : ''}
            </div>
            ${ballotsHtml}
            <div style="display:flex; justify-content:flex-end; margin-top:1rem;">
                <button class="btn btn-secondary" onclick="document.getElementById('viewRFDModal').style.display='none'">Close</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
};
