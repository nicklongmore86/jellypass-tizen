// Fake data for dev/fixtures/requests-bridge.html (the fixture bridge
// page requests-bridge.js opens in an iframe during tests), attached to
// window on the top-level simulator page. Same-origin access to a
// parent's globals from an iframe is exactly the kind of shortcut a real
// bridge page could never take -- it's cross-origin in production, in
// jellypass's own request-bridge.ts -- but it's a reasonable way to give
// a same-origin test fixture shared, stateful data across the separate
// iframe loads checkEligibility() and openSession() each make.
(function () {
    'use strict';

    window.__requestsFixture = {
        // Charlie has no Jellyseerr account -- exercises the "Requests
        // are not available for this profile" path.
        eligibleUserIds: ['user-alice', 'user-bob'],
        movies: {
            100: { id: 100, title: 'Nebula Drift', releaseDate: '2023-05-01', mediaType: 'movie' },
            200: { id: 200, title: 'Salt Flats', releaseDate: '2021-02-14', mediaType: 'movie', mediaInfo: { status: 2 } },
            300: {
                id: 300, title: 'Harbor Lights', releaseDate: '2019-11-20', mediaType: 'movie',
                mediaInfo: { status: 5, jellyfinMediaId: 'movie-harbor' }
            }
        },
        nextRequestId: 1,
        claims: {}
    };
})();
