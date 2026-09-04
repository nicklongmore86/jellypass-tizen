// A fake window.playbackManager, matching real jellyfin-web's separation
// (playback is its own global, not part of ApiClient). Records calls so
// tests can assert what was requested without actually playing video --
// this project's Detail screen calls play() with the same shape the real
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
