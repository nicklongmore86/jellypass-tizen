import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('postinstall skips a missing Jellyfin Web build with actionable instructions', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyquest-install-'));
    try {
        const result = spawnSync(process.execPath, [path.join(root, 'scripts/postinstall.mjs')], {
            cwd: directory,
            encoding: 'utf8',
            env: { ...process.env, JELLYFIN_WEB_DIR: '', npm_execpath: path.join(directory, 'missing-npm.mjs') }
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Skipping the jellyfin-web-dependent build/);
        assert.match(result.stdout, /npm run build:full/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('postinstall reports actionable instructions when invoked without npm', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyquest-install-'));
    try {
        const env = { ...process.env, JELLYFIN_WEB_DIR: directory };
        delete env.npm_execpath;
        const result = spawnSync(process.execPath, [path.join(root, 'scripts/postinstall.mjs')], {
            cwd: directory,
            encoding: 'utf8',
            env
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /npm_execpath is unset/);
        assert.match(result.stderr, /Run npm run postinstall/);
        assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('postinstall delegates to npm run build and preserves failures for default and overridden Web paths', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyquest-install-'));
    try {
        const npmPath = path.join(directory, 'npm.mjs');
        fs.writeFileSync(npmPath, `import assert from 'node:assert/strict';
assert.deepEqual(process.argv.slice(2), ['run', 'build']);
console.log('fixture build invoked');
process.exitCode = Number(process.env.FIXTURE_BUILD_STATUS);
`);
        for (const webPath of ['', 'custom-web/dist', path.join(directory, 'absolute-web/dist')]) {
            const dist = path.resolve(directory, webPath || 'node_modules/jellyfin-web/dist');
            fs.mkdirSync(dist, { recursive: true });
            for (const status of [0, 7]) {
                const result = spawnSync(process.execPath, [path.join(root, 'scripts/postinstall.mjs')], {
                    cwd: directory,
                    encoding: 'utf8',
                    env: { ...process.env, JELLYFIN_WEB_DIR: webPath, npm_execpath: npmPath, FIXTURE_BUILD_STATUS: String(status) }
                });
                assert.equal(result.status, status, result.stderr);
                assert.match(result.stdout, /fixture build invoked/);
                assert.doesNotMatch(result.stdout, /Skipping/);
            }
            fs.rmSync(dist, { recursive: true });
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('committed jellyquest.js/jellyquest.css match what src/overlay/* currently generates', () => {
    // jellyquest.js/jellyquest.css are generated (see scripts/build-overlay.mjs)
    // but committed directly, since gulpfile.babel.js/package-wgt.sh expect
    // them to already exist at the project root at packaging time. This
    // regenerates them for real and fails if that produced any diff --
    // catching the case where src/overlay/* was edited without re-running
    // `npm run build:overlay` before committing.
    const before = {
        js: fs.readFileSync(path.join(root, 'jellyquest.js'), 'utf8'),
        css: fs.readFileSync(path.join(root, 'jellyquest.css'), 'utf8'),
    };
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-overlay.mjs')], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const after = {
        js: fs.readFileSync(path.join(root, 'jellyquest.js'), 'utf8'),
        css: fs.readFileSync(path.join(root, 'jellyquest.css'), 'utf8'),
    };
    assert.equal(after.js, before.js, 'jellyquest.js is stale -- run `npm run build:overlay` and commit the result');
    assert.equal(after.css, before.css, 'jellyquest.css is stale -- run `npm run build:overlay` and commit the result');
});

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
    assert.match(packager, /-e "artifacts\/\*"/);
    assert.match(packager, /-e "dev\/\*"/);
    assert.match(packager, /-e "docs\/\*"/);
    assert.match(packager, /-e "integration\/\*"/);
    assert.match(packager, /-e "src\/\*"/);
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
