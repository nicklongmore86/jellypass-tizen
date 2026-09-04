// TEMPORARY diagnostic for a reported real-hardware navigation bug (see
// docs/rebuild-plan.md, Phase 5 follow-up): a household reported only
// being able to reach every other profile card (Alex and Kids, out of
// Alex/Brittany/Kids/Nick) with the remote's D-pad. Simulator testing
// with the same 4-name set navigated correctly, and an earlier
// duplicate-keydown-debounce fix, tried without real device data, turned
// out to have collateral damage against ordinary fast repeated presses
// (Playwright's own back-to-back key presses land 5-20ms apart) -- so
// rather than guess again, this logs what the remote actually sends,
// directly on screen (no devtools needed).
//
// ONE THEORY IS ALREADY DEAD. An earlier version of this panel,
// photographed on the real remote, showed every keydown arriving with
// repeat=false and 170-800ms apart -- single, human-paced presses, no
// duplicates at all. So the remote is not sending two events per press.
// That rules out event COUNT; it says nothing about how far a single
// event moves focus, which is what this version measures.
//
// WHAT THIS IS LOOKING FOR. On device -- but never in the simulator,
// which loads the overlay alone -- gulpfile.babel.js injects
// jellyquest.js into jellyfin-web's own index.html, so TWO independent
// arrow-key navigation systems are live at once:
//   a) the bundled spatial-navigation-polyfill (window keydown, bubble
//      phase, registered from its own 'load' handler), and
//   b) jellyfin-web's keyboardnavigation -> inputManager.handleCommand
//      -> focusManager.moveRight, a separate geometry implementation
//      present in the shipped main.jellyfin.bundle.js, whose arrow-key
//      branch is gated on jellyfin-web's layoutManager.tv detection: true on
//      the TV, false in desktop Chromium.
// Both guard on !event.defaultPrevented and both call preventDefault(),
// so normally whichever runs first wins and one press moves focus once.
// The hypothesis is that the TV dispatches keydown with
// cancelable:false, which makes preventDefault() a silent no-op, leaves
// defaultPrevented false, and lets BOTH handlers move focus -- two cards
// per press, i.e. exactly "only every other card is reachable".
//
// So each press is sampled at three points: in the capture phase (before
// any navigation handler has seen it), in a bubble-phase window listener
// deliberately registered LAST (after the polyfill's, and last in the
// bubble path regardless of registration order for any handler bound to
// document), and once more after dispatch has fully unwound, to catch an
// asynchronous focus move. If one physical press shows cancelable=NO and
// a net two-position focus jump, the hypothesis is confirmed.
//
// PURELY OBSERVATIONAL: never calls preventDefault/stopPropagation, and
// only ever reads document.activeElement -- it cannot itself affect
// navigation. REMOVE once the real cause is understood.
(function () {
    'use strict';

    var MAX_EVENTS = 8;
    var events = [];
    var panel;
    var lastByKeyCode = {};
    var sequence = 0;

    // A short human label for a focused element: what a photograph of the
    // panel needs to show which card focus actually landed on.
    function label(element) {
        if (!element) return 'none';
        if (element === document.body) return 'body';
        var text = element.getAttribute && element.getAttribute('aria-label');
        if (!text) text = element.textContent || '';
        text = text.replace(/\s+/g, ' ').replace(/^ | $/g, '');
        if (!text) text = element.id || element.tagName;
        if (text.length > 14) text = text.slice(0, 13) + '..';
        return text;
    }

    // Position among its own siblings -- profile cards are all children of
    // one .jq-profiles-row, so a two-step jump reads as [0] -> [2].
    function indexOf(element) {
        if (!element || !element.parentElement) return -1;
        var siblings = element.parentElement.children;
        for (var i = 0; i < siblings.length; i++) {
            if (siblings[i] === element) return i;
        }
        return -1;
    }

    function sample() {
        var active = document.activeElement;
        return { label: label(active), index: indexOf(active) };
    }

    function describe(snapshot) {
        if (!snapshot) return 'n/a';
        return snapshot.label + '[' + snapshot.index + ']';
    }

    function format(record) {
        var head = '#' + record.sequence + ' ' + record.key + ' kc=' + record.keyCode
            + ' rpt=' + (record.repeat ? 'Y' : 'N')
            + ' cancelable=' + (record.cancelable ? 'YES' : 'NO')
            + ' ' + record.gap;

        var jump = '';
        if (record.before && record.after
            && record.before.index >= 0 && record.after.index >= 0) {
            var delta = record.after.index - record.before.index;
            jump = ' (' + (delta > 0 ? '+' : '') + delta + ')';
            if (delta > 1 || delta < -1) jump += ' <-- DOUBLE MOVE';
        }

        var tail = '   dP cap=' + (record.defaultPreventedAtCapture ? 'Y' : 'N')
            + ' late=' + (record.reachedLate
                ? (record.defaultPreventedAtLate ? 'Y' : 'N')
                : '-')
            + ' | ' + describe(record.before)
            + ' > ' + describe(record.late)
            + ' > ' + describe(record.after) + jump;

        return head + '\n' + tail;
    }

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
        var text = [];
        for (var i = 0; i < events.length; i++) {
            text.push(format(events[i]));
        }
        panel.textContent = text.join('\n');
    }

    // Capture phase on window: the earliest point in the dispatch, before
    // the polyfill's or jellyfin-web's handler has had a chance to run or
    // to move focus.
    window.addEventListener('keydown', function (event) {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        var last = lastByKeyCode[event.keyCode];
        lastByKeyCode[event.keyCode] = now;

        var record = {
            sequence: ++sequence,
            event: event,
            key: event.key,
            keyCode: event.keyCode,
            repeat: event.repeat,
            cancelable: event.cancelable,
            gap: last ? (now - last).toFixed(0) + 'ms' : 'first',
            defaultPreventedAtCapture: event.defaultPrevented,
            before: sample(),
            reachedLate: false,
            late: null,
            after: null
        };

        events.push(record);
        if (events.length > MAX_EVENTS) events.shift();
        render();

        // After the whole dispatch has unwound, including any focus move a
        // handler scheduled rather than performed inline.
        setTimeout(function () {
            record.after = sample();
            render();
        }, 0);
    }, true);

    // Bubble phase on window is the last stop in the dispatch path, and
    // registering from a setTimeout after 'load' puts this listener behind
    // the polyfill's, which is itself registered from a 'load' handler.
    // Whatever ran, ran before this.
    function registerLateListener() {
        window.addEventListener('keydown', function (event) {
            for (var i = events.length - 1; i >= 0; i--) {
                if (events[i].event === event) {
                    events[i].reachedLate = true;
                    events[i].defaultPreventedAtLate = event.defaultPrevented;
                    events[i].late = sample();
                    render();
                    return;
                }
            }
        }, false);
    }

    if (document.readyState === 'complete') {
        setTimeout(registerLateListener, 0);
    } else {
        window.addEventListener('load', function () {
            setTimeout(registerLateListener, 0);
        });
    }
})();
