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
    assert.match(metadata.jellyfinWebRef, /^[a-f0-9]{40}$/);
});

test('injects app-owned household login policy before Jellyfin Web', () => {
    const gulpfile = fs.readFileSync(path.join(root, 'gulpfile.babel.js'), 'utf8');
    const adapter = fs.readFileSync(path.join(root, 'tizen.js'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'jellyquest.css'), 'utf8');
    const policy = fs.readFileSync(path.join(root, 'jellyquest.js'), 'utf8');
    const manifest = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');

    assert.match(gulpfile, /\.\.\/jellyquest\.css/);
    assert.match(gulpfile, /\.\.\/jellyquest\.js/);
    assert.match(adapter, /JellyQuest for Tizen/);
    assert.doesNotMatch(adapter, /'multiserver'/);
    assert.match(styles, /\.btnQuick/);
    assert.match(styles, /\.btnManual/);
    assert.match(styles, /\.btnForgotPassword/);
    assert.match(policy, /openRequests/);
    assert.match(policy, /getCurrentUser/);
    assert.match(policy, /jellyquestRequestsTab/);
    assert.match(policy, /headerTabs \.tabs-viewmenubar \.emby-tabs-slider/);
    assert.match(policy, /foreground\.textContent = 'Requests'/);
    assert.match(policy, /nativeTab\.cloneNode\(true\)/);
    assert.match(policy, /jellyquest-login\.html/);
    assert.match(policy, /'#user='/);
    assert.match(policy, /'&return='/);
    assert.doesNotMatch(policy, /api[_-]?key/i);
    assert.match(manifest, /id="JellyQuest\.JellyQuest"/);
    assert.match(manifest, /package="JellyQuest"/);
    assert.doesNotMatch(manifest, /AprZAARz4r\.Jellyfin/);
});

test('Jellyseerr bootstrap maps and verifies the Jellyfin identity without logging it in the URL', () => {
    const bootstrap = fs.readFileSync(path.join(root, 'integration/jellyseerr-login.html'), 'utf8');

    assert.match(bootstrap, /\/api\/v1\/auth\/jellyfin/);
    assert.match(bootstrap, /\/api\/v1\/auth\/me/);
    assert.match(bootstrap, /password: ''/);
    assert.match(bootstrap, /signedInUser\.jellyfinUserId/);
    assert.match(bootstrap, /\/api\/v1\/discover\/movies/);
    assert.match(bootstrap, /\/api\/v1\/discover\/tv/);
    assert.match(bootstrap, /\/api\/v1\/search\?query=/);
    assert.match(bootstrap, /\/api\/v1\/request/);
    assert.doesNotMatch(bootstrap, /<iframe/i);
    assert.match(bootstrap, /window\.location\.hash/);
    assert.match(bootstrap, /handleDirectionalKey/);
    assert.match(bootstrap, /Recently Added/);
    assert.match(bootstrap, /Recent Requests/);
    assert.match(bootstrap, /Movie Genres/);
    assert.match(bootstrap, /TV Genres/);
    assert.match(bootstrap, /See More/);
    assert.match(bootstrap, /previewApi/);
    assert.match(bootstrap, /Powered by Jellyseerr/);
    assert.match(bootstrap, /linear-gradient\(135deg, #4f46e5, #9333ea\)/);
    assert.match(bootstrap, /id="globalSearch"/);
    assert.match(bootstrap, /\.type-badge/);
    assert.match(bootstrap, /scrollIntoView/);
    assert.match(bootstrap, /window\.location\.replace\(params\.return\)/);
    assert.doesNotMatch(bootstrap, /api[_-]?key/i);
});

test('provides a fixed Samsung TV preview with remote controls', () => {
    const simulator = fs.readFileSync(path.join(root, 'integration/tv-simulator.html'), 'utf8');
    const preview = fs.readFileSync(path.join(root, 'scripts/preview-tv.sh'), 'utf8');

    assert.match(simulator, /width: 1920px/);
    assert.match(simulator, /height: 1080px/);
    assert.match(simulator, /preview=1/);
    assert.match(simulator, /data-key="10009"/);
    assert.match(preview, /python3 -m http\.server/);
    assert.match(preview, /project_dir}\/(?:integration|\}\/(?:integration))/);
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
