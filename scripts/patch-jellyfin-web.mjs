import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const webDirectory = path.resolve(process.argv[2] || '');
const shortcutsPath = path.join(webDirectory, 'src/components/shortcuts.js');
const source = fs.readFileSync(shortcutsPath, 'utf8');
const original = `            playbackManager.play({
                ids: [playableItemId],
                startPositionTicks: startPositionTicks,
                serverId: serverId,
                queryOptions: {`;
const patched = `            const optionalStreamIndex = name => {
                const value = card.getAttribute(name);
                return value == null || value === '' ? undefined : parseInt(value, 10);
            };
            playbackManager.play({
                ids: [playableItemId],
                startPositionTicks: startPositionTicks,
                serverId: serverId,
                mediaSourceId: card.getAttribute('data-mediasourceid') || undefined,
                audioStreamIndex: optionalStreamIndex('data-audiostreamindex'),
                subtitleStreamIndex: optionalStreamIndex('data-subtitlestreamindex'),
                queryOptions: {`;

if (source.includes(patched)) {
    console.info('JellyQuest playback-option patch already applied');
} else if (source.includes(original)) {
    fs.writeFileSync(shortcutsPath, source.replace(original, patched));
    console.info('Applied JellyQuest playback-option patch');
} else {
    throw new Error('Pinned Jellyfin Web shortcuts playback block no longer matches; update the JellyQuest patch');
}
