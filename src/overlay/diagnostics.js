// TEMPORARY Phase 5 diagnostic instrumentation -- REMOVE once the
// real-device "JellyQuest doesn't cover the full screen" issue (see
// docs/rebuild-plan.md, Phase 5) is understood. We have no devtools
// access to the TV in question, so this renders findings directly on
// screen instead. Must run first, before everything else (see its
// position at the top of build-overlay.mjs's JS_FILES), so it can catch
// errors thrown by the polyfill/focus/session/etc. too, not just by
// app.js.
(function () {
    'use strict';

    var lines = [];
    var panel;

    function render() {
        if (!panel) {
            panel = document.createElement('pre');
            panel.id = 'jq-diagnostics';
            panel.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;' +
                'background:rgba(0,0,0,0.85);color:#3f3;font-size:14px;line-height:1.4;' +
                'padding:8px;margin:0;max-width:640px;max-height:60vh;overflow:auto;' +
                'white-space:pre-wrap;font-family:monospace;pointer-events:none;';
            (document.body || document.documentElement).appendChild(panel);
        }
        panel.textContent = lines.join('\n');
    }

    function log(text) {
        lines.push(text);
        render();
    }

    window.addEventListener('error', function (event) {
        log('ERROR: ' + (event.message || (event.error && event.error.message) || event.error)
            + ' @ ' + (event.filename || '?') + ':' + (event.lineno || '?'));
    });
    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason;
        log('REJECTION: ' + (reason && reason.message ? reason.message : reason));
    });

    log('diag: script start, readyState=' + document.readyState);
    log('diag: typeof ApiClient=' + typeof window.ApiClient
        + ' playbackManager=' + typeof window.playbackManager
        + ' tizen=' + typeof window.tizen);

    document.addEventListener('DOMContentLoaded', function () {
        log('diag: DOMContentLoaded, ApiClient=' + typeof window.ApiClient);
    });

    window.addEventListener('load', function () {
        log('diag: window load');
        // Give app.js a moment to boot before inspecting its result.
        window.setTimeout(inspect, 1500);
    });

    function inspect() {
        var root = document.getElementById('jellyquest-root');
        log('diag: #jellyquest-root found=' + Boolean(root));
        if (root) {
            var rootStyle = window.getComputedStyle(root);
            log('diag: root position=' + rootStyle.position + ' zIndex=' + rootStyle.zIndex
                + ' top=' + rootStyle.top + ' left=' + rootStyle.left
                + ' width=' + rootStyle.width + ' height=' + rootStyle.height);
            // app.css sets #jellyquest-root's background to #14161a --
            // an unambiguous "did the stylesheet actually apply" signal,
            // unlike testing a class whose unfocused state is itself
            // `outline: none` (which reads the same whether the
            // stylesheet loaded or not).
            log('diag: root background-color=' + rootStyle.backgroundColor
                + ' (css loaded if this is rgb(20, 22, 26), i.e. #14161a)');
            // The computed `position` keyword stays "fixed" even when an
            // ancestor's transform/filter/contain has redefined its
            // containing block away from the real viewport -- only the
            // actual rendered box proves whether it's really covering
            // the screen. Compare against window.inner*, not screen.*,
            // since that's what `inset: 0` is actually relative to.
            var rect = root.getBoundingClientRect();
            log('diag: root rect=' + JSON.stringify({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
                + ' vs window=' + window.innerWidth + 'x' + window.innerHeight
                + ' (should match exactly if truly covering the viewport)');
        }

        var bodyStyle = window.getComputedStyle(document.body);
        var htmlStyle = window.getComputedStyle(document.documentElement);
        log('diag: body transform=' + bodyStyle.transform + ' filter=' + bodyStyle.filter
            + ' willChange=' + bodyStyle.willChange);
        log('diag: html transform=' + htmlStyle.transform + ' filter=' + htmlStyle.filter);

        log('diag: inspect complete');
    }

    window.__jqDiagLog = log;
})();
