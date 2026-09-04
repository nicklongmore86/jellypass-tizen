// Bootstraps JellyQuest: creates its own root container (no host markup
// required -- gulpfile.babel.js only injects <script>/<link> tags, never
// a container div) and switches between the profile picker and the main
// shell based on session state.
(function () {
    'use strict';

    function showProfiles(root) {
        window.JellyQuestProfilesScreen.render(root, function () {
            showShell(root);
        });
    }

    function showShell(root) {
        window.JellyQuestShell.render(root, function () {
            showProfiles(root);
        });
    }

    window.JellyQuestFocus.ready(function () {
        var root = document.getElementById('jellyquest-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'jellyquest-root';
            document.body.appendChild(root);
        }

        if (window.JellyQuestSession.getCurrentProfile()) {
            showShell(root);
        } else {
            showProfiles(root);
        }
    });
})();
