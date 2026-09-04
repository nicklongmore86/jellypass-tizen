// Bootstraps JellyQuest and owns the (small, hand-rolled) router between
// screens: creates #jellyquest-root (no host markup required -- gulp's
// injection provides no container div), then switches between the
// profile picker and the shell, and -- within the shell -- between
// Home/Search/Library/Detail/Requests. The shell's rail (shell.js) stays
// mounted across all of those; only its content area swaps.
//
// Also owns the remote's hardware Back button: every screen but Home
// registers a "go back to where I came from" handler here, so Back
// behaves the way every other TV app's does, distinct from (and in
// addition to) Left-into-the-rail spatial navigation.
(function () {
    'use strict';

    var BACK_KEY_CODES = [10009, 27]; // Tizen hardware Back; Escape for desktop/simulator testing.
    var currentBackHandler = null;
    var buildConfig = null;

    // jellyquest-build.json is written by scripts/configure-jellyquest.mjs
    // next to index.html at packaging time (fetched here the same way the
    // old app's loadConfiguration() did); Requests is the only thing that
    // needs it; every other screen works with no configuration at all.
    function loadConfiguration() {
        return fetch('jellyquest-build.json', { cache: 'no-store' }).then(function (response) {
            if (!response.ok) throw new Error('configuration returned ' + response.status);
            return response.json();
        }).then(function (config) {
            buildConfig = config;
        }).catch(function (error) {
            console.error('[JellyQuest] Requests configuration unavailable:', error);
        });
    }

    function showProfiles(root) {
        currentBackHandler = null;
        window.JellyQuestRequestsBridge.close();
        window.JellyQuestProfilesScreen.render(root, function () {
            showShell(root);
        });
    }

    function showShell(root) {
        window.JellyQuestShell.render(root, {
            onSwitchProfile: function () { showProfiles(root); },
            onHome: showHome,
            onSearch: showSearch,
            onRequests: showRequests,
        });
        showHome();
    }

    function showHome() {
        currentBackHandler = null; // top of the navigation stack
        window.JellyQuestRequestsBridge.close();
        window.JellyQuestHomeScreen.render(window.JellyQuestShell.getContent(), {
            onSelectItem: function (item) { showDetail(item, showHome); },
            onSeeAll: function (row) { showLibrary(row, showHome); },
        });
    }

    function showSearch() {
        currentBackHandler = showHome;
        window.JellyQuestRequestsBridge.close();
        window.JellyQuestSearchScreen.render(window.JellyQuestShell.getContent(), {
            onSelectItem: function (item) { showDetail(item, showSearch); },
        });
    }

    function showLibrary(row, returnTo) {
        currentBackHandler = returnTo;
        window.JellyQuestRequestsBridge.close();
        window.JellyQuestLibraryScreen.render(window.JellyQuestShell.getContent(), row, {
            onSelectItem: function (item) { showDetail(item, function () { showLibrary(row, returnTo); }); },
            onBack: returnTo,
        });
    }

    function showDetail(item, returnTo) {
        currentBackHandler = returnTo;
        window.JellyQuestRequestsBridge.close();
        window.JellyQuestDetailScreen.render(window.JellyQuestShell.getContent(), item, {
            onPlay: function (playItem, startPositionTicks) {
                window.playbackManager.play({ ids: [playItem.Id], startPositionTicks: startPositionTicks });
            },
            onPlayTrailer: function (playItem) {
                var userId = window.ApiClient.getCurrentUserId();
                window.ApiClient.getLocalTrailers(userId, playItem.Id).then(function (trailers) {
                    if (trailers.length) window.playbackManager.play({ ids: [trailers[0].Id] });
                });
            },
        });
    }

    function showRequests() {
        currentBackHandler = showHome;
        var user = window.JellyQuestSession.getCurrentProfile();
        window.JellyQuestRequestsScreen.render(window.JellyQuestShell.getContent(), {
            bridgeUrl: buildConfig && buildConfig.requestsBridgeUrl,
            userId: user.Id,
            userName: user.Name
        });
    }

    document.addEventListener('keydown', function (event) {
        if (BACK_KEY_CODES.indexOf(event.keyCode) === -1) return;
        // An open modal (e.g. Detail's Playback Options) owns Back first,
        // closing itself rather than navigating the whole screen away --
        // see DETAIL_ACTIONS.md's "Left or Back returns one level before
        // closing" rule.
        if (window.JellyQuestFocus.closeOnBack()) {
            event.preventDefault();
            return;
        }
        if (!currentBackHandler) return;
        event.preventDefault();
        currentBackHandler();
    });

    var API_CLIENT_POLL_MS = 50;
    var API_CLIENT_MAX_ATTEMPTS = 300; // ~15s

    // jellyquest.js is injected (deferred) before jellyfin-web's own
    // bundle in the built index.html, and deferred scripts run in
    // document order -- so window.ApiClient is NOT guaranteed to exist
    // the instant this file runs; jellyfin-web's own bundle hasn't
    // necessarily executed yet at all. Confirmed on real hardware
    // (Phase 5): this crashed every time in the field (session.js's
    // listProfiles() calling ApiClient.getPublicUsers() on undefined),
    // but never in the simulator, where the fixture scripts set
    // window.ApiClient synchronously before jellyquest.js's own <script>
    // tag even runs -- the simulator never actually exercised real
    // script load-order timing.
    function waitForApiClient(callback, attempt) {
        attempt = attempt || 0;
        if (window.ApiClient && typeof window.ApiClient.getPublicUsers === 'function') {
            callback();
            return;
        }
        if (attempt >= API_CLIENT_MAX_ATTEMPTS) {
            console.error('[JellyQuest] Jellyfin Web never initialized ApiClient -- giving up.');
            var root = document.getElementById('jellyquest-root');
            if (root) root.textContent = 'Unable to start -- Jellyfin did not finish loading.';
            return;
        }
        window.setTimeout(function () { waitForApiClient(callback, attempt + 1); }, API_CLIENT_POLL_MS);
    }

    window.JellyQuestFocus.ready(function () {
        loadConfiguration(); // fire-and-forget: Requests waits on it lazily, nothing else needs it

        var root = document.getElementById('jellyquest-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'jellyquest-root';
            document.body.appendChild(root);
        }

        waitForApiClient(function () {
            if (window.JellyQuestSession.getCurrentProfile()) {
                showShell(root);
            } else {
                showProfiles(root);
            }
        });
    });
})();
