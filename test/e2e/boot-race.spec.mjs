// Regression test for the Phase 5 real-hardware boot race (see
// docs/rebuild-plan.md): jellyquest.js is injected before jellyfin-web's
// own bundle and can run before window.ApiClient exists yet. Every other
// test relies on dev/fixtures/api-client-stub.js defining ApiClient
// synchronously before jellyquest.js's own <script> tag runs at all,
// which is exactly why this never showed up until real hardware --
// window.__jqTestDelayApiClientMs (see that fixture) reproduces the real
// timing instead.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './support/server.mjs';

const server = await startServer();
const simulatorUrl = `${server.baseUrl}/dev/simulator.html`;
test.after(() => server.close());

test('JellyQuest waits for a late window.ApiClient instead of crashing', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error));

        await page.addInitScript(() => { window.__jqTestDelayApiClientMs = 300; });
        await page.goto(simulatorUrl);

        // Immediately after load, ApiClient isn't there yet -- JellyQuest
        // must not have thrown trying to use it already.
        assert.equal(await page.evaluate(() => typeof window.ApiClient), 'undefined');
        assert.deepEqual(pageErrors, []);

        // Once ApiClient does show up (300ms later per the delay above),
        // the profile picker should render exactly as it does everywhere
        // else -- proving the wait actually resolves, not just avoids
        // crashing.
        await page.waitForSelector('.jq-profile-card');
        const names = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.jq-profile-card')).map((card) => card.textContent)
        );
        assert.deepEqual(names, ['Alice', 'Bob', 'Charlie']);
        assert.deepEqual(pageErrors, []);
    } finally {
        await browser.close();
    }
});
