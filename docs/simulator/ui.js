// ui.js - UI event handlers and display logic

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

// Head-to-Head Form Handler
document.getElementById('h2hForm').addEventListener('submit', async (e) => {
    e.preventDefault();

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
        const results = await runHeadToHeadSimulation(
            { numTeams, numRounds, historyA, historyB, minMatchups, useBuchholz, winModel },
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
    const { totalSims, matchupCount, teamAWins, teamBWins, avgRankA, avgRankB } = results;

    if (matchupCount === 0) {
        alert('No matchups found. Try different histories or more simulations.');
        return;
    }

    const totalWins = teamAWins + teamBWins;
    const percA = (teamAWins / totalWins * 100).toFixed(2);
    const percB = (teamBWins / totalWins * 100).toFixed(2);

    document.getElementById('h2h_matchupDisplay').textContent = `${historyA} vs ${historyB}`;
    document.getElementById('h2h_teamAPerc').textContent = percA + '%';
    document.getElementById('h2h_teamBPerc').textContent = percB + '%';
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
        const results = await runTopNSimulation(
            { numTeams, numRounds, topN, numSims, useBuchholz, winModel },
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
    const { probabilities } = results;
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
        const results = await runWinDistSimulation(
            { numTeams, numRounds, targetRank, numSims, useBuchholz, winModel },
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
    const { winCounts, numSims } = results;
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
        const results = await runRankFromWinsSimulation(
            { numTeams, numRounds, targetWins, numSims, useBuchholz, winModel },
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
    const { rankCounts, totalTeams } = results;
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
        const results = await runRankFromHistorySimulation(
            { numTeams, numRounds, history, numSims, useBuchholz, winModel },
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
    const { rankCounts, totalTeams } = results;
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
        const results = await runTopNFromHistorySimulation(
            { numTeams, numRounds, history, topN, numSims, useBuchholz, winModel },
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
    const { totalTeamsWithHistory, teamsInTopN, numSims } = results;

    document.getElementById('topNHistory_subtitle').textContent = `For teams with history "${history}"`;

    if (totalTeamsWithHistory === 0) {
        alert('No teams found with that history');
        return;
    }

    const probability = (teamsInTopN / totalTeamsWithHistory) * 100;
    const avgTeamsPerTournament = totalTeamsWithHistory / numSims;

    document.getElementById('topNHistory_probability').textContent = probability.toFixed(2) + '%';
    document.getElementById('topNHistory_inTopN').textContent = `${teamsInTopN} / ${totalTeamsWithHistory}`;
    document.getElementById('topNHistory_totalTeams').textContent = totalTeamsWithHistory.toLocaleString();
    document.getElementById('topNHistory_avgTeams').textContent = avgTeamsPerTournament.toFixed(2);

    document.getElementById('topNHistory_results').style.display = 'block';
    document.getElementById('topNHistory_results').scrollIntoView({ behavior: 'smooth' });
}

