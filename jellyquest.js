(function () {
    'use strict';

    var requestsUrl;
    var requestsOverlay;
    var requestsFrame;
    var previousFocus;

    var selectors = [
        '#loginPage .manualLoginForm',
        '#loginPage .readOnlyContent',
        '#loginPage .btnManual',
        '#loginPage .btnQuick',
        '#loginPage .btnForgotPassword'
    ];

    function enforceHouseholdLogin() {
        selectors.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (element) {
                element.hidden = true;
                element.setAttribute('aria-hidden', 'true');
                element.setAttribute('tabindex', '-1');
            });
        });
    }

    function isRequestsUrl(url) {
        if (!requestsUrl || typeof url !== 'string') {
            return false;
        }
        try {
            return new URL(url, window.location.href).origin === requestsUrl;
        } catch (error) {
            return false;
        }
    }

    function closeRequests() {
        if (!requestsOverlay || requestsOverlay.hidden) {
            return false;
        }
        requestsOverlay.hidden = true;
        document.body.classList.remove('jellyquest-requests-open');
        if (previousFocus && document.contains(previousFocus)) {
            previousFocus.focus();
        }
        return true;
    }

    function createRequestsOverlay() {
        if (requestsOverlay) {
            return;
        }

        requestsOverlay = document.createElement('section');
        requestsOverlay.id = 'jellyquestRequests';
        requestsOverlay.className = 'jellyquestRequests';
        requestsOverlay.hidden = true;
        requestsOverlay.setAttribute('aria-label', 'Media requests');

        var toolbar = document.createElement('header');
        toolbar.className = 'jellyquestRequestsToolbar';

        var closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'jellyquestRequestsClose';
        closeButton.setAttribute('aria-label', 'Back to JellyQuest');
        closeButton.textContent = '\u2190 Back to JellyQuest';
        closeButton.addEventListener('click', closeRequests);
        toolbar.appendChild(closeButton);

        var title = document.createElement('h1');
        title.textContent = 'Requests';
        toolbar.appendChild(title);

        requestsFrame = document.createElement('iframe');
        requestsFrame.className = 'jellyquestRequestsFrame';
        requestsFrame.title = 'Jellyseerr media requests';
        requestsFrame.setAttribute('allow', 'fullscreen');

        requestsOverlay.appendChild(toolbar);
        requestsOverlay.appendChild(requestsFrame);
        document.body.appendChild(requestsOverlay);
    }

    function openRequests(url) {
        if (!isRequestsUrl(url)) {
            return false;
        }
        createRequestsOverlay();
        previousFocus = document.activeElement;
        if (!requestsFrame.getAttribute('src')) {
            requestsFrame.src = requestsUrl;
        }
        requestsOverlay.hidden = false;
        document.body.classList.add('jellyquest-requests-open');
        requestsOverlay.querySelector('.jellyquestRequestsClose').focus();
        return true;
    }

    function handleBack(event) {
        var isBack = event.type === 'tizenhwkey'
            ? event.keyName === 'back'
            : event.keyCode === 10009 || event.keyCode === 8;
        if (isBack && closeRequests()) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }

    function loadConfiguration() {
        fetch('jellyquest-build.json', { cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('configuration returned ' + response.status);
                }
                return response.json();
            })
            .then(function (config) {
                requestsUrl = new URL(config.requestsUrl).origin;
                console.info('[JellyQuest] Requests configured for ' + requestsUrl);
            })
            .catch(function (error) {
                console.error('[JellyQuest] Requests are unavailable:', error);
            });
    }

    function start() {
        enforceHouseholdLogin();
        loadConfiguration();
        new MutationObserver(enforceHouseholdLogin).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.JellyQuest = { openRequests: openRequests, closeRequests: closeRequests };
    window.addEventListener('keydown', handleBack, true);
    window.addEventListener('tizenhwkey', handleBack, true);
    window.addEventListener('viewshow', enforceHouseholdLogin);
    console.info('[JellyQuest] Farmhouse household policy loaded');
})();
