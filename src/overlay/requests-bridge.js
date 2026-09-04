// Low-level client for JellyPass's request bridge (see jellypass's
// src/request-bridge.ts): a hidden iframe loaded at the deployment's
// requestsBridgeUrl, talked to over postMessage with an origin check and
// a per-open random nonce. This is the same security pattern the old
// (deleted) jellyquest.js used for its eligibility probe, generalized to
// also carry the full request/proxy session Requests needs -- callers
// never touch postMessage directly.
//
// Protocol (fixed by the JellyPass server, not this file):
//   - Opening the iframe at `${bridgeUrl}#user=..&id=..&nonce=..`
//     (add `mode=eligibility&` to just check eligibility, no session)
//     gets back exactly one `{source:'jellyquest-bridge', nonce, type}`
//     message: 'ready' or 'eligibility' on success, 'error' on failure.
//   - Once a session is open, `{source:'jellyquest-app', type:'request',
//     nonce, id, path, options}` posted to the frame gets back
//     `{source:'jellyquest-bridge', nonce, type:'response', id, ok,
//     data|error}` -- `call()` below is the request/response pairing for
//     that.
(function () {
    'use strict';

    var OPEN_TIMEOUT_MS = 15000;
    var CALL_TIMEOUT_MS = 20000;

    var frame = null;
    var frameOrigin = '';
    var frameNonce = '';
    var pendingCalls = {};
    var nextCallId = 1;

    function randomNonce() {
        var values = new Uint32Array(4);
        window.crypto.getRandomValues(values);
        return Array.prototype.map.call(values, function (value) { return value.toString(16); }).join('');
    }

    function receiveCallResponse(event) {
        if (!frame || event.source !== frame.contentWindow || event.origin !== frameOrigin) return;
        var data = event.data || {};
        if (data.source !== 'jellyquest-bridge' || data.nonce !== frameNonce || data.type !== 'response') return;
        var pending = pendingCalls[data.id];
        if (!pending) return;
        delete pendingCalls[data.id];
        window.clearTimeout(pending.timer);
        if (data.ok) pending.resolve(data.data);
        else pending.reject(new Error(data.error || 'Requests bridge call failed.'));
    }

    // Opens the bridge iframe in `mode` ('eligibility' or null for a full
    // session) and resolves with the bridge's first message. Tears down
    // any previously-open frame first -- only one bridge session is ever
    // live at a time.
    function openFrame(bridgeUrl, mode, userId, userName) {
        close();
        return new Promise(function (resolve, reject) {
            var target;
            // The catch below has to name a binding because ES5 -- the
            // dialect this file ships in, for Tizen 4.6's Chromium --
            // has no optional catch binding, and it then deliberately
            // discards it: whatever the URL parser objected to, the only
            // actionable problem for the caller is that no usable bridge
            // URL is configured, so that is what gets reported. Hence the
            // narrow eslint-disable-line rather than a repo-wide rule.
            try {
                // Resolved against the page's own URL rather than required
                // to stand alone: production config is always an absolute
                // https URL (scripts/configure-jellyquest.mjs enforces
                // that at build time), but this also lets a dev/test
                // fixture pass a same-origin relative path.
                target = new URL(bridgeUrl, window.location.href);
            } catch (error) { // eslint-disable-line no-unused-vars -- ES5 requires the binding; discarded on purpose (see above)
                reject(new Error('Requests bridge is not configured.'));
                return;
            }

            var opened = document.createElement('iframe');
            opened.hidden = true;
            opened.setAttribute('aria-hidden', 'true');
            opened.setAttribute('title', 'Requests');

            var origin = target.origin;
            var nonce = randomNonce();
            var hash = 'user=' + encodeURIComponent(userName || '') + '&id=' + encodeURIComponent(userId) + '&nonce=' + encodeURIComponent(nonce);
            if (mode) hash = 'mode=' + encodeURIComponent(mode) + '&' + hash;
            target.hash = hash;

            var timer = window.setTimeout(function () {
                window.removeEventListener('message', onInit);
                if (opened.parentNode) opened.parentNode.removeChild(opened);
                reject(new Error('Requests bridge timed out.'));
            }, OPEN_TIMEOUT_MS);

            function onInit(event) {
                if (event.source !== opened.contentWindow || event.origin !== origin) return;
                var data = event.data || {};
                if (data.source !== 'jellyquest-bridge' || data.nonce !== nonce) return;
                if (data.type === 'error') {
                    window.clearTimeout(timer);
                    window.removeEventListener('message', onInit);
                    if (opened.parentNode) opened.parentNode.removeChild(opened);
                    reject(new Error(data.error || 'Requests bridge rejected this profile.'));
                    return;
                }
                window.clearTimeout(timer);
                window.removeEventListener('message', onInit);
                frame = opened;
                frameOrigin = origin;
                frameNonce = nonce;
                window.addEventListener('message', receiveCallResponse);
                resolve(data);
            }
            window.addEventListener('message', onInit);

            opened.src = target.href;
            document.body.appendChild(opened);
        });
    }

    function checkEligibility(bridgeUrl, userId, userName) {
        return openFrame(bridgeUrl, 'eligibility', userId, userName).then(function (data) {
            var eligible = data.eligible === true;
            close();
            return eligible;
        });
    }

    function openSession(bridgeUrl, userId, userName) {
        return openFrame(bridgeUrl, null, userId, userName).then(function () { return true; });
    }

    // path/options mirror JellyPass's own proxy contract: options may
    // carry { method, headers: {'Content-Type': ...}, body } same as a
    // fetch() call would.
    function call(path, options) {
        if (!frame) return Promise.reject(new Error('Requests session is not open.'));
        var openFrameRef = frame;
        return new Promise(function (resolve, reject) {
            var id = String(nextCallId);
            nextCallId += 1;
            var timer = window.setTimeout(function () {
                delete pendingCalls[id];
                reject(new Error('Requests bridge call timed out.'));
            }, CALL_TIMEOUT_MS);
            pendingCalls[id] = { resolve: resolve, reject: reject, timer: timer };
            openFrameRef.contentWindow.postMessage({
                source: 'jellyquest-app',
                type: 'request',
                nonce: frameNonce,
                id: id,
                path: path,
                options: options || {}
            }, frameOrigin);
        });
    }

    function close() {
        window.removeEventListener('message', receiveCallResponse);
        if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
        frame = null;
        frameOrigin = '';
        frameNonce = '';
        Object.keys(pendingCalls).forEach(function (id) {
            window.clearTimeout(pendingCalls[id].timer);
            pendingCalls[id].reject(new Error('Requests bridge closed.'));
        });
        pendingCalls = {};
    }

    window.JellyQuestRequestsBridge = {
        checkEligibility: checkEligibility,
        openSession: openSession,
        call: call,
        close: close
    };
})();
