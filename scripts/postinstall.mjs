import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Match gulp's source directory, including the override used by build:full.
const webDirectory = path.resolve(process.env.JELLYFIN_WEB_DIR || 'node_modules/jellyfin-web/dist');

if (!fs.existsSync(webDirectory)) {
    console.info(`Skipping the jellyfin-web-dependent build: ${webDirectory} is missing. Run npm run build:full to build Jellyfin Web and prepare the app.`);
} else {
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], { stdio: 'inherit' });
    if (result.error) console.error(result.error);
    process.exitCode = result.status ?? 1;
}
