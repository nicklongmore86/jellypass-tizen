(function () {
    'use strict';

    var workspaceSelector = '.jqFilter, .jqSort, .jqMovieCard, .jqAction, .jqCollectionCard, .jqSeasonSelect, .jqEpisodeCard, .jqSportCard, .jqChapterCard';
    var headerSelector = '.pageTitleWithDefaultLogo, .tabs span';
    var sortMenu = null;
    var sortTrigger = null;

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
                target = headerIndex === 0 ? rail[0] : nearestByAxis(current, workspace.slice(), 'x');
            }
        } else if (railIndex !== -1) {
            if (keyCode === 38) target = railIndex > 0 ? rail[railIndex - 1] : headers[0];
            if (keyCode === 40 && railIndex < rail.length - 1) target = rail[railIndex + 1];
            if (keyCode === 39) target = nearestByAxis(current, workspace.slice(), 'y');
        } else if (inWorkspace) {
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
                    target = column < 3 ? headers[1]
                        : column === 3 ? headers[2]
                            : column === 4 ? headers[3]
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
            if (closeSortMenu()) {
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
                Favorites: 'jellyfin-favorites-preview.html#/favorites',
                Requests: 'jellyseerr-login.html?preview=1'
            }[tab.textContent.trim()];
            if (destination) window.location.href = destination;
        });
    });
    window.addEventListener('resize', positionSortMenu);
})();
