# Build, package, and deploy JellyQuest

This is the end-to-end runbook used to build JellyQuest from `master`, sign a
Samsung Tizen WGT, and deploy it to a television. Run all commands from the
repository root.

## Current deployment environment

- Repository: `/opt/dev/repos/jellyquest-tizen`
- Release branch: `master`
- Node.js: 20 or newer
- Pinned Jellyfin Web revision: `.jellyfin-web-ref`
- Tizen SDK image: `ghcr.io/georift/install-jellyfin-tizen:latest`
- Tizen Studio inside the image: `/tizen-studio`
- Tizen CLI inside the image: `/tizen-studio/tools/ide/bin/tizen`
- Active signing profile inside the image:
  `/home/developer/tizen-studio-data/profile/profiles.xml`
- Living Room TV: `10.172.40.93`
- Living Room TV application ID: `JellyQuest.JellyQuest`

The TV address is a private LAN address and can change if its DHCP reservation
changes. Confirm the address in the TV network settings before deployment if
SDB cannot connect.

## 1. Update `master`

The working tree must be clean before updating. Do not discard local changes
to force an update.

```sh
git status --short --branch
git fetch origin master
git checkout master
git pull --ff-only origin master
git log -1 --oneline --decorate
```

`--ff-only` prevents an unattended pull from creating a merge commit.

## 2. Build

```sh
npm run build:full
```

This is the correct clean-build entry point. `scripts/build.sh`:

1. Clones Jellyfin Web into `.cache/jellyfin-web` if needed. Jellyfin Web is
   not an npm dependency and must not be expected under
   `node_modules/jellyfin-web`.
2. Checks out the commit recorded in `.jellyfin-web-ref`.
3. Applies the narrowly scoped JellyQuest patches.
4. Installs Jellyfin Web dependencies with npm 10.9.4 and runs its production
   webpack build.
5. Installs this wrapper's locked dependencies, generates `jellyquest.js` and
   `jellyquest.css`, injects them into the built Jellyfin Web page, and writes
   the configured application to `www/`.
6. Runs `npm test`, including the generated-overlay drift check.

The expected final line begins with `Prepared` and identifies the pinned
Jellyfin Web commit. Webpack asset-size warnings and upstream dependency
deprecation warnings do not fail the build.

For UI and remote-navigation coverage, also run:

```sh
npm run test:e2e
```

## 3. Package and sign

### Current build host: Docker Tizen Studio

The host does not have `tizen` on its `PATH`. Package with the Tizen Studio and
active `dev` signing profile in the installer image:

```sh
docker run --rm \
  -v /opt/dev/repos/jellyquest-tizen:/project \
  -w /project \
  --entrypoint /bin/bash \
  ghcr.io/georift/install-jellyfin-tizen:latest \
  -lc 'bash scripts/package-wgt.sh'
```

The repository mount is intentionally writable because packaging replaces
`.buildResult/` and `artifacts/JellyQuest.wgt`.

The expected output includes all of the following:

```text
BUILD SUCCESSFUL
The active profile is used for signing.
Package File Location: /project/artifacts/JellyQuest.wgt
Packaged /project/artifacts/JellyQuest.wgt
```

### Workstation with Tizen Studio installed

If Tizen Studio 4.6 or newer, the Samsung TV extensions, and the correct
author/distributor certificate profile are installed locally, add
`tools/ide/bin` to `PATH` and run:

```sh
npm run package:wgt
```

### Verify the artifact

```sh
test -s artifacts/JellyQuest.wgt
unzip -p artifacts/JellyQuest.wgt config.xml \
  | sed -n 's/.*<widget[^>]*version="\([^"]*\)".*/version=\1/p'
sha256sum artifacts/JellyQuest.wgt
```

The signed archive contains `jellyquest.js` and `jellyquest.css` at its root.
The packaged `www/index.html` references them as `../jellyquest.js` and
`../jellyquest.css`, which resolves correctly from the `www/` directory.

Never commit `.cache/`, `.buildResult/`, certificates, private keys, device
DUIDs, or WGT artifacts.

## 4. Prepare the Samsung TV

The television and build host must be routable to each other.

1. On the TV, open **Apps** and enter `12345` on the remote.
2. Enable **Developer Mode**.
3. Set the developer-machine address to the build host's LAN address. The
   current build host uses `10.172.20.190`.
4. Restart the TV when Developer Mode requests it.
5. Confirm the TV is on and its current address is `10.172.40.93`.

SDB connects to the television on TCP port 26101. The transfer is unencrypted,
so deploy only over a trusted private network.

## 5. Deploy, verify, and launch

```sh
npm run install:tv -- 10.172.40.93
```

`scripts/install-tv.sh` starts the same Docker SDK image with host networking.
`scripts/install-wgt.sh` then:

1. Connects to `10.172.40.93:26101` with SDB.
2. Removes only an existing `JellyQuest.JellyQuest` installation.
3. Transfers `artifacts/JellyQuest.wgt` to the TV.
4. Installs it through Samsung's `vd_appinstall` command.
5. Reads the TV application registry and verifies both the application ID and
   version from the WGT manifest.
6. Launches JellyQuest.

A successful deployment ends with:

```text
JellyQuest <version> is installed, verified, and launched on 10.172.40.93.
```

## 6. Post-deployment checks

- Confirm JellyQuest opens on the TV rather than returning immediately to the
  Apps screen.
- Confirm the household profile picker renders.
- Exercise D-pad navigation, profile switching, Home, Search, Library, Detail,
  playback, Requests, and the Back key.
- Record the deployed Git commit and WGT SHA-256 in the deployment notes.
- Confirm the source tree remains clean:

```sh
git status --short --branch
git log -1 --oneline --decorate
```

## Troubleshooting

### `Tizen CLI was not found`

`npm run package:wgt` expects a host Tizen Studio installation. On the current
build host, use the Docker packaging command in step 3.

### `node_modules/jellyfin-web/dist` is missing

Do not run a bare `npm ci` as the clean-build workflow. Its `postinstall` does
not know where the separately cloned Jellyfin Web tree lives. Run
`npm run build:full`; it sets `JELLYFIN_WEB_DIR=.cache/jellyfin-web/dist` for
the wrapper build.

### The TV does not register as an SDB device

- Confirm the TV is powered on and still uses the expected IP address.
- Confirm Developer Mode is enabled and lists the correct developer-machine
  IP.
- Restart the TV after changing Developer Mode settings.
- Confirm routing/firewall access to TCP port 26101.

The Living Room TV previously changed from `10.172.40.89` to
`10.172.40.93`; do not assume a stale address is still valid.

### Packaging succeeds but installation fails

- Do not modify the WGT after signing it.
- Confirm the signing profile includes the target TV's distributor/DUID
  authorization.
- If automatic removal fails, delete JellyQuest from the TV's Apps screen and
  rerun the deployment command.

### Browser console and Web Inspector

Samsung TV system logs are not available through `sdb dlog`. Browser-console
output requires launching the application in debug mode from a full Tizen
Studio or Samsung Tizen TV VS Code environment. A plain SDB forward does not
create an inspector target for an application launched normally with
`debug 0`.
