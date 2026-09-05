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
