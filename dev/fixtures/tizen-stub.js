// Fakes the subset of Samsung's `tizen`/`webapis` globals that tizen.js
// touches, so the REAL tizen.js shim (not a rewritten copy of it) can run
// unmodified in a desktop/CI browser. Must load before tizen.js.
(function () {
    'use strict';

    window.tizen = {
        application: {
            getCurrentApplication: function () {
                return {
                    appInfo: { version: '0.0.0-dev' },
                    exit: function () { console.info('[simulator] tizen.application.exit() called'); },
                };
            },
        },
        systeminfo: {
            getPropertyValue: function (property, onSuccess) {
                onSuccess({ resolutionWidth: 1920, resolutionHeight: 1080 });
            },
        },
        tvinputdevice: {
            registerKey: function (key) { console.debug('[simulator] registerKey', key); },
            unregisterKey: function (key) { console.debug('[simulator] unregisterKey', key); },
        },
    };

    window.webapis = {
        productinfo: {
            is8KPanelSupported: function () { return false; },
            isUdPanelSupported: function () { return false; },
        },
    };
})();
