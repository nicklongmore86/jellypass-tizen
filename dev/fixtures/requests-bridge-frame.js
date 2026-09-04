// Loaded by dev/fixtures/requests-bridge.html, which the simulator (and
// test/e2e/requests.spec.mjs) mounts in an iframe. Extracted out of that
// page's inline <script> so this logic is actually covered by the ESLint
// gate; it is linted as ES5 alongside the rest of dev/fixtures/**.
//
// Fixture standing in for JellyPass's real bridge.html (see jellypass's
// src/request-bridge.ts, BRIDGE_HTML) -- same hash-param + postMessage
// protocol, backed by dev/fixtures/requests-bridge-fixture.js's fake data
// on the parent page instead of a real Jellyseerr/JellyPass backend.
(function () {
    'use strict';

    var params = {};
    window.location.hash.slice(1).split('&').forEach(function (part) {
        var separator = part.indexOf('=');
        if (separator > 0) params[decodeURIComponent(part.slice(0, separator))] = decodeURIComponent(part.slice(separator + 1));
    });

    var fixture = window.parent.__requestsFixture;

    function reply(message) {
        message.source = 'jellyquest-bridge';
        message.nonce = params.nonce;
        window.parent.postMessage(message, '*');
    }

    function checkEligibility() {
        reply({ type: 'eligibility', eligible: fixture.eligibleUserIds.indexOf(params.id) !== -1 });
    }

    function createSession() {
        if (fixture.eligibleUserIds.indexOf(params.id) === -1) {
            reply({ type: 'error', error: 'Jellyseerr rejected this Jellyfin profile.' });
            return;
        }
        reply({ type: 'ready' });
    }

    function accessStatus(mediaType, tmdbId) {
        var movie = fixture.movies[String(tmdbId)];
        var jellyfinItemId = movie && movie.mediaInfo && movie.mediaInfo.jellyfinMediaId;
        var claimed = Boolean(fixture.claims[params.id] && fixture.claims[params.id][mediaType + ':' + tmdbId]);
        return {
            mediaType: mediaType,
            tmdbId: tmdbId,
            claimed: claimed,
            managed: Boolean(jellyfinItemId),
            owned: false,
            public: false,
            jellyfinItemId: jellyfinItemId
        };
    }

    function route(path, options) {
        var method = (options.method || 'GET').toUpperCase();
        var url = new URL(path, 'http://fixture.local');

        if (url.pathname === '/api/v1/search' && method === 'GET') {
            var query = (url.searchParams.get('query') || '').toLowerCase();
            return {
                results: Object.keys(fixture.movies).map(function (id) { return fixture.movies[id]; })
                    .filter(function (movie) { return movie.title.toLowerCase().indexOf(query) !== -1; })
            };
        }
        if (url.pathname === '/api/v1/request' && method === 'POST') {
            var requestBody = JSON.parse(options.body || '{}');
            var requested = fixture.movies[String(requestBody.mediaId)];
            if (!requested) throw new Error('Unknown title.');
            requested.mediaInfo = requested.mediaInfo || {};
            requested.mediaInfo.status = 2; // pending
            var id = fixture.nextRequestId;
            fixture.nextRequestId += 1;
            return { id: id, status: 'pending' };
        }
        if (url.pathname === '/jellyquest/access' && method === 'GET') {
            return accessStatus(url.searchParams.get('mediaType'), Number(url.searchParams.get('tmdbId')));
        }
        if (url.pathname === '/jellyquest/access' && method === 'POST') {
            var claimBody = JSON.parse(options.body || '{}');
            fixture.claims[params.id] = fixture.claims[params.id] || {};
            fixture.claims[params.id][claimBody.mediaType + ':' + claimBody.tmdbId] = true;
            return accessStatus(claimBody.mediaType, claimBody.tmdbId);
        }
        throw new Error('Unsupported fixture route: ' + method + ' ' + url.pathname);
    }

    window.addEventListener('message', function (event) {
        var data = event.data || {};
        if (event.source !== window.parent || data.source !== 'jellyquest-app' || data.nonce !== params.nonce || data.type !== 'request') return;
        try {
            reply({ type: 'response', id: data.id, ok: true, data: route(data.path, data.options || {}) });
        } catch (error) {
            reply({ type: 'response', id: data.id, ok: false, error: error.message });
        }
    });

    if (params.mode === 'eligibility') checkEligibility();
    else createSession();
})();
