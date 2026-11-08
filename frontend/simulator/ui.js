// ui.js - UI event handlers and display logic

// Toggle Seed Card visibility
document.getElementById('debug_mode').addEventListener('change', (e) => {
    document.getElementById('seed_card').style.display = e.target.checked ? 'block' : 'none';
});

function getAndHandleSeed() {
    const isDebug = document.getElementById('debug_mode').checked;
    const seedInput = document.getElementById('global_seed');
    let seed;

    if (isDebug) {
        seed = parseInt(seedInput.value) || 12345;
    } else {
        // Generate random seed
        seed = Math.floor(Math.random() * 4294967296);
        seedInput.value = seed; // Show what was picked
    }

    setSeed(seed);
    return seed;
}

// Tab switching
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab content
    document.getElementById(tabName).classList.add('active');

    // Add active class to clicked tab
    event.target.classList.add('active');
}

// Background Web Worker runner with automatic fallback
let simWorker = null;

function runSimulationTask(simType, params, fallbackFn, progressCallback) {
    if (typeof Worker !== 'undefined') {
        try {
            if (!simWorker) {
                simWorker = new Worker('worker.js?v=2');
            }
            const taskId = Math.random().toString(36).substring(2, 9);
            return new Promise((resolve, reject) => {
                const handler = (e) => {
                    const data = e.data;
                    if (!data || data.id !== taskId) return;
                    if (data.type === 'PROGRESS') {
                        if (progressCallback) progressCallback(data.current, data.total);
                    } else if (data.type === 'COMPLETE') {
                        simWorker.removeEventListener('message', handler);
                        resolve(data.result);
                    } else if (data.type === 'ERROR') {
                        simWorker.removeEventListener('message', handler);
                        reject(new Error(data.error));
                    }
                };
                simWorker.addEventListener('message', handler);
                simWorker.postMessage({ id: taskId, type: simType, params });
            });
        } catch (e) {
            console.warn('Worker initialization failed, using main thread fallback:', e);
        }
    }
    // Fallback if Worker fails or not supported (e.g. file:// protocol)
    return fallbackFn(params, progressCallback);
}

// Head-to-Head Form Handler
document.getElementById('h2hForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const seed = getAndHandleSeed();

    const numTeams = parseInt(document.getElementById('h2h_teams').value);
    const historyA = document.getElementById('h2h_historyA').value.replace(/\s/g, '').toUpperCase();
    const historyB = document.getElementById('h2h_historyB').value.replace(/\s/g, '').toUpperCase();
    const numRounds = historyA.length + 1;
    const minMatchups = parseInt(document.getElementById('h2h_minMatchups').value);
    const useBuchholz = document.getElementById('h2h_buchholz').checked;
    const winModel = document.getElementById('h2h_winModel').value;

    if (!/^[WL]+$/.test(historyA) || !/^[WL]+$/.test(historyB)) {
        alert('Histories must contain only W and L characters');
        return;
    }

    if (historyA.length !== historyB.length) {
        alert('History lengths must match');
        return;
    }

    document.getElementById('h2h_progress').style.display = 'block';
    document.getElementById('h2h_results').style.display = 'none';
    e.target.querySelector('button').disabled = true;

    try {
        const results = await runSimulationTask(
            'HEAD_TO_HEAD',
            { numTeams, numRounds, historyA, historyB, minMatchups, useBuchholz, winModel, seed },
            runHeadToHeadSimulation,
            (sims, matchups) => {
                const progress = Math.min((matchups / minMatchups) * 100, 100);
                document.getElementById('h2h_progressFill').style.width = progress + '%';
                document.getElementById('h2h_progressText').textContent = `${sims} simulations, ${matchups} matchups found...`;
            }
        );

        displayHeadToHeadResults(results, historyA, historyB);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('h2h_progress').style.display = 'none';
        e.target.querySelector('button').disabled = false;
    }
});

function displayHeadToHeadResults(results, historyA, historyB) {
    const { totalSims, matchupCount, teamAWins, teamBWins, avgRankA, avgRankB, seed } = results;

    document.getElementById('h2h_seedDisplay').textContent = `Seed used: ${seed || document.getElementById('global_seed').value}`;

    if (matchupCount === 0) {
        alert('No matchups found. Try different histories or more simulations.');
        return;
    }

    const totalWins = teamAWins + teamBWins;
    const pA = totalWins > 0 ? teamAWins / totalWins : 0;
    const pB = totalWins > 0 ? teamBWins / totalWins : 0;
    const percA = (pA * 100).toFixed(2);
    const percB = (pB * 100).toFixed(2);

    // 95% Confidence Interval (Wald Margin of Error: 1.96 * SE)
    const se = totalWins > 0 ? Math.sqrt(pA * (1 - pA) / totalWins) : 0;
    const moe = 1.95996 * se * 100;
    const ciALow = Math.max(0, pA * 100 - moe).toFixed(1);
    const ciAHigh = Math.min(100, pA * 100 + moe).toFixed(1);
    const ciBLow = Math.max(0, pB * 100 - moe).toFixed(1);
    const ciBHigh = Math.min(100, pB * 100 + moe).toFixed(1);

    document.getElementById('h2h_matchupDisplay').textContent = `${historyA} vs ${historyB}`;
    document.getElementById('h2h_teamAPerc').textContent = percA + '%';
    document.getElementById('h2h_teamBPerc').textContent = percB + '%';

    const teamACI = document.getElementById('h2h_teamACI');
    if (teamACI) {
        teamACI.textContent = `± ${moe.toFixed(2)}% (95% CI: ${ciALow}%–${ciAHigh}%)`;
    }
    const teamBCI = document.getElementById('h2h_teamBCI');
    if (teamBCI) {
        teamBCI.textContent = `± ${moe.toFixed(2)}% (95% CI: ${ciBLow}%–${ciBHigh}%)`;
    }
    document.getElementById('h2h_totalMatchups').textContent = matchupCount.toLocaleString();
    document.getElementById('h2h_simsRun').textContent = totalSims.toLocaleString();
    document.getElementById('h2h_teamARank').textContent = avgRankA.toFixed(1);
    document.getElementById('h2h_teamBRank').textContent = avgRankB.toFixed(1);

    document.getElementById('h2h_results').style.display = 'block';
    document.getElementById('h2h_results').scrollIntoView({ behavior: 'smooth' });
}

// Top N Form Handler
document.getElementById('topNForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const seed = getAndHandleSeed();

    const numTeams = parseInt(document.getElementById('topN_teams').value);
    const numRounds = parseInt(document.getElementById('topN_rounds').value);
    const topN = parseInt(document.getElementById('topN_n').value);
    const numSims = parseInt(document.getElementById('topN_sims').value);
    const useBuchholz = document.getElementById('topN_buchholz').checked;
    const winModel = document.getElementById('topN_winModel').value;

    document.getElementById('topN_progress').style.display = 'block';
    document.getElementById('topN_results').style.display = 'none';
    e.target.querySelector('button').disabled = true;

    try {
        const results = await runSimulationTask(
            'TOP_N',
            { numTeams, numRounds, topN, numSims, useBuchholz, winModel, seed },
            runTopNSimulation,
            (current, total) => {
                const progress = (current / total) * 100;
                document.getElementById('topN_progressFill').style.width = progress + '%';
                document.getElementById('topN_progressText').textContent = `${current} / ${total} simulations...`;
            }
        );

        displayTopNResults(results, topN);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('topN_progress').style.display = 'none';
        e.target.querySelector('button').disabled = false;
    }
});

function displayTopNResults(results, topN) {
    const { probabilities, seed } = results;
    document.getElementById('topN_seedDisplay').textContent = `Seed used: ${seed || document.getElementById('global_seed').value}`;
    const tbody = document.getElementById('topN_tableBody');
    tbody.innerHTML = '';

    const maxProb = Math.max(...probabilities);

    probabilities.forEach((prob, idx) => {
        if (prob > 0.01) {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = idx + 1;
            row.insertCell(1).textContent = prob.toFixed(2) + '%';

            const barCell = row.insertCell(2);
            const barWidth = (prob / maxProb) * 100;
            barCell.innerHTML = `<div class="bar" style="width: ${barWidth}%"></div>`;
        }
    });

    document.getElementById('topN_results').style.display = 'block';
    document.getElementById('topN_results').scrollIntoView({ behavior: 'smooth' });
}

// Win Distribution Form Handler
document.getElementById('winDistForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const seed = getAndHandleSeed();

    const numTeams = parseInt(document.getElementById('winDist_teams').value);
    const numRounds = parseInt(document.getElementById('winDist_rounds').value);
    const targetRank = parseInt(document.getElementById('winDist_rank').value);
    const numSims = parseInt(document.getElementById('winDist_sims').value);
    const useBuchholz = document.getElementById('winDist_buchholz').checked;
    const winModel = document.getElementById('winDist_winModel').value;

    document.getElementById('winDist_progress').style.display = 'block';
    document.getElementById('winDist_results').style.display = 'none';
    e.target.querySelector('button').disabled = true;

    try {
        const results = await runSimulationTask(
            'WIN_DIST',
            { numTeams, numRounds, targetRank, numSims, useBuchholz, winModel, seed },
            runWinDistSimulation,
            (current, total) => {
                const progress = (current / total) * 100;
                document.getElementById('winDist_progressFill').style.width = progress + '%';
                document.getElementById('winDist_progressText').textContent = `${current} / ${total} simulations...`;
            }
        );

        displayWinDistResults(results, targetRank);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('winDist_progress').style.display = 'none';
        e.target.querySelector('button').disabled = false;
    }
});

function displayWinDistResults(results, targetRank) {
    const { winCounts, numSims, seed } = results;
    document.getElementById('winDist_seedDisplay').textContent = `Seed used: ${seed || document.getElementById('global_seed').value}`;
    const tbody = document.getElementById('winDist_tableBody');
    tbody.innerHTML = '';

    document.getElementById('winDist_subtitle').textContent = `For teams with true rank ${targetRank}`;

    const sortedWins = Object.keys(winCounts).map(Number).sort((a, b) => a - b);
    const maxCount = Math.max(...Object.values(winCounts));

    sortedWins.forEach(wins => {
        const count = winCounts[wins];
        const prob = (count / numSims) * 100;

        const row = tbody.insertRow();
        row.insertCell(0).textContent = wins;
        row.insertCell(1).textContent = prob.toFixed(2) + '%';
        row.insertCell(2).textContent = count;

        const barCell = row.insertCell(3);
        const barWidth = (count / maxCount) * 100;
        barCell.innerHTML = `<div class="bar" style="width: ${barWidth}%"></div>`;
    });

    document.getElementById('winDist_results').style.display = 'block';
    document.getElementById('winDist_results').scrollIntoView({ behavior: 'smooth' });
}

// Rank from Wins Form Handler
document.getElementById('rankFromWinsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const seed = getAndHandleSeed();

    const numTeams = parseInt(document.getElementById('rankWins_teams').value);
    const numRounds = parseInt(document.getElementById('rankWins_rounds').value);
    const targetWins = parseInt(document.getElementById('rankWins_wins').value);
    const numSims = parseInt(document.getElementById('rankWins_sims').value);
    const useBuchholz = document.getElementById('rankWins_buchholz').checked;
    const winModel = document.getElementById('rankWins_winModel').value;

    document.getElementById('rankWins_progress').style.display = 'block';
    document.getElementById('rankWins_results').style.display = 'none';
    e.target.querySelector('button').disabled = true;

    try {
        const results = await runSimulationTask(
            'RANK_FROM_WINS',
            { numTeams, numRounds, targetWins, numSims, useBuchholz, winModel, seed },
            runRankFromWinsSimulation,
            (current, total) => {
                const progress = (current / total) * 100;
                document.getElementById('rankWins_progressFill').style.width = progress + '%';
                document.getElementById('rankWins_progressText').textContent = `${current} / ${total} simulations...`;
            }
        );

        displayRankFromWinsResults(results, targetWins);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('rankWins_progress').style.display = 'none';
        e.target.querySelector('button').disabled = false;
    }
});

function displayRankFromWinsResults(results, targetWins) {
    const { rankCounts, totalTeams, seed } = results;
    document.getElementById('rankWins_seedDisplay').textContent = `Seed used: ${seed || document.getElementById('global_seed').value}`;
    const tbody = document.getElementById('rankWins_tableBody');
    tbody.innerHTML = '';

    document.getElementById('rankWins_subtitle').textContent = `For teams with ${targetWins} wins`;

    if (totalTeams === 0) {
        alert('No teams found with that win count');
        return;
    }

    const sortedRanks = Object.keys(rankCounts).map(Number).sort((a, b) => a - b);
    const maxCount = Math.max(...Object.values(rankCounts));

    let sumRank = 0;
    let mostCommonRank = sortedRanks[0];
    let mostCommonCount = 0;

    sortedRanks.forEach(rank => {
        const count = rankCounts[rank];
        const prob = (count / totalTeams) * 100;
        sumRank += rank * count;

        if (count > mostCommonCount) {
            mostCommonCount = count;
            mostCommonRank = rank;
        }

        if (prob >= 0.01) {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = rank;
            row.insertCell(1).textContent = prob.toFixed(2) + '%';
            row.insertCell(2).textContent = count;

            const barCell = row.insertCell(3);
            const barWidth = (count / maxCount) * 100;
            barCell.innerHTML = `<div class="bar" style="width: ${barWidth}%"></div>`;
        }
    });

    const avgRank = sumRank / totalTeams;
    document.getElementById('rankWins_avgRank').textContent = avgRank.toFixed(1);
    document.getElementById('rankWins_mostCommon').textContent = mostCommonRank;
    document.getElementById('rankWins_totalTeams').textContent = totalTeams.toLocaleString();

    document.getElementById('rankWins_results').style.display = 'block';
    document.getElementById('rankWins_results').scrollIntoView({ behavior: 'smooth' });
}

// Rank from History Form Handler
document.getElementById('rankHistoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const seed = getAndHandleSeed();

    const numTeams = parseInt(document.getElementById('rankHistory_teams').value);
    const numRounds = parseInt(document.getElementById('rankHistory_rounds').value);
    const history = document.getElementById('rankHistory_history').value.replace(/\s/g, '').toUpperCase();
    const numSims = parseInt(document.getElementById('rankHistory_sims').value);
    const useBuchholz = document.getElementById('rankHistory_buchholz').checked;
    const winModel = document.getElementById('rankHistory_winModel').value;

    if (!/^[WL]+$/.test(history)) {
        alert('History must contain only W and L characters');
        return;
    }

    if (history.length > numRounds) {
        alert('History length cannot exceed number of rounds');
        return;
    }

    document.getElementById('rankHistory_progress').style.display = 'block';
    document.getElementById('rankHistory_results').style.display = 'none';
    e.target.querySelector('button').disabled = true;

    try {
        const results = await runSimulationTask(
            'RANK_FROM_HISTORY',
            { numTeams, numRounds, history, numSims, useBuchholz, winModel, seed },
            runRankFromHistorySimulation,
            (current, total) => {
                const progress = (current / total) * 100;
                document.getElementById('rankHistory_progressFill').style.width = progress + '%';
                document.getElementById('rankHistory_progressText').textContent = `${current} / ${total} simulations...`;
            }
        );

        displayRankFromHistoryResults(results, history);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('rankHistory_progress').style.display = 'none';
        e.target.querySelector('button').disabled = false;
    }
});

function displayRankFromHistoryResults(results, history) {
    const { rankCounts, totalTeams, seed } = results;
    document.getElementById('rankHistory_seedDisplay').textContent = `Seed used: ${seed || document.getElementById('global_seed').value}`;
    const tbody = document.getElementById('rankHistory_tableBody');
    tbody.innerHTML = '';

    document.getElementById('rankHistory_subtitle').textContent = `For teams with history "${history}"`;

    if (totalTeams === 0) {
        alert('No teams found with that history');
        return;
    }

    const sortedRanks = Object.keys(rankCounts).map(Number).sort((a, b) => a - b);
    const maxCount = Math.max(...Object.values(rankCounts));

    let sumRank = 0;
    let mostCommonRank = sortedRanks[0];
    let mostCommonCount = 0;

    sortedRanks.forEach(rank => {
        const count = rankCounts[rank];
        const prob = (count / totalTeams) * 100;
        sumRank += rank * count;

        if (count > mostCommonCount) {
            mostCommonCount = count;
            mostCommonRank = rank;
        }

        if (prob >= 0.01) {
            const row = tbody.insertRow();
            row.insertCell(0).textContent = rank;
            row.insertCell(1).textContent = prob.toFixed(2) + '%';
            row.insertCell(2).textContent = count;

            const barCell = row.insertCell(3);
            const barWidth = (count / maxCount) * 100;
            barCell.innerHTML = `<div class="bar" style="width: ${barWidth}%"></div>`;
        }
    });

    const avgRank = sumRank / totalTeams;
    document.getElementById('rankHistory_avgRank').textContent = avgRank.toFixed(1);
    document.getElementById('rankHistory_mostCommon').textContent = mostCommonRank;
    document.getElementById('rankHistory_totalTeams').textContent = totalTeams.toLocaleString();

    document.getElementById('rankHistory_results').style.display = 'block';
    document.getElementById('rankHistory_results').scrollIntoView({ behavior: 'smooth' });
}

// Top-N from History Form Handler
document.getElementById('topNHistoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const seed = getAndHandleSeed();

    const numTeams = parseInt(document.getElementById('topNHistory_teams').value);
    const numRounds = parseInt(document.getElementById('topNHistory_rounds').value);
    const history = document.getElementById('topNHistory_history').value.replace(/\s/g, '').toUpperCase();
    const topN = parseInt(document.getElementById('topNHistory_topN').value);
    const numSims = parseInt(document.getElementById('topNHistory_sims').value);
    const useBuchholz = document.getElementById('topNHistory_buchholz').checked;
    const winModel = document.getElementById('topNHistory_winModel').value;

    if (!/^[WL]+$/.test(history)) {
        alert('History must contain only W and L characters');
        return;
    }

    if (history.length > numRounds) {
        alert('History length cannot exceed number of rounds');
        return;
    }

    if (topN > numTeams) {
        alert('Top N cannot exceed number of teams');
        return;
    }

    document.getElementById('topNHistory_progress').style.display = 'block';
    document.getElementById('topNHistory_results').style.display = 'none';
    e.target.querySelector('button').disabled = true;

    try {
        const results = await runSimulationTask(
            'TOP_N_HISTORY',
            { numTeams, numRounds, history, topN, numSims, useBuchholz, winModel, seed },
            runTopNFromHistorySimulation,
            (current, total) => {
                const progress = (current / total) * 100;
                document.getElementById('topNHistory_progressFill').style.width = progress + '%';
                document.getElementById('topNHistory_progressText').textContent = `${current} / ${total} simulations...`;
            }
        );

        displayTopNFromHistoryResults(results, history, topN);
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        document.getElementById('topNHistory_progress').style.display = 'none';
        e.target.querySelector('button').disabled = false;
    }
});

function displayTopNFromHistoryResults(results, history, topN) {
    const { totalTeamsWithHistory, teamsInTopN, numSims, seed } = results;
    document.getElementById('topNHistory_seedDisplay').textContent = `Seed used: ${seed || document.getElementById('global_seed').value}`;

    document.getElementById('topNHistory_subtitle').textContent = `For teams with history "${history}"`;

    if (totalTeamsWithHistory === 0) {
        alert('No teams found with that history');
        return;
    }

    const probability = (teamsInTopN / totalTeamsWithHistory) * 100;
    const avgTeamsPerTournament = totalTeamsWithHistory / numSims;

    // 95% Confidence Interval
    const p = totalTeamsWithHistory > 0 ? teamsInTopN / totalTeamsWithHistory : 0;
    const se = totalTeamsWithHistory > 0 ? Math.sqrt(p * (1 - p) / totalTeamsWithHistory) : 0;
    const moe = 1.95996 * se * 100;
    const ciLow = Math.max(0, p * 100 - moe).toFixed(1);
    const ciHigh = Math.min(100, p * 100 + moe).toFixed(1);

    document.getElementById('topNHistory_probability').textContent = probability.toFixed(2) + '%';
    const topNCI = document.getElementById('topNHistory_CI');
    if (topNCI) {
        topNCI.textContent = `± ${moe.toFixed(2)}% (95% CI: ${ciLow}%–${ciHigh}%)`;
    }
    document.getElementById('topNHistory_inTopN').textContent = `${teamsInTopN} / ${totalTeamsWithHistory}`;
    document.getElementById('topNHistory_totalTeams').textContent = totalTeamsWithHistory.toLocaleString();
    document.getElementById('topNHistory_avgTeams').textContent = avgTeamsPerTournament.toFixed(2);

    document.getElementById('topNHistory_results').style.display = 'block';
    document.getElementById('topNHistory_results').scrollIntoView({ behavior: 'smooth' });
}

