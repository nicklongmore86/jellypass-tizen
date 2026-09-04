// Drives the real profile picker + shell (see docs/rebuild-plan.md,
// Phase 2) against the simulator. Supersedes the Phase 1 spike
// (focus.spec.mjs, now removed) now that a real screen exercises the
// same navigation conventions -- .jq-row here plays the role
// jq-row/jq-rail did in that spike.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const simulatorUrl = `file://${path.join(root, 'dev/simulator.html')}`;

test('profile picker is the landing screen: no login form, autofocus on the first profile', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(simulatorUrl);
        await page.waitForSelector('.jq-profile-card');

        const names = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.jq-profile-card')).map((card) => card.textContent)
        );
        assert.deepEqual(names, ['Alice', 'Bob', 'Charlie']);
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Alice');

        // No manual-login/Quick Connect/admin surfaces anywhere on this screen.
        assert.equal(await page.evaluate(() => document.querySelectorAll('input, form').length), 0);
    } finally {
        await browser.close();
    }
});

test('arrow keys move across the profile row', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(simulatorUrl);
        await page.waitForSelector('.jq-profile-card');

        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Bob');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Charlie');
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Bob');
    } finally {
        await browser.close();
    }
});

test('selecting a profile switches instantly: no page navigation, no login step', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        let navigated = false;
        page.on('framenavigated', () => { navigated = true; });

        await page.goto(simulatorUrl);
        await page.waitForSelector('.jq-profile-card');
        navigated = false; // ignore the initial goto's own navigation

        await page.keyboard.press('Enter');
        await page.waitForSelector('.jq-shell');

        assert.equal(navigated, false, 'switching profile must not navigate the page');
        assert.deepEqual(
            await page.evaluate(() => window.JellyQuestSession.getCurrentProfile()),
            { Id: 'user-alice', Name: 'Alice' }
        );
        // The shell's rail autofocuses the profile button, showing who's active.
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Alice');
        assert.deepEqual(
            await page.evaluate(() => Array.from(document.querySelectorAll('.jq-rail-item')).map((el) => el.textContent)),
            ['Alice', 'Home', 'Requests']
        );
    } finally {
        await browser.close();
    }
});

test('the profile button returns to the picker and a different profile can be selected -- repeatable, no re-auth screen', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(simulatorUrl);
        await page.waitForSelector('.jq-profile-card');

        // Alice -> shell -> back to picker.
        await page.keyboard.press('Enter');
        await page.waitForSelector('.jq-shell');
        await page.keyboard.press('Enter');
        await page.waitForSelector('.jq-profile-card');
        assert.equal(await page.evaluate(() => window.JellyQuestSession.getCurrentProfile()), null);

        // Pick Bob this time.
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Bob');
        await page.keyboard.press('Enter');
        await page.waitForSelector('.jq-shell');

        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Bob');
        assert.equal(
            await page.evaluate(() => window.JellyQuestSession.getCurrentProfile().Name),
            'Bob'
        );
    } finally {
        await browser.close();
    }
});

test('down/up move from the rail into Home content and back', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(simulatorUrl);
        await page.waitForSelector('.jq-profile-card');
        await page.keyboard.press('Enter');
        await page.waitForSelector('.jq-shell');

        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Home');
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Requests');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Alice');
    } finally {
        await browser.close();
    }
});
