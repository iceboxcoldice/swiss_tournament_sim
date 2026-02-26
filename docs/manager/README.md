# Policy Debate Tournament Manager — Web App

A browser-based tournament manager for running live Swiss-system policy debate tournaments. Supports Swiss preliminary rounds, elimination bracket rounds, speaker points, judge management, and optional cloud sync via Google App Engine.

**Live demo:** hosted via GitHub Pages at `docs/manager/index.html`

---

## Features

| Feature | Description |
|---|---|
| **Tournament Setup** | Configure teams, preliminary rounds, and elimination rounds. Supports custom team names, institutions, and two-member rosters via a pipe-delimited text input or auto-populate. |
| **Swiss Pairing** | Automatic Swiss-system pairings that balance Aff/Neg sides, avoid repeat matchups, and group teams by win record. |
| **Elimination Brackets** | Seeded single-elimination brackets (Octafinals → Quarterfinals → Semifinals → Finals) rendered as an interactive bracket visualization. |
| **Result Reporting** | Click-to-report match outcomes (Aff/Neg win) with correction and unsubmit options. |
| **Speaker Points** | Per-participant speaker point entry with inline editing; standings include total, drop-1, and drop-2 methods. |
| **Standings** | Real-time standings sorted by wins, speaker points, and Buchholz tiebreaker. Separate preliminary and overall views. |
| **Team Details** | Drill-down pages for each team showing record, side history, opponents faced, and member speaker points. |
| **Entries Tab** | Sortable team roster with institution and member columns. Clickable team names link to team detail pages. |
| **Judge Management** | Add/remove judges with institution affiliation. Assign judges to individual matches with autocomplete search. Judge detail pages show judging history. |
| **Export / Import** | Export full tournament state as JSON; re-import to restore or share. |
| **Cloud Backend** | Optional connection to a Google App Engine + GCS backend for persistent cloud storage and multi-device access. |
| **Data Redundancy** | Maintains parallel text-based records of pairings and results, validated against the in-memory data structure on every update to prevent corruption. |
| **Local Persistence** | Tournament state is saved to `localStorage`—no data loss on page reload. |

---

## Quick Start

### Run Locally (no install required)

Open `index.html` directly in any modern browser:

```bash
open docs/manager/index.html        # macOS
xdg-open docs/manager/index.html    # Linux
start docs/manager/index.html       # Windows
```

No build step, no bundler, no framework—just HTML + CSS + vanilla JavaScript.

### Initialize a Tournament

1. Set the **number of teams**, **prelim rounds**, and **elimination rounds** (0 for no elims).
2. Paste team details in the text area using pipe-delimited format:
   ```
   Harvard | Harvard University | Alice Smith | Bob Jones
   Yale | Yale University | Carol White | David Brown
   ```
   Or click **Auto-Populate Placeholder Names** to generate default entries.
3. Click **Initialize Tournament**.

---

## Usage Workflow

```
Initialize Tournament
        │
        ▼
  ┌─────────────┐
  │  Round Tab   │◄── Click "+" tab to generate pairings for next round
  │  (Pairings)  │
  └──────┬──────┘
         │  Click Aff/Neg buttons to report results
         ▼
  ┌─────────────┐
  │  Standings   │◄── Auto-updates after each result
  └──────┬──────┘
         │  Repeat for each preliminary round
         ▼
  ┌─────────────┐
  │  Elim Rounds │◄── Bracket auto-seeds from prelim standings
  │  (Bracket)   │
  └──────┬──────┘
         │
         ▼
     Final Standings
```

### Tabs

| Tab | Purpose |
|---|---|
| **Round 1, 2, …** | View pairings and report/correct results for each round |
| **+** (green) | Generate pairings for the next round |
| **Entries** | View/sort all teams with institution and member info |
| **Judges** | Add, remove, and view judges; see judging history |
| **Standings** | View preliminary and overall standings with tiebreakers |

### Reporting Results

- Click **Aff** or **Neg** on a match to record the winner.
- After reporting, use **⇄ Switch** to correct the result or **✕ Unsubmit** to remove it.
- Speaker points can be entered per-participant using the inline edit icon next to each member name.

### Judge Assignment

- Add judges on the **Judges** tab (name + institution).
- On any round tab, each match shows a judge assignment dropdown with autocomplete.
- Click a judge name in any match to view their judging history.

---

## File Structure

```
docs/manager/
├── index.html       # Entry point — markup, modals, setup form
├── app.js           # UI controller — tab rendering, event handlers, DOM manipulation
├── tournament.js    # Core logic — TournamentManager class, Swiss pairing, elim brackets
├── styles.css       # Dark-themed design system (CSS custom properties)
├── package.json     # Dev dependency (jsdom for Node.js testing)
└── package-lock.json
```

### Architecture

```
index.html
    │
    ├── tournament.js   (TournamentManager, Team, Judge classes)
    │     • init(), pairRound(), reportResult(), updateResult()
    │     • generateSwissPairings(), generateElimPairings()
    │     • getStandings(), getPreliminaryStandings(), getParticipantStandings()
    │     • addJudge(), assignJudgeToMatch(), storeSpeakerPoints()
    │     • exportData(), importData()
    │     • localStorage persistence + optional cloud backend sync
    │
    └── app.js          (UI Controller)
          • initUI(), updateDashboard(), renderTabs()
          • showRound(), showEntries(), showJudges(), showStandings()
          • showTeamDetails(), showJudgeDetails()
          • reportResult(), correctResult(), unsubmitResult()
          • Speaker point input/editing
          • Judge autocomplete and assignment
          • Export/Import JSON, backend config modal
```

---

## Cloud Backend (Optional)

The app can optionally connect to a **Flask + Google Cloud Storage** backend for persistent cloud storage.

### Setup

1. Deploy the backend (`main.py` + `app.yaml`) to Google App Engine.
2. In the web app, click the **☁ Cloud** button in the header.
3. Enter your App Engine URL (e.g. `https://your-project-id.appspot.com`).
4. Click **Connect** — the status indicator updates to show connection state.

When connected, tournament data is synced to GCS. When disconnected, all data stays in `localStorage`.

See the [deploy workflow](../../.agent/workflows/deploy_to_app_engine.md) and [local backend workflow](../../.agent/workflows/run_local_backend.md) for detailed instructions.

---

## Testing

Verification tests live in `/verification/` at the project root:

```bash
# Install test dependency
npm install    # installs jsdom

# Run tournament consistency tests
node verification/test_tournament_consistency.js

# Run judge management tests
node verification/test_judge_management.js
```

Tests use `jsdom` to load `tournament.js` in a Node.js environment and validate pairing logic, result reporting, standings calculations, and judge management.

---

## Design

- **Dark theme** with CSS custom properties (`--bg: #0f172a`, `--primary: #4f46e5`)
- **Responsive** layout — mobile-friendly with column stacking at 768px
- **Animations** — modal slide-in, tab fade-in, card hover lift
- **Bracket visualization** — horizontal bracket with seed indicators, winner/loser styling, and connecting lines
- **No external dependencies** at runtime — pure HTML/CSS/JS (no React, no build step)

---

## Related

- [Tournament Manager CLI](../../TOURNAMENT_MANAGER_README.md) — command-line version (`tournament_manager.py`)
- [Tournament Simulator](../simulator/) — Monte Carlo simulation of Swiss tournament outcomes
- [Project README](../../README.md) — overview of the full Swiss Tournament Sim project
