# JellyQuest for Tizen

JellyQuest is a profile-centric, Netflix-style overlay for Samsung Tizen TVs, built on top of [Jellyfin Web](https://github.com/jellyfin/jellyfin-web) and packaged with the official [Jellyfin Tizen](https://github.com/jellyfin/jellyfin-tizen) wrapper. It replaces jellyfin-web's own account/login-centric UI with a profile picker and a small set of TV-native screens (Home, Search, Library, Detail/playback, Requests), and it adds Jellyseerr request/claim support through a companion server, [JellyPass](https://github.com/nicklongmore86/jellypass).

This build is a **blank-canvas rebuild**: the Tizen packaging pipeline (checkout, patch, build, sign, sideload) is the original `jellyfin-tizen` fork's plumbing, kept as-is because it was already solid, but the TV-facing UI overlay was deleted and rebuilt from scratch as a small set of modular, tested files under `src/overlay/`, replacing one large hand-rolled 4,300-line file. See `docs/rebuild-plan.md` for the full history and reasoning if you're picking this project back up after a break.

## Current status

The blank-canvas rebuild is merged into `master` and confirmed working on
real hardware. Two things to know before you build it:

- **One open bug.** On a real TV, D-pad Right along the profile row is
  reported to reach only every other card. It does not reproduce in the
  simulator or under Playwright, for structural reasons explained in
  `docs/rebuild-plan.md`.
- **A temporary diagnostic is compiled into every build.**
  `src/overlay/keydown-diagnostics.js` draws a yellow panel in the
  top-right corner of the TV showing what each keypress does. It is
  read-only and cannot affect navigation, but it is not shippable —
  delete it and its entry in `scripts/build-overlay.mjs` once the bug is
  understood.

`docs/rebuild-plan.md`'s "Where this stands, and the path from here"
section has the ordered next steps.

The responsibilities stay deliberately separated:

- **JellyQuest** (this repo) owns the Samsung TV experience — profile picker, browsing, playback, and requesting.
- **Jellyfin** remains the streaming server and player; JellyQuest talks to it through the standard `ApiClient`/`playbackManager` jellyfin-web already provides.
- **Jellyseerr** remains the request application and request system of record.
- **JellyPass** bridges the two: it grants per-user Jellyfin library access based on Jellyseerr requests, and exposes the small HTTP surface (`/jellyquest-bridge/*`) this overlay's Requests screen talks to. It also fronts household-scoped Jellyfin logins for JellyQuest's passwordless profile switching (see below).

## Architecture

### Module layout

The overlay lives entirely under `src/overlay/`, one file per concern:

- `focus.js` / `focus.css` — the one shared spatial-navigation layer every screen builds on (see below). No other file in this repo implements its own D-pad focus logic — though jellyfin-web's own does exist underneath on real hardware, which matters; see "Focus and D-pad navigation" below.
- `session.js` — the passwordless profile-switch primitive.
- `cards.js` — the shared media-card renderer (Home, Library, Search).
- `requests-bridge.js` — the low-level client for JellyPass's request bridge.
- `shell.js` — the persistent rail (Profile/Home/Search/Requests) and the content slot beneath it.
- `screens/profiles.js`, `screens/home.js`, `screens/library.js`, `screens/search.js`, `screens/detail.js`, `screens/requests.js` — one screen each.
- `app.js` — the bootstrap and router. Creates JellyQuest's own full-viewport root container and switches which screen renders into the shell's content slot; also owns the hardware Back button.

There are no native ES modules and no bundler: the oldest Tizen hardware this project targets (Tizen 5.0 / Chromium M63 — see [Target hardware](#target-hardware)) ships a Chromium old enough that native `<script type="module">` support in the TV web runtime cannot be relied on, so `scripts/build-overlay.mjs` just concatenates these files, in an explicit fixed order, into the two files `gulpfile.babel.js` actually injects into jellyfin-web's built `index.html`: `jellyquest.js` and `jellyquest.css`. Those two generated files are committed to the repo (packaging needs them present at the project root) — **always run `npm run build:overlay` after editing anything under `src/overlay/`** and commit the result; `test/configuration.test.mjs` has a drift check that fails if you forget.

JellyQuest creates its own `#jellyquest-root` container and owns the whole visible TV surface — it doesn't try to coexist visually with jellyfin-web's own rendered UI underneath it.

### Target hardware

Two Samsung TVs, both measured directly over `sdb` + the on-device Chrome
DevTools inspector (not inferred from vendor tables):

| Set | Model | Tizen | Engine | `sdb capability` |
| --- | --- | --- | --- | --- |
| Older — the compatibility floor | `UN55RU7100FXZA` (2019) | 5.0 | `Chrome/63.0.3239.0` | `platform_version:5.0` |
| Living room | `UN65TU7000FXZA` (2020) | 5.5 | `69.0.3497.106` | `platform_version:5.5` |

**Tizen 5.0 / Chromium M63 is the floor.** Anything that must work on both
sets has to work on M63.

> Earlier revisions of this document claimed a floor of "Tizen 4.6 (Chromium
> ~M56-63)". That was wrong: Samsung has never shipped a TV platform called
> Tizen 4.6 — the TV series runs 4.0 (2018), 5.0 (2019), 5.5 (2020), 6.0
> (2021), 6.5 (2022). The number came from **Tizen Studio 4.6**, the *SDK*
> version required for packaging and signing, which is unrelated to the TV
> platform version. References to Tizen Studio 4.6 elsewhere in this README
> and in `docs/build-package-deploy.md` are correct and intentionally
> unchanged.

Measured feature support on the two sets, for the properties this codebase
actually depends on:

| Feature | Tizen 5.0 / M63 | Tizen 5.5 / M69 |
| --- | --- | --- |
| Flex `gap` — **measured pixels** | **0** (broken) | **0** (broken) |
| Flex `gap` — `CSS.supports()` says | `false` | **`true`** ⚠️ |
| Grid `gap` (unprefixed) — measured px | **0** (broken) | 20 (works) |
| Grid `grid-gap` (legacy) — measured px | 20 (works) | 20 (works) |
| `display: grid` | works | works |
| `inset` shorthand | unsupported | unsupported |
| `Object.entries`, `Promise.prototype.finally` | present | present |
| Optional catch binding `try{}catch{}` | **`SyntaxError`** | parses |

Three consequences worth internalising before changing any layout code:

1. **Never feature-detect flex `gap` with `CSS.supports()`.** On M69 the
   property parses and computes to `20px 20px` — `CSS.supports('gap','20px')`
   returns `true` — and then flex layout ignores it entirely, because flex
   `gap` only shipped in Chromium 84. The detect returns `false` on the 2019
   set and `true` on the 2020 set, while the layout is broken on *both*. A
   `CSS.supports` guard would therefore look correct when tested on the older
   TV and silently regress on the newer one. Only measuring actual geometry
   (`next.getBoundingClientRect().left - prev.getBoundingClientRect().right`)
   detects this. Flex spacing is done with sibling margins for this reason —
   do not "modernise" it back to `gap`.
2. **Grid spacing must use the legacy `grid-gap` spelling.** Unprefixed `gap`
   in grid context needs M66; on the 2019 set it measures 0px.
3. **The ES5 constraint on `src/overlay/` is not merely stylistic.** Optional
   catch binding needs M66 and throws a `SyntaxError` on the 2019 set while
   parsing fine on the 2020 one — a crash on exactly one of the two TVs. Note
   that arrow functions, `const` and template literals *are* supported on both;
   if the ES5 rule is ever relaxed, optional catch binding must stay banned.

### Focus and D-pad navigation

Spatial navigation is handled by the vendored, MIT-licensed [`spatial-navigation-polyfill`](https://github.com/WICG/spatial-navigation) (the standards-track implementation browser vendors are converging on), not hand-rolled DOM-geometry code. `focus.js`/`focus.css` define the small set of conventions every screen uses on top of it:

| Class | Use |
| --- | --- |
| `.jq-rail`, `.jq-row` | Plain directional containers (default geometry-based traversal) |
| `.jq-grid` | Uniform card grids — use 'grid' mode so Up/Down move by row. Only use this when a column count matches what full rows actually render; a column count no row ever fills confuses row/column math (see `docs/rebuild-plan.md`'s Phase 2/3 notes) |
| `.jq-modal` | Overlays (e.g. Detail's Playback Options) — focus is trapped inside while open |
| `[data-jq-autofocus]` | Marks the element a screen should focus first |

**On device, JellyQuest is not the only thing listening to arrow keys.**
Nothing *in this repo* implements its own D-pad geometry — but
`gulpfile.babel.js` injects the overlay into jellyfin-web's own
`index.html`, and jellyfin-web ships its own `keyboardnavigation` →
`inputManager` → `focusManager` navigation whose arrow-key branch is
gated on its `browser.tv` detection: live on a television, dormant in
desktop Chromium and therefore absent from the simulator and the
Playwright suite. Both systems guard on `!event.defaultPrevented` and
both call `preventDefault()`, so ordinarily whichever runs first wins.
This is the leading explanation for the open navigation bug above, and
anything touching focus should assume both systems are present on real
hardware.

The hardware remote's Back button (Tizen keyCode `10009`; `27`/Escape doubles as Back in the desktop simulator) is handled separately in `app.js`: every screen but Home registers a "return to where I came from" handler, and an open modal's own close handler takes precedence over it (`focus.js`'s `closeOnBack()`).

### Profiles: instant, passwordless switching

Stock jellyfin-web is account/login-centric — switching users means a full sign-out/sign-in. JellyQuest's household accounts are intentionally passwordless (only the admin account has a real password), so `session.js`'s `switchProfile(user)` is the one place that calls Jellyfin's `AuthenticateByName` with a blank password and swaps the active `ApiClient` user in place — no page navigation, no visible login form. The profile picker is the true landing screen.

**This depends on JellyPass's household-gateway hardening**: `AuthenticateByName` is scoped so a login can only succeed as a member of *that* household, which is exactly the code path this switch mechanism calls. Without it, a passwordless profile-switch endpoint would let anyone on one household's client authenticate as a user from a different household. See JellyPass's `src/household-gateway.ts`.

### Requests

`requests-bridge.js` talks to JellyPass's `/jellyquest-bridge/*` endpoints through a hidden iframe and `postMessage`, with an origin check and a random nonce per session — the same security pattern used for eligibility checks. It never touches a Jellyseerr API key directly; JellyPass holds that.

`screens/requests.js` (movie-only in this pass — TV/season selection is explicit follow-up, not silently missing) searches Jellyseerr and shows one of three states per title, driven by Jellyseerr's own `mediaInfo.status`:

1. **No request yet** — a "Request" button (`POST /api/v1/request`).
2. **Requested** (pending/processing) — a plain "Requested" label, no action. This is intentionally not attributed to a person, and it does not distinguish "you requested this" from "someone else in your household requested this" — see the household-visibility note below.
3. **Available** — JellyPass's own claim state (`GET /jellyquest/access`) decides between "Add to My Library" (`POST /jellyquest/access`, which grants this profile access) and, once claimed, a plain "In My Library" label.

**Household visibility, by design**: a title requested by one household member shows as "Requested" to every other member of the same household, with no name attached. A *different* household can independently request or claim the exact same title with no visibility into the first household's request — JellyPass tracks claims per Jellyfin user, not per household. The actual security boundary in this system is authentication (which household a login can succeed for), which the household-gateway hardening above already owns; scoping media claims/requests to a household as well was tried and deliberately reverted — it added complexity without serving a real requirement.

## Configuration

Everything deployment-specific lives in `jellyquest.config.json` at the project root — nothing under `src/overlay/` has a hardcoded server, household name, or bridge URL:

```json
{
  "household": "farmhouse",
  "productName": "JellyQuest Farmhouse",
  "serverUrl": "https://your-jellyfin-host.example",
  "requestsUrl": "https://your-jellyseerr-host.example",
  "requestsBridgeUrl": "https://your-jellyfin-host.example/jellyquest-bridge/bridge.html",
  "requestsPageVersion": "1.0.0"
}
```

`scripts/configure-jellyquest.mjs` validates this (fails closed on a malformed URL, a bridge URL not on the server's own origin, etc.), writes it into jellyfin-web's generated `config.json`, and emits `jellyquest-build.json` next to the built `index.html` — the one file `app.js` fetches at runtime (`loadConfiguration()`) to learn `requestsBridgeUrl`. `requestsBridgeUrl` must point at JellyPass's `/jellyquest-bridge/bridge.html` on the same origin as `serverUrl`; enable the bridge on the JellyPass side per its own README (`JELLYQUEST_BRIDGE_ENABLED=true`, etc.).

## Dev loop

The primary feedback loop is **not** a physical TV — it's a faithful browser simulator driven headlessly by Playwright, so focus/navigation regressions are caught in seconds, not TV-reboot cycles.

```sh
npm run test:e2e   # Playwright suite against dev/simulator.html, headless
npm test           # config/plumbing tests (drift-checks jellyquest.js/.css too)
npm run preview:tv # serves dev/simulator.html at http://127.0.0.1:8090 for manual poking
```

`dev/simulator.html` loads fake `tizen`/`webapis` globals, a fake `ApiClient` with representative profile/library data, a fake `playbackManager`, and a fake Requests bridge (`dev/fixtures/`) — then loads the real, generated `jellyquest.js`/`jellyquest.css` unmodified. Screens built against the fakes work unmodified against the real Jellyfin `ApiClient` and JellyPass bridge once packaged. Extend `dev/fixtures/*` as new screens need more of the API surface; add a new `test/e2e/*.spec.mjs` alongside any new screen rather than after.

Open `npm run preview:tv`'s printed URL at a 1920×1080 viewport to match the TV's target resolution; keyboard arrows/Enter and Escape (standing in for the hardware Back button) exercise the same D-pad code the real remote will.

## Build, package, and install

See [`docs/build-package-deploy.md`](docs/build-package-deploy.md) for the
complete, verified runbook used by this repository, including the Docker-based
Tizen Studio environment, signing, artifact checks, Living Room TV settings,
deployment verification, and troubleshooting.

Requirements:

- Node.js 20 or newer (the build pins npm 10 for Jellyfin Web compatibility)
- Git
- Tizen Studio 4.6 or newer with the Samsung TV extensions, for packaging/signing
- A Samsung author/distributor certificate for each target television

Build the pinned Jellyfin Web revision (checked out fresh via `git clone`, not an npm dependency), apply JellyQuest's two narrow patches, build the overlay, and prepare `www/`:

```sh
npm run build:full
```

(`npm run build` alone assumes a jellyfin-web checkout is already in place under `JELLYFIN_WEB_DIR`; `build:full` is the real entry point for a from-scratch build. A bare `npm install` will *not* produce a working `www/` — jellyfin-web is fetched by `scripts/build.sh`, not installed as a package.)

Package with the certificate profile currently selected in Tizen Studio:

```sh
npm run package:wgt
```

On the current build host, Tizen Studio is supplied by
`ghcr.io/georift/install-jellyfin-tizen:latest` rather than installed on the
host `PATH`. Use the Docker packaging command in the runbook instead of the
command above on that host.

The WGT is written to `artifacts/`. Certificate profiles, private keys, device DUIDs, WGT artifacts, and local build caches must never be committed.

Install through the repeatable Docker/SDB workflow:

```sh
npm run install:tv -- YOUR_TV_IP
```

The installer connects to the TV on port 26101, removes only an existing `JellyQuest.JellyQuest` package, transfers the signed WGT, calls Samsung's `vd_appinstall` directly, verifies the installed version, and launches it — avoiding the older Tizen CLI manifest-parser failure seen on some Samsung TVs. JellyQuest uses its own `JellyQuest.JellyQuest` application identity; it installs as a fresh application rather than updating Jellyfin or an earlier client.

## Reusing this for a different deployment

This project was built for one household but designed to be reusable:

1. Fork or clone the repo.
2. Fill in your own `jellyquest.config.json` (see Configuration above) — no code changes needed for a standard deployment.
3. Stand up JellyPass pointed at your own Jellyfin and Jellyseerr, and enable its request bridge.
4. Run the dev loop (`npm run test:e2e`, `npm run preview:tv`) against your own fixture data or, once configured, the real bridge, before touching hardware.
5. `npm run build:full && npm run package:wgt && npm run install:tv -- YOUR_TV_IP`.

If a screen needs org-specific behavior beyond what `jellyquest.config.json` already covers, that's a sign it belongs as a new config key, not a hardcoded value in `src/overlay/`.

## License and attribution

JellyQuest for Tizen is an independent downstream project and is not affiliated with or endorsed by the Jellyfin or Jellyseerr projects. It is distributed under the GNU General Public License v2.0, consistent with the upstream Tizen client. See `LICENSE`.
