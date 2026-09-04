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

    function focusFirst(container) {
        if (!container) return false;
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

    // Opens a modal-style container: marks it contained (see .jq-modal
    // above) and focuses its first element. Screens call this instead of
    // writing their own focus-trap logic.
    function openModal(container) {
        if (!container) return;
        container.classList.add('jq-modal');
        container.hidden = false;
        focusFirst(container);
    }

    function closeModal(container, restoreTarget) {
        if (!container) return;
        container.hidden = true;
        if (restoreTarget && typeof restoreTarget.focus === 'function') {
            restoreTarget.focus();
        }
    }

    window.JellyQuestFocus = {
        ready: ready,
        focusFirst: focusFirst,
        openModal: openModal,
        closeModal: closeModal
    };
})();
