import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceConfigPath = process.env.JELLYPASS_CONFIG || path.join(root, 'jellypass.config.json');
const outputDirectory = process.env.JELLYFIN_TIZEN_WWW_DIR || path.join(root, 'www');
const webConfigPath = path.join(outputDirectory, 'config.json');

const jellypass = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8'));
const server = new URL(jellypass.serverUrl);
if (server.protocol !== 'https:' || server.pathname !== '/' || server.search || server.hash) {
    throw new Error('JellyPass serverUrl must be an HTTPS origin without a path, query, or fragment');
}

const webConfig = JSON.parse(fs.readFileSync(webConfigPath, 'utf8'));
webConfig.multiserver = false;
webConfig.servers = [server.origin];
fs.writeFileSync(webConfigPath, `${JSON.stringify(webConfig, null, 2)}\n`);

const webRef = fs.readFileSync(path.join(root, '.jellyfin-web-ref'), 'utf8').trim();
fs.writeFileSync(path.join(outputDirectory, 'jellypass-build.json'), `${JSON.stringify({
    household: jellypass.household,
    productName: jellypass.productName,
    serverUrl: server.origin,
    jellyfinWebRef: webRef
}, null, 2)}\n`);

console.info(`Configured ${jellypass.productName} for ${server.origin}`);
