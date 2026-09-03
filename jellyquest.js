(function () {
    'use strict';

    var requestsUrl;
    var requestsBridgeUrl;
    var requestsPageVersion;
    var openingRequests = false;
    var profileSwitcher;
    var profileSwitcherTrigger;
    var profileSwitching = false;
    var jellyquestScript = document.currentScript;
    var isStaticPreview = document.documentElement.hasAttribute('data-jellyquest-static-preview');
    var jellyfinIconUrl = jellyquestScript && jellyquestScript.src
        ? new URL('icon.png', jellyquestScript.src).href
        : 'icon.png';
    var localRequestsUrl = jellyquestScript && jellyquestScript.src
        ? new URL('www/jellyseerr-login.html', jellyquestScript.src).href
        : 'www/jellyseerr-login.html';
    var libraryRail;
    var libraryRailSignature = '';
    var myListLoading = false;
    var myListRefreshTimer;
    var runtimeHomeLoading = false;
    var runtimeHomeUserId = '';
    var runtimeHomeLastCard;
    var runtimeLibraryState = {
        genreId: '',
        genreName: '',
        items: [],
        loading: false,
        pageSize: 70,
        requestId: 0,
        signature: '',
        sort: 'recent',
        total: 0,
        unwatched: false
    };
    var runtimeLibraryLastCard;
    var runtimeLibraryMenu;
    var runtimeLibraryMenuTrigger;
    var runtimeGlobalTabs;
    var runtimeDetailOrigin;
    var runtimeDetailState = { id: '', loading: false, requestId: 0 };
    var runtimeDetailLastFocus;
    var detailActionLoading = false;
    var detailActionState;
    var playbackOptionsDialog;
    var playbackOptionsTrigger;
    var playbackOptionsView = 'root';

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
        return /^#\/home(?:\.html)?(?:\?|$)/.test(window.location.hash);
    }

    function isLibraryRoute() {
        return /^#\/(?:movies|tv)(?:\.html)?(?:\?|$)/.test(window.location.hash);
    }

    function isDetailRoute() {
        return /^#\/details(?:\.html)?(?:\?|$)/.test(window.location.hash);
    }

    function isRuntimeShellRoute() {
        return isLibraryRoute() || isDetailRoute();
    }

    function hashParameter(name) {
        var queryIndex = window.location.hash.indexOf('?');
        if (queryIndex === -1) return '';
        return new URLSearchParams(window.location.hash.slice(queryIndex + 1)).get(name) || '';
    }

    function libraryDescriptor() {
        if (!isLibraryRoute()) return null;
        var parentId = hashParameter('topParentId');
        var isSeries = /^#\/tv/.test(window.location.hash);
        var title = isSeries ? 'Shows' : 'Movies';
        document.querySelectorAll('.libraryMenuOptions .lnkMediaFolder').forEach(function (link) {
            if (link.getAttribute('data-itemid') === parentId) {
                var label = link.querySelector('.sectionName, .navMenuOptionText');
                if (label && label.textContent.trim()) title = label.textContent.trim();
            }
        });
        return {
            itemType: isSeries ? 'Series' : 'Movie',
            parentId: parentId,
            signature: (isSeries ? 'series:' : 'movie:') + parentId,
            title: title
        };
    }

    function resultItems(result) {
        return result && result.Items ? result.Items : [];
    }

    function safeHomeQuery(promise, label) {
        return promise.catch(function (error) {
            console.error('[JellyQuest] Unable to load ' + label + ':', error);
            return { Items: [] };
        });
    }

    function runtimeImageUrl(apiClient, item) {
        if (!item || !item.ImageTags || !item.ImageTags.Primary || typeof apiClient.getImageUrl !== 'function') {
            return '';
        }
        return apiClient.getImageUrl(item.Id, {
            type: 'Primary',
            tag: item.ImageTags.Primary,
            width: 360,
            quality: 90
        });
    }

    function runtimeDuration(ticks) {
        var minutes = Math.max(0, Math.round((ticks || 0) / 600000000));
        if (!minutes) return '';
        var hours = Math.floor(minutes / 60);
        var remainder = minutes % 60;
        return hours ? hours + 'h' + (remainder ? ' ' + remainder + 'm' : '') : minutes + 'm';
    }

    function runtimeCardLabel(item) {
        if (item.Type === 'Episode') {
            var season = item.ParentIndexNumber == null ? '' : 'S' + item.ParentIndexNumber;
            var episode = item.IndexNumber == null ? '' : ' E' + item.IndexNumber;
            return (season + episode).trim() || 'Episode';
        }
        return item.Type === 'Series' ? 'Series' : (item.Type || 'Video');
    }

    function runtimeCardMeta(item, rowKey) {
        var userData = item.UserData || {};
        if (rowKey === 'continue') {
            var remaining = Math.max(0, (item.RunTimeTicks || 0) - (userData.PlaybackPositionTicks || 0));
            return runtimeDuration(remaining) ? runtimeDuration(remaining) + ' remaining' : 'Resume';
        }
        if (item.Type === 'Episode') {
            var episodeNumber = item.IndexNumber == null ? '' : 'Episode ' + item.IndexNumber;
            return [episodeNumber, item.Name].filter(Boolean).join(' · ');
        }
        var details = [];
        if (item.ProductionYear) details.push(item.ProductionYear);
        if (item.OfficialRating) details.push(item.OfficialRating);
        var duration = runtimeDuration(item.RunTimeTicks);
        if (duration) details.push(duration);
        return details.join(' · ') || (item.Type === 'Series' ? 'Show' : (item.Type || 'Video'));
    }

    function createRuntimeHomeCard(apiClient, item, rowKey) {
        var card = document.createElement('a');
        var poster = document.createElement('span');
        var badge = document.createElement('span');
        var fallback = document.createElement('span');
        var title = document.createElement('span');
        var meta = document.createElement('span');
        var progress = document.createElement('span');
        var progressFill = document.createElement('span');
        var serverId = item.ServerId || (typeof apiClient.serverId === 'function' ? apiClient.serverId() : '');
        var imageUrl = runtimeImageUrl(apiClient, item);
        var displayName = item.Type === 'Episode' && item.SeriesName ? item.SeriesName : (item.Name || 'Untitled');

        card.className = 'jqMovieCard jellyquestRuntimeHomeCard';
        card.href = '#/details?id=' + encodeURIComponent(item.Id)
            + (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
        card.setAttribute('aria-label', displayName);
        poster.className = 'jqPoster';
        if (imageUrl) poster.style.backgroundImage = 'url("' + imageUrl.replace(/"/g, '%22') + '")';
        else poster.classList.add('is-placeholder');
        badge.className = 'jqHomeBadge';
        badge.textContent = runtimeCardLabel(item);
        fallback.className = 'jqPosterArt';
        fallback.textContent = imageUrl ? '' : displayName;
        title.className = 'jqMovieName';
        title.textContent = displayName;
        meta.className = 'jqMovieMeta';
        meta.textContent = runtimeCardMeta(item, rowKey);
        poster.appendChild(badge);
        poster.appendChild(fallback);
        if (rowKey === 'continue' && item.UserData && item.RunTimeTicks) {
            progress.className = 'jqHomeProgress';
            progressFill.style.width = Math.min(100, Math.max(0,
                item.UserData.PlaybackPositionTicks * 100 / item.RunTimeTicks)) + '%';
            progress.appendChild(progressFill);
            poster.appendChild(progress);
        }
        card.appendChild(poster);
        card.appendChild(title);
        card.appendChild(meta);
        return card;
    }

    function appendRuntimeHomeRow(root, apiClient, definition, items, user) {
        if (!items.length && definition.key !== 'favorites') return;
        var section = document.createElement('section');
        var heading = document.createElement('div');
        var title = document.createElement('h2');
        var note = document.createElement('span');
        var grid = document.createElement('div');
        section.className = 'jqHomeSection';
        section.setAttribute('data-jellyquest-row', definition.key);
        heading.className = 'jqHomeHeading';
        title.textContent = definition.title;
        note.textContent = definition.key === 'favorites' && user.Name
            ? 'Saved for ' + user.Name
            : definition.note;
        grid.className = 'jqHomeGrid';
        if (items.length) {
            items.slice(0, 7).forEach(function (item) {
                grid.appendChild(createRuntimeHomeCard(apiClient, item, definition.key));
            });
        } else {
            var empty = document.createElement('div');
            empty.className = 'jqHomeEmpty';
            empty.textContent = 'Your My List is empty. Add a title from its details page.';
            grid.appendChild(empty);
        }
        heading.appendChild(title);
        heading.appendChild(note);
        section.appendChild(heading);
        section.appendChild(grid);
        root.appendChild(section);
    }

    function renderRuntimeHome(container, apiClient, user, rows) {
        var existing = container.querySelector('.jellyquestRuntimeHomeRoot');
        var root = existing || document.createElement('main');
        root.innerHTML = '';
        root.className = 'jellyquestRuntimeHomeRoot jqHomeWorkspace';
        root.setAttribute('data-jellyquest-userid', user.Id);
        [
            { key: 'continue', title: 'Continue Watching', note: 'Resume where you left off' },
            { key: 'favorites', title: 'My List', note: 'Your saved titles' },
            { key: 'nextup', title: 'Next Up', note: 'New and unwatched episodes' },
            { key: 'recent', title: 'Recently Added', note: 'Movies and shows' }
        ].forEach(function (definition) {
            appendRuntimeHomeRow(root, apiClient, definition, rows[definition.key], user);
        });
        if (!root.children.length) {
            if (existing) existing.parentNode.removeChild(existing);
            document.body.classList.remove('jellyquestRuntimeHomeActive');
            return;
        }
        if (!existing) container.insertBefore(root, container.firstElementChild);
        root.scrollTop = 0;
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        document.body.classList.add('jellyquestRuntimeHomeActive');
        runtimeHomeUserId = user.Id;
    }

    function removeRuntimeHome() {
        document.body.classList.remove('jellyquestRuntimeHomeActive');
        var root = document.querySelector('.jellyquestRuntimeHomeRoot');
        if (root && !isHomeRoute()) root.parentNode.removeChild(root);
        if (!isHomeRoute()) {
            runtimeHomeUserId = '';
            runtimeHomeLastCard = null;
        }
    }

    function loadRuntimeHome(force) {
        if (isStaticPreview) return;
        if (!isHomeRoute()) {
            removeRuntimeHome();
            return;
        }
        var container = document.querySelector('#homeTab .sections.homeSectionsContainer, #homeTab .sections');
        var apiClient = window.ApiClient;
        if (!container || !apiClient || typeof apiClient.getCurrentUser !== 'function'
                || typeof apiClient.getItems !== 'function' || runtimeHomeLoading) return;
        var existing = container.querySelector('.jellyquestRuntimeHomeRoot');
        if (!force && existing && runtimeHomeUserId) {
            document.body.classList.add('jellyquestRuntimeHomeActive');
            return;
        }
        runtimeHomeLoading = true;
        apiClient.getCurrentUser(false).then(function (user) {
            if (!user || !user.Id) throw new Error('Jellyfin did not return the current profile.');
            var common = {
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,Overview',
                EnableTotalRecordCount: false,
                Limit: 7
            };
            return Promise.all([
                safeHomeQuery(apiClient.getItems(user.Id, Object.assign({}, common, {
                    Filters: 'IsResumable',
                    IncludeItemTypes: 'Movie,Episode',
                    SortBy: 'DatePlayed',
                    SortOrder: 'Descending'
                })), 'Continue Watching'),
                safeHomeQuery(apiClient.getItems(user.Id, Object.assign({}, common, {
                    Filters: 'IsFavorite',
                    IncludeItemTypes: 'Movie,Series',
                    SortBy: 'SortName',
                    SortOrder: 'Ascending',
                    CollapseBoxSetItems: false,
                    ExcludeLocationTypes: 'Virtual'
                })), 'My List'),
                typeof apiClient.getNextUpEpisodes === 'function'
                    ? safeHomeQuery(apiClient.getNextUpEpisodes({
                        UserId: user.Id,
                        Limit: 7,
                        Fields: 'PrimaryImageAspectRatio,Overview',
                        EnableTotalRecordCount: false
                    }), 'Next Up')
                    : Promise.resolve({ Items: [] }),
                safeHomeQuery(apiClient.getItems(user.Id, Object.assign({}, common, {
                    IncludeItemTypes: 'Movie,Series',
                    SortBy: 'DateCreated',
                    SortOrder: 'Descending'
                })), 'Recently Added')
            ]).then(function (results) {
                return {
                    user: user,
                    rows: {
                        continue: resultItems(results[0]),
                        favorites: resultItems(results[1]),
                        nextup: resultItems(results[2]),
                        recent: resultItems(results[3])
                    }
                };
            });
        }).then(function (result) {
            if (isHomeRoute() && document.body.contains(container)) {
                renderRuntimeHome(container, apiClient, result.user, result.rows);
            }
        }).catch(function (error) {
            console.error('[JellyQuest] Unable to load Home:', error);
        }).then(function () {
            runtimeHomeLoading = false;
        });
    }

    function ensureRuntimeGlobalTabs() {
        var header = document.querySelector('.skinHeader');
        if (isStaticPreview || !isRuntimeShellRoute() || !header) {
            var libraryProfile = document.querySelector('.jellyquestLibraryProfileTrigger');
            if (libraryProfile) {
                if (profileSwitcherTrigger === libraryProfile) profileSwitcherTrigger = null;
                libraryProfile.parentNode.removeChild(libraryProfile);
            }
            if (runtimeGlobalTabs && runtimeGlobalTabs.parentNode) runtimeGlobalTabs.parentNode.removeChild(runtimeGlobalTabs);
            runtimeGlobalTabs = null;
            return;
        }
        var profile = header.querySelector('.jellyquestLibraryProfileTrigger');
        if (!profile) {
            profile = document.createElement('button');
            profile.type = 'button';
            profile.className = 'jellyquestLibraryProfileTrigger pageTitleWithDefaultLogo';
            header.appendChild(profile);
            ensureProfileSwitcher();
        }
        if (runtimeGlobalTabs && document.body.contains(runtimeGlobalTabs)) return;
        runtimeGlobalTabs = document.createElement('nav');
        runtimeGlobalTabs.className = 'jellyquestGlobalTabs';
        runtimeGlobalTabs.setAttribute('aria-label', 'Primary navigation');
        var home = document.createElement('button');
        var requests = document.createElement('button');
        home.type = 'button';
        home.className = 'jellyquestGlobalTab';
        home.textContent = 'Home';
        home.addEventListener('click', function () { window.location.hash = '#/home'; });
        requests.type = 'button';
        requests.className = 'jellyquestGlobalTab';
        requests.textContent = 'Requests';
        requests.addEventListener('click', function () { openRequests(requestsUrl); });
        runtimeGlobalTabs.appendChild(home);
        runtimeGlobalTabs.appendChild(requests);
        header.appendChild(runtimeGlobalTabs);
    }

    function runtimeLibrarySortDefinition(key) {
        return {
            recent: { label: 'Recently added', by: 'DateCreated', order: 'Descending' },
            name: { label: 'Name', by: 'SortName', order: 'Ascending' },
            date: { label: 'Release date', by: 'PremiereDate', order: 'Descending' },
            rating: { label: 'Community rating', by: 'CommunityRating', order: 'Descending' },
            runtime: { label: 'Runtime', by: 'Runtime', order: 'Descending' }
        }[key] || { label: 'Recently added', by: 'DateCreated', order: 'Descending' };
    }

    function runtimeLibraryMeta(item, descriptor) {
        if (descriptor.itemType === 'Series') {
            var seasons = item.ChildCount == null ? '' : item.ChildCount + (item.ChildCount === 1 ? ' season' : ' seasons');
            var unwatched = item.UserData && item.UserData.UnplayedItemCount;
            return [seasons, unwatched ? unwatched + ' unwatched' : ''].filter(Boolean).join(' · ')
                || (item.ProductionYear || 'Series');
        }
        return runtimeCardMeta(item, 'library');
    }

    function createRuntimeLibraryCard(apiClient, item, descriptor) {
        var card = document.createElement('a');
        var poster = document.createElement('span');
        var fallback = document.createElement('span');
        var title = document.createElement('span');
        var meta = document.createElement('span');
        var serverId = item.ServerId || (typeof apiClient.serverId === 'function' ? apiClient.serverId() : '');
        var imageUrl = runtimeImageUrl(apiClient, item);
        card.className = 'jqMovieCard jellyquestRuntimeLibraryCard';
        if (descriptor.itemType === 'Series') card.classList.add('jqShowCard');
        card.href = '#/details?id=' + encodeURIComponent(item.Id)
            + (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
        card.setAttribute('aria-label', item.Name || descriptor.itemType);
        card.setAttribute('data-itemid', item.Id);
        poster.className = 'jqPoster';
        if (imageUrl) poster.style.backgroundImage = 'url("' + imageUrl.replace(/"/g, '%22') + '")';
        else poster.classList.add('is-placeholder');
        fallback.className = 'jqPosterArt';
        fallback.textContent = imageUrl ? '' : (item.Name || '');
        title.className = 'jqMovieName';
        title.textContent = item.Name || '';
        meta.className = 'jqMovieMeta';
        meta.textContent = runtimeLibraryMeta(item, descriptor);
        poster.appendChild(fallback);
        card.appendChild(poster);
        card.appendChild(title);
        card.appendChild(meta);
        return card;
    }

    function closeRuntimeLibraryMenu(restoreFocus) {
        if (!runtimeLibraryMenu) return false;
        runtimeLibraryMenu.parentNode.removeChild(runtimeLibraryMenu);
        runtimeLibraryMenu = null;
        if (restoreFocus && runtimeLibraryMenuTrigger && document.body.contains(runtimeLibraryMenuTrigger)) {
            runtimeLibraryMenuTrigger.focus();
        }
        runtimeLibraryMenuTrigger = null;
        return true;
    }

    function positionRuntimeLibraryMenu() {
        if (!runtimeLibraryMenu || !runtimeLibraryMenuTrigger) return;
        var rect = runtimeLibraryMenuTrigger.getBoundingClientRect();
        var left = Math.max(16, Math.min(rect.right - runtimeLibraryMenu.offsetWidth,
            window.innerWidth - runtimeLibraryMenu.offsetWidth - 16));
        var top = Math.min(rect.bottom + 10, window.innerHeight - runtimeLibraryMenu.offsetHeight - 16);
        runtimeLibraryMenu.style.left = Math.round(left) + 'px';
        runtimeLibraryMenu.style.top = Math.round(top) + 'px';
    }

    function openRuntimeLibraryMenu(trigger, title, definitions, selected, onSelect) {
        closeRuntimeLibraryMenu(false);
        runtimeLibraryMenuTrigger = trigger;
        runtimeLibraryMenu = document.createElement('div');
        runtimeLibraryMenu.className = 'jellyquestRuntimeLibraryMenu';
        runtimeLibraryMenu.setAttribute('role', 'menu');
        runtimeLibraryMenu.setAttribute('aria-label', title);
        var heading = document.createElement('h2');
        heading.textContent = title;
        runtimeLibraryMenu.appendChild(heading);
        definitions.forEach(function (definition) {
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'jellyquestRuntimeLibraryOption';
            option.textContent = definition.label;
            option.setAttribute('role', 'menuitemradio');
            option.setAttribute('aria-checked', definition.key === selected ? 'true' : 'false');
            if (definition.key === selected) option.classList.add('is-selected');
            option.addEventListener('click', function () {
                closeRuntimeLibraryMenu(false);
                onSelect(definition);
            });
            runtimeLibraryMenu.appendChild(option);
        });
        document.body.appendChild(runtimeLibraryMenu);
        positionRuntimeLibraryMenu();
        (runtimeLibraryMenu.querySelector('.is-selected') || runtimeLibraryMenu.querySelector('button')).focus();
    }

    function createRuntimeLibraryRoot(descriptor) {
        var root = document.createElement('main');
        var toolbar = document.createElement('div');
        var heading = document.createElement('h1');
        var count = document.createElement('span');
        var controls = document.createElement('div');
        var all = document.createElement('button');
        var unwatched = document.createElement('button');
        var genres = document.createElement('button');
        var sort = document.createElement('button');
        var grid = document.createElement('div');
        var status = document.createElement('div');

        root.className = 'jellyquestRuntimeLibraryRoot jqMediaWorkspace';
        root.setAttribute('data-library-signature', descriptor.signature);
        toolbar.className = 'jqLibraryToolbar';
        heading.className = 'jqLibraryTitle';
        heading.textContent = descriptor.title + ' ';
        count.className = 'jqLibraryCount';
        count.textContent = 'Loading…';
        heading.appendChild(count);
        controls.className = 'jqLibraryControls';
        all.type = unwatched.type = genres.type = sort.type = 'button';
        all.className = 'jqFilter jqLibraryAll active';
        all.textContent = 'All';
        unwatched.className = 'jqFilter jqLibraryUnwatched';
        unwatched.textContent = 'Unwatched';
        genres.className = 'jqFilter jqLibraryGenres';
        genres.textContent = 'Genres';
        sort.className = 'jqSort jqLibrarySort';
        sort.innerHTML = '<span class="jqLibrarySortLabel">Recently added</span> <span aria-hidden="true">▾</span>';
        controls.appendChild(all);
        controls.appendChild(unwatched);
        controls.appendChild(genres);
        controls.appendChild(sort);
        toolbar.appendChild(heading);
        toolbar.appendChild(controls);
        grid.className = 'jqMovieGrid';
        status.className = 'jellyquestRuntimeLibraryStatus';
        status.textContent = 'Loading ' + descriptor.title.toLowerCase() + '…';
        root.appendChild(toolbar);
        root.appendChild(grid);
        root.appendChild(status);

        all.addEventListener('click', function () {
            runtimeLibraryState.unwatched = false;
            runtimeLibraryState.genreId = '';
            runtimeLibraryState.genreName = '';
            loadRuntimeLibrary(true);
        });
        unwatched.addEventListener('click', function () {
            runtimeLibraryState.unwatched = true;
            runtimeLibraryState.genreId = '';
            runtimeLibraryState.genreName = '';
            loadRuntimeLibrary(true);
        });
        genres.addEventListener('click', function () {
            var definitions = runtimeLibraryState.genres || [];
            if (!definitions.length) return;
            openRuntimeLibraryMenu(genres, 'Genres', definitions, runtimeLibraryState.genreId, function (definition) {
                runtimeLibraryState.unwatched = false;
                runtimeLibraryState.genreId = definition.key;
                runtimeLibraryState.genreName = definition.label;
                loadRuntimeLibrary(true);
            });
        });
        sort.addEventListener('click', function () {
            var definitions = ['recent', 'name', 'date', 'rating', 'runtime'].map(function (key) {
                return { key: key, label: runtimeLibrarySortDefinition(key).label };
            });
            openRuntimeLibraryMenu(sort, 'Sort by', definitions, runtimeLibraryState.sort, function (definition) {
                runtimeLibraryState.sort = definition.key;
                loadRuntimeLibrary(true);
            });
        });
        return root;
    }

    function updateRuntimeLibraryControls(root) {
        root.querySelector('.jqLibraryAll').classList.toggle('active', !runtimeLibraryState.unwatched && !runtimeLibraryState.genreId);
        root.querySelector('.jqLibraryUnwatched').classList.toggle('active', runtimeLibraryState.unwatched);
        var genres = root.querySelector('.jqLibraryGenres');
        genres.classList.toggle('active', Boolean(runtimeLibraryState.genreId));
        genres.textContent = runtimeLibraryState.genreName || 'Genres';
        root.querySelector('.jqLibrarySortLabel').textContent = runtimeLibrarySortDefinition(runtimeLibraryState.sort).label;
    }

    function renderRuntimeLibraryItems(root, descriptor, apiClient, result, reset) {
        var grid = root.querySelector('.jqMovieGrid');
        var incoming = resultItems(result);
        if (reset) {
            grid.innerHTML = '';
            runtimeLibraryState.items = [];
        }
        incoming.forEach(function (item) {
            runtimeLibraryState.items.push(item);
            grid.appendChild(createRuntimeLibraryCard(apiClient, item, descriptor));
        });
        runtimeLibraryState.total = result && typeof result.TotalRecordCount === 'number'
            ? result.TotalRecordCount : runtimeLibraryState.items.length;
        var count = root.querySelector('.jqLibraryCount');
        count.textContent = runtimeLibraryState.total + (descriptor.itemType === 'Series' ? ' series' : ' titles');
        var status = root.querySelector('.jellyquestRuntimeLibraryStatus');
        if (!runtimeLibraryState.items.length) {
            status.textContent = 'No ' + descriptor.title.toLowerCase() + ' match this filter.';
            status.hidden = false;
        } else if (runtimeLibraryState.items.length < runtimeLibraryState.total) {
            status.textContent = 'Loading more as you browse…';
            status.hidden = false;
        } else {
            status.hidden = true;
        }
        updateRuntimeLibraryControls(root);
    }

    function loadRuntimeLibrary(reset) {
        var descriptor = libraryDescriptor();
        var root = document.querySelector('.jellyquestRuntimeLibraryRoot');
        var apiClient = window.ApiClient;
        if (!descriptor || !root || !apiClient || runtimeLibraryState.loading
                || typeof apiClient.getCurrentUser !== 'function' || typeof apiClient.getItems !== 'function') return;
        if (!reset && runtimeLibraryState.items.length >= runtimeLibraryState.total) return;
        runtimeLibraryState.loading = true;
        runtimeLibraryState.requestId += 1;
        var requestId = runtimeLibraryState.requestId;
        var querySignature = descriptor.signature;
        var sort = runtimeLibrarySortDefinition(runtimeLibraryState.sort);
        apiClient.getCurrentUser(false).then(function (user) {
            var query = {
                ParentId: descriptor.parentId,
                Recursive: true,
                IncludeItemTypes: descriptor.itemType,
                Fields: 'PrimaryImageAspectRatio,Overview,MediaSourceCount',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary',
                EnableTotalRecordCount: true,
                StartIndex: reset ? 0 : runtimeLibraryState.items.length,
                Limit: runtimeLibraryState.pageSize,
                SortBy: sort.by,
                SortOrder: sort.order
            };
            if (runtimeLibraryState.unwatched) query.Filters = 'IsUnplayed';
            if (runtimeLibraryState.genreId) query.GenreIds = runtimeLibraryState.genreId;
            return apiClient.getItems(user.Id, query);
        }).then(function (result) {
            if (requestId === runtimeLibraryState.requestId && isLibraryRoute()
                    && libraryDescriptor().signature === querySignature && document.body.contains(root)) {
                renderRuntimeLibraryItems(root, descriptor, apiClient, result, reset);
            }
        }).catch(function (error) {
            console.error('[JellyQuest] Unable to load library:', error);
            var status = root.querySelector('.jellyquestRuntimeLibraryStatus');
            status.textContent = 'Unable to load this library.';
            status.hidden = false;
        }).then(function () {
            if (requestId === runtimeLibraryState.requestId) runtimeLibraryState.loading = false;
        });
    }

    function loadRuntimeLibraryGenres(descriptor) {
        var apiClient = window.ApiClient;
        if (!apiClient || typeof apiClient.getGenres !== 'function') return;
        apiClient.getCurrentUser(false).then(function (user) {
            return apiClient.getGenres(user.Id, {
                ParentId: descriptor.parentId,
                IncludeItemTypes: descriptor.itemType,
                Recursive: true,
                SortBy: 'SortName',
                SortOrder: 'Ascending',
                EnableTotalRecordCount: false
            });
        }).then(function (result) {
            runtimeLibraryState.genres = resultItems(result).map(function (genre) {
                return { key: genre.Id, label: genre.Name };
            });
        }).catch(function (error) {
            console.error('[JellyQuest] Unable to load genres:', error);
            runtimeLibraryState.genres = [];
        });
    }

    function removeRuntimeLibrary() {
        var detailMenuOpen = isDetailRoute() && runtimeLibraryMenuTrigger
            && runtimeLibraryMenuTrigger.classList.contains('jqSeasonSelect');
        if (!detailMenuOpen) closeRuntimeLibraryMenu(false);
        document.body.classList.remove('jellyquestRuntimeLibraryActive');
        var root = document.querySelector('.jellyquestRuntimeLibraryRoot');
        if (root && !isLibraryRoute()) root.parentNode.removeChild(root);
        if (!isLibraryRoute()) {
            runtimeLibraryState.signature = '';
            runtimeLibraryLastCard = null;
            ensureRuntimeGlobalTabs();
        }
    }

    function ensureRuntimeLibrary() {
        if (isStaticPreview) {
            removeRuntimeLibrary();
            return;
        }
        var descriptor = libraryDescriptor();
        if (!descriptor) {
            removeRuntimeLibrary();
            return;
        }
        runtimeDetailOrigin = {
            hash: window.location.hash,
            itemType: descriptor.itemType,
            parentId: descriptor.parentId,
            title: descriptor.title
        };
        var root = document.querySelector('.jellyquestRuntimeLibraryRoot');
        if (runtimeLibraryState.signature !== descriptor.signature) {
            if (root) root.parentNode.removeChild(root);
            runtimeLibraryState.genreId = '';
            runtimeLibraryState.genreName = '';
            runtimeLibraryState.genres = [];
            runtimeLibraryState.items = [];
            runtimeLibraryState.loading = false;
            runtimeLibraryState.requestId += 1;
            runtimeLibraryState.signature = descriptor.signature;
            runtimeLibraryState.sort = 'recent';
            runtimeLibraryState.total = 0;
            runtimeLibraryState.unwatched = false;
            root = null;
        }
        ensureRuntimeGlobalTabs();
        if (!root) {
            root = createRuntimeLibraryRoot(descriptor);
            document.body.appendChild(root);
            document.body.classList.add('jellyquestRuntimeLibraryActive');
            loadRuntimeLibraryGenres(descriptor);
            loadRuntimeLibrary(true);
        } else {
            document.body.classList.add('jellyquestRuntimeLibraryActive');
        }
    }

    function detailBackdropUrl(apiClient, item) {
        if (!item.BackdropImageTags || !item.BackdropImageTags.length || typeof apiClient.getImageUrl !== 'function') return '';
        return apiClient.getImageUrl(item.Id, {
            type: 'Backdrop',
            tag: item.BackdropImageTags[0],
            width: 1920,
            quality: 90
        });
    }

    function runtimeDetailQuality(item) {
        var source = item.MediaSources && item.MediaSources[0];
        var video = source && source.MediaStreams && source.MediaStreams.filter(function (stream) {
            return stream.Type === 'Video';
        })[0];
        if (!video) return '';
        var quality = video.Width >= 3800 ? '4K' : video.Width >= 1900 ? '1080p' : video.Width ? video.Width + 'p' : '';
        if (video.VideoRange && video.VideoRange !== 'SDR' && video.VideoRange !== 'Unknown') quality += ' HDR';
        return quality.trim();
    }

    function runtimeDetailDate(item) {
        if (!item.PremiereDate) return item.ProductionYear || '';
        var value = new Date(item.PremiereDate);
        if (Number.isNaN(value.getTime())) return item.ProductionYear || '';
        return value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function runtimeDetailMeta(item, sports) {
        var values = [];
        values.push(sports ? runtimeDetailDate(item) : item.ProductionYear);
        if (item.OfficialRating) values.push(item.OfficialRating);
        var duration = runtimeDuration(item.RunTimeTicks);
        if (duration) values.push(duration);
        var quality = runtimeDetailQuality(item);
        if (quality) values.push(quality);
        if (item.CommunityRating) values.push('★ ' + Number(item.CommunityRating).toFixed(1));
        return values.filter(Boolean);
    }

    function nativeDetailActionDefinitions(item) {
        if (item.Type === 'Series') {
            return [
                ['.jellyquestResumeEpisodeAction', 'Resume'],
                ['.jellyquestRestartEpisodeAction', 'Restart Episode'],
                ['.jellyquestContinueEpisodeAction', 'Continue'],
                ['.btnPlayTrailer', 'Trailer'],
                ['.jellyquestHighlightsAction', 'Highlights'],
                ['.btnUserRating', 'Add to My List'],
                ['.btnMoreCommands', 'More']
            ];
        }
        return [
            ['.btnPlay', 'Play'],
            ['.btnReplay', 'Start Over'],
            ['.btnPlayTrailer', 'Trailer'],
            ['.jellyquestHighlightsAction', 'Highlights'],
            ['.btnUserRating', 'Add to My List'],
            ['.btnMoreCommands', 'More']
        ];
    }

    function visibleNativeDetailAction(selector) {
        var button = document.querySelector('.itemDetailPage .mainDetailButtons ' + selector);
        if (!button || button.hidden || button.classList.contains('hide')) return null;
        return button;
    }

    function nativeDetailActionLabel(button, fallback) {
        return button.getAttribute('aria-label') || button.title
            || (button.textContent || '').replace(/\s+/g, ' ').trim() || fallback;
    }

    function syncRuntimeDetailActions() {
        var root = document.querySelector('.jellyquestRuntimeDetailRoot');
        var item = runtimeDetailState.item;
        if (!root || !item) return;
        var definitions = nativeDetailActionDefinitions(item).map(function (definition) {
            var nativeButton = visibleNativeDetailAction(definition[0]);
            return nativeButton ? {
                fallback: definition[1],
                label: nativeDetailActionLabel(nativeButton, definition[1]),
                selector: definition[0]
            } : null;
        }).filter(Boolean);
        var signature = definitions.map(function (definition) {
            return definition.selector + ':' + definition.label;
        }).join('|');
        var actions = root.querySelector('.jqActions');
        if (actions.getAttribute('data-action-signature') === signature) return;
        var focusedSelector = document.activeElement && document.activeElement.getAttribute
            ? document.activeElement.getAttribute('data-native-selector') : '';
        actions.innerHTML = '';
        actions.setAttribute('data-action-signature', signature);
        definitions.forEach(function (definition, index) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'jqAction jellyquestRuntimeDetailAction';
            if (index === 0) button.classList.add('primary');
            button.setAttribute('data-native-selector', definition.selector);
            button.textContent = definition.selector === '.btnPlay' || /Resume|Continue/.test(definition.label)
                ? '▶ ' + definition.label
                : definition.selector === '.btnReplay' || definition.selector === '.jellyquestRestartEpisodeAction'
                    ? '↺ ' + definition.label : definition.label;
            button.addEventListener('click', function () {
                var nativeButton = visibleNativeDetailAction(definition.selector);
                if (nativeButton) nativeButton.click();
                if (definition.selector === '.btnUserRating') {
                    window.setTimeout(function () {
                        labelMyListButtons();
                        syncRuntimeDetailActions();
                    }, 500);
                }
            });
            actions.appendChild(button);
        });
        if (focusedSelector) {
            var replacement = actions.querySelector('[data-native-selector="' + focusedSelector + '"]');
            if (replacement) replacement.focus();
        }
    }

    function createRuntimeDetailLink(apiClient, item, className) {
        var card = document.createElement('a');
        var image = document.createElement('span');
        var name = document.createElement('span');
        var meta = document.createElement('span');
        var imageUrl = runtimeImageUrl(apiClient, item);
        var serverId = item.ServerId || (typeof apiClient.serverId === 'function' ? apiClient.serverId() : '');
        card.className = className + ' jellyquestRuntimeDetailContent';
        card.href = '#/details?id=' + encodeURIComponent(item.Id)
            + (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
        card.setAttribute('aria-label', item.Name || 'Media item');
        image.className = className.indexOf('Episode') !== -1 ? 'jqEpisodeImage' : 'jqCollectionImage';
        if (imageUrl) image.style.backgroundImage = 'url("' + imageUrl.replace(/"/g, '%22') + '")';
        name.className = className.indexOf('Episode') !== -1 ? 'jqEpisodeTitle' : 'jqCollectionName';
        name.textContent = item.Name || '';
        meta.className = className.indexOf('Episode') !== -1 ? 'jqEpisodeMeta' : 'jqCollectionYear';
        meta.textContent = item.Type === 'Episode'
            ? [runtimeDuration(item.RunTimeTicks), item.UserData && item.UserData.Played ? 'Watched' : ''].filter(Boolean).join(' · ')
            : [item.ProductionYear, item.UserData && item.UserData.Played ? 'Watched' : ''].filter(Boolean).join(' · ');
        if (item.Type === 'Episode') {
            var number = document.createElement('span');
            number.className = 'jqEpisodeNumber';
            number.textContent = item.IndexNumber == null ? 'Episode' : 'E' + item.IndexNumber;
            image.appendChild(number);
            if (item.UserData && item.RunTimeTicks && item.UserData.PlaybackPositionTicks) {
                var progress = document.createElement('span');
                var fill = document.createElement('span');
                progress.className = 'jqEpisodeProgress';
                fill.style.width = Math.min(100, item.UserData.PlaybackPositionTicks * 100 / item.RunTimeTicks) + '%';
                progress.appendChild(fill);
                image.appendChild(progress);
            }
        }
        card.appendChild(image);
        card.appendChild(name);
        card.appendChild(meta);
        return card;
    }

    function playRuntimeDetailChapter(item, ticks) {
        var actions = document.querySelector('.itemDetailPage .mainDetailButtons');
        if (!actions) return;
        var nativeButton = createPlaybackAction('jellyquestRuntimeChapterAction', 'Play chapter', item, ticks);
        nativeButton.hidden = true;
        actions.appendChild(nativeButton);
        nativeButton.click();
        window.setTimeout(function () {
            if (nativeButton.parentNode) nativeButton.parentNode.removeChild(nativeButton);
        }, 1000);
    }

    function renderRuntimeDetailLower(root, apiClient, item, model) {
        var lower = root.querySelector('.jellyquestRuntimeDetailLower');
        lower.innerHTML = '';
        if (model.sports && item.Chapters && item.Chapters.length) {
            lower.className = 'jellyquestRuntimeDetailLower jqChapterSection';
            lower.innerHTML = '<div class="jqSectionHeading"><h2>Game Chapters</h2><span>Jump without scrubbing</span></div>';
            var chapterRow = document.createElement('div');
            chapterRow.className = 'jqChapterRow';
            item.Chapters.slice(0, 10).forEach(function (chapter, index) {
                var button = document.createElement('button');
                var image = document.createElement('span');
                var name = document.createElement('span');
                var time = document.createElement('span');
                button.type = 'button';
                button.className = 'jqChapterCard jellyquestRuntimeDetailContent';
                button.setAttribute('aria-label', chapter.Name || 'Chapter ' + (index + 1));
                image.className = 'jqChapterImage';
                name.className = 'jqChapterName';
                name.textContent = chapter.Name || 'Chapter ' + (index + 1);
                time.className = 'jqChapterTime';
                time.textContent = runtimeDuration(chapter.StartPositionTicks).replace('h ', ':').replace('m', ':00') || '00:00';
                image.appendChild(name);
                button.appendChild(image);
                button.appendChild(time);
                button.addEventListener('click', function () { playRuntimeDetailChapter(item, chapter.StartPositionTicks); });
                chapterRow.appendChild(button);
            });
            lower.appendChild(chapterRow);
            return;
        }
        if (item.Type === 'Series') {
            lower.className = 'jellyquestRuntimeDetailLower jqEpisodeSection';
            var heading = document.createElement('div');
            var title = document.createElement('h2');
            var season = document.createElement('button');
            var row = document.createElement('div');
            heading.className = 'jqSectionHeading';
            title.textContent = 'Episodes';
            season.type = 'button';
            season.className = 'jqSeasonSelect';
            season.textContent = model.selectedSeason ? model.selectedSeason.Name : 'Season';
            season.addEventListener('click', function () {
                var definitions = (model.seasons || []).map(function (value) { return { key: value.Id, label: value.Name }; });
                openRuntimeLibraryMenu(season, 'Season', definitions,
                    model.selectedSeason && model.selectedSeason.Id, function (definition) {
                        loadRuntimeDetailEpisodes(definition.key);
                    });
            });
            heading.appendChild(title);
            heading.appendChild(season);
            row.className = 'jqEpisodeRow';
            (model.episodes || []).slice(0, 20).forEach(function (episode) {
                row.appendChild(createRuntimeDetailLink(apiClient, episode, 'jqEpisodeCard'));
            });
            lower.appendChild(heading);
            lower.appendChild(row);
            return;
        }
        lower.className = 'jellyquestRuntimeDetailLower jqCollectionSection';
        lower.innerHTML = '<div class="jqSectionHeading"><h2>More Like This</h2><span>From your Jellyfin libraries</span></div>';
        var similarRow = document.createElement('div');
        similarRow.className = 'jqCollectionRow';
        (model.similar || []).slice(0, 5).forEach(function (similar) {
            similarRow.appendChild(createRuntimeDetailLink(apiClient, similar, 'jqCollectionCard'));
        });
        lower.appendChild(similarRow);
        lower.hidden = !similarRow.children.length;
    }

    function createRuntimeDetailRoot(apiClient, item, model) {
        var root = document.createElement('main');
        var hero = document.createElement('section');
        var copy = document.createElement('div');
        var eyebrow = document.createElement('div');
        var title = document.createElement('h1');
        var meta = document.createElement('div');
        var overview = document.createElement('p');
        var actions = document.createElement('div');
        var lower = document.createElement('section');
        var backdrop = detailBackdropUrl(apiClient, item);
        root.className = 'jellyquestRuntimeDetailRoot jqDetailWorkspace';
        if (item.Type === 'Series') root.classList.add('jqShowDetailWorkspace');
        if (model.sports) root.classList.add('jqSportsDetailWorkspace');
        root.setAttribute('data-itemid', item.Id);
        hero.className = 'jqDetailHero' + (item.Type === 'Series' ? ' jqShowHero' : '') + (model.sports ? ' jqSportsHero' : '');
        if (backdrop) hero.style.backgroundImage = 'linear-gradient(90deg, #101318 7%, rgba(16,19,24,.95) 43%, rgba(16,19,24,.32) 76%, #101318), url("' + backdrop.replace(/"/g, '%22') + '")';
        copy.className = 'jqDetailCopy';
        eyebrow.className = 'jqDetailEyebrow';
        eyebrow.textContent = model.sports ? (model.originTitle || 'Sports event')
            : item.Type === 'Series' ? 'Series' : item.Type === 'Episode' ? 'Episode' : 'Movie';
        title.className = 'jqDetailTitle';
        title.textContent = item.Name || '';
        meta.className = 'jqDetailMeta';
        runtimeDetailMeta(item, model.sports).forEach(function (value, index) {
            var span = document.createElement('span');
            span.textContent = value;
            if (index === 1 && item.OfficialRating) span.className = 'jqRating';
            meta.appendChild(span);
        });
        overview.className = 'jqDetailOverview';
        overview.textContent = model.sports
            ? 'Resume this event without revealing the final score or outcome.'
            : (item.Overview || '');
        actions.className = 'jqActions';
        copy.appendChild(eyebrow);
        copy.appendChild(title);
        copy.appendChild(meta);
        if (overview.textContent) copy.appendChild(overview);
        copy.appendChild(actions);
        if (model.sports) {
            var spoiler = document.createElement('div');
            spoiler.className = 'jqSpoilerSafe';
            spoiler.textContent = '◉ Scores and outcome hidden';
            copy.appendChild(spoiler);
        }
        hero.appendChild(copy);
        lower.className = 'jellyquestRuntimeDetailLower';
        root.appendChild(hero);
        root.appendChild(lower);
        renderRuntimeDetailLower(root, apiClient, item, model);
        return root;
    }

    function loadRuntimeDetailEpisodes(seasonId) {
        var state = runtimeDetailState;
        if (!state.item || state.item.Type !== 'Series' || !seasonId) return;
        var season = (state.model.seasons || []).filter(function (value) { return value.Id === seasonId; })[0];
        window.ApiClient.getEpisodes(state.item.Id, {
            UserId: state.user.Id,
            SeasonId: seasonId,
            Fields: 'PrimaryImageAspectRatio,Overview',
            IsMissing: false,
            IsVirtualUnaired: false,
            Limit: 100
        }).then(function (result) {
            if (runtimeDetailState.id !== state.id) return;
            state.model.selectedSeason = season;
            state.model.episodes = resultItems(result);
            var root = document.querySelector('.jellyquestRuntimeDetailRoot');
            if (root) renderRuntimeDetailLower(root, window.ApiClient, state.item, state.model);
        }).catch(function (error) {
            console.error('[JellyQuest] Unable to load episodes:', error);
        });
    }

    function renderRuntimeDetail(apiClient, user, item, model) {
        var old = document.querySelector('.jellyquestRuntimeDetailRoot');
        if (old) old.parentNode.removeChild(old);
        var root = createRuntimeDetailRoot(apiClient, item, model);
        document.body.appendChild(root);
        runtimeDetailState.item = item;
        runtimeDetailState.user = user;
        runtimeDetailState.model = model;
        document.body.classList.add('jellyquestRuntimeDetailActive');
        ensureRuntimeGlobalTabs();
        syncRuntimeDetailActions();
    }

    function loadRuntimeDetail() {
        var id = detailItemId();
        var apiClient = window.ApiClient;
        if (!isDetailRoute() || !id || !apiClient || runtimeDetailState.loading
                || typeof apiClient.getCurrentUser !== 'function' || typeof apiClient.getItem !== 'function') return;
        runtimeDetailState.loading = true;
        runtimeDetailState.requestId += 1;
        var requestId = runtimeDetailState.requestId;
        runtimeDetailState.id = id;
        apiClient.getCurrentUser(false).then(function (user) {
            return Promise.all([
                apiClient.getItem(user.Id, id),
                typeof apiClient.getAncestorItems === 'function' ? apiClient.getAncestorItems(id, user.Id) : Promise.resolve([])
            ]).then(function (results) {
                var item = results[0];
                var ancestors = results[1] || [];
                var originTitle = runtimeDetailOrigin && runtimeDetailOrigin.title;
                if (!originTitle) {
                    var folder = ancestors.filter(function (value) { return value.Type === 'CollectionFolder'; })[0];
                    originTitle = folder && folder.Name;
                }
                var sports = /sport/i.test(originTitle || '');
                if (item.Type === 'Series' && typeof apiClient.getSeasons === 'function') {
                    return Promise.all([
                        apiClient.getSeasons(item.Id, { UserId: user.Id, Fields: 'PrimaryImageAspectRatio' }),
                        typeof apiClient.getNextUpEpisodes === 'function'
                            ? apiClient.getNextUpEpisodes({ SeriesId: item.Id, UserId: user.Id, Limit: 1 })
                            : Promise.resolve({ Items: [] })
                    ]).then(function (seriesResults) {
                        var seasons = resultItems(seriesResults[0]);
                        var next = resultItems(seriesResults[1])[0];
                        var selected = seasons.filter(function (season) { return next && season.Id === next.SeasonId; })[0]
                            || seasons.filter(function (season) { return season.IndexNumber > 0; })[0] || seasons[0];
                        var episodes = selected && typeof apiClient.getEpisodes === 'function'
                            ? apiClient.getEpisodes(item.Id, {
                                UserId: user.Id,
                                SeasonId: selected.Id,
                                Fields: 'PrimaryImageAspectRatio,Overview',
                                IsMissing: false,
                                IsVirtualUnaired: false,
                                Limit: 100
                            }) : Promise.resolve({ Items: [] });
                        return episodes.then(function (episodeResult) {
                            return { user: user, item: item, model: {
                                episodes: resultItems(episodeResult),
                                originTitle: originTitle,
                                seasons: seasons,
                                selectedSeason: selected,
                                sports: sports
                            } };
                        });
                    });
                }
                var similar = !sports && typeof apiClient.getSimilarItems === 'function'
                    ? apiClient.getSimilarItems(item.Id, {
                        UserId: user.Id,
                        Limit: 5,
                        Fields: 'PrimaryImageAspectRatio,Overview'
                    }) : Promise.resolve({ Items: [] });
                return similar.then(function (similarResult) {
                    return { user: user, item: item, model: {
                        originTitle: originTitle,
                        similar: resultItems(similarResult),
                        sports: sports
                    } };
                });
            });
        }).then(function (result) {
            if (requestId === runtimeDetailState.requestId && isDetailRoute() && detailItemId() === id) {
                renderRuntimeDetail(apiClient, result.user, result.item, result.model);
            }
        }).catch(function (error) {
            console.error('[JellyQuest] Unable to load detail:', error);
        }).then(function () {
            if (requestId === runtimeDetailState.requestId) runtimeDetailState.loading = false;
        });
    }

    function removeRuntimeDetail() {
        if (isDetailRoute()) return;
        document.body.classList.remove('jellyquestRuntimeDetailActive');
        var root = document.querySelector('.jellyquestRuntimeDetailRoot');
        if (root) root.parentNode.removeChild(root);
        runtimeDetailState.id = '';
        runtimeDetailState.item = null;
        runtimeDetailState.model = null;
        runtimeDetailState.requestId += 1;
        runtimeDetailState.loading = false;
        runtimeDetailLastFocus = null;
        ensureRuntimeGlobalTabs();
    }

    function ensureRuntimeDetail() {
        if (isStaticPreview) {
            removeRuntimeDetail();
            return;
        }
        if (!isDetailRoute()) {
            removeRuntimeDetail();
            return;
        }
        var id = detailItemId();
        var root = document.querySelector('.jellyquestRuntimeDetailRoot');
        if (root && root.getAttribute('data-itemid') === id) {
            document.body.classList.add('jellyquestRuntimeDetailActive');
            ensureRuntimeGlobalTabs();
            syncRuntimeDetailActions();
            return;
        }
        if (root) root.parentNode.removeChild(root);
        if (runtimeDetailState.id !== id) {
            runtimeDetailState.loading = false;
            runtimeDetailState.requestId += 1;
        }
        loadRuntimeDetail();
    }

    function ensureRequestsTab() {
        var existing = document.querySelector('.jellyquestRequestsTab');
        if (!isHomeRoute()) {
            if (existing) {
                existing.parentNode.removeChild(existing);
            }
            return;
        }
        var slider = document.querySelector('.headerTabs .tabs-viewmenubar .emby-tabs-slider');
        if (!slider) {
            return;
        }

        Array.prototype.forEach.call(slider.querySelectorAll('.emby-tab-button:not(.jellyquestRequestsTab)'), function (tab) {
            var label = tab.querySelector('.emby-button-foreground');
            if (label && label.textContent.trim().toLowerCase() === 'favorites') {
                tab.classList.add('jellyquestHiddenFavoritesTab');
                tab.hidden = true;
                tab.setAttribute('aria-hidden', 'true');
                tab.setAttribute('tabindex', '-1');
            }
        });
        if (existing) {
            return;
        }

        var nativeTab = slider.querySelector('.emby-tab-button:not(.jellyquestHiddenFavoritesTab)');
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

    function myListImageUrl(apiClient, item) {
        if (!item.ImageTags || !item.ImageTags.Primary || typeof apiClient.getImageUrl !== 'function') {
            return '';
        }
        return apiClient.getImageUrl(item.Id, {
            type: 'Primary',
            tag: item.ImageTags.Primary,
            width: 320,
            quality: 90
        });
    }

    function createMyListCard(apiClient, item) {
        var card = document.createElement('a');
        var image = document.createElement('span');
        var title = document.createElement('span');
        var meta = document.createElement('span');
        var serverId = item.ServerId || (typeof apiClient.serverId === 'function' ? apiClient.serverId() : '');
        var imageUrl = myListImageUrl(apiClient, item);

        card.className = 'jellyquestMyListCard';
        card.href = '#/details?id=' + encodeURIComponent(item.Id)
            + (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
        card.setAttribute('aria-label', item.Name || 'My List item');
        image.className = 'jellyquestMyListImage';
        if (imageUrl) {
            image.style.backgroundImage = 'url("' + imageUrl.replace(/"/g, '%22') + '")';
        } else {
            image.classList.add('is-placeholder');
            image.textContent = item.Name || '';
        }
        title.className = 'jellyquestMyListTitle';
        title.textContent = item.Name || '';
        meta.className = 'jellyquestMyListMeta';
        meta.textContent = item.Type === 'Series' ? 'Show' : (item.Type || 'Video');
        card.appendChild(image);
        card.appendChild(title);
        card.appendChild(meta);
        return card;
    }

    function renderMyList(section, apiClient, user, items) {
        section.innerHTML = '';
        section.setAttribute('data-jellyquest-userid', user.Id);
        if (!items.length) {
            section.hidden = true;
            return;
        }
        section.hidden = false;
        var heading = document.createElement('div');
        var title = document.createElement('h2');
        var note = document.createElement('span');
        var cards = document.createElement('div');
        heading.className = 'jellyquestMyListHeading';
        title.textContent = 'My List';
        note.textContent = user.Name ? 'Saved for ' + user.Name : 'Your saved titles';
        heading.appendChild(title);
        heading.appendChild(note);
        cards.className = 'jellyquestMyListCards';
        items.forEach(function (item) {
            cards.appendChild(createMyListCard(apiClient, item));
        });
        section.appendChild(heading);
        section.appendChild(cards);
    }

    function ensureMyListRow(force) {
        if (isHomeRoute()) {
            loadRuntimeHome(force);
            return;
        }
        removeRuntimeHome();
        var existing = document.querySelector('.jellyquestMyListSection');
        if (!isHomeRoute()) {
            if (existing) {
                existing.parentNode.removeChild(existing);
            }
            return;
        }
        var sections = document.querySelector('#homeTab .sections.homeSectionsContainer, #homeTab .sections');
        if (!sections || !window.ApiClient || typeof window.ApiClient.getCurrentUser !== 'function'
                || typeof window.ApiClient.getItems !== 'function' || myListLoading) {
            return;
        }
        if (!force && existing && existing.getAttribute('data-jellyquest-userid')) {
            return;
        }
        if (!existing) {
            existing = document.createElement('section');
            existing.className = 'verticalSection jellyquestMyListSection';
            existing.hidden = true;
            sections.insertBefore(existing, sections.firstElementChild);
        }
        myListLoading = true;
        window.ApiClient.getCurrentUser(false).then(function (user) {
            if (!user || !user.Id) {
                throw new Error('Jellyfin did not return the current profile.');
            }
            return window.ApiClient.getItems(user.Id, {
                Filters: 'IsFavorite',
                Recursive: true,
                IncludeItemTypes: 'Movie,Series',
                SortBy: 'SortName',
                SortOrder: 'Ascending',
                Fields: 'PrimaryImageAspectRatio',
                CollapseBoxSetItems: false,
                ExcludeLocationTypes: 'Virtual',
                EnableTotalRecordCount: false,
                Limit: 20
            }).then(function (result) {
                return { user: user, items: result && result.Items ? result.Items : [] };
            });
        }).then(function (result) {
            if (document.body.contains(existing) && isHomeRoute()) {
                renderMyList(existing, window.ApiClient, result.user, result.items);
            }
        }).catch(function (error) {
            console.error('[JellyQuest] Unable to load My List:', error);
            if (document.body.contains(existing)) {
                existing.hidden = true;
            }
        }).then(function () {
            myListLoading = false;
        });
    }

    function labelMyListButtons() {
        document.querySelectorAll('[is="emby-ratingbutton"][data-isfavorite], emby-ratingbutton[data-isfavorite], .btnUserData[data-method="markFavorite"]').forEach(function (button) {
            var selected = button.getAttribute('data-isfavorite') === 'true' || button.classList.contains('btnUserDataOn');
            var label = selected ? 'Remove from My List' : 'Add to My List';
            if (button.title !== label) button.title = label;
            if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
            var text = button.querySelector('.button-text');
            if (text && text.textContent !== label) {
                text.textContent = label;
            }
            var detailText = button.querySelector('.jellyquestDetailActionLabel');
            if (detailText && detailText.textContent !== label) {
                detailText.textContent = label;
            }
        });
    }

    function scheduleMyListRefresh() {
        window.clearTimeout(myListRefreshTimer);
        myListRefreshTimer = window.setTimeout(function () {
            runtimeHomeUserId = '';
            var section = document.querySelector('.jellyquestMyListSection');
            if (section) {
                section.removeAttribute('data-jellyquest-userid');
            }
            if (isHomeRoute()) loadRuntimeHome(true);
            else ensureMyListRow(true);
            labelMyListButtons();
        }, 700);
    }

    function detailItemId() {
        var match = window.location.hash.match(/[?&]id=([^&]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function detailActionLabel(button, label) {
        if (!button) return;
        button.title = label;
        button.setAttribute('aria-label', label);
        var content = button.querySelector('.detailButton-content') || button;
        var text = content.querySelector('.jellyquestDetailActionLabel');
        if (!text) {
            text = document.createElement('span');
            text.className = 'detailButton-text jellyquestDetailActionLabel';
            content.appendChild(text);
        }
        if (text.textContent !== label) text.textContent = label;
    }

    function episodeLabel(prefix, episode) {
        if (!episode) return prefix;
        var season = episode.ParentIndexNumber == null ? '' : ' S' + episode.ParentIndexNumber;
        var number = episode.IndexNumber == null ? '' : ' E' + episode.IndexNumber;
        return prefix + season + number;
    }

    function createPlaybackAction(className, label, item, positionTicks) {
        var button = document.createElement('button');
        var content = document.createElement('span');
        var icon = document.createElement('span');
        button.type = 'button';
        button.className = 'button-flat detailButton itemAction jellyquestDetailPlaybackAction ' + className;
        button.setAttribute('data-action', positionTicks > 0 ? 'resume' : 'play');
        button.setAttribute('data-id', item.Id);
        button.setAttribute('data-serverid', item.ServerId || '');
        button.setAttribute('data-type', item.Type || 'Video');
        button.setAttribute('data-mediatype', item.MediaType || 'Video');
        button.setAttribute('data-positionticks', String(positionTicks || 0));
        if (item.SeriesId) button.setAttribute('data-seriesid', item.SeriesId);
        content.className = 'detailButton-content';
        icon.className = 'material-icons detailButton-icon replay';
        icon.setAttribute('aria-hidden', 'true');
        content.appendChild(icon);
        button.appendChild(content);
        detailActionLabel(button, label);
        return button;
    }

    function ensurePlaybackAction(actions, className, label, item, positionTicks, before) {
        var button = actions.querySelector('.' + className);
        if (button && button.getAttribute('data-id') !== item.Id) {
            button.parentNode.removeChild(button);
            button = null;
        }
        if (!button) {
            button = createPlaybackAction(className, label, item, positionTicks);
            actions.insertBefore(button, before || null);
        }
        button.hidden = false;
        button.setAttribute('data-action', positionTicks > 0 ? 'resume' : 'play');
        button.setAttribute('data-positionticks', String(positionTicks || 0));
        detailActionLabel(button, label);
        return button;
    }

    function highlightFeature(features) {
        return (features || []).filter(function (feature) {
            return /\b(highlights?|condensed game|game recap)\b/i.test(feature.Name || '');
        })[0] || null;
    }

    function mediaSources(item) {
        return item && item.MediaSources ? item.MediaSources : [];
    }

    function mediaSourceByName(item, name) {
        var sources = mediaSources(item);
        return sources.filter(function (source) {
            return source.Name === name;
        })[0] || sources[0] || null;
    }

    function mediaTracks(source, type) {
        return source && source.MediaStreams ? source.MediaStreams.filter(function (stream) {
            return stream.Type === type;
        }) : [];
    }

    function trackIdentity(track) {
        return track ? {
            displayTitle: track.DisplayTitle || '',
            language: track.Language || '',
            codec: track.Codec || '',
            channels: track.Channels == null ? null : track.Channels
        } : null;
    }

    function matchingTrack(tracks, identity, defaultIndex) {
        if (!tracks.length) return null;
        if (!identity) {
            return tracks.filter(function (track) { return track.Index === defaultIndex; })[0] || tracks[0];
        }
        return tracks.filter(function (track) {
            return identity.displayTitle && track.DisplayTitle === identity.displayTitle;
        })[0] || tracks.filter(function (track) {
            return identity.language && track.Language === identity.language
                && track.Codec === identity.codec && track.Channels === identity.channels;
        })[0] || tracks.filter(function (track) {
            return identity.language && track.Language === identity.language;
        })[0] || tracks.filter(function (track) {
            return track.Index === defaultIndex;
        })[0] || tracks[0];
    }

    function primarySeriesPlaybackItem(state) {
        return state.resumePlaybackItem || state.nextPlaybackItem || null;
    }

    function selectedSeriesSource(state, item) {
        return mediaSourceByName(item, state.playbackPreferences && state.playbackPreferences.sourceName);
    }

    function initializeSeriesPlaybackPreferences(state) {
        var item = primarySeriesPlaybackItem(state);
        var source = mediaSources(item)[0];
        if (!source) return;
        var audio = matchingTrack(mediaTracks(source, 'Audio'), null, source.DefaultAudioStreamIndex);
        var subtitle = matchingTrack(mediaTracks(source, 'Subtitle'), null, source.DefaultSubtitleStreamIndex);
        state.playbackPreferences = {
            sourceName: source.Name || '',
            audio: trackIdentity(audio),
            subtitle: subtitle ? trackIdentity(subtitle) : { off: true }
        };
    }

    function applySeriesPlaybackPreferences(button, item, state) {
        if (!button || !item) return;
        var source = selectedSeriesSource(state, item);
        if (!source) return;
        var preferences = state.playbackPreferences || {};
        var audio = matchingTrack(mediaTracks(source, 'Audio'), preferences.audio, source.DefaultAudioStreamIndex);
        var subtitle = preferences.subtitle && preferences.subtitle.off ? null
            : matchingTrack(mediaTracks(source, 'Subtitle'), preferences.subtitle, source.DefaultSubtitleStreamIndex);
        button.setAttribute('data-mediasourceid', source.Id || '');
        if (audio) button.setAttribute('data-audiostreamindex', String(audio.Index));
        else button.removeAttribute('data-audiostreamindex');
        button.setAttribute('data-subtitlestreamindex', subtitle ? String(subtitle.Index) : '-1');
    }

    function nativePlaybackSelect(name) {
        var page = document.querySelector('.itemDetailPage');
        return page ? page.querySelector(name) : null;
    }

    function selectedNativeOption(select) {
        return select && select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    }

    function playbackOptionsModel(state) {
        var series = state.item.Type === 'Series';
        var item = series ? primarySeriesPlaybackItem(state) : state.item;
        var sourceSelect = series ? null : nativePlaybackSelect('.selectSource');
        var audioSelect = series ? null : nativePlaybackSelect('.selectAudio');
        var subtitleSelect = series ? null : nativePlaybackSelect('.selectSubtitles');
        var source = series ? selectedSeriesSource(state, item) : mediaSourceByName(item,
            selectedNativeOption(sourceSelect) && selectedNativeOption(sourceSelect).textContent);
        if (!item || !source) return null;
        var audioTracks = mediaTracks(source, 'Audio');
        var subtitleTracks = mediaTracks(source, 'Subtitle');
        var selectedAudio = series
            ? matchingTrack(audioTracks, state.playbackPreferences && state.playbackPreferences.audio, source.DefaultAudioStreamIndex)
            : null;
        var selectedSubtitle = series && !(state.playbackPreferences && state.playbackPreferences.subtitle
            && state.playbackPreferences.subtitle.off)
            ? matchingTrack(subtitleTracks, state.playbackPreferences && state.playbackPreferences.subtitle,
                source.DefaultSubtitleStreamIndex)
            : null;
        return {
            series: series,
            item: item,
            source: source,
            sources: mediaSources(item),
            audioTracks: audioTracks,
            subtitleTracks: subtitleTracks,
            sourceLabel: series ? (source.Name || 'Default')
                : ((selectedNativeOption(sourceSelect) || {}).textContent || source.Name || 'Default'),
            audioLabel: series ? (selectedAudio && selectedAudio.DisplayTitle || 'Default')
                : ((selectedNativeOption(audioSelect) || {}).textContent || 'Default'),
            subtitleLabel: series ? (selectedSubtitle && selectedSubtitle.DisplayTitle || 'Off')
                : ((selectedNativeOption(subtitleSelect) || {}).textContent || 'Off')
        };
    }

    function hasPlaybackOptions(state) {
        var model = playbackOptionsModel(state);
        return !!(model && (model.sources.length > 1 || model.audioTracks.length > 1 || model.subtitleTracks.length));
    }

    function ensurePlaybackOptionsDialog() {
        if (playbackOptionsDialog) return playbackOptionsDialog;
        playbackOptionsDialog = document.createElement('div');
        playbackOptionsDialog.className = 'jellyquestPlaybackOptionsBackdrop';
        playbackOptionsDialog.hidden = true;
        playbackOptionsDialog.setAttribute('role', 'presentation');
        playbackOptionsDialog.innerHTML = '<section class="jellyquestPlaybackOptions" role="dialog" aria-modal="true" aria-labelledby="jellyquestPlaybackOptionsTitle">'
            + '<header><button type="button" class="jellyquestPlaybackOptionsBack" aria-label="Back" hidden>&#x2039;</button>'
            + '<div><h2 id="jellyquestPlaybackOptionsTitle">Playback Options</h2><p class="jellyquestPlaybackOptionsContext"></p></div></header>'
            + '<div class="jellyquestPlaybackOptionsChoices"></div>'
            + '<button type="button" class="jellyquestPlaybackOptionButton jellyquestPlaybackOptionsDone">Done</button>'
            + '</section>';
        playbackOptionsDialog.querySelector('.jellyquestPlaybackOptionsBack').addEventListener('click', function () {
            renderPlaybackOptionsRoot();
        });
        playbackOptionsDialog.querySelector('.jellyquestPlaybackOptionsDone').addEventListener('click', closePlaybackOptions);
        playbackOptionsDialog.addEventListener('click', function (event) {
            if (event.target === playbackOptionsDialog) closePlaybackOptions();
        });
        document.body.appendChild(playbackOptionsDialog);
        return playbackOptionsDialog;
    }

    function playbackOptionButton(label, value, onClick, selected) {
        var button = document.createElement('button');
        var name = document.createElement('span');
        var current = document.createElement('span');
        button.type = 'button';
        button.className = 'jellyquestPlaybackOptionButton';
        if (selected) button.classList.add('is-selected');
        name.textContent = label;
        current.className = 'jellyquestPlaybackOptionValue';
        current.textContent = value || '';
        button.appendChild(name);
        button.appendChild(current);
        button.addEventListener('click', onClick);
        return button;
    }

    function playbackContextLabel(state) {
        if (state.item.Type !== 'Series') return state.item.Name || '';
        var target = primarySeriesPlaybackItem(state);
        return target ? episodeLabel(target.Name || 'Episode', target) : state.item.Name || '';
    }

    function renderPlaybackOptionsRoot() {
        var state = detailActionState;
        var dialog = ensurePlaybackOptionsDialog();
        var model = state && playbackOptionsModel(state);
        if (!model) {
            closePlaybackOptions();
            return;
        }
        playbackOptionsView = 'root';
        dialog.querySelector('h2').textContent = 'Playback Options';
        dialog.querySelector('.jellyquestPlaybackOptionsContext').textContent = playbackContextLabel(state);
        dialog.querySelector('.jellyquestPlaybackOptionsBack').hidden = true;
        var choices = dialog.querySelector('.jellyquestPlaybackOptionsChoices');
        choices.innerHTML = '';
        if (model.sources.length > 1) {
            choices.appendChild(playbackOptionButton('Version', model.sourceLabel, function () {
                renderPlaybackOptionChoices('source', 'Version');
            }));
        }
        if (model.audioTracks.length > 1) {
            choices.appendChild(playbackOptionButton('Audio', model.audioLabel, function () {
                renderPlaybackOptionChoices('audio', 'Audio');
            }));
        }
        if (model.subtitleTracks.length) {
            choices.appendChild(playbackOptionButton('Subtitles', model.subtitleLabel, function () {
                renderPlaybackOptionChoices('subtitle', 'Subtitles');
            }));
        }
        dialog.querySelector('.jellyquestPlaybackOptionsDone').hidden = false;
        var first = choices.querySelector('.jellyquestPlaybackOptionButton')
            || dialog.querySelector('.jellyquestPlaybackOptionsDone');
        if (first) first.focus();
    }

    function setNativePlaybackOption(type, value) {
        var selector = type === 'source' ? '.selectSource' : type === 'audio' ? '.selectAudio' : '.selectSubtitles';
        var select = nativePlaybackSelect(selector);
        if (!select) return;
        select.value = String(value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function selectSeriesPlaybackOption(type, value, model) {
        var state = detailActionState;
        if (type === 'source') {
            state.playbackPreferences.sourceName = value.Name || '';
            var source = mediaSourceByName(model.item, state.playbackPreferences.sourceName);
            var audio = matchingTrack(mediaTracks(source, 'Audio'), null, source.DefaultAudioStreamIndex);
            var subtitle = matchingTrack(mediaTracks(source, 'Subtitle'), null, source.DefaultSubtitleStreamIndex);
            state.playbackPreferences.audio = trackIdentity(audio);
            state.playbackPreferences.subtitle = subtitle ? trackIdentity(subtitle) : { off: true };
        } else if (type === 'audio') {
            state.playbackPreferences.audio = trackIdentity(value);
        } else {
            state.playbackPreferences.subtitle = value && value.off ? { off: true } : trackIdentity(value);
        }
        applyDetailActions();
    }

    function renderPlaybackOptionChoices(type, title) {
        var state = detailActionState;
        var dialog = ensurePlaybackOptionsDialog();
        var model = state && playbackOptionsModel(state);
        if (!model) return;
        playbackOptionsView = type;
        dialog.querySelector('h2').textContent = title;
        dialog.querySelector('.jellyquestPlaybackOptionsBack').hidden = false;
        dialog.querySelector('.jellyquestPlaybackOptionsDone').hidden = true;
        var choices = dialog.querySelector('.jellyquestPlaybackOptionsChoices');
        choices.innerHTML = '';
        var values = type === 'source' ? model.sources : type === 'audio' ? model.audioTracks
            : [{ off: true, DisplayTitle: 'Off', Index: -1 }].concat(model.subtitleTracks);
        var selectedLabel = type === 'source' ? model.sourceLabel : type === 'audio' ? model.audioLabel : model.subtitleLabel;
        values.forEach(function (value) {
            var label = type === 'source' ? (value.Name || 'Default') : (value.DisplayTitle || 'Unknown');
            var option = playbackOptionButton(label, '', function () {
                if (model.series) selectSeriesPlaybackOption(type, value, model);
                else setNativePlaybackOption(type, type === 'source' ? value.Id : value.Index);
                window.setTimeout(renderPlaybackOptionsRoot, type === 'source' ? 40 : 0);
            }, label === selectedLabel);
            option.setAttribute('aria-pressed', label === selectedLabel ? 'true' : 'false');
            choices.appendChild(option);
        });
        var selected = choices.querySelector('.is-selected') || choices.firstElementChild;
        if (selected) selected.focus();
    }

    function openPlaybackOptions(trigger) {
        if (!detailActionState || !hasPlaybackOptions(detailActionState)) return;
        playbackOptionsTrigger = trigger;
        var dialog = ensurePlaybackOptionsDialog();
        dialog.hidden = false;
        renderPlaybackOptionsRoot();
    }

    function closePlaybackOptions() {
        if (!playbackOptionsDialog || playbackOptionsDialog.hidden) return false;
        playbackOptionsDialog.hidden = true;
        playbackOptionsView = 'root';
        if (playbackOptionsTrigger && document.body.contains(playbackOptionsTrigger)) playbackOptionsTrigger.focus();
        return true;
    }

    function handlePlaybackOptionsKeys(event) {
        if (!playbackOptionsDialog || playbackOptionsDialog.hidden) return;
        if (event.keyCode === 10009 || event.keyCode === 27 || event.keyCode === 8 || event.keyCode === 37) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (playbackOptionsView !== 'root') renderPlaybackOptionsRoot();
            else closePlaybackOptions();
            return;
        }
        if (event.keyCode === 38 || event.keyCode === 40) {
            var buttons = Array.prototype.slice.call(playbackOptionsDialog.querySelectorAll('.jellyquestPlaybackOptionButton:not([hidden])'));
            var index = buttons.indexOf(document.activeElement);
            if (buttons.length) {
                event.preventDefault();
                event.stopImmediatePropagation();
                index = index < 0 ? 0 : event.keyCode === 38
                    ? (index - 1 + buttons.length) % buttons.length : (index + 1) % buttons.length;
                buttons[index].focus();
            }
        }
    }

    function applyDetailActions() {
        var page = document.querySelector('.itemDetailPage');
        var state = detailActionState;
        if (!page || !state || state.id !== detailItemId()) return;
        var actions = page.querySelector('.mainDetailButtons');
        if (!actions) return;
        var item = state.item;
        var nextEpisode = state.nextEpisode;
        var resumeEpisode = state.resumeEpisode;
        var resumable = !!(item.UserData && item.UserData.PlaybackPositionTicks > 0);
        var play = actions.querySelector('.btnPlay');
        var replay = actions.querySelector('.btnReplay');
        var trailer = actions.querySelector('.btnPlayTrailer');
        var favorite = actions.querySelector('.btnUserRating');
        var more = actions.querySelector('.btnMoreCommands');

        detailActionLabel(play, item.Type === 'Series'
            ? episodeLabel('Continue', nextEpisode)
            : (resumable ? 'Resume' : 'Play'));
        detailActionLabel(replay, 'Start Over');
        detailActionLabel(trailer, 'Trailer');
        detailActionLabel(favorite, favorite && favorite.getAttribute('data-isfavorite') === 'true'
            ? 'Remove from My List' : 'Add to My List');
        detailActionLabel(more, 'More');

        if (!item.LocalTrailerCount && !(item.RemoteTrailers && item.RemoteTrailers.length) && trailer) {
            trailer.classList.add('hide');
        }

        var resumeAction = actions.querySelector('.jellyquestResumeEpisodeAction');
        var restart = actions.querySelector('.jellyquestRestartEpisodeAction');
        var continueAction = actions.querySelector('.jellyquestContinueEpisodeAction');
        if (item.Type === 'Series') {
            if (play) play.classList.add('jellyquestNativeSeriesPlayback');
            if (replay) replay.classList.add('jellyquestNativeSeriesPlayback');
            var insertionPoint = trailer || favorite || more;
            if (resumeEpisode && resumeEpisode.UserData && resumeEpisode.UserData.PlaybackPositionTicks > 0) {
                resumeAction = ensurePlaybackAction(actions, 'jellyquestResumeEpisodeAction',
                    episodeLabel('Resume', resumeEpisode), resumeEpisode,
                    resumeEpisode.UserData.PlaybackPositionTicks, insertionPoint);
                restart = ensurePlaybackAction(actions, 'jellyquestRestartEpisodeAction',
                    'Restart Episode', resumeEpisode, 0, insertionPoint);
            } else {
                if (resumeAction) resumeAction.hidden = true;
                if (restart) restart.hidden = true;
            }
            if (nextEpisode) {
                continueAction = ensurePlaybackAction(actions, 'jellyquestContinueEpisodeAction',
                    episodeLabel('Continue', nextEpisode), nextEpisode, 0, insertionPoint);
            } else if (continueAction) {
                continueAction.hidden = true;
            }
            applySeriesPlaybackPreferences(resumeAction, state.resumePlaybackItem, state);
            applySeriesPlaybackPreferences(restart, state.resumePlaybackItem, state);
            applySeriesPlaybackPreferences(continueAction, state.nextPlaybackItem, state);
        } else {
            if (play) play.classList.remove('jellyquestNativeSeriesPlayback');
            if (replay) replay.classList.remove('jellyquestNativeSeriesPlayback');
            if (resumeAction) resumeAction.hidden = true;
            if (restart) restart.hidden = true;
            if (continueAction) continueAction.hidden = true;
        }

        var feature = highlightFeature(state.features);
        var highlights = actions.querySelector('.jellyquestHighlightsAction');
        if (feature) {
            if (!highlights || highlights.getAttribute('data-id') !== feature.Id) {
                if (highlights) highlights.parentNode.removeChild(highlights);
                highlights = createPlaybackAction('jellyquestHighlightsAction', 'Highlights', feature, 0);
                if (favorite) actions.insertBefore(highlights, favorite);
                else actions.appendChild(highlights);
            }
            highlights.hidden = false;
        } else if (highlights) {
            highlights.hidden = true;
        }
        if (more) {
            more.classList.add('jellyquestPlaybackOptionsAction');
            more.classList.toggle('hide', !hasPlaybackOptions(state));
            more.setAttribute('aria-haspopup', 'dialog');
        }
    }

    function ensureDetailActions() {
        var page = document.querySelector('.itemDetailPage');
        var itemId = detailItemId();
        if (!page || !itemId || !window.ApiClient || typeof window.ApiClient.getItem !== 'function'
                || typeof window.ApiClient.getCurrentUser !== 'function') {
            detailActionState = null;
            return;
        }
        if (detailActionState && detailActionState.id === itemId) {
            applyDetailActions();
            return;
        }
        if (detailActionLoading) return;
        detailActionLoading = true;
        window.ApiClient.getCurrentUser(false).then(function (user) {
            return window.ApiClient.getItem(user.Id, itemId).then(function (item) {
                var nextUp = item.Type === 'Series' && typeof window.ApiClient.getNextUpEpisodes === 'function'
                    ? window.ApiClient.getNextUpEpisodes({
                        SeriesId: item.Id,
                        UserId: user.Id,
                        Fields: 'MediaSourceCount'
                    })
                    : Promise.resolve({ Items: [] });
                var resumable = item.Type === 'Series' && typeof window.ApiClient.getItems === 'function'
                    ? window.ApiClient.getItems(user.Id, {
                        SeriesIds: item.Id,
                        IncludeItemTypes: 'Episode',
                        Filters: 'IsResumable',
                        Recursive: true,
                        SortBy: 'DatePlayed',
                        SortOrder: 'Descending',
                        Fields: 'MediaSourceCount',
                        Limit: 1
                    })
                    : Promise.resolve({ Items: [] });
                var episodes = item.Type === 'Series' && typeof window.ApiClient.getEpisodes === 'function'
                    ? window.ApiClient.getEpisodes(item.Id, {
                        IsVirtualUnaired: false,
                        IsMissing: false,
                        UserId: user.Id,
                        Fields: 'MediaSourceCount',
                        limit: 100
                    })
                    : Promise.resolve({ Items: [] });
                var features = item.SpecialFeatureCount && typeof window.ApiClient.getSpecialFeatures === 'function'
                    ? window.ApiClient.getSpecialFeatures(user.Id, item.Id)
                    : Promise.resolve([]);
                return Promise.all([nextUp, resumable, episodes, features]).then(function (results) {
                    var resumeEpisode = results[1] && results[1].Items ? results[1].Items[0] : null;
                    var allEpisodes = results[2] && results[2].Items ? results[2].Items : [];
                    var nextEpisode = results[0] && results[0].Items ? results[0].Items[0] : null;
                    if (resumeEpisode) {
                        var resumeIndex = allEpisodes.map(function (episode) { return episode.Id; }).indexOf(resumeEpisode.Id);
                        nextEpisode = resumeIndex !== -1 ? allEpisodes[resumeIndex + 1] : nextEpisode;
                        if (nextEpisode && nextEpisode.Id === resumeEpisode.Id) nextEpisode = null;
                    }
                    var playbackIds = [];
                    [resumeEpisode, nextEpisode].forEach(function (episode) {
                        if (episode && playbackIds.indexOf(episode.Id) === -1) playbackIds.push(episode.Id);
                    });
                    return Promise.all(playbackIds.map(function (id) {
                        return window.ApiClient.getItem(user.Id, id);
                    })).then(function (playbackItems) {
                        detailActionState = {
                        id: itemId,
                        item: item,
                        resumeEpisode: resumeEpisode,
                        nextEpisode: nextEpisode,
                        resumePlaybackItem: playbackItems.filter(function (episode) {
                            return resumeEpisode && episode.Id === resumeEpisode.Id;
                        })[0] || null,
                        nextPlaybackItem: playbackItems.filter(function (episode) {
                            return nextEpisode && episode.Id === nextEpisode.Id;
                        })[0] || null,
                        features: results[3] || []
                        };
                        if (item.Type === 'Series') initializeSeriesPlaybackPreferences(detailActionState);
                    });
                });
            });
        }).then(function () {
            applyDetailActions();
        }).catch(function (error) {
            console.error('[JellyQuest] Unable to enhance detail actions:', error);
        }).then(function () {
            detailActionLoading = false;
            if (detailItemId() !== itemId) ensureDetailActions();
        });
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
        var trigger = isRuntimeShellRoute() && !isStaticPreview
            ? document.querySelector('.jellyquestLibraryProfileTrigger')
            : document.querySelector('.pageTitleWithDefaultLogo:not(.jellyquestLibraryProfileTrigger)');
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

    function runtimeHomeVisible(elements) {
        return Array.prototype.filter.call(elements, function (element) {
            var rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
    }

    function runtimeHomeCenter(element) {
        var rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function runtimeHomeNearest(origin, candidates, axis) {
        var point = runtimeHomeCenter(origin);
        return candidates.sort(function (left, right) {
            return Math.abs(runtimeHomeCenter(left)[axis] - point[axis])
                - Math.abs(runtimeHomeCenter(right)[axis] - point[axis]);
        })[0] || null;
    }

    function focusRuntimeHomeTarget(target, returnKey, origin) {
        if (!target) return false;
        if (returnKey && origin) {
            target._jellyquestRuntimeReturn = target._jellyquestRuntimeReturn || {};
            target._jellyquestRuntimeReturn[returnKey] = origin;
        }
        target.focus();
        if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        return true;
    }

    function handleRuntimeHomeKeys(event) {
        if (!document.body.classList.contains('jellyquestRuntimeHomeActive')
                || (playbackOptionsDialog && !playbackOptionsDialog.hidden)
                || (profileSwitcher && !profileSwitcher.hidden)) return;
        var keyCode = event.keyCode;
        if ([37, 38, 39, 40].indexOf(keyCode) === -1) return;
        var current = document.activeElement;
        var card = current && current.closest ? current.closest('.jellyquestRuntimeHomeCard') : null;
        var railItem = current && current.closest ? current.closest('.jellyquestRailItem') : null;
        var headerItem = current && current.closest
            ? current.closest('.jellyquestProfileTrigger, .headerTabs .emby-tab-button:not(.jellyquestHiddenFavoritesTab)')
            : null;
        var root = document.querySelector('.jellyquestRuntimeHomeRoot');
        if (!root || (!card && !railItem && !headerItem)) return;
        var target = null;

        if (card) {
            var grid = card.closest('.jqHomeGrid');
            var row = runtimeHomeVisible(grid.querySelectorAll('.jellyquestRuntimeHomeCard'));
            var index = row.indexOf(card);
            var sections = runtimeHomeVisible(root.querySelectorAll('.jqHomeSection')).filter(function (section) {
                return runtimeHomeVisible(section.querySelectorAll('.jellyquestRuntimeHomeCard')).length > 0;
            });
            var sectionIndex = sections.indexOf(card.closest('.jqHomeSection'));
            runtimeHomeLastCard = card;
            if (keyCode === 37) {
                target = index > 0 ? row[index - 1] : (libraryRail ? runtimeHomeNearest(card,
                    runtimeHomeVisible(libraryRail.querySelectorAll('.jellyquestRailItem')), 'y') : null);
            } else if (keyCode === 39 && index < row.length - 1) {
                target = row[index + 1];
            } else if (keyCode === 38) {
                if (sectionIndex > 0) {
                    var previous = runtimeHomeVisible(sections[sectionIndex - 1].querySelectorAll('.jellyquestRuntimeHomeCard'));
                    target = previous[Math.min(index, previous.length - 1)];
                } else {
                    target = runtimeHomeNearest(card, runtimeHomeVisible(document.querySelectorAll(
                        '.headerTabs .emby-tab-button:not(.jellyquestHiddenFavoritesTab)')), 'x');
                }
            } else if (keyCode === 40 && sectionIndex < sections.length - 1) {
                var next = runtimeHomeVisible(sections[sectionIndex + 1].querySelectorAll('.jellyquestRuntimeHomeCard'));
                target = next[Math.min(index, next.length - 1)];
            }
            if (target) {
                focusRuntimeHomeTarget(target, keyCode === 38 ? 40 : (keyCode === 37 ? 39 : 0), card);
            }
        } else if (railItem && keyCode === 39) {
            target = railItem._jellyquestRuntimeReturn && railItem._jellyquestRuntimeReturn[39];
            if (!target || !document.body.contains(target)) target = runtimeHomeLastCard;
            if (!target || !document.body.contains(target)) target = root.querySelector('.jellyquestRuntimeHomeCard');
            focusRuntimeHomeTarget(target, 37, railItem);
        } else if (headerItem) {
            var headers = runtimeHomeVisible(document.querySelectorAll(
                '.jellyquestProfileTrigger, .headerTabs .emby-tab-button:not(.jellyquestHiddenFavoritesTab)'));
            var headerIndex = headers.indexOf(headerItem);
            if (keyCode === 37 && headerIndex > 0) target = headers[headerIndex - 1];
            if (keyCode === 39 && headerIndex < headers.length - 1) target = headers[headerIndex + 1];
            if (keyCode === 40) {
                target = headerItem._jellyquestRuntimeReturn && headerItem._jellyquestRuntimeReturn[40];
                if (!target || !document.body.contains(target)) {
                    target = headerItem.classList.contains('jellyquestProfileTrigger')
                        ? (libraryRail && libraryRail.querySelector('.jellyquestRailItem'))
                        : runtimeHomeNearest(headerItem,
                            runtimeHomeVisible(root.querySelectorAll('.jqHomeSection .jellyquestRuntimeHomeCard')), 'x');
                }
            }
            if (target) focusRuntimeHomeTarget(target, keyCode === 40 ? 38
                : (keyCode === 37 ? 39 : (keyCode === 39 ? 37 : 0)), headerItem);
        }

        if (target) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }

    function runtimeLibraryTopTarget(card, index) {
        var tabs = runtimeHomeVisible(document.querySelectorAll('.jellyquestGlobalTab'));
        var controls = runtimeHomeVisible(document.querySelectorAll('.jellyquestRuntimeLibraryRoot .jqLibraryControls button'));
        if (index <= 2) return tabs[0] || controls[0];
        if (index <= 4) return tabs[1] || tabs[0] || controls[0];
        if (index === 5) return controls[1] || controls[0];
        return controls[2] || controls[controls.length - 1];
    }

    function handleRuntimeLibraryKeys(event) {
        if (!document.body.classList.contains('jellyquestRuntimeLibraryActive')) return;
        var keyCode = event.keyCode;
        if (runtimeLibraryMenu) {
            var options = runtimeHomeVisible(runtimeLibraryMenu.querySelectorAll('.jellyquestRuntimeLibraryOption'));
            var optionIndex = options.indexOf(document.activeElement);
            if ((keyCode === 38 || keyCode === 40) && optionIndex !== -1) {
                optionIndex = keyCode === 38
                    ? (optionIndex - 1 + options.length) % options.length
                    : (optionIndex + 1) % options.length;
                options[optionIndex].focus();
                event.preventDefault();
                event.stopImmediatePropagation();
            } else if (keyCode === 37 || keyCode === 10009 || keyCode === 8 || keyCode === 27) {
                closeRuntimeLibraryMenu(true);
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            return;
        }
        if ([37, 38, 39, 40].indexOf(keyCode) === -1) return;
        var current = document.activeElement;
        var card = current && current.closest ? current.closest('.jellyquestRuntimeLibraryCard') : null;
        var control = current && current.closest ? current.closest('.jellyquestRuntimeLibraryRoot .jqLibraryControls button') : null;
        var railItem = current && current.closest ? current.closest('.jellyquestRailItem') : null;
        var headerItem = current && current.closest
            ? current.closest('.jellyquestProfileTrigger, .jellyquestGlobalTab') : null;
        var root = document.querySelector('.jellyquestRuntimeLibraryRoot');
        if (!root || (!card && !control && !railItem && !headerItem)) return;
        var cards = runtimeHomeVisible(root.querySelectorAll('.jellyquestRuntimeLibraryCard'));
        var controls = runtimeHomeVisible(root.querySelectorAll('.jqLibraryControls button'));
        var headers = runtimeHomeVisible(document.querySelectorAll('.jellyquestProfileTrigger, .jellyquestGlobalTab'));
        var target = null;

        if (card) {
            var index = cards.indexOf(card);
            var column = index % 7;
            runtimeLibraryLastCard = card;
            if (keyCode === 37) {
                target = column > 0 ? cards[index - 1] : (libraryRail ? runtimeHomeNearest(card,
                    runtimeHomeVisible(libraryRail.querySelectorAll('.jellyquestRailItem')), 'y') : null);
            } else if (keyCode === 39 && column < 6 && index + 1 < cards.length) {
                target = cards[index + 1];
            } else if (keyCode === 38) {
                target = index >= 7 ? cards[index - 7] : runtimeLibraryTopTarget(card, column);
            } else if (keyCode === 40 && index + 7 < cards.length) {
                target = cards[index + 7];
            }
            if (target) focusRuntimeHomeTarget(target, keyCode === 38 ? 40 : (keyCode === 37 ? 39 : 0), card);
        } else if (control) {
            var controlIndex = controls.indexOf(control);
            if (keyCode === 37 && controlIndex > 0) target = controls[controlIndex - 1];
            if (keyCode === 39 && controlIndex < controls.length - 1) target = controls[controlIndex + 1];
            if (keyCode === 38) target = runtimeHomeNearest(control, headers.slice(), 'x');
            if (keyCode === 40) {
                target = control._jellyquestRuntimeReturn && control._jellyquestRuntimeReturn[40];
                if (!target || !document.body.contains(target)) {
                    target = cards[Math.min(cards.length - 1, controlIndex + 3)] || cards[0];
                }
            }
            if (target) focusRuntimeHomeTarget(target, keyCode === 40 ? 38 : 0, control);
        } else if (headerItem) {
            var headerIndex = headers.indexOf(headerItem);
            if (keyCode === 37 && headerIndex > 0) target = headers[headerIndex - 1];
            if (keyCode === 39 && headerIndex < headers.length - 1) target = headers[headerIndex + 1];
            if (keyCode === 40) {
                target = headerItem._jellyquestRuntimeReturn && headerItem._jellyquestRuntimeReturn[40];
                if (!target || !document.body.contains(target)) {
                    target = headerItem.classList.contains('jellyquestProfileTrigger')
                        ? (libraryRail && libraryRail.querySelector('.jellyquestRailItem'))
                        : cards[headerIndex === headers.length - 1 ? Math.min(4, cards.length - 1) : 0];
                }
            }
            if (target) focusRuntimeHomeTarget(target, keyCode === 40 ? 38 : 0, headerItem);
        } else if (railItem && keyCode === 39) {
            target = railItem._jellyquestRuntimeReturn && railItem._jellyquestRuntimeReturn[39];
            if (!target || !document.body.contains(target)) target = runtimeLibraryLastCard;
            if (!target || !document.body.contains(target)) target = cards[0];
            if (target) focusRuntimeHomeTarget(target, 37, railItem);
        }

        if (target) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }

    function runtimeDetailDirectional(current, candidates, keyCode) {
        var origin = runtimeHomeCenter(current);
        var vertical = keyCode === 38 || keyCode === 40;
        var forward = keyCode === 39 || keyCode === 40;
        return candidates.filter(function (candidate) {
            if (candidate === current) return false;
            var point = runtimeHomeCenter(candidate);
            var primary = vertical ? point.y - origin.y : point.x - origin.x;
            return forward ? primary > 4 : primary < -4;
        }).sort(function (left, right) {
            function score(element) {
                var point = runtimeHomeCenter(element);
                var primary = Math.abs(vertical ? point.y - origin.y : point.x - origin.x);
                var cross = Math.abs(vertical ? point.x - origin.x : point.y - origin.y);
                return primary + cross * 2.5;
            }
            return score(left) - score(right);
        })[0] || null;
    }

    function runtimeDetailEdgeRow(candidates, edge) {
        if (!candidates.length) return [];
        var sorted = candidates.slice().sort(function (left, right) {
            return runtimeHomeCenter(left).y - runtimeHomeCenter(right).y;
        });
        var anchor = runtimeHomeCenter(edge === 'bottom' ? sorted[sorted.length - 1] : sorted[0]).y;
        return sorted.filter(function (candidate) {
            var rect = candidate.getBoundingClientRect();
            return Math.abs(runtimeHomeCenter(candidate).y - anchor) <= Math.max(12, rect.height * .45);
        });
    }

    function handleRuntimeDetailKeys(event) {
        if (!document.body.classList.contains('jellyquestRuntimeDetailActive')
                || (playbackOptionsDialog && !playbackOptionsDialog.hidden)
                || (profileSwitcher && !profileSwitcher.hidden)) return;
        var keyCode = event.keyCode;
        if (runtimeLibraryMenu) {
            var menuOptions = runtimeHomeVisible(runtimeLibraryMenu.querySelectorAll('.jellyquestRuntimeLibraryOption'));
            var menuIndex = menuOptions.indexOf(document.activeElement);
            if ((keyCode === 38 || keyCode === 40) && menuIndex !== -1) {
                menuIndex = keyCode === 38
                    ? (menuIndex - 1 + menuOptions.length) % menuOptions.length
                    : (menuIndex + 1) % menuOptions.length;
                menuOptions[menuIndex].focus();
                event.preventDefault();
                event.stopImmediatePropagation();
            } else if (keyCode === 37 || keyCode === 10009 || keyCode === 8 || keyCode === 27) {
                closeRuntimeLibraryMenu(true);
                event.preventDefault();
                event.stopImmediatePropagation();
            }
            return;
        }
        if (keyCode === 10009 || keyCode === 8 || keyCode === 27) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (runtimeDetailOrigin && runtimeDetailOrigin.hash) {
                window.location.hash = runtimeDetailOrigin.hash;
            } else {
                window.history.back();
            }
            return;
        }
        if ([37, 38, 39, 40].indexOf(keyCode) === -1) return;
        var root = document.querySelector('.jellyquestRuntimeDetailRoot');
        var current = document.activeElement;
        var action = current && current.closest ? current.closest('.jellyquestRuntimeDetailAction') : null;
        var content = current && current.closest ? current.closest('.jellyquestRuntimeDetailContent') : null;
        var season = current && current.closest ? current.closest('.jqSeasonSelect') : null;
        var railItem = current && current.closest ? current.closest('.jellyquestRailItem') : null;
        var headerItem = current && current.closest ? current.closest('.jellyquestProfileTrigger, .jellyquestGlobalTab') : null;
        if (!root || (!action && !content && !season && !railItem && !headerItem)) return;
        var actions = runtimeHomeVisible(root.querySelectorAll('.jellyquestRuntimeDetailAction'));
        var lower = runtimeHomeVisible(root.querySelectorAll('.jqSeasonSelect, .jellyquestRuntimeDetailContent'));
        var contents = runtimeHomeVisible(root.querySelectorAll('.jellyquestRuntimeDetailContent'));
        var headers = runtimeHomeVisible(document.querySelectorAll('.jellyquestProfileTrigger, .jellyquestGlobalTab'));
        var target = null;
        var remembered = current._jellyquestRuntimeReturn && current._jellyquestRuntimeReturn[keyCode];

        if (remembered && document.body.contains(remembered)
                && runtimeHomeVisible([remembered]).length) {
            target = remembered;
        }

        if (!target && action) {
            var actionIndex = actions.indexOf(action);
            runtimeDetailLastFocus = action;
            if (keyCode === 37) target = actionIndex > 0 ? actions[actionIndex - 1]
                : (libraryRail ? runtimeHomeNearest(action, runtimeHomeVisible(libraryRail.querySelectorAll('.jellyquestRailItem')), 'y') : null);
            if (keyCode === 39 && actionIndex < actions.length - 1) target = actions[actionIndex + 1];
            if (keyCode === 38) target = headers[actionIndex < Math.ceil(actions.length / 2) ? 1 : 2] || headers[1] || headers[0];
            if (keyCode === 40) {
                target = season && actionIndex === actions.length - 1
                    ? season
                    : runtimeHomeNearest(action, runtimeDetailEdgeRow(contents, 'top'), 'x');
            }
        } else if (!target && season) {
            runtimeDetailLastFocus = season;
            if (keyCode === 38) target = actions[actions.length - 1];
            if (keyCode === 40) target = runtimeHomeNearest(season, runtimeDetailEdgeRow(contents, 'top'), 'x');
        } else if (!target && content) {
            runtimeDetailLastFocus = content;
            target = runtimeDetailDirectional(content, contents.slice(), keyCode);
            if (!target && keyCode === 37) target = libraryRail
                ? runtimeHomeNearest(content, runtimeHomeVisible(libraryRail.querySelectorAll('.jellyquestRailItem')), 'y') : null;
            if (!target && keyCode === 38) {
                target = runtimeHomeNearest(content, actions.concat(season ? [season] : []), 'x');
            }
        } else if (!target && headerItem) {
            var headerIndex = headers.indexOf(headerItem);
            if (keyCode === 37 && headerIndex > 0) target = headers[headerIndex - 1];
            if (keyCode === 39 && headerIndex < headers.length - 1) target = headers[headerIndex + 1];
            if (keyCode === 40) {
                target = headerItem._jellyquestRuntimeReturn && headerItem._jellyquestRuntimeReturn[40];
                if (!target || !document.body.contains(target)) target = headerItem.classList.contains('jellyquestProfileTrigger')
                    ? (libraryRail && libraryRail.querySelector('.jellyquestRailItem'))
                    : actions[headerIndex === headers.length - 1 ? actions.length - 1 : 0];
            }
        } else if (!target && railItem && keyCode === 39) {
            target = railItem._jellyquestRuntimeReturn && railItem._jellyquestRuntimeReturn[39];
            if (!target || !document.body.contains(target)) target = runtimeDetailLastFocus;
            if (!target || !document.body.contains(target)) target = actions[0] || lower[0];
        }

        if (target) {
            focusRuntimeHomeTarget(target, keyCode === 38 ? 40
                : (keyCode === 40 ? 38 : (keyCode === 37 ? 39 : (keyCode === 39 ? 37 : 0))), current);
            event.preventDefault();
            event.stopImmediatePropagation();
        }
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
                + '&return=' + encodeURIComponent(window.location.href)
                + '&bridge=' + encodeURIComponent(requestsBridgeUrl);
            var version = requestsPageVersion ? '?v=' + encodeURIComponent(requestsPageVersion) : '';
            window.location.assign(localRequestsUrl + version + fragment);
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
                requestsBridgeUrl = new URL(config.requestsBridgeUrl).href;
                requestsPageVersion = config.requestsPageVersion || '';
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
        ensureRuntimeLibrary();
        ensureMyListRow();
        labelMyListButtons();
        ensureDetailActions();
        ensureRuntimeDetail();
        new MutationObserver(function () {
            enforceHouseholdLogin();
            ensureRequestsTab();
            ensureProfileSwitcher();
            ensureLibraryRail();
            ensureRuntimeLibrary();
            ensureMyListRow();
            labelMyListButtons();
            ensureDetailActions();
            ensureRuntimeDetail();
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
    window.addEventListener('keydown', handleRuntimeDetailKeys, true);
    window.addEventListener('keydown', handleRuntimeLibraryKeys, true);
    window.addEventListener('keydown', handleRuntimeHomeKeys, true);
    window.addEventListener('keydown', handleProfileKeys, true);
    window.addEventListener('keydown', handlePlaybackOptionsKeys, true);
    window.addEventListener('resize', positionProfileSwitcher);
    window.addEventListener('resize', positionLibraryRail);
    window.addEventListener('resize', positionRuntimeLibraryMenu);
    document.addEventListener('focusin', function (event) {
        var card = event.target.closest && event.target.closest('.jellyquestRuntimeLibraryCard');
        if (!card) return;
        var cards = runtimeHomeVisible(document.querySelectorAll('.jellyquestRuntimeLibraryCard'));
        if (cards.indexOf(card) >= cards.length - 14) loadRuntimeLibrary(false);
    });
    document.addEventListener('click', function (event) {
        var playbackOptions = event.target.closest && event.target.closest('.jellyquestPlaybackOptionsAction');
        if (playbackOptions) {
            event.preventDefault();
            event.stopImmediatePropagation();
            openPlaybackOptions(playbackOptions);
            return;
        }
        if (profileSwitcher && !profileSwitcher.hidden
                && !profileSwitcher.contains(event.target)
                && event.target !== profileSwitcherTrigger
                && (!profileSwitcherTrigger || !profileSwitcherTrigger.contains(event.target))) {
            closeProfileSwitcher();
        }
    }, true);
    document.addEventListener('click', function (event) {
        if (event.target.closest && event.target.closest('[is="emby-ratingbutton"][data-isfavorite], emby-ratingbutton[data-isfavorite], .btnUserData[data-method="markFavorite"]')) {
            scheduleMyListRefresh();
        }
    }, true);
    window.addEventListener('hashchange', function () {
        closePlaybackOptions();
        closeRuntimeLibraryMenu(false);
        ensureRequestsTab();
        ensureRuntimeLibrary();
        ensureMyListRow();
        ensureDetailActions();
        ensureRuntimeDetail();
    });
    window.addEventListener('hashchange', updateLibraryRailSelection);
    window.addEventListener('viewshow', function () {
        enforceHouseholdLogin();
        ensureRequestsTab();
        ensureRuntimeLibrary();
        ensureMyListRow();
        labelMyListButtons();
        ensureDetailActions();
        ensureRuntimeDetail();
    });
    console.info('[JellyQuest] Farmhouse household policy loaded');
})();
