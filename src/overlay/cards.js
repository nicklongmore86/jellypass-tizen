// Shared media-card rendering, used by Home, Library, and Search --
// factored out once a second screen needed the same card shape, rather
// than speculatively up front.
(function () {
    'use strict';

    function createCard(item, options) {
        options = options || {};
        var card = document.createElement('button');
        card.className = 'jq-card jq-focusable jq-media-card';
        card.setAttribute('data-item-id', item.Id);

        var title = document.createElement('span');
        title.className = 'jq-media-card-title';
        title.textContent = item.Name;
        card.appendChild(title);

        if (item.ProductionYear) {
            var meta = document.createElement('small');
            meta.className = 'jq-media-card-meta';
            meta.textContent = String(item.ProductionYear);
            card.appendChild(meta);
        }

        var position = item.UserData && item.UserData.PlaybackPositionTicks;
        if (position && item.RunTimeTicks) {
            var progress = document.createElement('div');
            progress.className = 'jq-media-card-progress';
            var bar = document.createElement('div');
            bar.className = 'jq-media-card-progress-bar';
            var percent = Math.min(100, Math.round((position / item.RunTimeTicks) * 100));
            bar.style.width = percent + '%';
            progress.appendChild(bar);
            card.appendChild(progress);
        }

        if (options.onSelect) {
            card.addEventListener('click', function () { options.onSelect(item); });
        }
        return card;
    }

    window.JellyQuestCards = {
        createCard: createCard
    };
})();
