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

for (const recovery of ['failure', 'empty', 'success']) {
    test(`a rejected Requests search is visible and recovers to ${recovery}`, async () => {
        const browser = await chromium.launch();
        try {
            const page = await browser.newPage();
            await openRequestsAs(page, 'Alice');
            await page.waitForSelector('.jq-requests-input');
            await page.evaluate(() => {
                const call = window.JellyQuestRequestsBridge.call;
                window.JellyQuestRequestsBridge.call = function (path, options) {
                    if (path.includes('query=fail')) return Promise.reject(new Error('Proxy unavailable'));
                    return call(path, options);
                };
            });
            await page.locator('.jq-requests-input').fill('fail');
            await page.waitForFunction(() => {
                const status = document.querySelector('.jq-requests-status');
                return !status.hidden && status.textContent === 'Search failed. Try again.';
            }, null, { timeout: 2000 });
            assert.equal(await page.locator('.jq-requests-status').isVisible(), true);
            assert.equal(await page.locator('.jq-requests-empty').isVisible(), false);
            assert.equal(await page.locator('.jq-request-card').count(), 0);
            if (recovery === 'failure') return;
            await page.locator('.jq-requests-input').fill(recovery === 'empty' ? 'zzzz-no-movie' : 'Nebula Drift');
            await page.waitForSelector(recovery === 'empty' ? '.jq-requests-empty' : '.jq-request-card');
            assert.equal(await page.locator('.jq-requests-status').isVisible(), false);
            if (recovery === 'empty') {
                assert.equal(await page.locator('.jq-requests-empty').textContent(), 'No matches.');
                assert.equal(await page.locator('.jq-request-card').count(), 0);
            } else {
                assert.equal(await page.locator('.jq-request-card-title').textContent(), 'Nebula Drift');
                assert.equal(await page.locator('.jq-requests-empty').isVisible(), false);
            }
        } finally {
            await browser.close();
        }
    });
}

for (const scenario of ['library search', 'library', 'home', 'profiles', 'favorite', 'request', 'claim']) {
    test(`a failed ${scenario} operation shows a message`, async () => {
        const browser = await chromium.launch();
        try {
            const page = await browser.newPage();
            await openRequestsAs(page, 'Alice');
            await page.waitForSelector('.jq-requests-input');
            if (scenario === 'request' || scenario === 'claim') {
                await searchFor(page, scenario === 'request' ? 'Nebula Drift' : 'Harbor Lights');
                await page.waitForFunction(() => document.querySelector('.jq-request-card-action').tagName === 'BUTTON');
                await page.evaluate(() => {
                    window.JellyQuestRequestsBridge.call = () => Promise.reject(new Error('Offline'));
                    document.querySelector('.jq-request-card-action').click();
                });
            } else {
                await page.evaluate((scenario) => {
                    const container = document.createElement('div');
                    container.id = 'failure-test';
                    document.body.appendChild(container);
                    const reject = () => Promise.reject(new Error('Offline'));
                    if (scenario === 'library search') {
                        window.ApiClient.getItems = reject;
                        window.JellyQuestSearchScreen.render(container, {});
                        const input = container.querySelector('input');
                        input.value = 'movie';
                        input.dispatchEvent(new Event('input'));
                    } else if (scenario === 'library') {
                        window.JellyQuestLibraryScreen.render(container, { title: 'Movies', fetch: reject }, { onBack() {} });
                    } else if (scenario === 'home') {
                        window.ApiClient.getItems = reject;
                        window.JellyQuestHomeScreen.render(container, {});
                    } else if (scenario === 'profiles') {
                        window.JellyQuestSession.listProfiles = reject;
                        window.JellyQuestProfilesScreen.render(container, () => {});
                    } else {
                        window.ApiClient.updateFavoriteStatus = reject;
                        window.JellyQuestDetailScreen.render(container, { Id: 'movie', Name: 'Movie' }, {});
                        container.querySelector('.jq-my-list-action').click();
                    }
                }, scenario);
            }
            const messages = {
                'library search': 'Search failed. Try again.',
                library: 'Library is unavailable right now. Try again.',
                home: 'Continue Watching is unavailable right now.',
                profiles: 'Profiles are unavailable right now. Try again.',
                favorite: 'Could not update My List. Try again.',
                request: 'Request failed. Try again.',
                claim: 'Could not add to My Library. Try again.',
            };
            await page.getByText(messages[scenario], { exact: true }).waitFor({ state: 'visible', timeout: 2000 });
        } finally {
            await browser.close();
        }
    });
}
