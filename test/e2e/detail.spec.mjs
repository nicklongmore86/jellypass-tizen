// Detail/playback screen (see docs/rebuild-plan.md, Phase 3 and
// DETAIL_ACTIONS.md). Covers the movie actions this pass implements:
// Resume/Play, Start Over, Trailer, My List, and the conditional More
// menu -- including reintroducing .jq-modal/contain-mode coverage that
// lapsed when the Phase 1 spike (focus.spec.mjs) was retired in Phase 2.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const simulatorUrl = `file://${path.join(root, 'dev/simulator.html')}`;

async function openDetail(page, itemId) {
    await page.goto(simulatorUrl);
    await page.waitForSelector('.jq-profile-card');
    await page.keyboard.press('Enter'); // Alice
    await page.waitForSelector('.jq-media-card');
    await page.evaluate((id) => document.querySelector(`[data-item-id="${id}"]`).click(), itemId);
    await page.waitForSelector('.jq-detail-screen');
}

test('a resumable item with a trailer and multiple tracks shows the full action set', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-1');

        assert.deepEqual(
            await page.evaluate(() => Array.from(document.querySelectorAll('.jq-detail-action')).map((b) => b.textContent)),
            ['Resume', 'Start Over', 'Trailer', 'Add to My List', 'More']
        );
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Resume');
    } finally {
        await browser.close();
    }
});

test('an item with no progress, no trailer, and no extra tracks shows just Play and My List', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-9'); // Blue Hour: no UserData progress, no trailer, no MediaStreams

        assert.deepEqual(
            await page.evaluate(() => Array.from(document.querySelectorAll('.jq-detail-action')).map((b) => b.textContent)),
            ['Play', 'Add to My List']
        );
    } finally {
        await browser.close();
    }
});

test('Play/Resume/Start Over call playbackManager.play with the right start position', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-1');

        await page.keyboard.press('Enter'); // Resume
        const resumeCall = await page.evaluate(() => window.playbackManager.__calls.slice(-1)[0]);
        assert.equal(resumeCall.ids[0], 'movie-1');
        assert.ok(resumeCall.startPositionTicks > 0, 'Resume must start from the saved position');

        await page.keyboard.press('ArrowRight'); // Start Over
        await page.keyboard.press('Enter');
        const startOverCall = await page.evaluate(() => window.playbackManager.__calls.slice(-1)[0]);
        assert.equal(startOverCall.startPositionTicks, 0);
    } finally {
        await browser.close();
    }
});

test('Trailer plays the trailer item, not the movie itself', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-1');

        await page.keyboard.press('ArrowRight'); // Resume -> Start Over
        await page.keyboard.press('ArrowRight'); // Start Over -> Trailer
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Trailer');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.playbackManager.__calls.length > 0);
        const call = await page.evaluate(() => window.playbackManager.__calls.slice(-1)[0]);
        assert.equal(call.ids[0], 'movie-1-trailer');
    } finally {
        await browser.close();
    }
});

test('My List toggles the favorite label and persists through ApiClient', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-9');

        await page.keyboard.press('ArrowRight'); // Play -> Add to My List
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Add to My List');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.activeElement.textContent === 'Remove from My List');

        const favorite = await page.evaluate(() => window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), 'movie-9'));
        assert.equal(favorite.UserData.IsFavorite, true);
    } finally {
        await browser.close();
    }
});

test('More opens a focus-contained Playback Options dialog and Close restores focus to More', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-1');

        await page.keyboard.press('ArrowRight'); // Resume -> Start Over
        await page.keyboard.press('ArrowRight'); // Start Over -> Trailer
        await page.keyboard.press('ArrowRight'); // Trailer -> Add to My List
        await page.keyboard.press('ArrowRight'); // Add to My List -> More
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'More');
        await page.keyboard.press('Enter');

        await page.waitForSelector('.jq-playback-options');
        assert.deepEqual(
            await page.evaluate(() => Array.from(document.querySelectorAll('.jq-modal-option')).map((b) => b.textContent)),
            ['English 5.1', 'French Stereo', 'Off', 'English', 'French', 'Close']
        );
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'English 5.1');

        // Contain mode: repeated Down never escapes the dialog.
        for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Close');

        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.querySelector('.jq-modal-backdrop').hidden), true);
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'More');
    } finally {
        await browser.close();
    }
});

test('the hardware Back button closes an open modal instead of navigating away from Detail', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-1');

        await page.evaluate(() => Array.from(document.querySelectorAll('.jq-detail-action')).find((b) => b.textContent === 'More').click());
        await page.waitForSelector('.jq-playback-options');

        // Escape doubles as Back in the simulator (see app.js's BACK_KEY_CODES).
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('.jq-modal-backdrop').hidden);

        // Still on Detail -- Back closed the dialog, it did not also
        // trigger Detail's own "return to where I came from" handler.
        assert.ok(await page.evaluate(() => Boolean(document.querySelector('.jq-detail-screen'))));
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'More');
    } finally {
        await browser.close();
    }
});

test('Left from the first action returns to the persistent rail', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await openDetail(page, 'movie-1');

        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Resume');
        await page.keyboard.press('ArrowLeft');
        assert.equal(
            await page.evaluate(() => document.activeElement.classList.contains('jq-rail-item')),
            true
        );
    } finally {
        await browser.close();
    }
});
