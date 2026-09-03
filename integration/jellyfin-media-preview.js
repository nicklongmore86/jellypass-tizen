(function () {
    'use strict';

    var workspaceSelector = '.jqPageBack, .jqFilter, .jqSort, .jqMovieCard, .jqDetailBack, .jqAction, .jqActionSheetButton, .jqCollectionCard, .jqSeasonSelect, .jqEpisodeCard, .jqSportCard, .jqChapterCard';
    var headerSelector = '.pageTitleWithDefaultLogo, .tabs span';
    var sortMenu = null;
    var sortTrigger = null;
    var actionSurface = null;
    var actionSurfaceReturnFocus = null;
    var actionSurfaceBack = null;
    var previewMyListDefaults = ['movie-1', 'show-1', 'movie-3', 'show-4', 'movie-5', 'show-6', 'sport-1'];

    function previewMyListKey() {
        return 'jellyquest-preview-my-list:' + (localStorage.getItem('jellyquest-preview-user') || 'default');
    }

    function readPreviewMyList() {
        var saved = localStorage.getItem(previewMyListKey());
        if (saved === null) return previewMyListDefaults.slice();
        try {
            return JSON.parse(saved);
        } catch (error) {
            return previewMyListDefaults.slice();
        }
    }

    function updatePreviewMyList() {
        var itemIds = readPreviewMyList();
        var section = document.querySelector('.jqPreviewMyListSection');
        var action = document.querySelector('.jqMyListAction');
        if (section) {
            var visibleCount = 0;
            section.querySelectorAll('[data-my-list-id]').forEach(function (card) {
                var visible = itemIds.indexOf(card.getAttribute('data-my-list-id')) !== -1;
                card.hidden = !visible;
                if (visible) visibleCount += 1;
            });
            section.hidden = visibleCount === 0;
            if (window.ApiClient && typeof window.ApiClient.getCurrentUser === 'function') {
                window.ApiClient.getCurrentUser(false).then(function (user) {
                    var owner = section.querySelector('.jqPreviewMyListOwner');
                    if (owner && user && user.Name) owner.textContent = 'Saved for ' + user.Name;
                });
            }
        }
        if (action) {
            var selected = itemIds.indexOf(action.getAttribute('data-my-list-id')) !== -1;
            action.setAttribute('aria-pressed', selected ? 'true' : 'false');
            action.textContent = selected ? '\u2713 My List' : '\uff0b My List';
        }
    }

    function togglePreviewMyList(action) {
        var itemId = action.getAttribute('data-my-list-id');
        var itemIds = readPreviewMyList();
        var index = itemIds.indexOf(itemId);
        if (index === -1) itemIds.push(itemId);
        else itemIds.splice(index, 1);
        localStorage.setItem(previewMyListKey(), JSON.stringify(itemIds));
        updatePreviewMyList();
    }

    function ensureActionSurface() {
        if (actionSurface) return actionSurface;
        actionSurface = document.createElement('div');
        actionSurface.className = 'jqActionSheetBackdrop';
        actionSurface.hidden = true;
        document.body.appendChild(actionSurface);
        return actionSurface;
    }

    function closeActionSurface() {
        if (!actionSurface || actionSurface.hidden) return false;
        actionSurface.hidden = true;
        actionSurface.innerHTML = '';
        actionSurfaceBack = null;
        if (actionSurfaceReturnFocus && document.body.contains(actionSurfaceReturnFocus)) {
            actionSurfaceReturnFocus.focus();
        }
        return true;
    }

    function showPlaybackNotice(trigger, title, detail) {
        var surface = ensureActionSurface();
        actionSurfaceReturnFocus = trigger;
        actionSurfaceBack = null;
        surface.innerHTML = '';
        var notice = document.createElement('div');
        var heading = document.createElement('strong');
        var message = document.createElement('span');
        var close = document.createElement('button');
        notice.className = 'jqPlaybackNotice';
        heading.textContent = title;
        message.textContent = detail;
        close.type = 'button';
        close.className = 'jqActionSheetButton';
        close.textContent = 'Close';
        close.addEventListener('click', closeActionSurface);
        notice.appendChild(heading);
        notice.appendChild(message);
        notice.appendChild(close);
        surface.appendChild(notice);
        surface.hidden = false;
        close.focus();
    }

    function openMoreMenu(trigger) {
        var surface = ensureActionSurface();
        actionSurfaceReturnFocus = trigger;
        actionSurfaceBack = null;
        surface.innerHTML = '';
        var menu = document.createElement('div');
        var heading = document.createElement('h2');
        menu.className = 'jqActionSheet';
        menu.setAttribute('role', 'menu');
        heading.textContent = 'Playback Options';
        menu.appendChild(heading);
        var definitions = [
            { key: 'version', label: 'Version' },
            { key: 'audio', label: 'Audio' },
            { key: 'subtitle', label: 'Subtitles' }
        ];
        definitions.forEach(function (definition) {
            var values = (trigger.getAttribute('data-' + definition.key + '-options') || '').split('|').filter(Boolean);
            if ((definition.key === 'version' || definition.key === 'audio') && values.length < 2) return;
            if (definition.key === 'subtitle' && !values.length) return;
            var selectedAttribute = 'data-' + definition.key + '-selected';
            var selected = trigger.getAttribute(selectedAttribute) || values[0];
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'jqActionSheetButton';
            option.setAttribute('role', 'menuitem');
            option.innerHTML = '<span>' + definition.label + '</span><span class="jqActionSheetValue"></span>';
            option.querySelector('.jqActionSheetValue').textContent = selected;
            option.addEventListener('click', function () {
                openPlaybackChoices(trigger, definition, values, selected);
            });
            menu.appendChild(option);
        });
        var done = document.createElement('button');
        done.type = 'button';
        done.className = 'jqActionSheetButton jqActionSheetDone';
        done.textContent = 'Done';
        done.addEventListener('click', closeActionSurface);
        menu.appendChild(done);
        surface.appendChild(menu);
        surface.hidden = false;
        menu.querySelector('.jqActionSheetButton').focus();
    }

    function openPlaybackChoices(trigger, definition, values, selected) {
        var surface = ensureActionSurface();
        actionSurfaceBack = function () { openMoreMenu(trigger); };
        surface.innerHTML = '';
        var menu = document.createElement('div');
        var heading = document.createElement('h2');
        menu.className = 'jqActionSheet';
        menu.setAttribute('role', 'menu');
        heading.textContent = definition.label;
        menu.appendChild(heading);
        values.forEach(function (label) {
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'jqActionSheetButton';
            option.classList.toggle('is-selected', label === selected);
            option.setAttribute('role', 'menuitemradio');
            option.setAttribute('aria-checked', label === selected ? 'true' : 'false');
            option.textContent = label;
            option.addEventListener('click', function () {
                trigger.setAttribute('data-' + definition.key + '-selected', label);
                openMoreMenu(trigger);
            });
            menu.appendChild(option);
        });
        surface.appendChild(menu);
        surface.hidden = false;
        (menu.querySelector('.is-selected') || menu.querySelector('.jqActionSheetButton')).focus();
    }

    function initializeConditionalActions() {
        document.querySelectorAll('.jqTrailerAction').forEach(function (button) {
            button.hidden = !button.getAttribute('data-trailer-url');
        });
        document.querySelectorAll('.jqHighlightsAction').forEach(function (button) {
            button.hidden = !button.getAttribute('data-highlight-id');
        });
        document.querySelectorAll('.jqMoreAction').forEach(function (button) {
            var versions = (button.getAttribute('data-version-options') || '').split('|').filter(Boolean);
            var audio = (button.getAttribute('data-audio-options') || '').split('|').filter(Boolean);
            var subtitles = (button.getAttribute('data-subtitle-options') || '').split('|').filter(Boolean);
            button.hidden = versions.length < 2 && audio.length < 2 && subtitles.length === 0;
        });
    }

    function center(rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function isVisible(element) {
        var rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function visibleElements(selector) {
        return Array.prototype.slice.call(document.querySelectorAll(selector)).filter(isVisible);
    }

    function oppositeKey(keyCode) {
        return { 37: 39, 38: 40, 39: 37, 40: 38 }[keyCode];
    }

    function focusElement(element, keyCode, origin) {
        if (!element) return false;
        if (keyCode && origin) {
            element._jellyquestReturnFocus = element._jellyquestReturnFocus || {};
            element._jellyquestReturnFocus[oppositeKey(keyCode)] = origin;
        }
        element.focus();
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
    }

    function directionalCandidate(current, candidates, keyCode) {
        var origin = center(current.getBoundingClientRect());
        var vertical = keyCode === 38 || keyCode === 40;
        var forward = keyCode === 39 || keyCode === 40;
        var matches = candidates.filter(function (candidate) {
            if (candidate === current) return false;
            var point = center(candidate.getBoundingClientRect());
            var primary = vertical ? point.y - origin.y : point.x - origin.x;
            return forward ? primary > 4 : primary < -4;
        });
        matches.sort(function (left, right) {
            function score(element) {
                var point = center(element.getBoundingClientRect());
                var primary = Math.abs(vertical ? point.y - origin.y : point.x - origin.x);
                var cross = Math.abs(vertical ? point.x - origin.x : point.y - origin.y);
                return primary + cross * 2.5;
            }
            return score(left) - score(right);
        });
        return matches[0] || null;
    }

    function nearestByAxis(current, candidates, axis) {
        var origin = center(current.getBoundingClientRect());
        candidates.sort(function (left, right) {
            var leftPoint = center(left.getBoundingClientRect());
            var rightPoint = center(right.getBoundingClientRect());
            return Math.abs(leftPoint[axis] - origin[axis]) - Math.abs(rightPoint[axis] - origin[axis]);
        });
        return candidates[0] || null;
    }

    function sameVisualRow(current, candidates) {
        var origin = center(current.getBoundingClientRect());
        var tolerance = Math.max(12, current.getBoundingClientRect().height * .45);
        return candidates.filter(function (candidate) {
            return Math.abs(center(candidate.getBoundingClientRect()).y - origin.y) <= tolerance;
        }).sort(function (left, right) {
            return center(left.getBoundingClientRect()).x - center(right.getBoundingClientRect()).x;
        });
    }

    function edgeVisualRow(candidates, edge) {
        if (!candidates.length) return [];
        var sorted = candidates.slice().sort(function (left, right) {
            return center(left.getBoundingClientRect()).y - center(right.getBoundingClientRect()).y;
        });
        var anchor = center((edge === 'bottom' ? sorted[sorted.length - 1] : sorted[0]).getBoundingClientRect()).y;
        return sorted.filter(function (candidate) {
            var rect = candidate.getBoundingClientRect();
            return Math.abs(center(rect).y - anchor) <= Math.max(12, rect.height * .45);
        });
    }

    function detailContentElements() {
        return visibleElements('.jqCollectionCard, .jqEpisodeCard, .jqChapterCard');
    }

    function detailLowerElements() {
        return visibleElements('.jqSeasonSelect').concat(detailContentElements());
    }

    function proportionalTarget(index, sourceCount, targets) {
        if (!targets.length) return null;
        if (sourceCount <= 1 || targets.length <= 1) return targets[0];
        return targets[Math.round(index * (targets.length - 1) / (sourceCount - 1))];
    }

    function detailNavigationTarget(current, keyCode, headers, rail) {
        if (!document.querySelector('.jqDetailWorkspace')) return undefined;
        var actions = visibleElements('.jqActions .jqAction');
        var back = visibleElements('.jqDetailBack')[0] || null;
        var content = detailContentElements();
        var season = visibleElements('.jqSeasonSelect')[0] || null;
        var tabs = headers.slice(1);
        var actionIndex = actions.indexOf(current);
        var contentIndex = content.indexOf(current);
        var target = null;

        if (current === back) {
            if (keyCode === 37) target = nearestByAxis(current, rail.slice(), 'y');
            if (keyCode === 38) target = nearestByAxis(current, headers.slice(), 'x');
            if (keyCode === 39 || keyCode === 40) target = nearestByAxis(current, actions.slice(), 'x');
            return target;
        }

        if (actionIndex !== -1) {
            if (keyCode === 37) target = actionIndex > 0 ? actions[actionIndex - 1] : nearestByAxis(current, rail.slice(), 'y');
            if (keyCode === 39 && actionIndex < actions.length - 1) target = actions[actionIndex + 1];
            if (keyCode === 38) target = back
                || tabs[actionIndex < Math.ceil(actions.length / 2) ? 0 : tabs.length - 1] || headers[0];
            if (keyCode === 40) target = season && actionIndex === actions.length - 1
                ? season : nearestByAxis(current, edgeVisualRow(content, 'top'), 'x');
            return target;
        }

        if (current === season) {
            if (keyCode === 38) target = actions[actions.length - 1];
            if (keyCode === 40) target = nearestByAxis(current, edgeVisualRow(content, 'top'), 'x');
            return target;
        }

        if (contentIndex !== -1) {
            if (keyCode === 37 || keyCode === 39) {
                var row = sameVisualRow(current, content);
                var rowIndex = row.indexOf(current);
                if (keyCode === 37) target = rowIndex > 0 ? row[rowIndex - 1] : nearestByAxis(current, rail.slice(), 'y');
                if (keyCode === 39 && rowIndex < row.length - 1) target = row[rowIndex + 1];
                return target;
            }
            target = directionalCandidate(current, content, keyCode);
            if (!target && keyCode === 38) target = nearestByAxis(current, actions.concat(season ? [season] : []), 'x');
            return target;
        }

        return undefined;
    }

    function moveFocus(keyCode) {
        var current = document.activeElement;
        if (!current || !current.getBoundingClientRect || !isVisible(current)) return;

        var remembered = current._jellyquestReturnFocus && current._jellyquestReturnFocus[keyCode];
        if (remembered && document.body.contains(remembered) && isVisible(remembered)) {
            focusElement(remembered, keyCode, current);
            return;
        }

        var headers = visibleElements(headerSelector);
        var rail = visibleElements('.jellyquestRailItem');
        var workspace = visibleElements(workspaceSelector);
        var headerIndex = headers.indexOf(current);
        var railIndex = rail.indexOf(current);
        var inWorkspace = workspace.indexOf(current) !== -1;
        var target = null;

        if (headerIndex !== -1) {
            if (keyCode === 37 && headerIndex > 0) target = headers[headerIndex - 1];
            if (keyCode === 39 && headerIndex < headers.length - 1) target = headers[headerIndex + 1];
            if (keyCode === 40) {
                if (headerIndex === 0) {
                    target = rail[0];
                } else if (document.querySelector('.jqDetailWorkspace')) {
                    var detailActions = visibleElements('.jqActions .jqAction');
                    target = visibleElements('.jqDetailBack')[0]
                        || (headerIndex === 1 ? detailActions[0] : detailActions[detailActions.length - 1]);
                } else {
                    target = nearestByAxis(current, workspace.slice(), 'x');
                }
            }
        } else if (railIndex !== -1) {
            if (keyCode === 38) target = railIndex > 0 ? rail[railIndex - 1] : headers[0];
            if (keyCode === 40 && railIndex < rail.length - 1) target = rail[railIndex + 1];
            if (keyCode === 39) {
                var detailWorkspace = document.querySelector('.jqDetailWorkspace')
                    ? visibleElements('.jqDetailBack').concat(visibleElements('.jqActions .jqAction'), detailLowerElements()) : workspace;
                target = nearestByAxis(current, detailWorkspace.slice(), 'y');
            }
        } else if (inWorkspace) {
            var detailTarget = detailNavigationTarget(current, keyCode, headers, rail);
            if (detailTarget !== undefined) {
                focusElement(detailTarget, keyCode, current);
                return;
            }
            var isLibraryCard = current.matches('.jqMovieCard, .jqSportCard');
            var libraryCards = isLibraryCard
                ? visibleElements(current.matches('.jqSportCard') ? '.jqSportCard' : '.jqMovieCard')
                : [];
            var currentPoint = center(current.getBoundingClientRect());
            var hasCardAbove = libraryCards.some(function (card) {
                return center(card.getBoundingClientRect()).y < currentPoint.y - 4;
            });
            if (keyCode === 38 && isLibraryCard && !hasCardAbove) {
                var filters = visibleElements('.jqFilter');
                if (current.matches('.jqMovieCard')) {
                    var topRow = libraryCards.filter(function (card) {
                        return Math.abs(center(card.getBoundingClientRect()).y - currentPoint.y) < 4;
                    }).sort(function (left, right) {
                        return center(left.getBoundingClientRect()).x - center(right.getBoundingClientRect()).x;
                    });
                    var column = topRow.indexOf(current);
                    target = column < 4 ? headers[1]
                        : column === 4 ? headers[2]
                            : column === 5 ? (filters[1] || filters[0])
                                : filters[filters.length - 1];
                } else {
                    target = nearestByAxis(current, headers.slice(1).concat(filters), 'x');
                }
            } else {
                target = directionalCandidate(current, workspace, keyCode);
            }
            if (!target && keyCode === 37) target = nearestByAxis(current, rail.slice(), 'y');
            if (!target && keyCode === 38) {
                target = nearestByAxis(current, headers.slice(1), 'x') || headers[0];
            }
        }

        focusElement(target, keyCode, current);
    }

    function sortCardValue(card, key) {
        var text = card.textContent.replace(/\s+/g, ' ').trim();
        var original = Number(card.getAttribute('data-original-index'));
        if (key === 'name') {
            var title = card.querySelector('.jqMovieName, .jqSportName');
            return title ? title.textContent.trim().toLowerCase() : text.toLowerCase();
        }
        if (key === 'date') {
            var year = text.match(/\b(19|20)\d{2}\b/);
            return year ? Number(year[0]) : -original;
        }
        if (key === 'rating') return (original * 7) % 11;
        if (key === 'runtime') {
            var hours = text.match(/(\d+)h/);
            var minutes = text.match(/(\d+)m/);
            return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
        }
        if (key === 'league') {
            var league = card.querySelector('.jqLeagueBadge');
            return league ? league.textContent.trim().toLowerCase() : '';
        }
        return original;
    }

    function applySort(key, label) {
        var grid = document.querySelector('.jqMovieGrid, .jqSportsGrid');
        if (!grid) return;
        var cards = Array.prototype.slice.call(grid.children);
        cards.sort(function (left, right) {
            var leftValue = sortCardValue(left, key);
            var rightValue = sortCardValue(right, key);
            if (typeof leftValue === 'string') return leftValue.localeCompare(rightValue);
            return key === 'recent' ? leftValue - rightValue : rightValue - leftValue;
        });
        cards.forEach(function (card) { grid.appendChild(card); });
        sortTrigger.setAttribute('data-current-sort', key);
        sortTrigger.firstChild.nodeValue = label + ' ';
    }

    function closeSortMenu() {
        if (!sortMenu || sortMenu.hidden) return false;
        sortMenu.hidden = true;
        if (sortTrigger) sortTrigger.focus();
        return true;
    }

    function positionSortMenu() {
        if (!sortMenu || sortMenu.hidden || !sortTrigger) return;
        var rect = sortTrigger.getBoundingClientRect();
        sortMenu.style.left = Math.max(16, Math.min(rect.right - sortMenu.offsetWidth, window.innerWidth - sortMenu.offsetWidth - 16)) + 'px';
        sortMenu.style.top = Math.min(rect.bottom + 10, window.innerHeight - sortMenu.offsetHeight - 16) + 'px';
    }

    function openSortMenu(trigger) {
        sortTrigger = trigger;
        if (!sortMenu) {
            sortMenu = document.createElement('div');
            sortMenu.className = 'jqSortMenu';
            sortMenu.hidden = true;
            sortMenu.setAttribute('role', 'menu');
            document.body.appendChild(sortMenu);
        }
        sortMenu.innerHTML = '';
        var current = trigger.getAttribute('data-current-sort') || trigger.getAttribute('data-sort-options').split(':')[0];
        trigger.getAttribute('data-sort-options').split('|').forEach(function (definition) {
            var separator = definition.indexOf(':');
            var key = definition.slice(0, separator);
            var label = definition.slice(separator + 1);
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'jqSortOption';
            option.textContent = label;
            option.setAttribute('role', 'menuitemradio');
            option.setAttribute('aria-checked', key === current ? 'true' : 'false');
            option.classList.toggle('is-selected', key === current);
            option.addEventListener('click', function () {
                applySort(key, label);
                closeSortMenu();
            });
            sortMenu.appendChild(option);
        });
        sortMenu.hidden = false;
        positionSortMenu();
        focusElement(sortMenu.querySelector('.is-selected') || sortMenu.firstElementChild);
    }

    visibleElements('.tabs span').forEach(function (tab) {
        tab.setAttribute('role', 'button');
        tab.setAttribute('tabindex', '-1');
    });

    document.addEventListener('keydown', function (event) {
        var actionButtons = actionSurface && !actionSurface.hidden
            ? Array.prototype.slice.call(actionSurface.querySelectorAll('.jqActionSheetButton'))
            : [];
        var actionIndex = actionButtons.indexOf(document.activeElement);
        if (actionSurface && !actionSurface.hidden && [37, 38, 39, 40].indexOf(event.keyCode) !== -1) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if ((event.keyCode === 38 || event.keyCode === 40) && actionIndex !== -1 && actionButtons.length > 1) {
                actionIndex = event.keyCode === 38
                    ? (actionIndex - 1 + actionButtons.length) % actionButtons.length
                    : (actionIndex + 1) % actionButtons.length;
                focusElement(actionButtons[actionIndex], event.keyCode, document.activeElement);
            } else if (event.keyCode === 37) {
                if (actionSurfaceBack) {
                    var actionBack = actionSurfaceBack;
                    actionSurfaceBack = null;
                    actionBack();
                } else {
                    closeActionSurface();
                }
            }
            return;
        }
        var sortOptions = sortMenu && !sortMenu.hidden
            ? Array.prototype.slice.call(sortMenu.querySelectorAll('.jqSortOption'))
            : [];
        var sortIndex = sortOptions.indexOf(document.activeElement);
        if (sortIndex !== -1 && (event.keyCode === 38 || event.keyCode === 40)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            sortIndex = event.keyCode === 38
                ? (sortIndex - 1 + sortOptions.length) % sortOptions.length
                : (sortIndex + 1) % sortOptions.length;
            focusElement(sortOptions[sortIndex], event.keyCode, document.activeElement);
            return;
        }
        if ([37, 38, 39, 40].indexOf(event.keyCode) !== -1) {
            event.preventDefault();
            event.stopImmediatePropagation();
            moveFocus(event.keyCode);
        } else if (event.keyCode === 10009 || event.keyCode === 8 || event.keyCode === 27) {
            event.preventDefault();
            if (actionSurface && !actionSurface.hidden && actionSurfaceBack) {
                var back = actionSurfaceBack;
                actionSurfaceBack = null;
                back();
                event.stopImmediatePropagation();
            } else if (closeActionSurface() || closeSortMenu()) {
                event.stopImmediatePropagation();
            } else if (document.querySelector('.jqSportsDetailWorkspace')) {
                window.location.href = 'jellyfin-sports-preview.html#/movies?topParentId=preview-sports';
            } else if (document.querySelector('.jqShowDetailWorkspace')) {
                window.location.href = 'jellyfin-shows-preview.html#/tv?topParentId=preview-shows';
            } else if (document.querySelector('.jqDetailWorkspace')) {
                window.location.href = 'jellyfin-movies-preview.html#/movies?topParentId=preview-movies';
            } else if (document.body.classList.contains('jqHomePreview')) {
                window.parent.postMessage({ type: 'jellyquest-preview-exit' }, window.location.origin);
            } else {
                window.location.href = 'jellyfin-profile-preview.html';
            }
        }
    }, true);

    document.addEventListener('click', function (event) {
        var filter = event.target.closest ? event.target.closest('.jqFilter') : null;
        var sort = event.target.closest ? event.target.closest('.jqSort') : null;
        var myListAction = event.target.closest ? event.target.closest('.jqMyListAction') : null;
        var playbackAction = event.target.closest ? event.target.closest('.jqPlaybackAction, .jqHighlightsAction') : null;
        var trailerAction = event.target.closest ? event.target.closest('.jqTrailerAction') : null;
        var moreAction = event.target.closest ? event.target.closest('.jqMoreAction') : null;
        var pageBack = event.target.closest ? event.target.closest('.jqPageBack') : null;
        var detailBack = event.target.closest ? event.target.closest('.jqDetailBack') : null;
        if (pageBack) {
            window.location.href = pageBack.getAttribute('data-page-return');
            return;
        }
        if (detailBack) {
            window.location.href = detailBack.getAttribute('data-detail-return');
            return;
        }
        if (myListAction) {
            togglePreviewMyList(myListAction);
            return;
        }
        if (playbackAction) {
            showPlaybackNotice(playbackAction, 'Playback', playbackAction.getAttribute('data-playback-label'));
            return;
        }
        if (trailerAction) {
            showPlaybackNotice(trailerAction, 'Trailer', 'Starting the available trailer: ' + trailerAction.getAttribute('data-trailer-url'));
            return;
        }
        if (moreAction) {
            openMoreMenu(moreAction);
            return;
        }
        if (filter) {
            document.querySelectorAll('.jqFilter').forEach(function (button) {
                button.classList.toggle('active', button === filter);
            });
        }
        if (sort) openSortMenu(sort);
    });

    visibleElements('.jqMovieCard, .jqSportCard').forEach(function (card, index) {
        card.setAttribute('data-original-index', String(index));
    });
    visibleElements('.tabs span').forEach(function (tab) {
        tab.addEventListener('click', function () {
            var destination = {
                Home: 'jellyfin-profile-preview.html',
                Requests: 'jellyseerr-login.html?preview=1'
            }[tab.textContent.trim()];
            if (destination) window.location.href = destination;
        });
    });
    initializeConditionalActions();
    updatePreviewMyList();
    window.addEventListener('resize', positionSortMenu);
})();
