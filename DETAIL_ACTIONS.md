# JellyQuest detail actions

JellyQuest keeps Jellyfin as the playback authority. The TV UI exposes these actions only when the current item supports them:

| Action | Movies and recorded sports | Shows |
| --- | --- | --- |
| Resume | Plays the item at `UserData.PlaybackPositionTicks` when progress exists. | Resumes the most recently played in-progress episode at its saved position. |
| Continue | Not applicable. | Plays the episode immediately after the in-progress episode, or Jellyfin's Next Up episode when nothing is in progress. |
| Start Over / Restart Episode | Plays the same item at tick `0`. | Plays the in-progress episode at tick `0`. |
| Trailer | Uses Jellyfin's native trailer player. | Same behavior. |
| Highlights | Plays a separate matching special-feature item. | Not shown unless a matching feature happens to exist. |
| My List | Toggles the current Jellyfin user's Favorite state. | Same behavior. |
| More | Opens Audio, Subtitle, and conditional Version choices for this item. | Uses track identity from the primary episode and maps it to the actual Resume, Restart, or Continue episode. |

## Trailers

Jellyfin's detail controller exposes Trailer only when the item has `LocalTrailerCount` or one or more `RemoteTrailers`, and the active player advertises `PlayTrailers`. Local trailers are requested with `getLocalTrailers`; remote entries are passed to Jellyfin's playback manager as URL-backed trailer items. JellyQuest preserves that behavior and does not display a trailer action for an item without a trailer URL or local trailer.

## Sports highlights

Jellyfin does not define a sports-highlight media type or generate a condensed game. Its media-segment API recognizes only Intro, Outro, Recap, Preview, Commercial, and Unknown segments. Chapters can jump into the full recording, but they do not define a bounded highlight reel.

JellyQuest therefore treats highlights as real media. It requests the event's Jellyfin special features and shows Highlights only when a playable feature name contains `Highlight`, `Highlights`, `Condensed Game`, or `Game Recap`. Selecting it plays that feature from the beginning. If no matching feature is indexed, the action remains hidden.

## More menu

JellyQuest replaces Jellyfin's general item-management overflow with focused playback options. Audio appears only when more than one track is available. Subtitles appears when at least one subtitle exists and always includes Off. Version appears only for items with multiple media sources. When none of those choices is configurable, More is hidden.

Movies and recorded sports update Jellyfin's native hidden track selectors, so Resume and Start Over continue through Jellyfin's normal playback path. Series do not have streams of their own. JellyQuest therefore resolves the primary episode, stores choices by track identity rather than stream number, and maps those choices to the specific episode behind Resume, Restart Episode, or Continue. If an episode lacks the selected track, Jellyfin's default for that episode is used.

Queue controls, media information, downloads, deletion, and metadata administration are intentionally excluded from the household TV surface.
