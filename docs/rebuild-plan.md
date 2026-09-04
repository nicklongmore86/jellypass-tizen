# JellyQuest Tizen: blank-canvas rebuild of the overlay layer

Status as of this doc: **all phases (0 through 5) complete** on
`claude/code-audit-issues-rha2bz` -- the rebuild itself is done and
confirmed working on real hardware. A **follow-up navigation bug**
reported after that (see the end of the Phase 5 section) is under active
investigation: a first fix attempt (guessing a duplicate-keydown remote
glitch) was reverted before being committed, and real-device data has
since **disproved that theory outright** -- every keydown is single and
normally paced, so the remote is not sending two events per press. The
live hypothesis is now one event moving focus twice, because on device
(and never in the simulator) two independent arrow-key navigation
systems are live at once; a read-only diagnostic measuring exactly that
is in place waiting on a photo from the TV. **For the current state and
the ordered path from here, jump to "Where this stands, and the path
from here" below** — the phase-by-phase history in between is reference,
not the plan. This file is the handoff/plan doc for continuing from
a fresh session (local CLI or otherwise)
without needing the original conversation history.

**Correction, previously documented here as a real defect and now
confirmed not to be one:** running a bare `npm install` (or letting
something else trigger the `postinstall` hook without
`JELLYFIN_WEB_DIR` set) fails, because `npm run build`'s `gulp` step
defaults `WEB_DIR` to `node_modules/jellyfin-web/dist` -- which never
exists, since jellyfin-web isn't an npm dependency at all; it's fetched
by `scripts/build.sh` via `git clone` into `.cache/jellyfin-web`. The
correct entry point is `npm run build:full`, which sets
`JELLYFIN_WEB_DIR` correctly before running `npm ci`. Confirmed working
when invoked that way -- there is no missing-`dist/` defect in this
branch. (`npm run build:overlay`, the simulator, and `node --test` never
needed a real jellyfin-web build regardless, which is why this stayed
invisible for two phases.)

## Context

JellyQuest started as a fork of `jellyfin/jellyfin-tizen` (the official
Tizen wrapper for jellyfin-web), meant to become a Netflix-style,
profile-centric TV skin with Jellyseerr request support layered on top.
An architecture review of the pre-rebuild `jellyquest.js` (4,374 lines)
and `jellyquest.css` (1,937 lines) found that the **build/patch/install
pipeline was clean and disciplined** (two narrow, fail-fast patches to a
pinned jellyfin-web revision; a minimal gulp overlay that never touches
jellyfin-web's compiled bundle), but the **UI overlay itself had grown
very fast** (0 to 4,374 lines in 4 days / 26 commits) and showed real
accretion debt: zero comments across ~6,300 lines of JS/CSS, no module
boundaries (one flat IIFE with ~200 functions), and — most importantly —
a **hand-rolled, DOM-geometry-based focus/D-pad navigation system
duplicated independently in two places** (`jellyquest.js` and
`integration/jellyseerr-login.html`), which directly explained the long
tail of "fix/harden/stabilize navigation" commits in that history.

Given that, plus three requirements driving the rebuild:

1. **Profile-centric from the ground up** — stock jellyfin-tizen is
   account/login-centric, not profile-centric. The profile picker should
   be the real home screen, and switching profiles must be **instant with
   no re-auth** (Netflix-style), even though Jellyfin itself has no
   native "quick switch" feature (confirmed via research — Quick Connect
   and per-account login are the closest built-ins, neither instant).
   This has to be built by hand: since these accounts are passwordless by
   design, "switching" means calling Jellyfin's `AuthenticateByName` with
   a blank password for the target profile and swapping the active
   `ApiClient` session client-side, with no visible login screen.
   **This depends on the JellyPass household-gateway hardening done in a
   companion session on the `jellypass` repo** (scoping `AuthenticateByName`
   to only that household's own members, on branch
   `claude/code-audit-issues-rha2bz` there too) — that's the exact code
   path this profile-switch mechanism calls.
2. **Reusable by others** — no hardcoded, org-specific values in the
   shared overlay code. `jellyquest.config.json` +
   `scripts/configure-jellyquest.mjs` already do this reasonably well for
   server URLs and should be kept and extended, not reinvented.
3. **Minimize physical-TV test cycles** — the old dev loop
   (`npm run preview:tv`) was a manual, unassisted browser preview with
   no assertions. The rebuild needed an automated test harness
   (Playwright against a faithful browser simulator) catching focus/UI
   regressions before anything touches real hardware, built early rather
   than bolted on later.

The decision: **gut this same repo back to its reusable plumbing and
rebuild the overlay from scratch**, rather than continuing to patch the
old `jellyquest.js`/`jellyquest.css`/`integration/*`, and rather than
starting a new repo.

## What stayed vs. what was rebuilt

**Kept as-is (already solid, no rework needed):**
- `config.xml`, `.jellyfin-web-ref`, `LICENSE`
- `scripts/build.sh`, `scripts/patch-jellyfin-web.mjs` (the two narrow
  jellyfin-web patches)
- `scripts/package-wgt.sh`, `scripts/install-tv.sh`,
  `scripts/install-wgt.sh` (Tizen packaging + the
  `georift/install-jellyfin-tizen` Docker sideload/signing flow) — minor
  guard added in Phase 0 (see below), logic otherwise unchanged
- `jellyquest.config.json`, `scripts/configure-jellyquest.mjs` (the
  portable per-deployment config layer — already validates URLs, fails
  closed on malformed input)
- `gulpfile.babel.js` — the injection mechanism itself needed no change;
  `jellyquest.css`/`jellyquest.js` are still the two files it injects,
  just now generated rather than hand-written (see Phase 1)
- `tizen.js` (thin, upstream-derived platform shim; not part of the
  accretion problem)

**Deleted in Phase 0, rebuilt from scratch starting Phase 1:**
- `jellyquest.js`, `jellyquest.css` (now generated — see below)
- `integration/jellyseerr-login.html`,
  `integration/jellyfin-media-preview.{js,css}`,
  `integration/jellyfin-*-preview.html`, `integration/tv-simulator.html`
- `DETAIL_ACTIONS.md` — kept in place as the behavior spec for
  playback/detail actions (it's a good, precise spec); Phase 3 should
  turn its action matrix into literal Playwright test cases rather than
  re-deriving behavior from prose

**Rewritten in Phase 4:**
- `README.md` — describes the architecture as it stands after Phase 4
  (module layout, focus system, profile-switch model, Requests bridge,
  config layer, dev/test loop, build/package/install steps)

**Fixed in Phase 0 to keep the plumbing buildable during the interim
gutted state** (all still true, not follow-ups):
- `gulpfile.babel.js`'s `copyJellyQuestRequests` task now uses
  `{ allowEmpty: true }` so a missing Requests page doesn't fail the
  whole build.
- `scripts/package-wgt.sh` only copies `jellyseerr-login.html` into
  `www/` when it actually exists.
- `test/configuration.test.mjs` was pruned from ~600 lines of regex
  assertions pinned to the deleted overlay's exact content down to the
  tests that exercise still-live plumbing.

## Architecture principles for the rebuild

1. **Modular source, not one IIFE.** Source lives under `src/overlay/`
   as separate, named files — not one giant file. `scripts/build-overlay.mjs`
   concatenates them (explicit order, not glob order) into the committed
   `jellyquest.js`/`jellyquest.css`. **Decided in Phase 1: no native ES
   modules, no bundler** — the oldest Tizen this project targets (5.0,
   per README) ships Chromium M63. Native `<script type=module>` support
   landed in M61, so it is *nominally* present, but the Samsung TV web
   runtime loads the app from `file:///www/index.html`, where module
   loading is subject to additional origin restrictions. Plain
   concatenated scripts avoid that risk entirely with zero build
   complexity.

   > Corrected after direct device measurement: the floor is **Tizen 5.0
   > / Chromium M63** (`UN55RU7100FXZA`, 2019), not "Tizen 4.6 / ~M56-M63".
   > Samsung ships no TV platform numbered 4.6; that number is the *Tizen
   > Studio* SDK version. See the Target hardware table in the README.
2. **Spatial navigation: `spatial-navigation-polyfill` (MIT), not
   hand-rolled geometry code.** Done in Phase 1 — see below. Its license
   is compatible with this project's GPLv2 (unlike BBC's `lrud`,
   Apache-2.0, which the FSF considers GPLv2-incompatible), and its
   plain-IIFE ES2015 syntax runs unmodified on the Tizen 5.0 / M63 floor.
3. **One passwordless session-switch primitive.** *(Done in Phase 2 —
   `src/overlay/session.js`.)* A single `switchProfile(user)` function
   performs the blank-password `AuthenticateByName` call and swaps the
   active `ApiClient` user in place — no full page navigation, no
   visible login form. Every "profile" surface (picker, the shell's
   profile button) calls this one function.
4. **Requests/Jellyseerr as a real bounded module**, not an iframe bridge
   to a hand-duplicated standalone page. *(Done in Phase 4 —
   `src/overlay/requests-bridge.js` + `src/overlay/screens/requests.js`.)*
   Shares `src/overlay/focus.js` (the search input/results row uses the
   same `.jq-row` + debounce pattern as `screens/search.js`) instead of
   reimplementing focus handling independently the way the old
   `jellyseerr-login.html` did. The actual JellyPass backend bridge
   protocol (`/jellyquest-bridge/session`, `/eligibility`, `/proxy`) stays
   the transport — only the TV-side implementation was rebuilt.
5. **Zero hardcoded deployment values** anywhere under the new source
   tree — everything reachable only through `jellyquest.config.json` →
   `jellyquest-build.json`, matching the existing configure step's
   pattern.
6. **Comment the non-obvious.** Given the old build had zero comments
   across 6,300 lines, section headers per module and comments on the
   focus/session primitives (the trickiest parts) are part of "done,"
   not optional polish.

## Phased plan and status

**Phase 0 — Repo reset. DONE (`bffa773`).**
Deleted the old overlay files, fixed the two hard-fail dependencies on
them found by actually running the pipeline (see "Fixed in Phase 0"
above), pruned the config test suite. Verified `npx gulp` +
`npm run configure` run cleanly end-to-end against a stub jellyfin-web
build. `build:full` needed a real jellyfin-web clone this sandbox
didn't have, but has since been confirmed working elsewhere (see the
correction note at the top of this doc — use `npm run build:full`
itself, not a bare `npm install`). `package:wgt` still needs Tizen
Studio to verify, saved for Phase 5.

**Phase 1 — Dev-loop foundation. DONE (`a5078ab`).**
- `src/overlay/focus.js` + `focus.css`: JellyQuest's conventions on top
  of the polyfill — `.jq-rail`/`.jq-row` (plain containers, default
  'auto' geometry-based traversal), `.jq-grid` (uniform card grids, 'grid'
  mode for predictable row/column Up/Down instead of nearest-element
  snapping), `.jq-modal` ('contain' mode, focus-trapped dialogs, matching
  DETAIL_ACTIONS.md's "dialogs contain focus" rule), `[data-jq-autofocus]`.
- `scripts/build-overlay.mjs`: concatenates the vendored polyfill +
  `src/overlay/*.js` into `jellyquest.js`, `src/overlay/*.css` into
  `jellyquest.css`. Wired into `npm run build` as `build:overlay`.
  `jellyquest.js`/`jellyquest.css` are committed (packaging needs them at
  the project root) despite being generated — `test/configuration.test.mjs`
  has a drift check that regenerates them for real and fails on any diff,
  so editing `src/overlay/*` without re-running `npm run build:overlay`
  before committing gets caught.
- `dev/simulator.html` + `dev/fixtures/*`: fake `tizen`/`webapis` globals
  (the real `tizen.js` shim runs unmodified against them), a fake
  `ApiClient` with representative profile/library data
  (`dev/fixtures/api-client-stub.js` — extend this as real screens need
  more of the API surface), and a rail+row+grid+modal demo layout.
- `test/e2e/focus.spec.mjs`: Playwright driving the simulator headlessly.
  3/3 passing, stable across repeated runs. Covers all three navigation
  shapes: rail/row crossing, grid row/column traversal, modal focus
  containment. **Superseded in Phase 2** by `test/e2e/profile-shell.spec.mjs`
  once a real screen existed to exercise the same conventions against —
  removed rather than kept alongside it, to avoid maintaining a synthetic
  demo and its real replacement in parallel. Its modal/`.jq-modal`
  coverage lapsed with it; reintroduce an equivalent test in Phase 3 once
  a real dialog (Settings, Playback Options) exists.
- Two real bugs the harness caught immediately (both fixed, both in
  `dev/simulator.html`, not the polyfill): a `.jq-modal-backdrop {
  display: flex }` rule unconditionally beating the `hidden` attribute's
  UA default (author styles always win over UA defaults regardless of
  selector specificity — needed an explicit `.jq-modal-backdrop[hidden] {
  display: none }` override), and a hand-written Enter-to-click bridge
  that was redundant with native `<button>` Enter-activation and
  double-fired click handlers (removed — native buttons already do this).

**Phase 2 — Profile-centric shell. DONE.**
- `src/overlay/session.js`: `JellyQuestSession` — `listProfiles()` (thin
  wrapper on `ApiClient.getPublicUsers()`), `switchProfile(user)` (the
  blank-password `AuthenticateByName` call, swaps the in-memory current
  user, notifies listeners — no navigation, no login form),
  `getCurrentProfile()`, `clearProfile()` (used by "switch profile" in
  the shell, below), `onProfileChange(listener)`.
- `src/overlay/screens/profiles.js` + `profiles.css`: the profile picker
  — landing screen, one `.jq-row` of profile cards from
  `listProfiles()`, autofocus on the first, no login form/input/admin
  chrome anywhere on it (asserted directly in the test suite).
- `src/overlay/shell.js` + `shell.css`: the post-login shell — a
  `.jq-rail` with the active profile's name (activating it calls
  `clearProfile()` and returns to the picker), Home, and Requests. Home's
  actual content is a placeholder (`"Home -- Phase 3"`); Requests has no
  content yet (Phase 4).
- `src/overlay/app.js`: the bootstrap. Creates `#jellyquest-root`
  (`position: fixed`, full viewport, its own background/z-index) since
  gulpfile.babel.js's injection never provides a container div — this is
  also where the "JellyQuest owns the whole visible TV surface, doesn't
  try to coexist visually with jellyfin-web's own rendered UI" decision
  from Phase 1's research is actually implemented. Switches between the
  picker and the shell based on `JellyQuestSession` state.
- `dev/simulator.html` was simplified to just load the fixtures +
  `tizen.js` + `jellyquest.js`/`.css` — no more hardcoded demo markup,
  since `app.js` now builds the whole UI itself. This is more
  representative of the real deployment (gulp injects the same two
  tags into jellyfin-web's `index.html` with no container prepared for
  them either).
- `test/e2e/profile-shell.spec.mjs` (replaces `focus.spec.mjs`): 5/5
  passing, stable across repeated runs. Landing screen has no login
  chrome, arrow navigation across the profile row, selecting a profile
  doesn't trigger page navigation (`framenavigated` listener) and updates
  `JellyQuestSession` state, the round trip (switch → back to picker →
  switch to a *different* profile) works repeatably with no re-auth
  screen at any point, and rail↔content Up/Down navigation in the shell.

Two more real bugs the harness caught (both fixed, both Phase-2-specific
— the Phase 1 spike had already proven the library itself works):
- **`.jq-grid`'s 'grid' navigation mode misbehaves when the CSS
  `grid-template-columns` count exceeds the actual number of rendered
  items** (a ragged row) — Right from the first of 3 profiles in a
  4-column grid template jumped to the 3rd item, skipping the 2nd
  entirely. This is the *normal* case for a profile picker (household
  size varies and rarely fills a fixed column count), not an edge case.
  Fixed by using `.jq-row` for the profile picker instead of `.jq-grid`
  — a small, variable-length list of profiles is semantically a single
  row, not a multi-row grid; reserve `.jq-grid` for genuinely uniform,
  fully-populated layouts (a movie poster wall), which is what Phase 1's
  spike actually tested. Worth remembering going into Phase 3's library
  grid: keep `grid-template-columns` matched to how many items are
  actually likely to fill a row, or expect this same failure mode.
- The `npm run test:e2e` script itself was broken (`node --test test/e2e/`
  with a bare directory path doesn't reliably discover `*.spec.mjs`
  files on Node 22 — it needs an explicit glob). Fixed to
  `node --test "test/e2e/**/*.spec.mjs"`.

**Phase 3 — Core screens (Home, Library, Search, Detail/playback). DONE,
scoped to movies.**

**Explicit scope decision**: this pass covers `Type: 'Movie'` items only
— Resume/Play, Start Over, Trailer, My List, and a conditional More
(track selection) menu, matching DETAIL_ACTIONS.md's movie column.
**Series/Sports-specific behavior is deliberately not built yet**: season/
episode navigation, the show-specific Resume/Continue/Restart Episode
semantics, sports highlights/condensed games, chapters, and the
episode-track-identity mapping DETAIL_ACTIONS.md's "More menu" section
describes for shows. This isn't an oversight — replicating all of that
faithfully in one pass risked exactly the kind of rushed, undertested
code this whole rebuild exists to move away from. Treat it as a clearly
scoped follow-up phase (call it "Phase 3b" if picking this up next),
not a gap to quietly patch in passing.

- `src/overlay/cards.js` + `cards.css`: shared media-card rendering,
  factored out once Library needed the same card shape Home already had
  (not built speculatively up front).
- `src/overlay/screens/home.js` + `home.css`: Continue Watching (items
  with saved progress) + Recently Added rows. Selecting a card opens
  Detail; "See All" on Recently Added opens the Library grid for it.
- `src/overlay/screens/library.js` + `library.css`: a `.jq-grid` for one
  category. Column count (4) is fixed and matches how many cards
  actually render per row throughout — see the `.jq-grid` caveat update
  below.
- `src/overlay/screens/search.js` + `search.css`: a plain `<input
  type="search">` (the platform's on-screen keyboard handles text entry
  on real Tizen hardware, confirmed no custom input UI is needed) with
  debounced, live-filtered results.
- `src/overlay/screens/detail.js` + `detail.css`: movie detail/playback,
  per the scope note above.
- `src/overlay/shell.js` reworked from Phase 2's static placeholder into
  a real container: owns only the persistent rail (now Profile/Home/
  Search/Requests) and a content slot; `src/overlay/app.js` is the
  actual (small, hand-rolled) router deciding what renders into that
  slot (`showHome`/`showSearch`/`showLibrary`/`showDetail`/
  `showRequestsPlaceholder`).
- **Hardware Back button, added in this phase though not originally
  scoped for it**: every screen but Home registers a "return to where I
  came from" handler in `app.js` (`currentBackHandler`), and a single
  `keydown` listener (Tizen's Back keyCode `10009`, plus `27`/Escape for
  desktop/simulator testing) invokes it. This is genuinely necessary TV
  UX, distinct from Left-into-the-rail spatial navigation, and gives real
  purpose to the `returnTo` callback threaded through the router (an
  earlier draft left it unused — dead code that either needed wiring up
  or removing, and wiring it up was clearly the right call for a TV app).
  `focus.js`'s `openModal`/`closeModal` gained a matching
  `closeOnBack()`: an open modal (Detail's More menu) owns Back first,
  closing itself rather than letting the screen-level handler navigate
  the whole page away — see DETAIL_ACTIONS.md's "Left or Back returns
  one level before closing" rule, and the bug note below on why this
  needed its own coordination point rather than being implicit.
- Requests renders a plain placeholder (`"Requests -- Phase 4"`) with a
  working Back handler back to Home; no real functionality yet.
- Tests: `test/e2e/home.spec.mjs`, `detail.spec.mjs`,
  `library-search.spec.mjs` (new), plus `profile-shell.spec.mjs` updated
  for the fact that focus now lands on Home's content after a profile
  switch instead of staying on the rail (better UX, but it moved where
  three of that file's assertions needed to look). 29/29 tests total
  (7 config + 22 e2e) passing, stable across repeated runs.

Three more real bugs/findings the harness caught:
- **`.jq-grid`'s Phase-2 caveat needed a precision update.** Re-tested
  directly: a *naturally partial last row* (e.g. 7 items in a 3-column
  template — the normal "last page of a library" case) navigates fine.
  The actual bug from Phase 2 was a column template that reserves
  columns *no row ever fills* (4 columns, only ever 3 profiles) — that's
  what confuses 'grid' mode's row/column math. Library's grid is safe
  because its column count matches what every full row actually uses;
  only the trailing page is short, same as the verified-safe case.
- **Back needed to be arbitrated against an open modal**, not left to
  each screen. The naive version (a single global handler calling
  whatever `currentBackHandler` was current) would have let Back close
  Detail entirely while its Playback Options dialog was open, skipping
  past "close the dialog first" — wrong per DETAIL_ACTIONS.md and just
  bad TV UX. Fixed by giving `focus.js` a small `closeOnBack()`
  arbitration point instead of hand-coordinating it per screen, so any
  future modal gets the right precedence for free.
- Two of the Phase 2 test file's own focus assertions were simply wrong
  about *which* rail item Left/Up would land on once Home had real
  content (guessed "Alice" where the geometry actually lands on "Home"
  first) — caught immediately by rerunning them, not a runtime bug, but
  a reminder to verify empirically rather than assume geometry results
  even when the pattern seems obvious from a previous phase.

**Phase 4 — Requests/Jellyseerr module + README rewrite. DONE.**

**Explicit scope decision, same discipline as Phase 3**: movie-only.
Search, request, and claim all assume `mediaType: 'movie'`; TV/season
selection is explicit follow-up, not silently missing.

**Household-visibility decision** (settled earlier in this rebuild's
planning, before any Requests code existed): a title requested by one
household member shows as plain "Requested" to every other member of
that *same* household — nobody's name is attached, and there's no
separate "somebody in your household already asked for this" state.
Critically, this build does **not** scope requests/claims to a household
at all — a *different* household can independently request or claim the
exact same title with no visibility into the first household's request,
because JellyPass tracks claims per Jellyfin user, not per household
(`MediaClaim.userIds`, `access-service.ts`). This was a deliberate
reversal of an earlier draft (in the JellyPass repo, now reverted) that
tried to scope media claims to a household — the actual security boundary
in this system is authentication (who can act as which Jellyfin user),
which the household-gateway hardening from Phase 2 already owns; media
claims were never the boundary and restricting them added complexity
serving no real requirement.

- `src/overlay/requests-bridge.js`: low-level client for JellyPass's
  request bridge (`jellypass/src/request-bridge.ts`) — a hidden iframe
  loaded at the deployment's `requestsBridgeUrl`, talked to over
  `postMessage` with an origin check and a random nonce per open. Reused
  the exact security pattern the old (deleted) `jellyquest.js`'s
  `probeRequestsEligibility` used for its eligibility check, generalized
  into three calls: `checkEligibility(bridgeUrl, userId, userName)` (one
  round trip, then closes itself), `openSession(bridgeUrl, userId,
  userName)` (opens a session iframe that stays live), and `call(path,
  options)` (the request/response pairing over that open session,
  matching JellyPass's `/jellyquest-bridge/proxy` contract). Read
  JellyPass's actual current `request-bridge.ts` and its inlined
  `BRIDGE_HTML` directly from the `jellypass` repo (same branch,
  `claude/code-audit-issues-rha2bz`) rather than relying on the deleted
  TV-side code's memory of the protocol, since that file is the source of
  truth for what the bridge actually expects and returns.
- `src/overlay/screens/requests.js` + `requests.css`: search (same
  debounced-input pattern as `search.js`), one card per movie result. Per
  card, the action follows Jellyseerr's own `mediaInfo.status`: no
  request yet → "Request" button (`POST /api/v1/request`); pending/
  processing → plain "Requested" label, no action; available → resolves
  this profile's own claim via JellyPass's `GET /jellyquest/access` and
  shows either "Add to My Library" (`POST /jellyquest/access`) or, once
  claimed, a plain "In My Library" label. Jumping straight to Detail after
  a successful claim was considered and deliberately deferred (same
  "clearly scoped follow-up, not a gap" reasoning as Phase 3's
  Series/Sports deferral) — claiming just updates the card in place.
- `src/overlay/app.js`: added `loadConfiguration()` (`fetch('jellyquest-build.json')`,
  mirrors the old app's function of the same name and purpose), called
  once at boot; wired the shell's Requests button to a real `showRequests()`
  instead of the Phase 3 placeholder; every other screen-show function now
  also calls `JellyQuestRequestsBridge.close()` on the way in, so
  navigating away from Requests doesn't leave its iframe/session mounted
  in the background.
- `dev/fixtures/requests-bridge.html` + `requests-bridge-fixture.js`: a
  fixture standing in for JellyPass's real `bridge.html`, backed by fake
  data attached to the simulator page's own `window` (an iframe reading
  its `window.parent`'s globals — a shortcut only valid because the
  fixture is deliberately same-origin under the test server; the real
  bridge is cross-origin, which is exactly what the nonce/origin check in
  `requests-bridge.js` defends). Three fixture movies exercise all three
  states (none/requested/available), and one profile (Charlie) is
  deliberately left out of `eligibleUserIds` to exercise the "no
  Jellyseerr account" path.
- `dev/jellyquest-build.json`: a fixture config the simulator's `fetch()`
  now actually needs (see the `file://` fix below) — `requestsBridgeUrl`
  is a same-origin relative path (`fixtures/requests-bridge.html`) rather
  than production's absolute `https://` URL; `requests-bridge.js` resolves
  it against `window.location.href` rather than requiring an absolute URL
  on its own specifically so a relative test fixture path works, while
  `scripts/configure-jellyquest.mjs` still enforces an absolute
  same-origin `https://.../jellyquest-bridge/bridge.html` URL at
  production build time.
- `test/e2e/requests.spec.mjs` (new): 6 tests — search returns one card
  per movie result, an ineligible profile sees a message instead of a
  search box, none → Requested transition, an already-requested title
  shows the plain label with no action "regardless of who requested it"
  (the household-visibility decision above, asserted directly), available
  → claimed transition, and the hardware Back button back to Home.
- `README.md` rewritten to describe the new architecture: the module
  layout under `src/overlay/`, the `spatial-navigation-polyfill`-based
  focus system and its `.jq-rail`/`.jq-row`/`.jq-grid`/`.jq-modal`
  conventions, the passwordless profile-switch model and what it depends
  on in JellyPass, the Requests bridge protocol and its movie-only scope,
  the config layer, the `dev/simulator.html` + Playwright test-harness
  dev loop, and build/package/install steps for a new deployer.

**A prerequisite bug found and fixed before any Requests code was
written**: Chromium refuses `fetch()` from a `file://` document (an
opaque-origin CORS restriction), which would have silently blocked
Requests' `jellyquest-build.json` config load from ever being exercised
in the Playwright harness — confirmed directly with an isolated
`file://` test page before touching any real code. The old app's
`fetch()`-based config loading had shipped and worked fine, so this was
specifically a test-harness gap (the simulator was being opened via
`file://`), not a production concern; Tizen's packaged-app runtime, and
any other real embedding, is never `file://`. Fixed by adding
`test/e2e/support/server.mjs` (a small static file server using Node's
built-in `http`, no new dependency) and pointing all five spec files'
`simulatorUrl` at it instead of `file://dev/simulator.html` — landed as
its own commit before any Phase 4 feature code, and incidentally makes
the whole harness more faithful to production loading, not just
fetch-capable.

**Verified, not yet run in this sandbox**: `npm run build:full` failed
here with `403 Forbidden` fetching
`https://github.com/eligrey/classList.js/archive/...tar.gz` during
jellyfin-web's own `npm ci` — this sandbox's outbound network proxy
doesn't allow GitHub's tarball-archive domain, unrelated to any code in
this repo (jellyfin-web's own `package.json` pulls that dependency
directly from a GitHub archive URL, not npm). This is a sandbox egress
policy limitation, not a regression: it's the same category of
environment gap the correction note at the top of this doc already
covers for the earlier `dist/` confusion, and `build:overlay` + the full
e2e/config suites remain the real regression gate per this phase's plan
(see Architecture principles and "Minimize physical-TV test cycles"
above). Re-verify `build:full`/`package:wgt` in an environment with full
GitHub access, or on real hardware, as part of Phase 5.

**Phase 5 — Real hardware validation. DONE.**

The user built and sideloaded successfully on their own machine/TV (this
sandbox can't do either — see the Phase 4 network-limitation note above).
First install rendered broken: a "Who's watching?" panel partially
appeared (proving `jellyquest.js` ran) but didn't cover the screen —
stock Jellyfin's own library view was visible behind and around it. No
devtools access to the TV, so diagnosis happened entirely through
**`src/overlay/diagnostics.js`**, a temporary on-screen panel (catches
`window.onerror`/`unhandledrejection`, reports `#jellyquest-root`'s
computed style and actual `getBoundingClientRect()`, and `<html>`/`<body>`
transform/filter state) added specifically because this TV had no other
inspectable output channel. **Still in the tree, marked temporary — pull
it (and its `build-overlay.mjs` entry) once Phase 5 is confirmed fixed on
real hardware.**

Two real, independent bugs found this way, both fixed and regression-tested:

1. **Boot race: `window.ApiClient` isn't ready when JellyQuest's own
   script runs.** The diagnostic panel showed `typeof ApiClient=undefined`
   followed by `Uncaught TypeError: Cannot read property 'getPublicUsers'
   of undefined @ jellyquest.js:1973` — `session.js`'s `listProfiles()`
   calling `ApiClient.getPublicUsers()` the instant JellyQuest boots.
   Root cause: `jellyquest.js` is injected with `defer` *before*
   `main.jellyfin.bundle.js` in the built `index.html` (gulp's injection
   order), and deferred scripts run in document order — so JellyQuest's
   boot code runs, and can crash, before jellyfin-web's own bundle has
   even started, let alone defined `window.ApiClient`. **The simulator
   structurally could never catch this**: `dev/simulator.html`'s fixture
   scripts are plain synchronous `<script>` tags that set
   `window.ApiClient` *before* `jellyquest.js`'s own tag is even reached,
   so real script-load-order timing was never actually exercised in
   ~29 tests across four phases. Fixed in `src/overlay/app.js` with
   `waitForApiClient()` — polls every 50ms (bounded to ~15s, then shows a
   plain "Unable to start" message rather than hanging silently forever)
   before doing anything that touches `ApiClient`. Regression-tested in
   `test/e2e/boot-race.spec.mjs`, which reproduces the real timing via a
   new `window.__jqTestDelayApiClientMs` flag in
   `dev/fixtures/api-client-stub.js` (delays the fixture's own
   `window.ApiClient` assignment instead of setting it synchronously) —
   **verified this test actually fails with the pre-fix `app.js`**
   (reproduced the exact same `TypeError` from the TV) before confirming
   it passes with the fix, so it's a real regression test, not a
   false-positive.
2. **`inset: 0` isn't honored on this TV's WebKit.** The diagnostic panel
   showed `#jellyquest-root` at `top=96.875px width=393.859px` instead of
   `0`/`1920` (the TV's actual viewport), while `height=1080px`,
   `background-color`, and `z-index` — from the same CSS rule — were all
   correct. That's the exact signature of an unsupported declaration
   being silently dropped: `top`/`right`/`bottom`/`left` are unset, so
   the fixed-position element falls back to its static in-flow position
   and content-driven size, while every other declared property on the
   rule still applies fine. `inset` as a shorthand only landed in
   Chromium 87 (2020); this project's floor is Tizen 5.0 (Chromium M63,
   2019) — squarely too old. Since confirmed by direct measurement on
   both sets: `CSS.supports('inset','0')` returns `false` on the 2019
   (M63) and 2020 (M69) TVs alike. Fixed by replacing
   `inset: 0` with explicit `top/right/bottom/left: 0` (supported
   essentially forever) in both `src/overlay/app.css`
   (`#jellyquest-root`) and `src/overlay/focus.css`
   (`.jq-modal-backdrop`, same shorthand, same risk, not yet observed
   broken but no reason to leave it). No practical way to regression-test
   old-WebKit-specific CSS parsing in a Chromium-based Playwright harness
   — this one relies on the code comment and real-hardware verification
   instead.

A third hypothesis (jellyfin-web applying a CSS `transform` to
`<html>`/`<body>` for its own page-transition animations, which would
redefine `position: fixed`'s containing block away from the real
viewport) was tried first — `html, body { transform: none !important; ...
}` was added to `app.css` — but the *next* round of on-screen diagnostics
showed `transform: none` on both already, with the layout still broken,
disproving it as the (sole) cause. Left in place as harmless insurance
(once JellyQuest takes over, jellyfin-web's own transition effects
underneath it don't matter either way), but bug #2 above is the
confirmed, evidenced fix — not this one.

**Confirmed on real hardware**: a follow-up install produced a clean
diagnostic report -- `#jellyquest-root`'s `getBoundingClientRect()`
matched `window.inner{Width,Height}` exactly (`1920x1080`), no
`ERROR:`/`REJECTION:` lines, and the real profile picker rendered
full-screen with the household's actual profiles (not fixture data) and
correct focus styling. `src/overlay/diagnostics.js` and its
`build-overlay.mjs` entry were removed immediately after — it was always
meant to be temporary, and its job is done.

- Packaged and sideloaded via the existing `install-tv.sh` /
  `georift/install-jellyfin-tizen` flow, on the user's own machine/TV
  (this sandbox has no path to either — see the Phase 4 network-
  limitation note above for `build:full`, and there's obviously no route
  to a physical TV from here).
- Physical-TV testing was the final validation pass, not the primary
  feedback loop — the point of Phase 1. It earned its keep: both real
  bugs above were invisible to ~29 simulator/config tests across four
  phases and only surfaced here.

**This closed out the rebuild** as originally scoped. All six phases were
done and verified, including on real hardware.

**Follow-up bug report, post-rebuild.** The same household then reported
a navigation problem on the real TV: from the 4-profile picker (their
actual household, not this fixture's placeholder names), only every
other card was reachable with the remote (first and third, never second
or fourth). Simulator testing with an identically-sized 4-profile row
navigated correctly, ruling out a plain navigation-logic bug.

**A first attempt at a fix was wrong, and was reverted rather than
shipped.** The pattern (reaching only positions 0 and 2 of 4) looked
exactly like a keydown double-fire -- a known class of bug on some
Samsung Tizen remotes, where a single physical press delivers two
keydown events, silently moving focus two positions instead of one. A
time-windowed debounce guard was added to `focus.js` to suppress a
same-key duplicate arriving within 100ms, registered in the capture
phase specifically so it runs before the vendored polyfill's own
(bubble-phase) listener regardless of script load order. It was written
**without an on-device measurement first** — a real inconsistency with
how the other two Phase 5 bugs were handled (both had concrete on-screen
diagnostic proof before any fix was written). Running the full test
suite against it, before committing anything, caught the mistake
immediately: 7 tests failed, because Playwright's own back-to-back
`keyboard.press()` calls land only 5-20ms apart in this environment
(measured directly) -- comfortably inside the 100ms window, so the "fix"
was also swallowing completely ordinary, legitimate repeated presses,
not just a hypothetical hardware artifact. There is no timing threshold
that reliably tells those two apart from JS-visible timestamps alone.
**Reverted in full before ever being committed** -- `focus.js` is back
to its pre-attempt content; nothing from this attempt reached `origin`.

**`src/overlay/keydown-diagnostics.js` (v1) disproved the double-keydown
theory outright.** A photo of the on-screen panel after pressing Left/
Up/Back on the real remote showed every single keydown arriving with
`repeat=false`, spaced 170-800ms apart from the previous event of that
same `keyCode` — normal, single, human-paced presses. No duplicates, no
near-simultaneous pairs, at all. The bug is not in event count.

**v2** kept that finding and added the obvious next measurement: log
`document.activeElement` immediately before each keydown and again after
a `setTimeout(0)`, showing directly whether one press moves focus by
more than one position.

**v3, in progress** — what v2 could not distinguish. A two-position jump
has two very different explanations, and "focus before/after" alone
cannot tell them apart:

1. the vendored spatial-navigation-polyfill's own geometry picking the
   wrong candidate, or
2. **two independent navigation systems both acting on the same event.**

(2) is real and specific to the device. `gulpfile.babel.js` injects
`jellyquest.js` into jellyfin-web's own `index.html`, so on hardware
these are both live:

- the bundled **spatial-navigation-polyfill** — `window` keydown, bubble
  phase, registered from its own `load` handler
  (`spatial-navigation-polyfill.js:83`, registered at `:1746`); and
- **jellyfin-web's `keyboardnavigation`** → `inputManager.handleCommand`
  → `focusManager.moveRight`, a completely separate geometry
  implementation, confirmed present in the shipped
  `www/main.jellyfin.bundle.js`.

Nothing in JellyQuest disables either one. `app.js:104` is the overlay's
only other keydown listener and it returns early for anything but Back;
`scripts/patch-jellyfin-web.mjs` does not touch keyboard nav. Both
systems guard on `!event.defaultPrevented` and both call
`preventDefault()`, so normally whichever runs first wins and one press
moves focus once. **The hole**: if the TV dispatches keydown with
`cancelable: false`, `preventDefault()` is a silent no-op,
`defaultPrevented` stays false, and *both* handlers move focus — two
cards per press, exactly the reported symptom.

Note this is **not** the disproved theory. That one was two *events* per
press, and the device data killed it. This is one event, two *handlers*
— and single, human-paced keydowns are precisely what it predicts.

Neither the simulator nor desktop Chromium can show this: `dev/simulator.html`
loads the overlay alone, so system (2) isn't there at all, and
jellyfin-web's arrow branch is gated on its own `browser.tv` detection,
false off-device. Playwright's keyboard events are also cancelable, so
the guard works and the bug cannot appear in e2e.

So v3 samples each press at three points — capture phase on `window`,
a bubble-phase `window` listener registered from a `setTimeout` after
`load` (behind the polyfill's, and last in the bubble path anyway for
anything bound to `document`), and once more after dispatch unwinds —
recording `cancelable` and `defaultPrevented` at each point plus the
focused element's label and sibling index before/after. Still
**read-only** (TEMPORARY, same on-screen-panel pattern as
`diagnostics.js` before it — remove once done; never calls
`preventDefault`/`stopPropagation`, only reads `document.activeElement`).

**Next**: photo of the panel after pressing Right along the profile row
on the actual remote. `cancelable=NO` beside a `(+2) <-- DOUBLE MOVE`
confirms the two-systems cause; `cancelable=YES` rules it out and sends
the investigation back to explanation (1), the polyfill's geometry. The
fix that follows from (1) and from (2) are different — for (2) it is
making JellyQuest the only arrow-key consumer on device (disable
jellyfin-web's `keyboardnavigation`, or guarantee polyfill-first
registration) — so do not write either until the photo says which.

Series/Sports detail support (deferred in Phase 3) and TV/season-aware
Requests (deferred in Phase 4) remain genuinely separate follow-up work,
not part of either the original rebuild or this navigation
investigation.

## Where this stands, and the path from here

**State.** Phases 0 through 5 are done on
`claude/code-audit-issues-rha2bz`: **17 commits ahead of `master`, 0
behind, never merged, no open PR.** `npm test` 7/7 and
`npm run test:e2e` 29/29 green. The rebuild itself is confirmed working
on real hardware. Two things are outstanding: the D-pad follow-up bug
described at the end of Phase 5, and the **temporary on-screen
diagnostic that is currently compiled into every build** (first entry of
`JS_FILES` in `scripts/build-overlay.mjs`) — anyone packaging this
branch right now gets a yellow panel in the top-right corner of the TV.
That is deliberate and must be removed before this branch ships.

**The path, in order.**

1. **Get the photo.** This is the only step that needs real hardware,
   and everything after it depends on what it says.

   ```sh
   npm run build:full && npm run package:wgt   # needs Tizen Studio
   npm run install:tv -- YOUR_TV_IP
   ```

   Open the profile picker and press Right along the row. Each press
   adds two lines to the panel:

   ```
   #3 ArrowRight kc=39 rpt=N cancelable=NO 812ms
      dP cap=N late=N | Alex[0] > Kids[2] > Kids[2] (+2) <-- DOUBLE MOVE
   ```

   `cancelable` is the whole question. `dP cap`/`late` are
   `defaultPrevented` as seen in the capture phase and in a bubble-phase
   `window` listener registered after the polyfill's. The three focus
   readings are label and sibling index before dispatch, at that late
   listener, and after dispatch unwinds.

2. **Branch on what the photo shows.** The fixes are different and
   mutually exclusive, which is why none of them is written yet:

   - **`cancelable=NO` with `DOUBLE MOVE`** — the two-navigation-systems
     cause is confirmed. The fix is to make JellyQuest the only
     arrow-key consumer on device: either disable jellyfin-web's
     `keyboardnavigation` through a third narrow patch in
     `scripts/patch-jellyfin-web.mjs` (same fail-fast, pinned-revision
     style as the two patches already there), or stop relying on
     `preventDefault()` as the handoff between the two systems.
     Note that ordering alone cannot fix it: under `cancelable:false`
     the polyfill's own `preventDefault()` is equally a no-op, so
     "whichever registers first wins" is exactly the mechanism that has
     failed. One of the two consumers has to actually stop handling
     arrows.
   - **`cancelable=YES`, one focus move per press** — this theory is
     dead too, and the before/after indexes then say whether the
     polyfill moved focus more than one position on its own. That points
     at its geometry/candidate selection against this specific layout
     (compare `.jq-row` here against the `.jq-grid` column-count caveat
     under "Resolved decisions").
   - **No jump at all, one card per press** — then keydown handling is
     not the bug, and the thing to look at is what re-renders or
     re-focuses the row: `JellyQuestFocus.focusFirst()` and the
     re-render when `listProfiles()` resolves.

   In every branch: **do not reach for a timing or debounce
   heuristic.** That was tried once without device data, broke 7 e2e
   tests, and was reverted; no JS-visible timestamp separates a hardware
   artifact from a legitimate fast press.

3. **Remove the diagnostic.** Delete `src/overlay/keydown-diagnostics.js`
   and its entry in `scripts/build-overlay.mjs`'s `JS_FILES`, run
   `npm run build:overlay`, and commit the regenerated `jellyquest.js`.
   The drift check in `test/configuration.test.mjs` catches a forgotten
   rebuild.

4. **Merge to `master`.** The whole rebuild has lived on this branch
   through all six phases and has never landed.

5. **Then the deferred feature work**, which is genuinely separate from
   all of the above: Series/Sports detail support (deferred in Phase 3)
   and TV/season-aware Requests (deferred in Phase 4).

**Notes for a fresh machine.** `npm run test:e2e` can fail on every test
with a Playwright browser-revision mismatch (the pinned Playwright wants
one `chromium_headless_shell` build, the cache holds another); `npx
playwright install chromium` fixes it and it is environmental, not a
code failure. `build:full` and `package:wgt` need Tizen Studio and a
Samsung certificate profile, so they only run on a real workstation —
`build:overlay`, `npm test`, `npm run test:e2e`, and the simulator never
need either.

## Verification

- `npm test` (= `node --test test/configuration.test.mjs`) —
  config/plumbing tests, 7/7 passing as of Phase 5.
- `npm run test:e2e` (= `node --test "test/e2e/**/*.spec.mjs"`) — the
  Playwright navigation harness, 29/29 passing as of Phase 5, stable
  across repeated runs, served over a local HTTP server (see Phase 4's
  `file://` fix) rather than `file://`. This is the primary regression
  gate going forward for any future work; grow it alongside each new
  screen/feature rather than after.
- `npm run build:full` and `npm run package:wgt` confirmed working on the
  user's own machine (both fail inside *this* sandbox — `build:full` on
  an unrelated GitHub-tarball network restriction, see Phase 4's status
  above; `package:wgt` needs Tizen Studio, not installed here).
- `npm run install:tv -- TV_IP`: confirmed working, and the resulting
  install confirmed correct on real hardware — see Phase 5's status
  above.

## Resolved decisions (were "open items" going into Phase 1)

- **Bundling approach: plain concatenation, no ES modules, no bundler.**
  Resolved above under "Architecture principles" #1.
- **Does `spatial-navigation-polyfill` cover row/grid/rail out of the
  box?** Yes, confirmed in Phase 1 — no custom glue needed beyond the
  CSS custom properties it already reads (`--spatial-navigation-contain`,
  `--spatial-navigation-function`), which `src/overlay/focus.css`
  exposes as the `.jq-rail`/`.jq-row`/`.jq-grid`/`.jq-modal` conventions.
  **Caveat found in Phase 2, precision-corrected in Phase 3**: `.jq-grid`
  misbehaves specifically when the CSS column template reserves columns
  that *no row ever fills* (e.g. 4 columns, only ever 3 items — the
  profile picker's mistake) — that confuses 'grid' mode's row/column
  math and it skips items. A grid whose column count matches what full
  rows actually use, with only a naturally short trailing/last-page row
  (e.g. 7 items in a 3-column template), navigates correctly — verified
  directly, and this is exactly Library's shape in Phase 3. Use
  `.jq-row` for small/variable-length lists like the profile picker;
  reserve `.jq-grid` for a real, fully-populated multi-row layout.
