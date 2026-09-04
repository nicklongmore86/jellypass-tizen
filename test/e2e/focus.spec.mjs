// Drives the browser simulator headlessly and asserts on actual focus
// state after each key press -- not just that the page renders. This is
// the harness every future screen's navigation gets tested against
// instead of relying on physical-TV test cycles (see
// /root/.claude/plans/silly-growing-haven.md, Phase 1).
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const simulatorUrl = `file://${path.join(root, 'dev/simulator.html')}`;

async function focusedTestId(page) {
    return page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return null;
        return active.id || active.getAttribute('data-item-id') || active.className;
    });
}

test('rail and content row: down/up move within the rail, right/left cross into content', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(simulatorUrl);
        await page.waitForSelector('.jq-card');

        // Autofocus lands on the first rail item (Home).
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Home');

        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'open-settings');

        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Requests');

        await page.keyboard.press('ArrowUp');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'open-settings');

        // Right from the rail crosses into the content row's first card.
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowRight');
        assert.equal(await focusedTestId(page), 'item-1');

        // Right/left move across cards within the row.
        await page.keyboard.press('ArrowRight');
        assert.equal(await focusedTestId(page), 'item-2');
        await page.keyboard.press('ArrowRight');
        assert.equal(await focusedTestId(page), 'item-3');
        await page.keyboard.press('ArrowLeft');
        assert.equal(await focusedTestId(page), 'item-2');

        await page.keyboard.press('ArrowLeft');
        assert.equal(await focusedTestId(page), 'item-1');

        // Left from the first card in the row returns to the rail.
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'open-settings');
    } finally {
        await browser.close();
    }
});

test('modal dialog contains focus: arrow keys cannot escape it, closing restores the trigger', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(simulatorUrl);
        await page.waitForSelector('.jq-card');

        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'open-settings');
        await page.keyboard.press('Enter');

        // Focus moved into the modal, onto its first (autofocus) option.
        assert.equal(
            await page.evaluate(() => document.activeElement.textContent),
            'Maximum audio channels'
        );

        // Down/Down should stay inside the modal and reach Close, never
        // escaping to the rail or content row behind it.
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'close-settings');

        // One more Down must not leave the modal (contain mode).
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'close-settings');

        await page.keyboard.press('Enter');
        // Closing restores focus to the button that opened it.
        assert.equal(await page.evaluate(() => document.activeElement.id), 'open-settings');
        assert.equal(await page.evaluate(() => document.getElementById('settings-backdrop').hidden), true);
    } finally {
        await browser.close();
    }
});

test('grid: up/down move by row and column, not nearest-element geometry', async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
        await page.goto(simulatorUrl);
        await page.waitForSelector('#library-grid .jq-card');

        // Library.jq-grid is 3 columns x 2 rows of the same 6 fixture
        // items (grid-item-1..6). Start at row 1, column 2.
        await page.evaluate(() => document.querySelector('[data-item-id="grid-item-2"]').focus());

        await page.keyboard.press('ArrowDown');
        assert.equal(await focusedTestId(page), 'grid-item-5');

        await page.keyboard.press('ArrowRight');
        assert.equal(await focusedTestId(page), 'grid-item-6');

        await page.keyboard.press('ArrowUp');
        assert.equal(await focusedTestId(page), 'grid-item-3');

        await page.keyboard.press('ArrowLeft');
        assert.equal(await focusedTestId(page), 'grid-item-2');
    } finally {
        await browser.close();
    }
});
