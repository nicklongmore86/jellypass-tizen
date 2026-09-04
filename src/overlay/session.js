// JellyQuest session/profile module.
//
// Stock jellyfin-web is account/login-centric: one signed-in user per
// session, switching means signing out and back in through a full login
// screen. JellyQuest's household accounts are passwordless by design
// (see the JellyPass household-gateway hardening this depends on), so
// "switching profiles" doesn't need a login screen at all -- it's one
// AuthenticateByName call with a blank password, and an in-place swap of
// the active ApiClient user. No navigation, no visible auth step.
//
// This is the ONE place that call happens. Every profile-switching
// surface (the picker, an in-shell switcher) goes through switchProfile()
// here rather than re-implementing the auth call itself.
(function () {
    'use strict';

    var currentUser = null;
    var listeners = [];

    function notify() {
        listeners.forEach(function (listener) { listener(currentUser); });
    }

    // The household's visible profiles -- already filtered server-side to
    // just this household by the JellyPass household gateway, so there is
    // no client-side filtering to get right (or wrong) here.
    function listProfiles() {
        return window.ApiClient.getPublicUsers();
    }

    // Switches the active profile. `user` is an entry from listProfiles()
    // (needs .Name; Jellyfin's AuthenticateByName takes a username, not
    // an id). Resolves with the authenticated user on success; rejects
    // (e.g. the account unexpectedly has a real password, or the
    // household gateway rejects it) without changing the current profile.
    function switchProfile(user) {
        return window.ApiClient.authenticateUserByName(user.Name, '').then(function (result) {
            currentUser = result.User;
            notify();
            return currentUser;
        });
    }

    function getCurrentProfile() {
        return currentUser;
    }

    // Returns to no active profile (used when the shell's "switch
    // profile" action sends the viewer back to the picker) without
    // touching the ApiClient's own auth state -- the next switchProfile()
    // call re-authenticates cleanly regardless.
    function clearProfile() {
        currentUser = null;
        notify();
    }

    function onProfileChange(listener) {
        listeners.push(listener);
        return function unsubscribe() {
            listeners = listeners.filter(function (entry) { return entry !== listener; });
        };
    }

    window.JellyQuestSession = {
        listProfiles: listProfiles,
        switchProfile: switchProfile,
        getCurrentProfile: getCurrentProfile,
        clearProfile: clearProfile,
        onProfileChange: onProfileChange
    };
})();
