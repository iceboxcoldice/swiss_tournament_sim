import {
    tournament, uiState, dom, showLoading, hideLoading, showConfirm, showNotification
} from './state.js';
import { getUserRole } from './auth.js';
import { showRound, updateDashboard } from './rounds.js';
import { showEntries, showJudges, showUserProfile } from './participants.js';

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

// Show Standings
export function showStandings() {
    if (!tournament || !tournament.data || !tournament.data.config) {
        tabContent.innerHTML = '<div class="card"><p class="text-muted">No data available yet. Please initialize the tournament.</p></div>';
        return;
    }
    uiState.activeTab = 'standings';
    window.location.hash = 'standings';

    // Add to navigation history
    if (uiState.navigationHistory[uiState.navigationHistory.length - 1] !== uiState.activeTab) {
        uiState.navigationHistory.push(uiState.activeTab);
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
                        <td>
                            <a href="#" onclick="showTeamDetails(${team.id}, 'standings'); return false;" class="team-link"><strong>${team.name}</strong></a>
                            ${team.is_dropped ? '<span class="badge" style="background:#ef4444; color:white; font-size:0.6rem; margin-left:0.4rem; padding:0.1rem 0.35rem; border-radius:3px;">DROPPED</span>' : ''}
                        </td>
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


// Show Team Details
export const showTeamDetails = window.showTeamDetails = function (teamId, previousView = null) {
    const team = tournament.teams.find(t => t.id === teamId);
    if (!team) return;

    uiState.activeTab = `team${teamId}`;
    window.location.hash = `team${teamId}`;

    // Add to navigation history (avoid duplicates of current view)
    if (uiState.navigationHistory[uiState.navigationHistory.length - 1] !== uiState.activeTab) {
        uiState.navigationHistory.push(uiState.activeTab);
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
    const currentIndex = uiState.navigationHistory.length - 1;
    // let previousView = null;

    for (let i = currentIndex - 1; i >= 0; i--) {
        const historyItem = uiState.navigationHistory[i];
        if (historyItem !== uiState.activeTab && !historyItem.startsWith('team')) {
            previousView = historyItem;
            break;
        } else if (historyItem.startsWith('team') && historyItem !== uiState.activeTab) {
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
                const item = uiState.navigationHistory[i];
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
                    <h3 style="margin:0; display:flex; align-items:center;">
                        Team Details: ${team.name}
                        ${team.is_dropped ? '<span class="badge" style="background:#ef4444; color:white; padding:0.15rem 0.5rem; border-radius:3px; font-size:0.8rem; margin-left:0.6rem;">DROPPED</span>' : ''}
                    </h3>
                    <p class="text-muted" style="margin-top:0.5rem">ID: ${team.id} | ${team.institution || 'No Institution'}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    ${(getUserRole() === 'admin' && !tournament.data.is_closed) ? `
                        ${!team.is_dropped 
                            ? `<button class="btn btn-danger" onclick="confirmDropTeam(${team.id})">Drop Team</button>`
                            : `<button class="btn btn-warning" onclick="confirmReinstateTeam(${team.id})">Reinstate Team</button>`
                        }
                    ` : ''}
                    <button class="btn btn-secondary" onclick="goBack()">${backLabel}</button>
                </div>
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
        const isBye = match.is_bye || match.neg_id === -1;
        const isAff = match.aff_id === teamId;
        const oppId = isAff ? match.neg_id : match.aff_id;
        const oppName = isBye ? 'BYE' : (isAff ? match.neg_name : match.aff_name);
        const side = isBye ? '—' : (isAff ? 'Aff' : 'Neg');

        let result = '—';
        let resultClass = '';
        if (isBye) {
            result = 'Win (Bye)';
            resultClass = 'result-win';
        } else if (match.result !== null) {
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

        const oppCell = isBye ? '<span style="color:var(--text-muted); font-style:italic;">BYE</span>' : `<a href="#" onclick="showTeamDetails(${oppId}); return false;" class="team-link">${oppName}</a>`;

        return `
                            <tr>
                                <td>${roundLabel}</td>
                                <td>${side}</td>
                                <td>${oppCell}</td>
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

// Drop Team Handlers
window.confirmDropTeam = function (teamId) {
    const team = tournament.teams.find(t => t.id === teamId);
    if (!team) return;

    showConfirm(
        'Drop Team',
        `Are you sure you want to drop "${team.name}"? They will be excluded from all future pairings. If they are in an active match, a forfeit win will be awarded to their opponent.`,
        async () => {
            showLoading('Dropping team...');
            try {
                await tournament.dropTeam(teamId);
                showNotification('Success', `Team "${team.name}" has been dropped.`);
                if (uiState.activeTab === `team${teamId}`) {
                    showTeamDetails(teamId);
                } else if (uiState.activeTab === 'entries') {
                    showEntries();
                } else if (uiState.activeTab === 'standings') {
                    showStandings();
                } else if (uiState.activeTab.startsWith('round')) {
                    const rNum = parseInt(uiState.activeTab.replace('round', ''));
                    showRound(rNum);
                }
            } catch (err) {
                showNotification('Error', err.message);
            } finally {
                hideLoading();
            }
        }
    );
};

window.confirmReinstateTeam = function (teamId) {
    const team = tournament.teams.find(t => t.id === teamId);
    if (!team) return;

    showConfirm(
        'Reinstate Team',
        `Are you sure you want to reinstate "${team.name}"? They will become eligible for future round pairings.`,
        async () => {
            showLoading('Reinstating team...');
            try {
                await tournament.reinstateTeam(teamId);
                showNotification('Success', `Team "${team.name}" has been reinstated.`);
                if (uiState.activeTab === `team${teamId}`) {
                    showTeamDetails(teamId);
                } else if (uiState.activeTab === 'entries') {
                    showEntries();
                } else if (uiState.activeTab === 'standings') {
                    showStandings();
                }
            } catch (err) {
                showNotification('Error', err.message);
            } finally {
                hideLoading();
            }
        }
    );
};

// Go back to previous view
window.goBack = function () {
    console.log('goBack called. Current history:', JSON.stringify(uiState.navigationHistory));
    console.log('Current activeTab:', uiState.activeTab);

    // Remove current view from history
    uiState.navigationHistory.pop();

    // Find the previous non-team view or a different team view
    let previousView = null;
    while (uiState.navigationHistory.length > 0) {
        const historyItem = uiState.navigationHistory.pop();
        console.log('Checking history item:', historyItem);
        if (historyItem !== uiState.activeTab) {
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

