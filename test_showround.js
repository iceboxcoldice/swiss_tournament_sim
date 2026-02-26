const fs = require('fs');

class Team {
    constructor(id, name, institution = '', members = []) {
        this.id = id;
        this.name = name;
        this.institution = institution || 'Unknown';
        this.members = members.length === 2 ? members : [{ name: `Member 1`, id: 1 }, { name: `Member 2`, id: 2 }];
    }
}
class Judge {
    constructor(id, name, institution = '') {
        this.id = id;
        this.name = name;
        this.institution = institution || 'Tournament Hire';
        this.matches_judged = [];
    }
}
class TournamentManager {
    constructor() { this.data = null; this.teams = []; this.judges = []; }
    getRoundMatches(roundNum) { return this.data.matches.filter(m => m.round_num === roundNum); }
    reconstructObjects() {
        if (!this.data) return;
        this.teams = this.data.teams.map(t => {
            const team = new Team(t.id, t.name, t.institution, t.members);
            Object.assign(team, t);
            return team;
        });
        if (this.data.judges) {
            this.judges = this.data.judges.map(j => new Judge(j.id, j.name, j.institution));
        }
    }
}

const tournament = new TournamentManager();
const mainTabs = { querySelectorAll: () => [] };
const tabContent = {};
let activeTab = null;
const window = { location: { hash: '' } };
const navigationHistory = [];
function getElimRoundLabel() { return "Elim"; }

eval(fs.readFileSync('docs/manager/app.js', 'utf8').substring( fs.readFileSync('docs/manager/app.js', 'utf8').indexOf('function showRound'), fs.readFileSync('docs/manager/app.js', 'utf8').indexOf('function showStandings') ));

const data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
tournament.data = data;
tournament.reconstructObjects();

try {
    showRound(1);
    console.log("Success! Rendered string length:", tabContent.innerHTML.length);
} catch (e) {
    console.error("CRASH:", e);
}
