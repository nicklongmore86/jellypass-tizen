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

    window.JellyQuest = { openRequests: openRequests };
    window.addEventListener('viewshow', enforceHouseholdLogin);
    console.info('[JellyQuest] Farmhouse household policy loaded');
})();
