import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('locks generated Jellyfin Web configuration to Farmhouse', () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyquest-tizen-'));
    fs.writeFileSync(path.join(outputDirectory, 'config.json'), JSON.stringify({ multiserver: true, servers: [], plugins: [] }));

    const result = spawnSync(process.execPath, [path.join(root, 'scripts/configure-jellyquest.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, JELLYFIN_TIZEN_WWW_DIR: outputDirectory }
    });

    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'config.json'), 'utf8'));
    assert.equal(config.multiserver, false);
    assert.deepEqual(config.servers, ['https://jelly-farmhouse.starrgroup.io']);
    assert.deepEqual(config.menuLinks, [{
        name: 'Requests',
        icon: 'add_circle',
        url: 'https://jellyseerr.starrgroup.io'
    }]);
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'jellyquest-build.json'), 'utf8'));
    assert.equal(metadata.household, 'farmhouse');
    assert.equal(metadata.requestsUrl, 'https://jellyseerr.starrgroup.io');
    assert.equal(metadata.requestsBridgeUrl, 'https://jelly-farmhouse.starrgroup.io/jellyquest-bridge/bridge.html');
    assert.equal(metadata.requestsPageVersion, '1.0.2');
    assert.match(metadata.jellyfinWebRef, /^[a-f0-9]{40}$/);
});

test('overlay injection points still target the app-owned files', () => {
    // jellyquest.css/jellyquest.js content is being rebuilt from scratch (see the
    // blank-canvas rebuild plan); this test only pins the injection contract that
    // gulpfile.babel.js and tizen.js must keep honoring, not the overlay's content.
    const gulpfile = fs.readFileSync(path.join(root, 'gulpfile.babel.js'), 'utf8');
    const adapter = fs.readFileSync(path.join(root, 'tizen.js'), 'utf8');
    const manifest = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');

    assert.match(gulpfile, /\.\.\/jellyquest\.css/);
    assert.match(gulpfile, /\.\.\/jellyquest\.js/);
    assert.match(gulpfile, /data: blob: gap:/);
    assert.match(adapter, /JellyQuest for Tizen/);
    assert.doesNotMatch(adapter, /'multiserver'/);
    assert.match(manifest, /id="JellyQuest\.JellyQuest"/);
    assert.match(manifest, /package="JellyQuest"/);
    assert.doesNotMatch(manifest, /AprZAARz4r\.Jellyfin/);
});

test('keeps development configuration and notes out of the TV package', () => {
    const packager = fs.readFileSync(path.join(root, 'scripts/package-wgt.sh'), 'utf8');

    assert.match(packager, /-e DETAIL_ACTIONS\.md/);
    assert.match(packager, /-e jellyquest\.config\.json/);
    assert.match(packager, /-e "integration\/\*"/);
    assert.doesNotMatch(packager, /bridge\/\*/);
    assert.match(packager, /www\/jellyseerr-login\.html/);
});

test('patches Jellyfin Web to handle generated detail playback actions', () => {
    const patcher = fs.readFileSync(path.join(root, 'scripts/patch-jellyfin-web.mjs'), 'utf8');

    assert.match(patcher, /itemShortcuts\.on\(view\.querySelector\('\.mainDetailButtons'\)\)/);
    assert.match(patcher, /itemShortcuts\.off\(view\.querySelector\('\.mainDetailButtons'\)\)/);
    assert.match(patcher, /mediaSourceId: card\.getAttribute\('data-mediasourceid'\)/);
});

test('patches Jellyfin playback shortcuts with per-item stream selections', () => {
    const webDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyquest-web-patch-'));
    const componentDirectory = path.join(webDirectory, 'src/components');
    const itemDetailsDirectory = path.join(webDirectory, 'src/controllers/itemDetails');
    fs.mkdirSync(componentDirectory, { recursive: true });
    fs.mkdirSync(itemDetailsDirectory, { recursive: true });
    const shortcutsPath = path.join(componentDirectory, 'shortcuts.js');
    const itemDetailsPath = path.join(itemDetailsDirectory, 'index.js');
    fs.writeFileSync(shortcutsPath, `function play() {
            playbackManager.play({
                ids: [playableItemId],
                startPositionTicks: startPositionTicks,
                serverId: serverId,
                queryOptions: {
                    SortBy: 'SortName'
                }
            });
}`);
    fs.writeFileSync(itemDetailsPath, `function bind(view) {
            itemShortcuts.on(view.querySelector('.nameContainer'));
            itemShortcuts.off(view.querySelector('.nameContainer'));
}`);

    const patcher = path.join(root, 'scripts/patch-jellyfin-web.mjs');
    const first = spawnSync(process.execPath, [patcher, webDirectory], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const patched = fs.readFileSync(shortcutsPath, 'utf8');
    assert.match(patched, /mediaSourceId: card\.getAttribute\('data-mediasourceid'\)/);
    assert.match(patched, /audioStreamIndex: optionalStreamIndex\('data-audiostreamindex'\)/);
    assert.match(patched, /subtitleStreamIndex: optionalStreamIndex\('data-subtitlestreamindex'\)/);
    const patchedItemDetails = fs.readFileSync(itemDetailsPath, 'utf8');
    assert.match(patchedItemDetails, /itemShortcuts\.on\(view\.querySelector\('\.mainDetailButtons'\)\)/);
    assert.match(patchedItemDetails, /itemShortcuts\.off\(view\.querySelector\('\.mainDetailButtons'\)\)/);

    const second = spawnSync(process.execPath, [patcher, webDirectory], { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(fs.readFileSync(shortcutsPath, 'utf8'), patched);
    assert.equal(fs.readFileSync(itemDetailsPath, 'utf8'), patchedItemDetails);
});

test('installs through the direct Samsung TV workflow', () => {
    const launcher = fs.readFileSync(path.join(root, 'scripts/install-tv.sh'), 'utf8');
    const installer = fs.readFileSync(path.join(root, 'scripts/install-wgt.sh'), 'utf8');

    assert.match(launcher, /docker run --rm --network host/);
    assert.match(installer, /sdb connect/);
    assert.match(installer, /vd_appuninstall/);
    assert.match(installer, /vd_appinstall/);
    assert.match(installer, /vd_applist/);
    assert.match(installer, /execute/);
    assert.match(installer, /app_version/);
});
