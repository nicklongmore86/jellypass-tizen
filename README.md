# JellyQuest for Tizen

JellyQuest is a household-scoped Samsung TV experience for streaming and requesting media. It is built from the official [Jellyfin Tizen](https://github.com/jellyfin/jellyfin-tizen) wrapper and [Jellyfin Web](https://github.com/jellyfin/jellyfin-web), with Jellyseerr integration planned as the request experience.

The first build targets the Farmhouse household at `https://jelly-farmhouse.starrgroup.io`. It locks the client to that server, removes multi-server navigation, and suppresses Quick Connect, manual login, and password-recovery actions before Jellyfin Web renders. Only the household's public Jellyfin profiles are presented by the JellyPass gateway.

The responsibilities stay deliberately separated:

- JellyQuest owns the Samsung TV experience for streaming and requesting.
- Jellyfin remains the streaming server and player.
- Jellyseerr remains the request application and request system of record.
- JellyPass remains the per-user visibility and tagging service.

This repository remains a GitHub fork of `jellyfin/jellyfin-tizen` so upstream wrapper changes can be merged. JellyQuest-specific behavior is intentionally kept in a small set of files:

- `jellyquest.config.json` defines the non-secret household server.
- `jellyquest.css` and `jellyquest.js` enforce the household login surface in the packaged client.
- `DETAIL_ACTIONS.md` documents playback, My List, trailers, highlights, and the focused Audio/Subtitle menu.
- `scripts/configure-jellyquest.mjs` locks the generated Jellyfin Web configuration to the household server.
- `scripts/build.sh` checks out the pinned Jellyfin Web revision, applies the narrow per-item playback-options patch, and produces the unsigned Tizen application tree.

After a household user signs in, **Requests** appears beside **Home** in the visible top navigation and remains available in the navigation drawer. Jellyfin Favorites are presented as a per-profile **My List** row on Home instead of a separate top-level screen. JellyQuest passes the current Jellyfin profile name and ID to a same-origin bootstrap page using a URL fragment, which is not sent in the HTTP request or NPM access logs. The bootstrap authenticates the passwordless profile through Jellyseerr's Jellyfin login endpoint, verifies the returned Jellyfin ID, and opens Jellyseerr with a persistent return toolbar. Jellyseerr continues to own discovery, request creation, approvals, and request history. The Tizen package contains no Jellyseerr API key.

Deploy `integration/jellyseerr-login.html` at `/jellyquest-login.html` on the configured Jellyseerr origin. It must be served from that origin so Jellyseerr can establish its HTTP-only session cookie.

The current Docker deployment mounts the versioned page read-only:

```yaml
volumes:
  - /opt/jellyquest-integration/jellyseerr-login.html:/app/public/jellyquest-login.html:ro
```

## Build

Requirements:

- Node.js 20 or newer (the build pins npm 10 for Jellyfin Web compatibility)
- Git
- Tizen Studio 4.6 or newer with the Samsung TV extensions
- A Samsung author/distributor certificate for each target television

Build the pinned Jellyfin Web 10.11.11 client and prepare `www/`:

```sh
npm run build:full
```

Package the prepared application with the certificate profile currently selected in Tizen Studio:

```sh
npm run package:wgt
```

The WGT is written to `artifacts/`. Certificate profiles, private keys, device DUIDs, WGT artifacts, and local build caches must never be committed.

Install through the repeatable Docker/SDB workflow:

```sh
npm run install:tv -- YOUR_TV_IP
```

The installer connects to the TV on port 26101, removes only an existing
`JellyQuest.JellyQuest` package, transfers the signed WGT, calls Samsung's
`vd_appinstall` directly, verifies the installed version, and launches it. This
avoids the older Tizen CLI manifest-parser failure seen on some Samsung TVs.

Preview the request interface at a fixed 1920×1080 Samsung TV viewport before
deploying it:

```sh
npm run preview:tv
```

Open the printed simulator URL. Only the static `integration/` preview assets
are served. Keyboard arrow/Enter keys and the on-screen
remote exercise the same D-pad focus code as the TV. Preview mode uses mock
media and never creates a Jellyseerr request. Use **Home** in the simulator
toolbar to exercise the injected profile and library navigation with mock
household profiles. **Movies** and **Movie Detail** provide TV-sized design
previews for the library grid and contextual collection treatment. **Shows**
and **Show Detail** preview series browsing, season selection, and episode
progress. **Sports** and **Event Detail** preview spoiler-safe event browsing,
resume actions, and game-chapter navigation.

JellyQuest uses its own `JellyQuest.JellyQuest` application identity. It installs as a fresh application rather than updating Jellyfin or the earlier JellyPass-branded client.

## Authentication roadmap

This first build changes discovery and login presentation only. It does not embed a Jellyfin API key, Jellyseerr API key, or permanent household credential. Passwordless household SSO will use one-time device enrollment and a revocable JellyPass-issued device credential in a later phase.

## License and attribution

JellyQuest for Tizen is an independent downstream project and is not affiliated with or endorsed by the Jellyfin or Jellyseerr projects. It is distributed under the GNU General Public License v2.0, consistent with the upstream Tizen client. See `LICENSE`.
