(function () {
    'use strict';

    var requestsUrl;
    var openingRequests = false;

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

    function isHomeRoute() {
        return /^#\/home(?:\?|$)/.test(window.location.hash);
    }

    function ensureRequestsTab() {
        var existing = document.querySelector('.jellyquestRequestsTab');
        if (!isHomeRoute()) {
            if (existing) {
                existing.parentNode.removeChild(existing);
            }
            return;
        }
        if (existing) {
            return;
        }

        var slider = document.querySelector('.headerTabs .tabs-viewmenubar .emby-tabs-slider');
        if (!slider) {
            return;
        }

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'emby-tab-button jellyquestRequestsTab';
        button.setAttribute('data-index', '-1');
        button.setAttribute('aria-label', 'Requests');

        var foreground = document.createElement('div');
        foreground.className = 'emby-button-foreground';
        foreground.textContent = 'Requests';
        button.appendChild(foreground);
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            openRequests(requestsUrl);
        });
        slider.appendChild(button);
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

    function openRequests(url) {
        if (!isRequestsUrl(url)) {
            return false;
        }
        if (openingRequests) {
            return true;
        }
        openingRequests = true;
        if (!window.ApiClient || typeof window.ApiClient.getCurrentUser !== 'function') {
            openingRequests = false;
            window.alert('Sign in to Jellyfin before opening Requests.');
            return true;
        }
        window.ApiClient.getCurrentUser(false).then(function (user) {
            if (!user || !user.Id || !user.Name) {
                throw new Error('Jellyfin did not return the current profile.');
            }
            var fragment = '#user=' + encodeURIComponent(user.Name) + '&id=' + encodeURIComponent(user.Id);
            window.location.assign(requestsUrl + '/jellyquest-login.html' + fragment);
        }).catch(function (error) {
            openingRequests = false;
            console.error('[JellyQuest] Unable to open Requests:', error);
            window.alert('Unable to open Requests for the current Jellyfin profile.');
        });
        return true;
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
        ensureRequestsTab();
        new MutationObserver(function () {
            enforceHouseholdLogin();
            ensureRequestsTab();
        }).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.JellyQuest = { openRequests: openRequests };
    window.addEventListener('hashchange', ensureRequestsTab);
    window.addEventListener('viewshow', function () {
        enforceHouseholdLogin();
        ensureRequestsTab();
    });
    console.info('[JellyQuest] Farmhouse household policy loaded');
})();
