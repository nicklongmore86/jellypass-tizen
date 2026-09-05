import test from 'node:test';
import { chromium } from 'playwright';
import { startServer } from './support/server.mjs';
import { assertSiblingSpacing, assertWrappedSpacing } from './support/spacing.mjs';

const server = await startServer();
test.after(() => server.close());

// Reach screens through the same profile, navigation, search and More actions
// used by the existing specs. No production hooks or synthetic card elements.
async function openScreen(page, screen) {
    await page.goto(`${server.baseUrl}/dev/simulator.html`);
    await page.waitForSelector('.jq-profile-card');
    if (screen === 'profiles') return;
    await page.keyboard.press('Enter'); // Alice
    await page.waitForSelector('.jq-media-card');
    if (screen === 'home') return;
    if (screen === 'detail' || screen === 'playback') {
        await page.locator('[data-item-id="movie-1"]').click();
        await page.waitForSelector('.jq-detail-action');
        if (screen === 'playback') {
            await page.locator('.jq-detail-action').filter({ hasText: /^More$/ }).click();
            await page.waitForSelector('.jq-playback-options');
        }
        return;
    }
    await page.locator(`.jq-nav-${screen}`).click();
    const input = page.locator(`.jq-${screen}-input`);
    await input.fill('a'); // Multiple existing matches in both simulator fixtures.
    await page.waitForSelector(screen === 'search'
        ? '.jq-search-results .jq-media-card' : '.jq-request-card');
}

for (const [selector, screen, axis] of [
    ['.jq-rail', 'home', 'y'],
    ['.jq-profiles-row', 'profiles', 'x'],
    ['.jq-home-row', 'home', 'x'],
    ['.jq-search-results', 'search', 'x'],
    ['.jq-detail-actions', 'detail', 'x'],
    ['.jq-playback-options', 'playback', 'y'],
    ['.jq-playback-option-group', 'playback', 'y'],
    ['.jq-request-card', 'requests', 'y'],
    ['.jq-requests-results', 'requests', 'wrapped'],
]) {
    test(`margin spacing without flex gap: ${selector}`, async () => {
        const browser = await chromium.launch();
        try {
            // At 1020px the real Requests cards form a two-card line plus one
            // wrapped card, exercising both axes and container compensation.
            const page = await browser.newPage({
                viewport: { width: axis === 'wrapped' ? 1020 : 1920, height: 1080 },
            });
            await openScreen(page, screen);
            if (axis === 'wrapped') await assertWrappedSpacing(page, selector);
            else await assertSiblingSpacing(page, selector, axis);
        } finally {
            await browser.close();
        }
    });
}
