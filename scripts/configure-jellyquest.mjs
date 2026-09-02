import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceConfigPath = process.env.JELLYQUEST_CONFIG || path.join(root, 'jellyquest.config.json');
const outputDirectory = process.env.JELLYFIN_TIZEN_WWW_DIR || path.join(root, 'www');
const webConfigPath = path.join(outputDirectory, 'config.json');

const jellyquest = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8'));
const server = new URL(jellyquest.serverUrl);
if (server.protocol !== 'https:' || server.pathname !== '/' || server.search || server.hash) {
    throw new Error('JellyQuest serverUrl must be an HTTPS origin without a path, query, or fragment');
}

const webConfig = JSON.parse(fs.readFileSync(webConfigPath, 'utf8'));
webConfig.multiserver = false;
webConfig.servers = [server.origin];
fs.writeFileSync(webConfigPath, `${JSON.stringify(webConfig, null, 2)}\n`);

const webRef = fs.readFileSync(path.join(root, '.jellyfin-web-ref'), 'utf8').trim();
fs.writeFileSync(path.join(outputDirectory, 'jellyquest-build.json'), `${JSON.stringify({
    household: jellyquest.household,
    productName: jellyquest.productName,
    serverUrl: server.origin,
    jellyfinWebRef: webRef
}, null, 2)}\n`);

console.info(`Configured ${jellyquest.productName} for ${server.origin}`);
