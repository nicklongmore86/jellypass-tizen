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
    var playingVideo = false;

    window.playbackManager = {
        play: function (options) {
            calls.push(options);
            playingVideo = true;
            return Promise.resolve();
        },
        // Real: playbackmanager.js's self.isPlayingVideo (via
        // isPlayingMediaType('Video')). app.js's Back handler asks this
        // before deciding whether to consume the key or leave it to
        // jellyfin-web, whose video view stops playback when it is
        // navigated away from.
        isPlayingVideo: function () {
            return playingVideo;
        },
        // Test-only inspection hooks -- not part of the real playbackManager
        // API, so screens must never call these themselves.
        __calls: calls,
        __endPlayback: function () { playingVideo = false; },
    };
})();
