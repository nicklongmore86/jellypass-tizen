(function () {
    'use strict';

    var requestsUrl;
    var openingRequests = false;
    var profileSwitcher;
    var profileSwitcherTrigger;
    var profileSwitching = false;
    var jellyquestScript = document.currentScript;
    var jellyfinIconUrl = jellyquestScript && jellyquestScript.src
        ? new URL('icon.png', jellyquestScript.src).href
        : 'icon.png';
    var libraryRail;
    var libraryRailSignature = '';

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

        var nativeTab = slider.querySelector('.emby-tab-button');
        var button = nativeTab ? nativeTab.cloneNode(true) : document.createElement('button');
        button.type = 'button';
        button.removeAttribute('id');
        button.removeAttribute('aria-selected');
        button.classList.remove('emby-tab-button-active');
        button.classList.remove('selected');
        button.classList.add('emby-tab-button');
        button.classList.add('jellyquestRequestsTab');
        button.setAttribute('data-index', '-1');
        button.setAttribute('aria-label', 'Requests');

        var foreground = button.querySelector('.emby-button-foreground');
        if (!foreground) {
            foreground = document.createElement('div');
            foreground.className = 'emby-button-foreground';
            button.appendChild(foreground);
        }
        foreground.textContent = 'Requests';
        button.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openRequests(requestsUrl);
        });
        slider.appendChild(button);
        if (window.CustomElements && typeof window.CustomElements.upgradeSubtree === 'function') {
            window.CustomElements.upgradeSubtree(button);
        }
    }

    function initials(name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (part) {
            return part.charAt(0).toUpperCase();
        }).join('');
    }

    function closeProfileSwitcher() {
        if (!profileSwitcher || profileSwitching) {
            return;
        }
        profileSwitcher.hidden = true;
        if (profileSwitcherTrigger && document.body.contains(profileSwitcherTrigger)) {
            profileSwitcherTrigger.focus();
        }
    }

    function positionProfileSwitcher() {
        if (!profileSwitcher || profileSwitcher.hidden || !profileSwitcherTrigger) {
            return;
        }
        var rect = profileSwitcherTrigger.getBoundingClientRect();
        var gutter = 16;
        var left = Math.max(gutter, Math.min(rect.left, window.innerWidth - profileSwitcher.offsetWidth - gutter));
        profileSwitcher.style.left = Math.round(left) + 'px';
        profileSwitcher.style.top = Math.round(rect.bottom + 14) + 'px';
    }

    function updateProfileTrigger(trigger) {
        var label = trigger.querySelector('.jellyquestCurrentProfileName');
        if (!label) {
            var icon = document.createElement('img');
            trigger.textContent = '';
            icon.className = 'jellyquestBrandIcon';
            icon.src = jellyfinIconUrl;
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');
            icon.setAttribute('draggable', 'false');
            label = document.createElement('span');
            label.className = 'jellyquestCurrentProfileName';
            label.textContent = 'Profile';
            trigger.appendChild(icon);
            trigger.appendChild(label);
        }
        if (!window.ApiClient || label.getAttribute('data-profile-loading')) {
            return;
        }
        label.setAttribute('data-profile-loading', 'true');
        window.ApiClient.getCurrentUser(false).then(function (user) {
            if (!user || !user.Name || !document.body.contains(trigger)) {
                return;
            }
            label.textContent = user.Name;
            trigger.setAttribute('aria-label', 'Switch profile. Current profile: ' + user.Name);
        }).catch(function () {
            label.removeAttribute('data-profile-loading');
        });
    }

    function switchProfile(user, currentUser) {
        var status = profileSwitcher.querySelector('.jellyquestProfileStatus');
        if (user.Id === currentUser.Id) {
            closeProfileSwitcher();
            return;
        }
        profileSwitching = true;
        status.textContent = 'Switching to ' + user.Name + '\u2026';
        profileSwitcher.querySelectorAll('.jellyquestProfileCard').forEach(function (card) {
            card.disabled = true;
        });
        window.ApiClient.authenticateUserByName(user.Name, '').then(function (result) {
            if (!result || !result.User || result.User.Id !== user.Id) {
                throw new Error('Jellyfin returned a different profile.');
            }
            window.location.hash = '#/home';
            window.location.reload();
        }).catch(function (error) {
            profileSwitching = false;
            status.textContent = 'Unable to switch profiles. ' + (error.message || 'Try again.');
            profileSwitcher.querySelectorAll('.jellyquestProfileCard').forEach(function (card) {
                card.disabled = false;
            });
            var selected = profileSwitcher.querySelector('[data-userid="' + user.Id + '"]');
            if (selected) {
                selected.focus();
            }
        });
    }

    function renderProfiles(users, currentUser) {
        var grid = profileSwitcher.querySelector('.jellyquestProfileGrid');
        var status = profileSwitcher.querySelector('.jellyquestProfileStatus');
        grid.innerHTML = '';
        users.filter(function (user) {
            return !user.HasPassword || user.Id === currentUser.Id;
        }).forEach(function (user) {
            var card = document.createElement('button');
            var avatar = document.createElement('span');
            var name = document.createElement('span');
            card.type = 'button';
            card.className = 'jellyquestProfileCard';
            card.setAttribute('data-userid', user.Id);
            card.setAttribute('role', 'menuitemradio');
            card.setAttribute('aria-checked', user.Id === currentUser.Id ? 'true' : 'false');
            if (user.Id === currentUser.Id) {
                card.classList.add('is-current');
            }
            avatar.className = 'jellyquestProfileAvatar';
            if (user.PrimaryImageTag) {
                avatar.style.backgroundImage = 'url("' + window.ApiClient.getUserImageUrl(user.Id, {
                    width: 400,
                    tag: user.PrimaryImageTag
                }).replace(/"/g, '%22') + '")';
            } else {
                avatar.textContent = initials(user.Name);
            }
            name.className = 'jellyquestProfileName';
            name.textContent = user.Name;
            card.appendChild(avatar);
            card.appendChild(name);
            if (user.Id === currentUser.Id) {
                var current = document.createElement('span');
                current.className = 'jellyquestProfileCurrent';
                current.textContent = '\u2713';
                current.setAttribute('aria-label', 'Current profile');
                card.appendChild(current);
            }
            card.addEventListener('click', function () {
                switchProfile(user, currentUser);
            });
            grid.appendChild(card);
        });
        if (!grid.children.length) {
            status.textContent = 'No passwordless household profiles are available.';
            return;
        }
        status.textContent = '';
        var selected = grid.querySelector('.is-current') || grid.firstElementChild;
        if (selected) {
            selected.focus();
        }
    }

    function openProfileSwitcher(event) {
        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
        if (!window.ApiClient || profileSwitching) {
            return;
        }
        profileSwitcher.hidden = false;
        positionProfileSwitcher();
        profileSwitcher.querySelector('.jellyquestProfileGrid').innerHTML = '';
        profileSwitcher.querySelector('.jellyquestProfileStatus').textContent = 'Loading household profiles\u2026';
        Promise.all([
            window.ApiClient.getPublicUsers(),
            window.ApiClient.getCurrentUser(false)
        ]).then(function (responses) {
            renderProfiles(responses[0] || [], responses[1]);
        }).catch(function (error) {
            profileSwitcher.querySelector('.jellyquestProfileStatus').textContent =
                'Unable to load household profiles. ' + (error.message || 'Try again.');
        });
    }

    function handleProfileKeys(event) {
        if (!profileSwitcher || profileSwitcher.hidden) {
            return;
        }
        if (event.keyCode === 10009 || event.keyCode === 27 || event.keyCode === 8) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeProfileSwitcher();
            return;
        }
        if (event.keyCode === 38 || event.keyCode === 40) {
            var cards = Array.prototype.slice.call(profileSwitcher.querySelectorAll('.jellyquestProfileCard:not([disabled])'));
            var index = cards.indexOf(document.activeElement);
            if (index !== -1 && cards.length > 1) {
                event.preventDefault();
                event.stopImmediatePropagation();
                index = event.keyCode === 38 ? (index - 1 + cards.length) % cards.length : (index + 1) % cards.length;
                cards[index].focus();
            }
        }
    }

    function ensureProfileSwitcher() {
        if (!profileSwitcher) {
            profileSwitcher = document.createElement('div');
            profileSwitcher.className = 'jellyquestProfileSwitcher';
            profileSwitcher.hidden = true;
            profileSwitcher.setAttribute('role', 'menu');
            profileSwitcher.setAttribute('aria-label', 'Switch profile');
            profileSwitcher.innerHTML = '<div class="jellyquestProfilePanel">'
                + '<div class="jellyquestProfileGrid"></div>'
                + '<div class="jellyquestProfileStatus" aria-live="polite"></div>'
                + '</div>';
            document.body.appendChild(profileSwitcher);
        }
        document.querySelectorAll('.jellyquestProfileTrigger:not(.pageTitleWithDefaultLogo)').forEach(function (oldTrigger) {
            oldTrigger.classList.remove('jellyquestProfileTrigger');
            oldTrigger.removeAttribute('role');
            oldTrigger.removeAttribute('tabindex');
            oldTrigger.removeAttribute('aria-label');
        });
        var trigger = document.querySelector('.pageTitleWithDefaultLogo');
        if (!trigger) {
            return;
        }
        profileSwitcherTrigger = trigger;
        trigger.classList.add('jellyquestProfileTrigger');
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');
        trigger.setAttribute('aria-label', 'Switch profile');
        updateProfileTrigger(trigger);
        if (!trigger.getAttribute('data-jellyquest-profile-bound')) {
            trigger.setAttribute('data-jellyquest-profile-bound', 'true');
            trigger.addEventListener('click', openProfileSwitcher, true);
            trigger.addEventListener('keydown', function (event) {
                if (event.keyCode === 13 || event.keyCode === 32) {
                    openProfileSwitcher(event);
                }
            }, true);
        }
    }

    function railIcon(name) {
        var paths = {
            search: '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5L21 21"></path>',
            movies: '<rect x="3" y="5" width="18" height="15" rx="1"></rect><path d="M3 9h18M7 5l3 4m3-4 3 4"></path>',
            shows: '<rect x="6" y="5" width="15" height="13" rx="1"></rect><path d="M6 8H3v12h15v-2m-6-9 4 2.5-4 2.5z"></path>',
            livetv: '<rect x="3" y="7" width="18" height="13" rx="1"></rect><path d="M8 3l4 4 4-4m-4 8v5m-2.5-2.5h5"></path>',
            sports: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3M12 13v4M9 17h6M8 20h8"></path>',
            photos: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8" cy="9" r="2"></circle><path d="M4 17l5-5 3 3 2-2 6 5"></path>',
            books: '<path d="M4 5a8 8 0 0 1 8 2v13a8 8 0 0 0-8-2V5zm16 0a8 8 0 0 0-8 2v13a8 8 0 0 1 8-2V5z"></path>',
            videos: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 9l5 3-5 3z"></path>',
            music: '<path d="M9 18V6l10-2v12M9 9l10-2"></path><circle cx="6" cy="18" r="3"></circle><circle cx="16" cy="16" r="3"></circle>',
            musicvideos: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M11 15V9l5-1v5"></path><circle cx="9" cy="15" r="2"></circle><circle cx="14" cy="13" r="2"></circle>',
            collections: '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect>',
            playlists: '<path d="M4 6h11M4 11h11M4 16h7M18 14v6"></path><circle cx="16" cy="20" r="2"></circle>',
            trailers: '<rect x="3" y="5" width="18" height="15" rx="1"></rect><path d="M3 9h18M7 5l3 4m3-4 3 4m-2 3 4 2.5-4 2.5z"></path>',
            channels: '<path d="M7 8a6 6 0 0 0 0 8m-3-11a10 10 0 0 0 0 14m13-11a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"></path><circle cx="12" cy="12" r="2"></circle>',
            folder: '<path d="M3 6h7l2 2h9v11H3z"></path>',
            settings: '<path d="M9 2h6l.5 3 2 .8L20 4.3l3 5.2-2.4 1.8v1.4l2.4 1.8-3 5.2-2.5-1.5-2 .8-.5 3H9l-.5-3-2-.8L4 19.7l-3-5.2 2.4-1.8v-1.4L1 9.5l3-5.2 2.5 1.5 2-.8z"></path><circle cx="12" cy="12" r="3"></circle>'
        };
        return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + paths[name] + '</svg>';
    }

    function libraryIconName(source, libraryName) {
        var normalized = libraryName.toLowerCase();
        var icon = source.querySelector('.navMenuOptionIcon, .material-icons');
        var iconClasses = icon ? icon.classList : [];
        var classMap = [
            ['live_tv', 'livetv'], ['music_video', 'musicvideos'], ['video_library', 'collections'],
            ['music_note', 'music'], ['photo', 'photos'], ['book', 'books'], ['queue', 'playlists'],
            ['theaters', 'trailers'], ['videocam', 'channels'], ['movie', 'movies'], ['tv', 'shows']
        ];
        if (/sport/.test(normalized)) return 'sports';
        if (/live\s*tv/.test(normalized)) return 'livetv';
        if (/show|series/.test(normalized)) return 'shows';
        if (/movie|film/.test(normalized)) return 'movies';
        if (/photo|picture|image/.test(normalized)) return 'photos';
        if (/book/.test(normalized)) return 'books';
        if (/music\s*video/.test(normalized)) return 'musicvideos';
        if (/music|audio/.test(normalized)) return 'music';
        if (/playlist/.test(normalized)) return 'playlists';
        if (/collection|box\s*set/.test(normalized)) return 'collections';
        if (/trailer/.test(normalized)) return 'trailers';
        if (/channel/.test(normalized)) return 'channels';
        if (/video/.test(normalized)) return 'videos';
        for (var index = 0; index < classMap.length; index += 1) {
            if (iconClasses.contains && iconClasses.contains(classMap[index][0])) {
                return classMap[index][1];
            }
        }
        return 'folder';
    }

    function createRailItem(tagName, label, iconName, href) {
        var item = document.createElement(tagName);
        var icon = document.createElement('span');
        var text = document.createElement('span');
        item.className = 'jellyquestRailItem jellyquestRail' + label.replace(/[^a-z0-9]/gi, '');
        item.setAttribute('aria-label', label);
        if (href) {
            item.href = href;
        } else {
            item.type = 'button';
        }
        icon.className = 'jellyquestRailIcon';
        icon.innerHTML = railIcon(iconName);
        text.className = 'jellyquestRailLabel';
        text.textContent = label;
        item.appendChild(icon);
        item.appendChild(text);
        return item;
    }

    function updateLibraryRailSelection() {
        if (!libraryRail) {
            return;
        }
        libraryRail.querySelectorAll('.jellyquestRailItem').forEach(function (item) {
            var itemId = item.getAttribute('data-itemid');
            var selected = item.classList.contains('jellyquestRailSearch')
                ? /^#\/search(?:\?|$)/.test(window.location.hash)
                : item.classList.contains('jellyquestRailSettings')
                    ? /^#\/(?:mypreferencesmenu|settings)/.test(window.location.hash)
                    : itemId && window.location.hash.indexOf(itemId) !== -1;
            item.classList.toggle('is-active', Boolean(selected));
            if (selected) {
                item.setAttribute('aria-current', 'page');
            } else {
                item.removeAttribute('aria-current');
            }
        });
    }

    function positionLibraryRail() {
        if (!libraryRail) {
            return;
        }
        var header = document.querySelector('.skinHeader');
        var headerBottom = header ? header.getBoundingClientRect().bottom : 0;
        libraryRail.style.top = Math.max(0, Math.round(headerBottom)) + 'px';
    }

    function refreshLibraryRailLinks() {
        if (!libraryRail) {
            return;
        }
        var sourceLinks = Array.prototype.slice.call(document.querySelectorAll('.libraryMenuOptions .lnkMediaFolder'));
        var seen = {};
        var matches = sourceLinks.map(function (source) {
            var nameElement = source.querySelector('.sectionName, .navMenuOptionText');
            var name = nameElement ? nameElement.textContent.trim() : '';
            var itemId = source.getAttribute('data-itemid') || '';
            var href = source.getAttribute('href') || '';
            var key = itemId || href;
            var iconName = libraryIconName(source, name);
            if (!name || !href || seen[key] || iconName === 'collections') {
                return null;
            }
            seen[key] = true;
            return { entry: { label: name, icon: iconName }, source: source };
        }).filter(Boolean);
        var signature = matches.map(function (match) {
            return match.entry.label + ':' + match.source.getAttribute('data-itemid') + ':' + match.source.getAttribute('href');
        }).join('|');
        if (signature === libraryRailSignature) {
            updateLibraryRailSelection();
            return;
        }
        libraryRailSignature = signature;
        libraryRail.querySelectorAll('.jellyquestRailLibrary').forEach(function (item) {
            item.parentNode.removeChild(item);
        });
        matches.forEach(function (match) {
            var item = createRailItem('a', match.entry.label, match.entry.icon, match.source.getAttribute('href'));
            item.classList.add('jellyquestRailLibrary');
            item.setAttribute('data-itemid', match.source.getAttribute('data-itemid') || '');
            match.source.classList.add('jellyquestRailSource');
            libraryRail.insertBefore(item, libraryRail.querySelector('.jellyquestRailSettings'));
        });
        updateLibraryRailSelection();
    }

    function ensureLibraryRail() {
        if (/^#\/(?:login|selectserver|wizard)/.test(window.location.hash)) {
            if (libraryRail) {
                libraryRail.parentNode.removeChild(libraryRail);
                libraryRail = null;
                libraryRailSignature = '';
                document.body.classList.remove('jellyquestHasLibraryRail');
            }
            return;
        }
        if (!libraryRail && !document.querySelector('.pageTitleWithDefaultLogo')) {
            return;
        }
        if (!libraryRail) {
            libraryRail = document.createElement('nav');
            libraryRail.className = 'jellyquestLibraryRail';
            libraryRail.setAttribute('aria-label', 'Media navigation');
            var search = createRailItem('button', 'Search', 'search');
            search.addEventListener('click', function () {
                var nativeSearch = document.querySelector('.headerSearchButton');
                if (nativeSearch) {
                    nativeSearch.click();
                } else {
                    window.location.hash = '#/search';
                }
            });
            libraryRail.appendChild(search);
            var settings = createRailItem('button', 'Settings', 'settings');
            settings.addEventListener('click', function () {
                var nativeSettings = document.querySelector('.headerUserButton');
                if (nativeSettings) {
                    nativeSettings.click();
                } else {
                    window.location.hash = '#/mypreferencesmenu';
                }
            });
            libraryRail.appendChild(settings);
            libraryRail.addEventListener('focusin', function () {
                libraryRail.classList.add('is-expanded');
            });
            libraryRail.addEventListener('focusout', function () {
                window.setTimeout(function () {
                    if (!libraryRail.contains(document.activeElement)) {
                        libraryRail.classList.remove('is-expanded');
                    }
                }, 0);
            });
            document.body.appendChild(libraryRail);
            document.body.classList.add('jellyquestHasLibraryRail');
        }
        positionLibraryRail();
        refreshLibraryRailLinks();
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
            var fragment = '#user=' + encodeURIComponent(user.Name)
                + '&id=' + encodeURIComponent(user.Id)
                + '&return=' + encodeURIComponent(window.location.href);
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
        ensureProfileSwitcher();
        ensureLibraryRail();
        new MutationObserver(function () {
            enforceHouseholdLogin();
            ensureRequestsTab();
            ensureProfileSwitcher();
            ensureLibraryRail();
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

    window.JellyQuest = { openRequests: openRequests, openProfileSwitcher: openProfileSwitcher };
    window.addEventListener('keydown', handleProfileKeys, true);
    window.addEventListener('resize', positionProfileSwitcher);
    window.addEventListener('resize', positionLibraryRail);
    document.addEventListener('click', function (event) {
        if (profileSwitcher && !profileSwitcher.hidden
                && !profileSwitcher.contains(event.target)
                && event.target !== profileSwitcherTrigger
                && !profileSwitcherTrigger.contains(event.target)) {
            closeProfileSwitcher();
        }
    }, true);
    window.addEventListener('hashchange', ensureRequestsTab);
    window.addEventListener('hashchange', updateLibraryRailSelection);
    window.addEventListener('viewshow', function () {
        enforceHouseholdLogin();
        ensureRequestsTab();
    });
    console.info('[JellyQuest] Farmhouse household policy loaded');
})();
