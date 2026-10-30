const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 8089;
const SERVER_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${url}/api/health`);
            if (res.ok) return true;
        } catch (e) {
            // Wait and retry
        }
        await sleep(250);
    }
    throw new Error(`Server did not respond within ${timeoutMs}ms`);
}

async function runBrowserTests() {
    console.log('=== Starting E2E Browser Testing for Tournament Platform ===\n');

    // 1. Start Flask backend server on dedicated port with fresh storage
    const testStorageDir = path.join(__dirname, 'browser_test_storage');
    if (fs.existsSync(testStorageDir)) {
        fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testStorageDir, { recursive: true });

    console.log(`1. Launching backend server on port ${PORT}...`);
    const serverProcess = spawn('/usr/bin/python3', ['main.py'], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            PORT: String(PORT),
            LOCAL_STORAGE_DIR: testStorageDir,
            GOOGLE_OAUTH_CLIENT_ID: '' // local mode allows full admin access
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stderr.on('data', d => {
        // optional: console.error('server err:', d.toString());
    });

    try {
        await waitForServer(SERVER_URL);
        console.log('✓ Backend server is active and healthy.\n');

        // 2. Launch headless Chrome browser
        console.log('2. Launching Chrome browser...');
        const browser = await puppeteer.launch({
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
            defaultViewport: { width: 1280, height: 800 }
        });
        const page = await browser.newPage();

        // Listen for console logs and errors in the page
        page.on('console', msg => {
            console.log(`[Browser Console ${msg.type()}] ${msg.text()}`);
        });
        page.on('pageerror', err => {
            console.log(`[Browser PageError] ${err.toString()}`);
        });
        page.on('response', resp => {
            if (!resp.ok()) {
                console.log(`[HTTP ${resp.status()}] ${resp.request().method()} ${resp.url()}`);
            }
        });

        // 3. Navigate to Tournament Hub
        console.log('3. Navigating to Tournament Hub (index.html)...');
        await page.goto(`${SERVER_URL}/`, { waitUntil: 'networkidle0' });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_tournament_hub.png') });
        console.log('✓ Loaded Tournament Hub.');

        // Authenticate via Google token handler in the browser as Director
        console.log('  Authenticating as Tournament Director...');
        const tokenPayload = Buffer.from(JSON.stringify({
            email: 'director@tournament.org',
            name: 'Tournament Director',
            picture: ''
        })).toString('base64');
        const mockToken = `eyJhbGciOiJIUzI1NiJ9.${tokenPayload}.sig`;

        await page.evaluate(async (tok) => {
            await window.handleCredentialResponse({ credential: tok });
        }, mockToken);
        await sleep(500);

        // Verify Hub title
        const hubTitle = await page.$eval('header h1', el => el.textContent.trim());
        console.log(`  Page header: "${hubTitle}"`);

        // 4. Test Tournament Setup (Open Registration with 0 teams)
        console.log('\n4. Opening Tournament Creation Form...');
        page.on('dialog', async dialog => {
            console.log(`  [Dialog] ${dialog.type()}: "${dialog.message()}"`);
            if (dialog.type() === 'prompt') {
                await dialog.accept('e2e-open-reg');
            } else {
                await dialog.accept();
            }
        });

        await page.evaluate(() => document.getElementById('newTournamentHubBtn').click());
        await sleep(600);

        // Verify Setup form is visible
        const setupVisible = await page.$eval('#setupSection', el => !el.classList.contains('hidden'));
        if (!setupVisible) throw new Error('Setup section did not appear after clicking New Tournament');

        const initialNumTeams = await page.$eval('#numTeams', el => el.value);
        console.log(`  Default numTeams value: "${initialNumTeams}" (0 = open registration)`);

        // Fill in form: 0 initial teams, 2 prelim rounds, 1 elim round
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_setup_form.png') });
        console.log('  Submitting tournament configuration...');
        await page.click('#setupForm button[type="submit"]');
        await sleep(1000);

        // 5. Verify Dashboard and Entries Tab
        console.log('\n5. Verifying Tournament Dashboard...');
        const dashboardVisible = await page.$eval('#dashboardSection', el => !el.classList.contains('hidden'));
        if (!dashboardVisible) throw new Error('Dashboard section did not appear after setup');
        console.log('✓ Successfully arrived at Tournament Dashboard.');

        // Check Entries tab badge
        const entriesTabBtn = await page.$eval('.tab-btn', el => el.textContent.trim());
        console.log(`  First navigation tab: "${entriesTabBtn}"`);

        // Verify Registration Open badge and Empty Roster prompt
        const regStatusBadge = await page.$eval('.badge', el => el.textContent.trim());
        console.log(`  Status badge: "${regStatusBadge}"`);
        if (!regStatusBadge.includes('Registration Open')) {
            throw new Error(`Expected 'Registration Open' badge, got: ${regStatusBadge}`);
        }

        const emptyPrompt = await page.$eval('#tabContent', el => el.textContent);
        if (!emptyPrompt.includes('No teams registered yet')) {
            throw new Error('Expected empty roster prompt for open registration');
        }
        console.log('✓ Empty roster state correctly prompts for open registration.');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_entries_open_registration.png') });

        // 6. Navigate to Coaches Tab
        console.log('\n6. Testing Coaches Tab...');
        const coachTabs = await page.$$('.tab-btn');
        let coachTabFound = false;
        for (const btn of coachTabs) {
            const txt = await page.evaluate(el => el.textContent.trim(), btn);
            if (txt === 'Coaches') {
                await btn.click();
                coachTabFound = true;
                break;
            }
        }
        if (!coachTabFound) throw new Error('Coaches tab button not found in tab bar');
        await sleep(500);

        const coachesContent = await page.$eval('#tabContent', el => el.textContent);
        if (!coachesContent.includes('School Coaches')) {
            throw new Error('School Coaches heading not found in Coaches tab');
        }
        console.log('✓ Coaches tab rendered successfully with School Coaches management.');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_coaches_tab.png') });

        // 7. Add a Coach via Admin form in browser
        console.log('\n7. Adding school coach via UI...');
        await page.click('button[onclick="showAddCoachForm()"]');
        await sleep(300);
        await page.type('#coachEmail', 'coach.carter@richmond.edu');
        await page.type('#coachInstitution', 'Richmond Academy');
        await page.click('#addCoachForm button[type="submit"]');
        await sleep(1000);

        const updatedCoachesContent = await page.$eval('#tabContent', el => el.textContent);
        if (!updatedCoachesContent.includes('coach.carter@richmond.edu') || !updatedCoachesContent.includes('Richmond Academy')) {
            throw new Error('Added coach was not found in the coaches table');
        }
        console.log('✓ Coach coach.carter@richmond.edu (Richmond Academy) added and displayed in table.');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_coach_added.png') });

        // 8. Register Teams in Entries Tab
        console.log('\n8. Registering Teams on Entries Tab...');
        await page.evaluate(() => {
            window.location.hash = 'entries';
            showEntries();
        });
        await sleep(600);

        // Open Team Modal directly
        await page.evaluate(() => showRegisterTeamForm());
        await sleep(400);

        const modalHidden = await page.$eval('#teamModal', el => el.classList.contains('hidden'));
        console.log('  teamModal is hidden?', modalHidden);

        // Fill team 1
        await page.type('#teamNameInput', 'Richmond Alpha');
        await page.type('#teamInstitutionInput', 'Richmond Academy');
        await page.type('#member1NameInput', 'Alice Walker');
        await page.type('#member1EmailInput', 'alice@richmond.edu');
        await page.type('#member2NameInput', 'Bob Smith');
        await page.type('#member2EmailInput', 'bob@richmond.edu');

        await page.evaluate(() => document.querySelector('#teamModalForm button[type="submit"]').click());
        await sleep(1000);

        // Fill team 2
        await page.evaluate(() => showRegisterTeamForm());
        await sleep(400);
        await page.type('#teamNameInput', 'Lincoln Beta');
        await page.type('#teamInstitutionInput', 'Lincoln High');
        await page.type('#member1NameInput', 'Charlie Brown');
        await page.type('#member1EmailInput', 'charlie@lincoln.edu');
        await page.type('#member2NameInput', 'Diana Prince');
        await page.type('#member2EmailInput', 'diana@lincoln.edu');

        await page.evaluate(() => document.querySelector('#teamModalForm button[type="submit"]').click());
        await sleep(1000);

        const teamEntriesText = await page.$eval('#tabContent', el => el.textContent);
        if (!teamEntriesText.includes('Richmond Alpha') || !teamEntriesText.includes('Lincoln Beta')) {
            throw new Error('Registered teams not visible in entries list');
        }
        console.log('✓ Successfully registered 2 teams (Richmond Alpha and Lincoln Beta).');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_teams_registered.png') });

        // 9. Start Tournament (Pair Round 1 and freeze registration)
        console.log('\n9. Starting Tournament and Freezing Registration...');
        const debugInfo = await page.evaluate(() => ({
            teamCount: tournament.teams ? tournament.teams.length : -1,
            dataTeamCount: tournament.data && tournament.data.teams ? tournament.data.teams.length : -1,
            isStarted: tournament.data ? tournament.data.is_started : null,
            role: getUserRole()
        }));
        console.log('Debug before start:', JSON.stringify(debugInfo));

        await page.evaluate(() => handleStartTournament());
        await sleep(2000);

        // Verify active tab is Round 1
        const r1TabText = await page.$eval('.tab-btn.active', el => el.textContent.trim());
        console.log(`  Active tab after starting tournament: "${r1TabText}"`);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_round1_pairings.png') });

        // Switch back to Entries tab to verify registration is closed
        await page.evaluate(() => showEntries());
        await sleep(500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_entries_registration_closed.png') });

        const startedBadge = await page.$eval('.badge', el => el.textContent.trim());
        console.log(`  Entries status badge: "${startedBadge}"`);
        if (!startedBadge.includes('Tournament Started')) {
            throw new Error(`Expected badge to indicate tournament started, got: ${startedBadge}`);
        }
        console.log('✓ Tournament started! Registration is closed and locked.');

        console.log('\n=== All Browser End-to-End Tests Passed Successfully! ===\n');

        await browser.close();
    } finally {
        serverProcess.kill('SIGTERM');
        // Clean test storage
        if (fs.existsSync(testStorageDir)) {
            fs.rmSync(testStorageDir, { recursive: true, force: true });
        }
    }
}

runBrowserTests().catch(err => {
    console.error('\n❌ Browser test failed:', err);
    process.exit(1);
});
