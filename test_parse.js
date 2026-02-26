const fs = require('fs');
class Team { constructor(id, name, institution, members) { Object.assign(this, {id, name, institution, members}); } }
class Judge { constructor(id, name, institution) { Object.assign(this, {id, name, institution, matches_judged: []}); } }
class TournamentManager {
    constructor() { this.data = null; this.teams = []; this.judges = []; }
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
const tm = new TournamentManager();
tm.data = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
console.log("Before parsing matches length:", tm.data.matches ? tm.data.matches.length : 0);
tm.reconstructObjects();
console.log("After parsing matches length:", tm.data.matches ? tm.data.matches.length : 0);
