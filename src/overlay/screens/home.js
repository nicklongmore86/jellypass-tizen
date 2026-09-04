// Home screen: Continue Watching + Recently Added rows. Real screen
// content replacing the Phase 2 placeholder ("Home -- Phase 3").
(function () {
    'use strict';

    // callbacks: { onSelectItem(item), onSeeAll(row) } where row is
    // { title, fetch: () => Promise<{Items}> } for the Library screen.
    function renderHome(container, callbacks) {
        container.innerHTML = '';
        container.className = 'jq-home-screen';

        var userId = window.ApiClient.getCurrentUserId();
        var rows = [
            {
                title: 'Continue Watching',
                fetch: function () { return window.ApiClient.getItems(userId, { Filters: 'IsResumable' }); },
                seeAll: false,
            },
            {
                title: 'Recently Added',
                fetch: function () { return window.ApiClient.getItems(userId, { SortBy: 'DateCreated', Limit: 8 }); },
                seeAll: true,
            },
        ];

        var firstCard = null;
        var pending = rows.map(function (row) {
            return row.fetch().then(function (result) {
                if (!result.Items.length) return;
                var section = renderRow(row, result.Items, callbacks);
                container.appendChild(section);
                if (!firstCard) firstCard = section.querySelector('.jq-focusable');
            });
        });

        Promise.all(pending).then(function () {
            if (!container.children.length) {
                var empty = document.createElement('p');
                empty.className = 'jq-home-empty';
                empty.textContent = 'Nothing here yet.';
                container.appendChild(empty);
            }
            if (firstCard) firstCard.setAttribute('data-jq-autofocus', '');
            window.JellyQuestFocus.focusFirst(container);
        });
    }

    function renderRow(row, items, callbacks) {
        var section = document.createElement('section');
        section.className = 'jq-home-row-section';

        var heading = document.createElement('h2');
        heading.className = 'jq-home-row-heading';
        heading.textContent = row.title;
        section.appendChild(heading);

        var rowEl = document.createElement('div');
        rowEl.className = 'jq-row jq-home-row';
        items.forEach(function (item) {
            rowEl.appendChild(window.JellyQuestCards.createCard(item, {
                onSelect: function () { callbacks.onSelectItem(item); },
            }));
        });
        if (row.seeAll) {
            var seeAll = document.createElement('button');
            seeAll.className = 'jq-card jq-focusable jq-see-all';
            seeAll.textContent = 'See All';
            seeAll.addEventListener('click', function () { callbacks.onSeeAll(row); });
            rowEl.appendChild(seeAll);
        }
        section.appendChild(rowEl);
        return section;
    }

    window.JellyQuestHomeScreen = {
        render: renderHome
    };
})();
