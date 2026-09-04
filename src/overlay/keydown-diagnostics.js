// TEMPORARY diagnostic for a reported real-hardware navigation bug (see
// docs/rebuild-plan.md, Phase 5 follow-up): a household reported only
// being able to reach every other profile card (Alex and Kids, out of
// Alex/Brittany/Kids/Nick) with the remote's D-pad. Simulator testing
// with the same 4-name set navigated correctly, and an earlier
// duplicate-keydown-debounce fix, tried without real device data, turned
// out to have collateral damage against ordinary fast repeated presses
// (Playwright's own back-to-back key presses land 5-20ms apart) -- so
// rather than guess again, this logs every real keydown event's keyCode/
// key/repeat and the gap since the last event of that same keyCode,
// directly on screen (no devtools needed), to see what the remote
// actually sends. PURELY OBSERVATIONAL: never calls
// preventDefault/stopPropagation, so it cannot itself affect navigation.
// REMOVE once the real cause is understood.
(function () {
    'use strict';

    var MAX_LINES = 20;
    var lines = [];
    var panel;
    var lastByKeyCode = {};

    function render() {
        if (!panel) {
            panel = document.createElement('pre');
            panel.id = 'jq-keydown-diagnostics';
            panel.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;' +
                'background:rgba(0,0,0,0.85);color:#ff0;font-size:14px;line-height:1.4;' +
                'padding:8px;margin:0;max-width:640px;max-height:100vh;overflow:auto;' +
                'white-space:pre-wrap;font-family:monospace;pointer-events:none;';
            (document.body || document.documentElement).appendChild(panel);
        }
        panel.textContent = lines.join('\n');
    }

    window.addEventListener('keydown', function (event) {
        var now = performance.now();
        var last = lastByKeyCode[event.keyCode];
        var gap = last ? (now - last).toFixed(1) + 'ms since last same keyCode' : 'first of this keyCode';
        lastByKeyCode[event.keyCode] = now;

        lines.push('keydown key=' + event.key + ' keyCode=' + event.keyCode
            + ' repeat=' + event.repeat + ' -- ' + gap);
        if (lines.length > MAX_LINES) lines.shift();
        render();
    }, true);
})();
