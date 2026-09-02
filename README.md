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
- `scripts/configure-jellyquest.mjs` locks the generated Jellyfin Web configuration to the household server.
- `scripts/build.sh` checks out the pinned Jellyfin Web revision and produces the unsigned Tizen application tree.

After a household user signs in, **Requests** appears beside **Home** and **Favorites** in the visible top navigation and remains available in the navigation drawer. JellyQuest passes the current Jellyfin profile name and ID to a same-origin bootstrap page using a URL fragment, which is not sent in the HTTP request or NPM access logs. The bootstrap authenticates the passwordless profile through Jellyseerr's Jellyfin login endpoint, verifies the returned Jellyfin ID, and opens Jellyseerr with a persistent return toolbar. Jellyseerr continues to own discovery, request creation, approvals, and request history. The Tizen package contains no Jellyseerr API key.

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

Install with Developer Mode and the Tizen CLI:

```sh
tizen install -n JellyQuest.wgt -t YOUR_TV_TARGET
```

JellyQuest uses its own `JellyQuest.JellyQuest` application identity. It installs as a fresh application rather than updating Jellyfin or the earlier JellyPass-branded client.

## Authentication roadmap

This first build changes discovery and login presentation only. It does not embed a Jellyfin API key, Jellyseerr API key, or permanent household credential. Passwordless household SSO will use one-time device enrollment and a revocable JellyPass-issued device credential in a later phase.

## License and attribution

JellyQuest for Tizen is an independent downstream project and is not affiliated with or endorsed by the Jellyfin or Jellyseerr projects. It is distributed under the GNU General Public License v2.0, consistent with the upstream Tizen client. See `LICENSE`.
