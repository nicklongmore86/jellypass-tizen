// A fake window.ApiClient with representative Jellyfin data (profiles and
// library items), matching the method names real jellyfin-web code calls
// on the genuine ApiClient. Screens built against this in the simulator
// should work unmodified against the real ApiClient once packaged.
(function () {
    'use strict';

    var USERS = [
        { Id: 'user-alice', Name: 'Alice' },
        { Id: 'user-bob', Name: 'Bob' },
        { Id: 'user-charlie', Name: 'Charlie' },
    ];

    var ITEMS = [
        { Id: 'item-1', Name: 'The Long Winter', Type: 'Movie', ProductionYear: 2024 },
        { Id: 'item-2', Name: 'Harbor Lights', Type: 'Series', ProductionYear: 2023 },
        { Id: 'item-3', Name: 'Quiet Signal', Type: 'Movie', ProductionYear: 2022 },
        { Id: 'item-4', Name: 'Field Notes', Type: 'Series', ProductionYear: 2021 },
        { Id: 'item-5', Name: 'Low Tide', Type: 'Movie', ProductionYear: 2020 },
        { Id: 'item-6', Name: 'Static Bloom', Type: 'Movie', ProductionYear: 2024 },
    ];

    var currentUserId = null;

    window.ApiClient = {
        getPublicUsers: function () {
            return Promise.resolve(USERS.slice());
        },
        // Mirrors the real passwordless flow this project relies on: a
        // blank password against a household member's account.
        authenticateUserByName: function (username, password) {
            var user = USERS.filter(function (candidate) { return candidate.Name === username; })[0];
            if (!user || password !== '') {
                return Promise.reject(new Error('authentication failed'));
            }
            currentUserId = user.Id;
            return Promise.resolve({ User: user, AccessToken: 'dev-token-' + user.Id });
        },
        getCurrentUserId: function () {
            return currentUserId;
        },
        getItems: function () {
            return Promise.resolve({ Items: ITEMS.slice(), TotalRecordCount: ITEMS.length });
        },
    };
})();
