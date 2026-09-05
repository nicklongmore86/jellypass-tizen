// A fake window.playbackManager, matching real jellyfin-web's separation
// (playback is its own global, not part of ApiClient). Records calls so
// tests can assert what was requested without actually playing video --
// this project's Detail screen calls play() with the same shape the real
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
