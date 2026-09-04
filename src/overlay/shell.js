// Top-level nav shell -- the persistent rail (Profile/Home/Search/Requests)
// stays mounted across every screen; app.js swaps what's in the content
// area beneath/beside it (Home, Search, Library, Detail). This matches
// DETAIL_ACTIONS.md's focus graph, which has the rail reachable by Up
// from the detail page's own action row, not hidden while viewing detail.
//
// shell.js only owns the rail chrome and the content container; it has
// no idea what's inside the content area at any given moment -- that's
// app.js's job (see showHome/showSearch/showLibrary/showDetail there).
(function () {
    'use strict';

    var contentEl = null;

    // callbacks: { onSwitchProfile(), onHome(), onSearch(), onRequests() }
    function renderShell(container, callbacks) {
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
            callbacks.onSwitchProfile();
        });
        rail.appendChild(profileButton);

        var homeButton = document.createElement('button');
        homeButton.className = 'jq-rail-item jq-focusable jq-nav-home';
        homeButton.textContent = 'Home';
        homeButton.addEventListener('click', callbacks.onHome);
        rail.appendChild(homeButton);

        var searchButton = document.createElement('button');
        searchButton.className = 'jq-rail-item jq-focusable jq-nav-search';
        searchButton.textContent = 'Search';
        searchButton.addEventListener('click', callbacks.onSearch);
        rail.appendChild(searchButton);

        var requestsButton = document.createElement('button');
        requestsButton.className = 'jq-rail-item jq-focusable jq-nav-requests';
        requestsButton.textContent = 'Requests';
        requestsButton.addEventListener('click', callbacks.onRequests);
        rail.appendChild(requestsButton);

        container.appendChild(rail);

        contentEl = document.createElement('main');
        contentEl.className = 'jq-content jq-shell-content';
        container.appendChild(contentEl);

        window.JellyQuestFocus.focusFirst(rail);
    }

    function getContent() {
        return contentEl;
    }

    window.JellyQuestShell = {
        render: renderShell,
        getContent: getContent
    };
})();
