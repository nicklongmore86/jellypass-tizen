// Top-level nav shell -- shown once a profile is active. Home/Requests
// rail plus the current profile, with a way back to the picker. No
// account-management, manual-login, or admin surfaces anywhere in it.
//
// Home's real content is Phase 3; Requests' real content (and its
// eligibility gating) is Phase 4. This phase only owns the persistent
// chrome around them.
(function () {
    'use strict';

    // onSwitchProfile() is called when the viewer activates the profile
    // button in the rail, to return to the picker.
    function renderShell(container, onSwitchProfile) {
        container.innerHTML = '';
        container.className = 'jq-shell';

        var rail = document.createElement('nav');
        rail.className = 'jq-rail';
        rail.setAttribute('aria-label', 'Primary');

        var profileButton = document.createElement('button');
        profileButton.className = 'jq-rail-item jq-focusable jq-profile-switch';
        profileButton.setAttribute('data-jq-autofocus', '');
        var user = window.JellyQuestSession.getCurrentProfile();
        profileButton.textContent = user ? user.Name : 'Profile';
        profileButton.addEventListener('click', function () {
            window.JellyQuestSession.clearProfile();
            onSwitchProfile();
        });
        rail.appendChild(profileButton);

        var homeButton = document.createElement('button');
        homeButton.className = 'jq-rail-item jq-focusable jq-nav-home';
        homeButton.textContent = 'Home';
        rail.appendChild(homeButton);

        var requestsButton = document.createElement('button');
        requestsButton.className = 'jq-rail-item jq-focusable jq-nav-requests';
        requestsButton.textContent = 'Requests';
        rail.appendChild(requestsButton);

        container.appendChild(rail);

        var content = document.createElement('main');
        content.className = 'jq-content jq-shell-content';
        content.textContent = 'Home -- Phase 3';
        container.appendChild(content);

        window.JellyQuestFocus.focusFirst(rail);
    }

    window.JellyQuestShell = {
        render: renderShell
    };
})();
