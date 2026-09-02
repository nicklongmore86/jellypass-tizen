(function () {
    'use strict';

    var focusSelector = '.jellyquestRailItem, .jqFilter, .jqMovieCard, .jqAction, .jqCollectionCard, .jqSeasonSelect, .jqEpisodeCard, .jqSportCard, .jqChapterCard';

    function center(rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function isVisible(element) {
        var rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function moveFocus(keyCode) {
        var current = document.activeElement;
        var currentRect = current && current.getBoundingClientRect ? current.getBoundingClientRect() : null;
        if (!currentRect || !isVisible(current)) {
            return;
        }
        var origin = center(currentRect);
        var vertical = keyCode === 38 || keyCode === 40;
        var forward = keyCode === 39 || keyCode === 40;
        var candidates = Array.prototype.slice.call(document.querySelectorAll(focusSelector)).filter(function (candidate) {
            if (candidate === current || !isVisible(candidate)) return false;
            var point = center(candidate.getBoundingClientRect());
            var primary = vertical ? point.y - origin.y : point.x - origin.x;
            return forward ? primary > 4 : primary < -4;
        });
        candidates.sort(function (left, right) {
            function score(element) {
                var point = center(element.getBoundingClientRect());
                var primary = Math.abs(vertical ? point.y - origin.y : point.x - origin.x);
                var cross = Math.abs(vertical ? point.x - origin.x : point.y - origin.y);
                return primary + cross * 2.5;
            }
            return score(left) - score(right);
        });
        if (candidates[0]) {
            candidates[0].focus();
            candidates[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    document.addEventListener('keydown', function (event) {
        if ([37, 38, 39, 40].indexOf(event.keyCode) !== -1) {
            event.preventDefault();
            event.stopImmediatePropagation();
            moveFocus(event.keyCode);
        } else if (event.keyCode === 10009 || event.keyCode === 8 || event.keyCode === 27) {
            event.preventDefault();
            if (document.querySelector('.jqSportsDetailWorkspace')) {
                window.location.href = 'jellyfin-sports-preview.html#/movies?topParentId=preview-sports';
            } else if (document.querySelector('.jqShowDetailWorkspace')) {
                window.location.href = 'jellyfin-shows-preview.html#/tv?topParentId=preview-shows';
            } else if (document.querySelector('.jqDetailWorkspace')) {
                window.location.href = 'jellyfin-movies-preview.html#/movies?topParentId=preview-movies';
            } else {
                window.location.href = 'jellyfin-profile-preview.html';
            }
        }
    }, true);

    document.addEventListener('click', function (event) {
        var filter = event.target.closest ? event.target.closest('.jqFilter') : null;
        if (filter) {
            document.querySelectorAll('.jqFilter').forEach(function (button) {
                button.classList.toggle('active', button === filter);
            });
        }
    });
})();
