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
    assert.equal(metadata.requestsPageVersion, '0.8.0');
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
    assert.match(policy, /requestsPageVersion/);
    assert.match(policy, /getCurrentUser/);
    assert.match(policy, /jellyquestRequestsTab/);
    assert.match(policy, /headerTabs \.tabs-viewmenubar \.emby-tabs-slider/);
    assert.match(policy, /foreground\.textContent = 'Requests'/);
    assert.match(policy, /nativeTab\.cloneNode\(true\)/);
    assert.match(policy, /jellyquestHiddenFavoritesTab/);
    assert.match(policy, /Filters: 'IsFavorite'/);
    assert.match(policy, /IncludeItemTypes: 'Movie,Series'/);
    assert.match(policy, /jellyquestMyListSection/);
    assert.match(policy, /jellyquestRuntimeHomeRoot/);
    assert.match(policy, /data-jellyquest-static-preview/);
    assert.match(policy, /if \(isStaticPreview\) return/);
    assert.match(policy, /isRuntimeShellRoute\(\) && !isStaticPreview/);
    assert.match(policy, /Continue Watching/);
    assert.match(policy, /Your My List is empty/);
    assert.match(policy, /window\.scrollTo\(0, 0\)/);
    assert.match(policy, /Recently Added/);
    assert.match(policy, /function handleRuntimeHomeKeys/);
    assert.match(policy, /grid\.appendChild\(createRuntimeHomeCard/);
    assert.match(policy, /jellyquestRuntimeLibraryRoot/);
    assert.match(policy, /function handleRuntimeLibraryKeys/);
    assert.match(policy, /StartIndex: reset \? 0 : runtimeLibraryState\.items\.length/);
    assert.match(policy, /runtimeLibraryState\.pageSize/);
    assert.match(policy, /Filters = 'IsUnplayed'/);
    assert.match(policy, /query\.GenreIds/);
    assert.match(policy, /getGenres/);
    assert.match(policy, /Recently added/);
    assert.match(policy, /Community rating/);
    assert.match(policy, /jellyquestGlobalTabs/);
    assert.match(policy, /jellyquestRuntimeDetailRoot/);
    assert.match(policy, /function handleRuntimeDetailKeys/);
    assert.match(policy, /hash: window\.location\.hash/);
    assert.match(policy, /window\.location\.hash = runtimeDetailOrigin\.hash/);
    assert.match(policy, /detailMenuOpen/);
    assert.match(policy, /nativeDetailActionDefinitions/);
    assert.match(policy, /getSimilarItems/);
    assert.match(policy, /getSeasons/);
    assert.match(policy, /SeasonId/);
    assert.match(policy, /Game Chapters/);
    assert.match(policy, /Scores and outcome hidden/);
    assert.match(policy, /playRuntimeDetailChapter/);
    assert.match(policy, /Add to My List/);
    assert.match(policy, /getNextUpEpisodes/);
    assert.match(policy, /getEpisodes/);
    assert.match(policy, /Filters: 'IsResumable'/);
    assert.match(policy, /getSpecialFeatures/);
    assert.match(policy, /PlaybackPositionTicks/);
    assert.match(policy, /Restart Episode/);
    assert.match(policy, /LocalTrailerCount/);
    assert.match(policy, /condensed game\|game recap/);
    assert.match(policy, /btnMoreCommands/);
    assert.match(policy, /jellyquestPlaybackOptionsAction/);
    assert.match(policy, /Playback Options/);
    assert.match(policy, /data-audiostreamindex/);
    assert.match(policy, /data-subtitlestreamindex/);
    assert.match(policy, /matchingTrack/);
    assert.match(styles, /\.jellyquestPlaybackOptionsBackdrop/);
    assert.match(styles, /\.itemDetailPage \.trackSelections/);
    assert.match(policy, /pageTitleWithDefaultLogo/);
    assert.doesNotMatch(policy, /Who\\'s watching\?/);
    assert.match(policy, /getPublicUsers/);
    assert.match(policy, /authenticateUserByName\(user\.Name, ''\)/);
    assert.match(policy, /jellyquestCurrentProfileName/);
    assert.match(policy, /jellyquestBrandIcon/);
    assert.match(policy, /new URL\('icon\.png', jellyquestScript\.src\)/);
    assert.match(policy, /Current profile: /);
    assert.match(policy, /jellyquestLibraryRail/);
    assert.match(policy, /\.libraryMenuOptions \.lnkMediaFolder/);
    assert.match(policy, /nativeSearch\.click\(\)/);
    assert.match(policy, /jellyquestRailSettings/);
    assert.match(policy, /function openSettings/);
    assert.match(policy, /function handleSettingsKeys/);
    assert.match(policy, /jellyquestSettingsRoot/);
    assert.match(policy, /updateUserConfiguration/);
    assert.match(policy, /Maximum audio channels/);
    assert.match(policy, /Preferred subtitle language/);
    assert.match(policy, /Display & Device/);
    assert.match(policy, /segmentTypeAction__Intro/);
    assert.doesNotMatch(policy, /nativeSettings\.click\(\)/);
    assert.match(policy, /function libraryIconName/);
    assert.match(policy, /livetv:/);
    assert.match(policy, /shows:/);
    assert.match(policy, /photos:/);
    assert.match(policy, /books:/);
    assert.match(policy, /videos:/);
    assert.match(policy, /iconName === 'collections'/);
    assert.match(policy, /getBoundingClientRect\(\)\.bottom/);
    assert.match(policy, /jellyquestProfileCard:not\(\[disabled\]\)/);
    assert.match(styles, /\.jellyquestProfileSwitcher/);
    assert.match(styles, /\.jellyquestProfileAvatar/);
    assert.match(styles, /\.jellyquestBrandIcon/);
    assert.match(styles, /flex-direction: column/);
    assert.match(styles, /\.jellyquestLibraryRail/);
    assert.match(styles, /\.jellyquestSettingsRoot/);
    assert.match(styles, /\.jellyquestSettingsCategory/);
    assert.match(styles, /\.jellyquestSettingsControl/);
    assert.match(styles, /width: 60px/);
    assert.match(styles, /width: 256px/);
    assert.match(styles, /overflow-y: auto/);
    assert.match(styles, /margin-top: auto/);
    assert.match(styles, /margin-bottom: auto/);
    assert.match(styles, /\.skinHeader \{/);
    assert.match(styles, /\.skinHeader \.headerTabs/);
    assert.match(styles, /height: 84px !important/);
    assert.match(styles, /\.jellyquestMyListCards/);
    assert.match(styles, /\.jellyquestHiddenFavoritesTab/);
    assert.match(styles, /margin-left: 60px/);
    assert.match(styles, /width: calc\(100% - 60px\)/);
    assert.match(styles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
    assert.match(styles, /\.jellyquestRuntimeHomeRoot/);
    assert.match(styles, /\.jqHomeEmpty/);
    assert.match(styles, /\.jellyquestRuntimeLibraryRoot/);
    assert.match(styles, /\.jellyquestRuntimeLibraryMenu/);
    assert.match(styles, /\.jellyquestGlobalTabs/);
    assert.match(styles, /\.jellyquestRuntimeDetailRoot/);
    assert.match(styles, /\.jqEpisodeRow/);
    assert.match(styles, /\.jqChapterRow/);
    assert.match(policy, /www\/jellyseerr-login\.html/);
    assert.match(policy, /'#user='/);
    assert.match(policy, /'&return='/);
    assert.doesNotMatch(policy, /api[_-]?key/i);
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

test('Jellyseerr bootstrap delegates identity verification without logging it in the URL', () => {
    const bootstrap = fs.readFileSync(path.join(root, 'integration/jellyseerr-login.html'), 'utf8');

    assert.match(bootstrap, /function startBridge/);
    assert.match(bootstrap, /function bridgeApi/);
    assert.match(bootstrap, /jellyquest-bridge\/bridge\.html/);
    assert.doesNotMatch(bootstrap, /\/api\/v1\/auth\/jellyfin/);
    assert.match(bootstrap, /https:\/\/jelly-farmhouse\.starrgroup\.io/);
    assert.match(bootstrap, /\/api\/v1\/discover\/movies/);
    assert.match(bootstrap, /\/api\/v1\/discover\/tv/);
    assert.match(bootstrap, /\/api\/v1\/search\?query=/);
    assert.match(bootstrap, /\/api\/v1\/request/);
    assert.doesNotMatch(bootstrap, /<iframe/i);
    assert.match(bootstrap, /window\.location\.hash/);
    assert.match(bootstrap, /handleDirectionalKey/);
    assert.match(bootstrap, /_jellyquestReturnFocus/);
    assert.match(bootstrap, /focusFrom/);
    assert.match(bootstrap, /width: 3\.75rem/);
    assert.match(bootstrap, /width: 16rem/);
    assert.match(bootstrap, /header:focus-within/);
    assert.match(bootstrap, /class="nav-label"/);
    assert.match(bootstrap, /id="requestsProfile"/);
    assert.doesNotMatch(bootstrap, /id="back"|Back to Jellyfin|\.nav\.back|id="categoryBack"|Back to Discover|&larr; Discover/);
    assert.match(bootstrap, /railElements/);
    assert.match(bootstrap, /headerElements/);
    assert.match(bootstrap, /workspaceElements/);
    assert.match(bootstrap, /workspaceEntryTarget/);
    assert.match(bootstrap, /category\.key === categories\[0\]\.key/);
    assert.match(bootstrap, /Recently Added/);
    assert.match(bootstrap, /Recent Requests/);
    assert.match(bootstrap, /Movie Genres/);
    assert.match(bootstrap, /TV Genres/);
    assert.match(bootstrap, /See More/);
    assert.match(bootstrap, /items\.slice\(0, 7\)/);
    assert.match(bootstrap, /function resetSearch/);
    assert.match(bootstrap, /current\.id === 'requestsProfile'/);
    assert.match(bootstrap, /src="\.\.\/icon\.png"/);
    assert.match(bootstrap, /id="seasonOptions"/);
    assert.match(bootstrap, /function renderSeasonOptions/);
    assert.match(bootstrap, /body\.seasons = selectedSeasons\.length \? selectedSeasons\.slice\(\) : 'all'/);
    assert.match(bootstrap, /previewApi/);
    assert.match(bootstrap, /class="brand-mark"/);
    assert.match(bootstrap, /id="requestsHomeTab"/);
    assert.match(bootstrap, /id="requestsTopTab"/);
    assert.doesNotMatch(bootstrap, /id="requestsFavoritesTab"/);
    assert.match(bootstrap, /background: #0e1013/);
    assert.match(bootstrap, /#00a4dc/);
    assert.doesNotMatch(bootstrap, /#4f46e5|#7e22ce|#9333ea|#c084fc|#6366f1/);
    assert.match(bootstrap, /params\.user \|\| 'Living Room'/);
    assert.match(bootstrap, /id="globalSearch"/);
    assert.match(bootstrap, /\.type-badge/);
    assert.match(bootstrap, /scrollIntoView/);
    assert.match(bootstrap, /function visualRows/);
    assert.match(bootstrap, /function gridTarget/);
    assert.match(bootstrap, /function navigableDiscoverRows/);
    assert.match(bootstrap, /visibleCards\(row\)\.length > 0/);
    assert.match(bootstrap, /scroll-behavior: auto/);
    assert.match(bootstrap, /\/api\/v1\/discover\/genreslider\//);
    assert.match(bootstrap, /if \(path\.indexOf\('\/api\/v1\/discover\/genreslider\/'\) === 0\) \{\s*return \[\];/);
    assert.match(bootstrap, /function completeMove/);
    assert.match(bootstrap, /window\.location\.replace\(params\.return\)/);
    assert.doesNotMatch(bootstrap, /api[_-]?key/i);
});

test('provides a fixed Samsung TV preview with remote controls', () => {
    const simulator = fs.readFileSync(path.join(root, 'integration/tv-simulator.html'), 'utf8');
    const profiles = fs.readFileSync(path.join(root, 'integration/jellyfin-profile-preview.html'), 'utf8');
    const mediaNavigation = fs.readFileSync(path.join(root, 'integration/jellyfin-media-preview.js'), 'utf8');
    const mediaStyles = fs.readFileSync(path.join(root, 'integration/jellyfin-media-preview.css'), 'utf8');
    const movies = fs.readFileSync(path.join(root, 'integration/jellyfin-movies-preview.html'), 'utf8');
    const shows = fs.readFileSync(path.join(root, 'integration/jellyfin-shows-preview.html'), 'utf8');
    const sports = fs.readFileSync(path.join(root, 'integration/jellyfin-sports-preview.html'), 'utf8');
    const movieDetail = fs.readFileSync(path.join(root, 'integration/jellyfin-movie-detail-preview.html'), 'utf8');
    const showDetail = fs.readFileSync(path.join(root, 'integration/jellyfin-show-detail-preview.html'), 'utf8');
    const sportDetail = fs.readFileSync(path.join(root, 'integration/jellyfin-sport-detail-preview.html'), 'utf8');
    const preview = fs.readFileSync(path.join(root, 'scripts/preview-tv.sh'), 'utf8');

    assert.match(simulator, /width: 1920px/);
    assert.match(simulator, /height: 1080px/);
    assert.match(simulator, /preview=1/);
    assert.match(simulator, /data-key="10009"/);
    assert.match(simulator, /data-key="10182"/);
    assert.match(simulator, /Back \/ Return/);
    assert.match(simulator, /jellyquest-preview-exit/);
    assert.match(simulator, /lastTvFocus/);
    assert.match(simulator, /function isUsableTvTarget/);
    assert.match(simulator, /elementFromPoint/);
    assert.match(simulator, /contentWindow\.scrollTo\(0, 0\)/);
    assert.match(simulator, /mousedown[^\n]+preventDefault/);
    assert.match(simulator, /profilesView">Home/);
    assert.doesNotMatch(simulator, /favoritesView/);
    assert.match(simulator, /Movie Detail/);
    assert.match(simulator, /Show Detail/);
    assert.match(simulator, /Event Detail/);
    assert.match(profiles, /pageTitleWithDefaultLogo/);
    [profiles, movies, shows, sports, movieDetail, showDetail, sportDetail].forEach((document) => {
        assert.match(document, /<html lang="en" data-jellyquest-static-preview>/);
    });
    assert.match(profiles, /jellyquest\.js/);
    assert.match(profiles, /jellyfin-media-preview\.css/);
    assert.match(profiles, /getPublicUsers/);
    assert.match(profiles, /Continue Watching/);
    assert.match(profiles, /<h2>My List<\/h2>/);
    assert.match(profiles, /jqPreviewMyListSection/);
    assert.match(profiles, /Next Up/);
    assert.match(profiles, /Recently Added/);
    assert.match(profiles, /jqHomeProgress/);
    assert.equal((profiles.match(/class="jqMovieCard"/g) || []).length, 28);
    assert.doesNotMatch(profiles, /class="hint"/);
    assert.match(mediaNavigation, /workspaceSelector/);
    assert.match(mediaNavigation, /headerSelector/);
    assert.match(mediaNavigation, /railIndex/);
    assert.match(mediaNavigation, /_jellyquestReturnFocus/);
    assert.match(mediaNavigation, /jellyquest-preview-my-list:/);
    assert.match(mediaNavigation, /togglePreviewMyList/);
    assert.doesNotMatch(mediaNavigation, /jellyfin-favorites-preview/);
    assert.match(mediaNavigation, /Requests: 'jellyseerr-login\.html\?preview=1'/);
    assert.match(mediaNavigation, /headers\.slice\(1\)\.concat\(filters\)/);
    assert.match(mediaNavigation, /!hasCardAbove/);
    assert.match(mediaNavigation, /function sameVisualRow/);
    assert.match(mediaNavigation, /function edgeVisualRow/);
    assert.match(mediaNavigation, /function detailContentElements/);
    assert.match(mediaNavigation, /function proportionalTarget/);
    assert.match(mediaNavigation, /function detailNavigationTarget/);
    assert.match(mediaNavigation, /headerIndex === 1 \? detailActions\[0\]/);
    assert.match(mediaNavigation, /season && actionIndex === actions\.length - 1/);
    assert.match(mediaNavigation, /openSortMenu/);
    assert.match(mediaNavigation, /applySort/);
    assert.match(mediaNavigation, /closeSortMenu/);
    assert.match(mediaNavigation, /initializeConditionalActions/);
    assert.match(mediaNavigation, /openMoreMenu/);
    assert.match(mediaNavigation, /openPlaybackChoices/);
    assert.doesNotMatch(mediaNavigation, /Play Next|Add to Queue|Media Info/);
    assert.match(mediaNavigation, /showPlaybackNotice/);
    assert.match(mediaStyles, /overflow-y: auto/);
    assert.match(mediaStyles, /height: 5\.25rem/);
    assert.match(mediaStyles, /translate\(-50%, -50%\)/);
    assert.match(mediaStyles, /\.jqSortMenu/);
    assert.match(movies, /data-sort-options="recent:Recently added/);
    assert.match(shows, /data-sort-options="recent:Recently added/);
    assert.match(sports, /data-sort-options="recent:Event date/);
    assert.match(movieDetail, /Resume 1:32:00/);
    assert.match(movieDetail, /Start Over/);
    assert.match(movieDetail, /data-version-options="4K HDR\|1080p"/);
    assert.match(movieDetail, /data-audio-options=/);
    assert.match(movieDetail, /data-subtitle-options=/);
    assert.match(movieDetail, /data-trailer-url="https:/);
    assert.match(showDetail, /Resume S2 E4/);
    assert.match(showDetail, /Continue S2 E5/);
    assert.match(showDetail, /Restart Episode/);
    assert.match(showDetail, /English · Dolby Digital 5\.1/);
    assert.match(sportDetail, /data-trailer-url=""/);
    assert.match(sportDetail, /data-highlight-id="sport-highlight-1"/);
    assert.match(sportDetail, /Home Radio · Stereo/);
    assert.match(sportDetail, /More<\/button>/);
    assert.equal((movies.match(/class="jqMovieCard"/g) || []).length, 21);
    assert.equal((shows.match(/class="jqMovieCard jqShowCard"/g) || []).length, 21);
    assert.equal((sports.match(/class="jqSportCard"/g) || []).length, 12);
    assert.match(preview, /python3 -m http\.server/);
    assert.match(preview, /--bind 127\.0\.0\.1/);
    assert.ok(fs.existsSync(path.join(root, 'integration/jellyfin-movies-preview.html')));
    assert.ok(fs.existsSync(path.join(root, 'integration/jellyfin-movie-detail-preview.html')));
    assert.ok(fs.existsSync(path.join(root, 'integration/jellyfin-shows-preview.html')));
    assert.ok(fs.existsSync(path.join(root, 'integration/jellyfin-show-detail-preview.html')));
    assert.ok(fs.existsSync(path.join(root, 'integration/jellyfin-sports-preview.html')));
    assert.ok(fs.existsSync(path.join(root, 'integration/jellyfin-sport-detail-preview.html')));
    assert.ok(!fs.existsSync(path.join(root, 'integration/jellyfin-favorites-preview.html')));
    assert.match(preview, /project_dir}\/(?:integration|\}\/(?:integration))/);
});

test('patches Jellyfin playback shortcuts with per-item stream selections', () => {
    const webDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyquest-web-patch-'));
    const componentDirectory = path.join(webDirectory, 'src/components');
    fs.mkdirSync(componentDirectory, { recursive: true });
    const shortcutsPath = path.join(componentDirectory, 'shortcuts.js');
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

    const patcher = path.join(root, 'scripts/patch-jellyfin-web.mjs');
    const first = spawnSync(process.execPath, [patcher, webDirectory], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const patched = fs.readFileSync(shortcutsPath, 'utf8');
    assert.match(patched, /mediaSourceId: card\.getAttribute\('data-mediasourceid'\)/);
    assert.match(patched, /audioStreamIndex: optionalStreamIndex\('data-audiostreamindex'\)/);
    assert.match(patched, /subtitleStreamIndex: optionalStreamIndex\('data-subtitlestreamindex'\)/);

    const second = spawnSync(process.execPath, [patcher, webDirectory], { encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(fs.readFileSync(shortcutsPath, 'utf8'), patched);
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
