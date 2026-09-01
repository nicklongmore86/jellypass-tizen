import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('locks generated Jellyfin Web configuration to Farmhouse', () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellypass-tizen-'));
    fs.writeFileSync(path.join(outputDirectory, 'config.json'), JSON.stringify({ multiserver: true, servers: [], plugins: [] }));

    const result = spawnSync(process.execPath, [path.join(root, 'scripts/configure-jellypass.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, JELLYFIN_TIZEN_WWW_DIR: outputDirectory }
    });

    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'config.json'), 'utf8'));
    assert.equal(config.multiserver, false);
    assert.deepEqual(config.servers, ['https://jelly-farmhouse.starrgroup.io']);
    const metadata = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'jellypass-build.json'), 'utf8'));
    assert.equal(metadata.household, 'farmhouse');
    assert.match(metadata.jellyfinWebRef, /^[a-f0-9]{40}$/);
});

test('injects app-owned household login policy before Jellyfin Web', () => {
    const gulpfile = fs.readFileSync(path.join(root, 'gulpfile.babel.js'), 'utf8');
    const adapter = fs.readFileSync(path.join(root, 'tizen.js'), 'utf8');
    const styles = fs.readFileSync(path.join(root, 'jellypass.css'), 'utf8');
    const manifest = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');

    assert.match(gulpfile, /\.\.\/jellypass\.css/);
    assert.match(gulpfile, /\.\.\/jellypass\.js/);
    assert.match(adapter, /JellyPass for Tizen/);
    assert.doesNotMatch(adapter, /'multiserver'/);
    assert.match(styles, /\.btnQuick/);
    assert.match(styles, /\.btnManual/);
    assert.match(styles, /\.btnForgotPassword/);
    assert.match(manifest, /id="JellyPass1\.JellyPass"/);
    assert.match(manifest, /package="JellyPass1"/);
    assert.doesNotMatch(manifest, /AprZAARz4r\.Jellyfin/);
});
