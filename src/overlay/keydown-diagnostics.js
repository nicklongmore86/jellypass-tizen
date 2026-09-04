// TEMPORARY diagnostic for a reported real-hardware navigation bug (see
// docs/rebuild-plan.md, Phase 5 follow-up): a household reported only
// being able to reach every other profile card (Alex and Kids, out of
// Alex/Brittany/Kids/Nick) with the remote's D-pad.
//
// A first hypothesis (the remote delivering two keydown events per
// physical press) is now DISPROVEN: an earlier version of this exact
// diagnostic showed every keydown arriving with `repeat=false`, spaced
// 170-800ms apart -- normal, single, human-paced presses, no duplicates.
// So the bug isn't in event count; it's in what a single keydown
// actually does to focus. This version logs the focused element
// immediately before each keydown, and again once its processing has
// finished (a setTimeout(0), so it runs after the vendored
// spatial-navigation-polyfill's own synchronous handling of the same
// event completes) -- directly showing whether one press really does
// move focus more than one position.
//
// PURELY OBSERVATIONAL: never calls preventDefault/stopPropagation, so
// it cannot itself affect navigation. REMOVE once the real cause is
// understood.
(function () {
    'use strict';

    var MAX_LINES = 40;
    var lines = [];
    var panel;
    var lastByKeyCode = {};

    function render() {
        if (!panel) {
            panel = document.createElement('pre');
            panel.id = 'jq-keydown-diagnostics';
            panel.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;' +
                'background:rgba(0,0,0,0.85);color:#ff0;font-size:13px;line-height:1.3;' +
                'padding:8px;margin:0;max-width:640px;max-height:100vh;overflow:auto;' +
                'white-space:pre-wrap;font-family:monospace;pointer-events:none;';
            (document.body || document.documentElement).appendChild(panel);
        }
        panel.textContent = lines.join('\n');
    }

    function push(text) {
        lines.push(text);
        if (lines.length > MAX_LINES) lines.shift();
        render();
    }

    function describeActive() {
        var el = document.activeElement;
        if (!el || el === document.body) return '(none)';
        var id = el.getAttribute && (el.getAttribute('data-profile-id') || el.getAttribute('data-item-id'));
        var label = (el.textContent && el.textContent.trim()) || el.className || el.tagName;
        return label + (id ? ' [' + id + ']' : '');
    }

    window.addEventListener('keydown', function (event) {
        var now = performance.now();
        var last = lastByKeyCode[event.keyCode];
        var gap = last ? (now - last).toFixed(1) + 'ms since last same keyCode' : 'first of this keyCode';
        lastByKeyCode[event.keyCode] = now;

        var before = describeActive();
        push('key=' + event.key + ' repeat=' + event.repeat + ' (' + gap + ') focus BEFORE=' + before);

        window.setTimeout(function () {
            push('  focus AFTER=' + describeActive());
        }, 0);
    }, true);
})();
