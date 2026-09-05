// JellyQuest focus/navigation conventions.
//
// This is the ONE navigation implementation every screen shares -- unlike
// the previous overlay, which hand-rolled DOM-geometry focus matching
// independently in jellyquest.js and integration/jellyseerr-login.html.
// Directional movement itself is handled entirely by the vendored
// spatial-navigation-polyfill (concatenated immediately before this file
// by scripts/build-overlay.mjs); this module only adds the small set of
// conventions JellyQuest screens build on top of it.
//
// Container conventions (set the CSS custom properties the polyfill reads):
//   .jq-rail, .jq-row   -- plain directional containers (default 'auto' mode).
//                          Arrow keys flow between containers based on
//                          geometry, e.g. Right from the last rail item
//                          enters the adjacent content row.
//   .jq-grid            -- uniform card grids. Uses 'grid' mode so Up/Down
//                          move by row instead of nearest-element geometry,
//                          which behaves oddly once card sizes vary.
//   .jq-modal           -- overlays (Settings, Playback Options). Uses
//                          'contain' mode so focus cannot escape the dialog
//                          via arrow keys while it's open, matching
//                          DETAIL_ACTIONS.md's "dialogs contain focus" rule.
//
// Element convention:
//   [data-jq-autofocus] -- marks the element a screen should focus first
//                          when it becomes active.
//
// This module also keeps the focused element inside its scrollport (see
// "Keeping the focused element on screen" below), which is what makes a
// row or grid longer than the screen walkable with the remote at all.
(function () {
    'use strict';

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    }

    // Screens call this when they finish rendering. A screen's render can
    // finish WHILE a modal is open -- Home's rows arrive over the network,
    // and app.js installs Home's Back handler before that render completes,
    // so a slow response lands after the exit confirmation is already up.
    // `--spatial-navigation-contain: contain` only constrains arrow-key
    // movement; it does nothing about a programmatic .focus() call, which
    // would silently move the cursor to a card behind the dialog and make
    // Enter act on it. The guard lives here, in the one helper every screen
    // routes focus through (shell.js, home.js, search.js, library.js,
    // requests.js, profiles.js, detail.js all call focusFirst and nothing
    // else), rather than in each screen that might ever render late.
    function focusFirst(container) {
        if (!container) return false;
        if (activeModal) return activeModal.contains(container) ? focusInto(container) : false;
        if (focusInto(container)) return true;
        // Nothing in the screen could take focus. That is a real state, not a
        // bug: an empty Jellyfin library gives Home no cards at all, only a
        // "Nothing here yet." paragraph. If the element that had focus was
        // inside the content the screen just replaced, it is gone too and
        // document.activeElement has fallen back to <body> -- no focus ring,
        // no cursor, and on a TV that reads as the app having died until the
        // user happens to press an arrow. The rail is always mounted and
        // always focusable, so it is the last resort.
        //
        // But only when focus really is nowhere. A render can finish long
        // after the user gave up waiting and moved the cursor onto the rail
        // themselves, and pulling it back to the rail's default item would
        // discard a selection they just made -- the same
        // asynchronous-completion-beats-newer-intent shape as a late render
        // stealing focus from an open modal, with a rail selection in place
        // of the dialog. If something real already holds focus, that is the
        // newer intent and this render leaves it alone.
        if (hasVisibleFocus()) return false;
        if (fallbackContainer
            && fallbackContainer !== container
            && document.body.contains(fallbackContainer)) {
            return focusInto(fallbackContainer);
        }
        return false;
    }

    // Whether the cursor is currently on something the user can actually see.
    // Deliberately three narrow conditions -- attached, not <body>, and
    // rendering a box -- because this decides whether to override what the
    // user is looking at. getClientRects() is empty for anything inside a
    // display:none subtree, which is the dismissed dialog's case.
    function hasVisibleFocus() {
        var active = document.activeElement;
        if (!active || active === document.body) return false;
        if (!document.body.contains(active)) return false;
        if (typeof active.getClientRects !== 'function') return false;
        return active.getClientRects().length > 0;
    }

    function focusInto(container) {
        var target = container.querySelector('[data-jq-autofocus]') || firstFocusable(container);
        if (target && typeof target.focus === 'function') {
            target.focus();
            return true;
        }
        return false;
    }

    function firstFocusable(container) {
        return container.querySelector(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
    }

    // ---- Keeping the focused element on screen --------------------------
    //
    // A Home row holds one card per library item, so it is routinely wider
    // than the screen; .jq-home-screen and .jq-library-screen clip the
    // overflow. Nothing scrolled, and the polyfill will not move focus to
    // an element it cannot see -- its isVisible() ends in a hitTest() that
    // probes the candidate with document.elementFromPoint(), which returns
    // the clipping ancestor for anything outside the scrollport. So a
    // Recently Added row of 8 cards plus "See All" dead-ended on card 7,
    // the last one with any pixels on screen: card 8 and "See All" were
    // unreachable by remote, permanently.
    //
    // The fix belongs here rather than in each screen because this is the
    // one place every focus change passes through -- not just the
    // focusFirst() calls above, but the polyfill's own arrow-key
    // .focus(), closeModal()'s restore, and anything else that ever moves
    // the cursor. A capture-phase 'focus' listener on document sees all of
    // them (focus does not bubble; capture is how you observe it
    // document-wide), so no screen has to remember to opt in, and the
    // Library grid gets vertical scrolling from the same code that gives
    // Home horizontal scrolling.
    //
    // Scrolling on focus is also what makes the NEXT element reachable:
    // bringing the focused card fully into view drags its neighbour into
    // view behind it, so the following key press has a visible candidate.
    // That is why the reveal margin below is load-bearing, not cosmetic.
    //
    // COMPATIBILITY. Only scrollLeft/scrollTop assignment is used, which
    // caniuse dates to Chrome 4 (https://caniuse.com/mdn-api_element_scrollleft)
    // -- far below the measured Tizen 5.0 / Chromium M63 floor. The
    // alternatives were rejected on purpose:
    //   * scrollIntoView() with an options object: caniuse marks Chrome
    //     4-60 partial and only 61+ full (https://caniuse.com/scrollintoview),
    //     which puts the floor two releases under M63 -- too thin a margin
    //     on hardware nobody can retest, and this repo has already been
    //     bitten by a property that parsed and computed correctly while
    //     doing nothing (see the flex `gap` note in focus.css). It also
    //     walks every scrollable ancestor including the document, and
    //     JellyQuest does not own jellyfin-web's page scroll.
    //   * CSS scroll-behavior / behavior: 'smooth': Chrome 61, disabled by
    //     default in 41-60 (https://caniuse.com/css-scroll-behavior).
    //     Same thin margin, and no functional need.
    // Containers are `overflow: hidden` rather than auto/scroll: the TV has
    // no pointer, scrollbars would be visible chrome, and the polyfill's
    // own isScrollable() deliberately excludes `hidden` ("the element can
    // be only programmically scrollable"), so it leaves these containers
    // to us instead of nudging them 40px at a time via moveScroll().

    // How much room to keep past the focused element's edges, in CSS px.
    //
    // Load-bearing, not padding: the polyfill's hitTest() probes a
    // candidate at `left + offsetWidth / 10` from its leading edge, so for
    // a 220px .jq-media-card the probe sits 22px in, behind a 20px sibling
    // margin. Reveal less than ~42px past the focused card and the next
    // one is still invisible to the polyfill and focus dead-ends exactly
    // where it does today. 64px clears that comfortably while showing only
    // a sliver of the next card, which is also the conventional TV cue
    // that a row continues.
    var REVEAL_PX = 64;

    function revealFocus(element) {
        if (!element || element.nodeType !== 1) return;
        // Stops at <body>: everything above #jellyquest-root belongs to
        // jellyfin-web, and its page scroll is not ours to move.
        var node = element.parentNode;
        while (node && node.nodeType === 1 && node !== document.body) {
            revealInto(node, element);
            node = node.parentNode;
        }
    }

    function revealInto(container, element) {
        var scrollsX = container.scrollWidth > container.clientWidth;
        var scrollsY = container.scrollHeight > container.clientHeight;
        // Assigning scrollLeft/scrollTop to a non-scrolling box is a no-op,
        // but skipping the geometry reads keeps this cheap on the deep
        // ancestor chains every focus change walks.
        if (!scrollsX && !scrollsY) return;
        var port = container.getBoundingClientRect();
        var rect = element.getBoundingClientRect();
        if (scrollsX) {
            // clientLeft/clientTop discount a border, which offsets the
            // scrollport from the border box getBoundingClientRect gives.
            var portLeft = port.left + container.clientLeft;
            container.scrollLeft = revealOffset(
                container.scrollLeft,
                rect.left - portLeft,
                rect.right - portLeft - container.clientWidth
            );
        }
        if (scrollsY) {
            var portTop = port.top + container.clientTop;
            container.scrollTop = revealOffset(
                container.scrollTop,
                rect.top - portTop,
                rect.bottom - portTop - container.clientHeight
            );
        }
    }

    // The scroll offset one axis should take. `near` is how far the
    // element's leading edge sits inside the scrollport's leading edge
    // (negative once it has slipped off it) and `far` how far its trailing
    // edge sits past the scrollport's trailing edge (positive once it has).
    //
    // Shifting the offset by d moves both by -d, so every offset in
    // [lowest, highest] keeps the element on screen with REVEAL_PX to
    // spare. The browser clamps whatever comes back to the scrollable
    // range, which is also what carries the last element in a row all the
    // way to the end: its trailing margin asks for more scroll than exists.
    function revealOffset(offset, near, far) {
        var lowest = offset + far + REVEAL_PX;
        var highest = offset + near - REVEAL_PX;
        // Empty range: the element is longer than the scrollport, so show
        // its leading edge, where its label and focus ring are.
        if (lowest > highest) return highest;
        // Nothing carries the offset back the other way, though -- the
        // margin is satisfied while the container's own leading chrome is
        // still hidden above/left of the scrollport, and that chrome can be
        // focusable: the Library screen's "< Back" sits above its first
        // grid row and is only reachable by Up from it. Parking 80px short
        // of the top would dead-end the cursor there in exactly the way
        // this whole section exists to prevent. So when returning all the
        // way to the start would still leave the element on screen, do
        // that. The trailing end needs no such rule (see above) and must
        // not have one: an element well short of the end usually also fits
        // at the end, and jumping there would fling the row past the cards
        // the viewer is walking through.
        if (lowest <= 0 && highest >= 0) return 0;
        if (offset < lowest) return lowest;
        if (offset > highest) return highest;
        return offset;
    }

    document.addEventListener('focus', function (event) {
        revealFocus(event.target);
    }, true);

    // Tracks the currently-open modal's own close handler so the
    // hardware Back button can close it first, before any screen-level
    // "go back to where I came from" handler runs (see app.js's router
    // and DETAIL_ACTIONS.md's "Left or Back returns one level before
    // closing" rule) -- without every screen having to coordinate this
    // itself.
    var activeModalClose = null;
    // The open modal's own container, so focusFirst() can tell "this screen
    // just finished rendering underneath the dialog" from "the dialog itself
    // is asking for focus".
    var activeModal = null;

    // Where focus goes when a screen has nowhere to put it -- shell.js
    // registers its rail. Checked for being attached before use, because the
    // profile picker clears the shell (and with it the rail) out of the root.
    var fallbackContainer = null;

    function setFallbackContainer(container) {
        fallbackContainer = container || null;
    }

    // Opens a modal-style container: marks it contained (see .jq-modal
    // above) and focuses its first element. Screens call this instead of
    // writing their own focus-trap logic. onClose is called by
    // closeOnBack() (wired to the hardware Back button); it must itself
    // call closeModal().
    function openModal(container, onClose) {
        if (!container) return;
        container.classList.add('jq-modal');
        container.hidden = false;
        // Set before focusFirst() so the guard there sees the dialog as the
        // active modal and lets it focus itself.
        activeModal = container;
        focusFirst(container);
        activeModalClose = onClose || null;
    }

    function closeModal(container, restoreTarget) {
        if (!container) return;
        container.hidden = true;
        activeModalClose = null;
        if (activeModal === container) activeModal = null;
        if (restoreTarget && typeof restoreTarget.focus === 'function') {
            restoreTarget.focus();
        }
    }

    // Returns true if a modal was open and its own close handler ran (the
    // caller should stop there); false if there was nothing to close, so
    // the caller's own Back behavior should run instead.
    function closeOnBack() {
        if (!activeModalClose) return false;
        var close = activeModalClose;
        activeModalClose = null;
        close();
        return true;
    }

    window.JellyQuestFocus = {
        ready: ready,
        focusFirst: focusFirst,
        setFallbackContainer: setFallbackContainer,
        openModal: openModal,
        closeModal: closeModal,
        closeOnBack: closeOnBack
    };
})();
