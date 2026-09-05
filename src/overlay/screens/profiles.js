// Profile picker screen -- the true landing screen (see
// docs/rebuild-plan.md, Phase 2). No login form, no manual-login/Quick
// Connect/admin chrome: just the household's own visible profiles,
// already filtered server-side by the JellyPass household gateway.
// Selecting one is a single Enter/click away from being on Home.
(function () {
    'use strict';

    // onSelected(user) is called after a successful switchProfile().
    function renderProfiles(container, onSelected) {
        container.innerHTML = '';
        container.className = 'jq-profiles-screen';

        var heading = document.createElement('h1');
        heading.className = 'jq-profiles-heading';
        heading.textContent = "Who's watching?";
        container.appendChild(heading);

        // A single row, not .jq-grid: grid mode's row/column snapping
        // misbehaves once the CSS column template has more columns than
        // there are actual items (a household smaller than the layout's
        // column count is the normal case, not an edge case), and a
        // profile picker is semantically one row anyway.
        var row = document.createElement('div');
        row.className = 'jq-row jq-profiles-row';
        container.appendChild(row);

        var error = document.createElement('p');
        error.className = 'jq-profiles-error';
        error.hidden = true;
        container.appendChild(error);

        window.JellyQuestSession.listProfiles().then(function (profiles) {
            profiles.forEach(function (user, index) {
                var card = document.createElement('button');
                card.className = 'jq-card jq-focusable jq-profile-card';
                card.setAttribute('data-profile-id', user.Id);
                card.textContent = user.Name;
                if (index === 0) card.setAttribute('data-jq-autofocus', '');
                card.addEventListener('click', function () {
                    error.hidden = true;
                    card.disabled = true;
                    window.JellyQuestSession.switchProfile(user).then(function (currentUser) {
                        onSelected(currentUser);
                    }, function () {
                        card.disabled = false;
                        error.textContent = 'Could not sign in as ' + user.Name + '. Try again.';
                        error.hidden = false;
                    });
                });
                row.appendChild(card);
            });
            window.JellyQuestFocus.focusFirst(container);
        }).catch(function (failure) {
            error.textContent = 'Profiles are unavailable right now. Try again.';
            error.hidden = false;
            console.error('[JellyQuest] Profiles failed:', failure);
        });
    }

    window.JellyQuestProfilesScreen = {
        render: renderProfiles
    };
})();
