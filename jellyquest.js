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
    var myListLoading = false;
    var myListRefreshTimer;
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
            var section = document.querySelector('.jellyquestMyListSection');
            if (section) {
                section.removeAttribute('data-jellyquest-userid');
            }
            ensureMyListRow(true);
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
        ensureMyListRow();
        labelMyListButtons();
        ensureDetailActions();
        new MutationObserver(function () {
            enforceHouseholdLogin();
            ensureRequestsTab();
            ensureProfileSwitcher();
            ensureLibraryRail();
            ensureMyListRow();
            labelMyListButtons();
            ensureDetailActions();
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
    window.addEventListener('keydown', handlePlaybackOptionsKeys, true);
    window.addEventListener('resize', positionProfileSwitcher);
    window.addEventListener('resize', positionLibraryRail);
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
                && !profileSwitcherTrigger.contains(event.target)) {
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
        ensureRequestsTab();
        ensureMyListRow();
        ensureDetailActions();
    });
    window.addEventListener('hashchange', updateLibraryRailSelection);
    window.addEventListener('viewshow', function () {
        enforceHouseholdLogin();
        ensureRequestsTab();
        ensureMyListRow();
        labelMyListButtons();
        ensureDetailActions();
    });
    console.info('[JellyQuest] Farmhouse household policy loaded');
})();
