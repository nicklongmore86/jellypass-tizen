# JellyPass for Tizen

JellyPass for Tizen is a household-scoped Samsung TV client built from the official [Jellyfin Tizen](https://github.com/jellyfin/jellyfin-tizen) wrapper and [Jellyfin Web](https://github.com/jellyfin/jellyfin-web).

The first build targets the Farmhouse household at `https://jelly-farmhouse.starrgroup.io`. It locks the client to that server, removes multi-server navigation, and suppresses Quick Connect, manual login, and password-recovery actions before Jellyfin Web renders.

This repository remains a GitHub fork of `jellyfin/jellyfin-tizen` so upstream wrapper changes can be merged. JellyPass-specific behavior is intentionally kept in a small set of files:

- `jellypass.config.json` defines the non-secret household server.
- `jellypass.css` and `jellypass.js` enforce the household login surface in the packaged client.
- `scripts/configure-jellypass.mjs` locks the generated Jellyfin Web configuration to the household server.
- `scripts/build.sh` checks out the pinned Jellyfin Web revision and produces the unsigned Tizen application tree.

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
tizen install -n JellyPass.wgt -t YOUR_TV_TARGET
```

The upstream application/package identifier is currently retained so a WGT signed with the same Samsung certificate can update the existing sideloaded Jellyfin installation. Change it only when a side-by-side installation is explicitly required.

## Authentication roadmap

This first build changes discovery and login presentation only. It does not embed a Jellyfin API key or permanent household credential. Passwordless household SSO will use one-time device enrollment and a revocable JellyPass-issued device credential in a later phase.

## License and attribution

JellyPass for Tizen is an independent downstream project and is not affiliated with or endorsed by the Jellyfin project. It is distributed under the GNU General Public License v2.0, consistent with the upstream Tizen client. See `LICENSE`.
