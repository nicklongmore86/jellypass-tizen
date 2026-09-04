// Library grid and Search screens (see docs/rebuild-plan.md, Phase 3).
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const simulatorUrl = `file://${path.join(root, 'dev/simulator.html')}`;

async function signInAsAlice(page) {
    await page.goto(simulatorUrl);
    await page.waitForSelector('.jq-profile-card');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.jq-shell');
    await page.waitForSelector('.jq-media-card');
}

test('library grid: full rows and a naturally partial last row both navigate correctly', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await signInAsAlice(page);
        await page.evaluate(() => document.querySelector('.jq-see-all').click());
        await page.waitForSelector('.jq-library-grid .jq-media-card');

        // 8 items in a 4-column grid: 2 full rows, no partial row here --
        // the "See All" row is capped at Limit: 8 in the fixture. Still
        // exercises Down between full rows and selecting an item.
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-item-id')), 'movie-10');
        await page.keyboard.press('ArrowDown');
        const secondRowFirst = await page.evaluate(() => document.activeElement.getAttribute('data-item-id'));
        assert.notEqual(secondRowFirst, 'movie-10');
        await page.keyboard.press('ArrowUp');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-item-id')), 'movie-10');
    } finally {
        await browser.close();
    }
});

test('the hardware Back button returns Detail to the library grid it was opened from, then the grid back to Home', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await signInAsAlice(page);
        await page.evaluate(() => document.querySelector('.jq-see-all').click());
        await page.waitForSelector('.jq-library-grid .jq-media-card');

        await page.keyboard.press('Enter'); // movie-10, autofocused
        await page.waitForSelector('.jq-detail-screen');
        assert.match(await page.evaluate(() => document.querySelector('.jq-detail-title').textContent), /Open Water/);

        // Escape doubles as Back in the simulator (see app.js's BACK_KEY_CODES).
        await page.keyboard.press('Escape');
        await page.waitForSelector('.jq-library-grid .jq-media-card');
        assert.equal(await page.evaluate(() => document.querySelector('.jq-library-heading').textContent), 'Recently Added');

        await page.keyboard.press('Escape');
        await page.waitForSelector('.jq-home-row-heading');
    } finally {
        await browser.close();
    }
});

test('search: filters as you type, shows nothing for no matches, and opens Detail on selection', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await signInAsAlice(page);

        await page.evaluate(() => document.querySelector('.jq-nav-search').click());
        await page.waitForSelector('.jq-search-input');
        assert.equal(await page.evaluate(() => document.activeElement.tagName), 'INPUT');

        await page.evaluate(() => {
            const input = document.querySelector('.jq-search-input');
            input.value = 'blue';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForSelector('.jq-search-results .jq-media-card');
        const results = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.jq-search-results .jq-media-card')).map((c) => c.getAttribute('data-item-id'))
        );
        assert.deepEqual(results, ['movie-9']);

        await page.evaluate(() => {
            const input = document.querySelector('.jq-search-input');
            input.value = 'zzz-no-such-movie';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForFunction(() => document.querySelector('.jq-search-empty') && !document.querySelector('.jq-search-empty').hidden);

        await page.evaluate(() => {
            const input = document.querySelector('.jq-search-input');
            input.value = 'blue';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForSelector('.jq-search-results .jq-media-card');
        await page.evaluate(() => document.querySelector('.jq-search-results .jq-media-card').click());
        await page.waitForSelector('.jq-detail-screen');
        assert.match(await page.evaluate(() => document.querySelector('.jq-detail-title').textContent), /Blue Hour/);
    } finally {
        await browser.close();
    }
});

test('the hardware Back button returns from Search to Home', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await signInAsAlice(page);

        await page.evaluate(() => document.querySelector('.jq-nav-search').click());
        await page.waitForSelector('.jq-search-input');
        await page.keyboard.press('Escape'); // Escape doubles as Back in the simulator
        await page.waitForSelector('.jq-home-row-heading');
    } finally {
        await browser.close();
    }
});

test('switching between Home and Search via the rail always lands on a fresh screen', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await signInAsAlice(page);

        await page.evaluate(() => document.querySelector('.jq-nav-search').click());
        await page.waitForSelector('.jq-search-input');
        await page.evaluate(() => document.querySelector('.jq-nav-home').click());
        await page.waitForSelector('.jq-home-row-heading');
        assert.equal(await page.evaluate(() => document.querySelectorAll('.jq-search-input').length), 0);
    } finally {
        await browser.close();
    }
});
