// A fake window.playbackManager modelling the PATCHED Jellyfin Web build --
// not a stock one. The pinned Jellyfin Web build does NOT expose this global:
// src/components/playback/playbackmanager.js only exports the singleton as a
// module export, and nothing assigns it to window. JellyQuest's build-time
// patch (scripts/patch-jellyfin-web.mjs) is what creates the global, so this
// stub stands in for that patch rather than for upstream behaviour. Records
// calls so tests can assert what was requested without actually playing video
// -- this project's Detail screen calls play() with the same shape the real
// playbackManager.play() expects.
(function () {
    'use strict';

    var calls = [];

    window.playbackManager = {
        play: function (options) {
            calls.push(options);
            return Promise.resolve();
        },
        // Test-only inspection hook -- not part of the real playbackManager
        // API, so screens must never call this themselves.
        __calls: calls,
    };
})();
