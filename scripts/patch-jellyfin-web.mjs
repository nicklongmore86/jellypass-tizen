import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const webDirectory = path.resolve(process.argv[2] || '');
const shortcutsPath = path.join(webDirectory, 'src/components/shortcuts.js');
const itemDetailsPath = path.join(webDirectory, 'src/controllers/itemDetails/index.js');
const shortcutsSource = fs.readFileSync(shortcutsPath, 'utf8');
const originalPlaybackOptions = `            playbackManager.play({
                ids: [playableItemId],
                startPositionTicks: startPositionTicks,
                serverId: serverId,
                queryOptions: {`;
const patchedPlaybackOptions = `            const optionalStreamIndex = name => {
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

if (shortcutsSource.includes(patchedPlaybackOptions)) {
    console.info('JellyQuest playback-option patch already applied');
} else if (shortcutsSource.includes(originalPlaybackOptions)) {
    fs.writeFileSync(shortcutsPath, shortcutsSource.replace(originalPlaybackOptions, patchedPlaybackOptions));
    console.info('Applied JellyQuest playback-option patch');
} else {
    throw new Error('Pinned Jellyfin Web shortcuts playback block no longer matches; update the JellyQuest patch');
}

const itemDetailsSource = fs.readFileSync(itemDetailsPath, 'utf8');
const originalPlaybackBinding = `            itemShortcuts.on(view.querySelector('.nameContainer'));`;
const patchedPlaybackBinding = `            itemShortcuts.on(view.querySelector('.nameContainer'));
            itemShortcuts.on(view.querySelector('.mainDetailButtons'));`;
const originalPlaybackUnbinding = `            itemShortcuts.off(view.querySelector('.nameContainer'));`;
const patchedPlaybackUnbinding = `            itemShortcuts.off(view.querySelector('.nameContainer'));
            itemShortcuts.off(view.querySelector('.mainDetailButtons'));`;

if (itemDetailsSource.includes(patchedPlaybackBinding) && itemDetailsSource.includes(patchedPlaybackUnbinding)) {
    console.info('JellyQuest generated detail-action binding patch already applied');
} else if (itemDetailsSource.includes(originalPlaybackBinding) && itemDetailsSource.includes(originalPlaybackUnbinding)) {
    fs.writeFileSync(itemDetailsPath, itemDetailsSource
        .replace(originalPlaybackBinding, patchedPlaybackBinding)
        .replace(originalPlaybackUnbinding, patchedPlaybackUnbinding));
    console.info('Applied JellyQuest generated detail-action binding patch');
} else {
    throw new Error('Pinned Jellyfin Web detail-action binding block no longer matches; update the JellyQuest patch');
}
