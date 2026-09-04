// Requests screen (see docs/rebuild-plan.md, Phase 4): search, request,
// and claim, driven against dev/fixtures/requests-bridge.html standing in
// for JellyPass's real bridge.html.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './support/server.mjs';

const server = await startServer();
const simulatorUrl = `${server.baseUrl}/dev/simulator.html`;
test.after(() => server.close());

async function openRequestsAs(page, profileName) {
    await page.goto(simulatorUrl);
    await page.waitForSelector('.jq-profile-card');
    await page.evaluate((name) => {
        Array.from(document.querySelectorAll('.jq-profile-card')).find((card) => card.textContent === name).click();
    }, profileName);
    await page.waitForSelector('.jq-shell');
    await page.evaluate(() => document.querySelector('.jq-nav-requests').click());
}

async function searchFor(page, term) {
    await page.waitForSelector('.jq-requests-input');
    await page.evaluate((value) => {
        const input = document.querySelector('.jq-requests-input');
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, term);
    await page.waitForSelector('.jq-request-card');
}

test('an eligible profile can search and gets one card per movie result', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openRequestsAs(page, 'Alice');
        await searchFor(page, 'a'); // matches Nebula Drift, Salt Flats, Harbor Lights

        const titles = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.jq-request-card-title')).map((el) => el.textContent)
        );
        assert.deepEqual(titles.sort(), ['Harbor Lights', 'Nebula Drift', 'Salt Flats']);
    } finally {
        await browser.close();
    }
});

test('a profile without a Jellyseerr account sees a message instead of a search box', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openRequestsAs(page, 'Charlie'); // fixture: not in eligibleUserIds

        await page.waitForFunction(() =>
            document.querySelector('.jq-requests-status') && !document.querySelector('.jq-requests-status').hidden
            && document.querySelector('.jq-requests-status').textContent === 'Requests are not available for this profile.'
        );
        assert.equal(await page.evaluate(() => document.querySelectorAll('.jq-requests-input').length), 0);
    } finally {
        await browser.close();
    }
});

test('a title with no request shows Request; requesting it flips the card to Requested', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openRequestsAs(page, 'Alice');
        await searchFor(page, 'Nebula Drift');

        assert.equal(await page.evaluate(() => document.querySelector('.jq-request-card-action').textContent), 'Request');
        await page.evaluate(() => document.querySelector('.jq-request-card-action').click());
        await page.waitForFunction(() => document.querySelector('.jq-request-card-action').textContent === 'Requested');

        // Requested is a plain status, not an action -- no button left to click.
        assert.equal(await page.evaluate(() => document.querySelector('.jq-request-card-action').tagName), 'SPAN');
    } finally {
        await browser.close();
    }
});

test('an already-requested title shows Requested with no action, regardless of who requested it', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openRequestsAs(page, 'Bob');
        await searchFor(page, 'Salt Flats'); // fixture: mediaInfo.status 2 (pending) from the start

        assert.equal(await page.evaluate(() => document.querySelector('.jq-request-card-action').textContent), 'Requested');
    } finally {
        await browser.close();
    }
});

test('an available title offers Add to My Library, and claiming it flips to In My Library', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openRequestsAs(page, 'Alice');
        await searchFor(page, 'Harbor Lights'); // fixture: status 5 (available), not yet claimed by Alice

        await page.waitForFunction(() => document.querySelector('.jq-request-card-action').textContent === 'Add to My Library');
        await page.evaluate(() => document.querySelector('.jq-request-card-action').click());
        await page.waitForFunction(() => document.querySelector('.jq-request-card-action').textContent === 'In My Library');
    } finally {
        await browser.close();
    }
});

test('the hardware Back button returns from Requests to Home', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openRequestsAs(page, 'Alice');
        await page.waitForSelector('.jq-requests-input');

        await page.keyboard.press('Escape'); // Escape doubles as Back in the simulator
        await page.waitForSelector('.jq-home-row-heading');
    } finally {
        await browser.close();
    }
});
