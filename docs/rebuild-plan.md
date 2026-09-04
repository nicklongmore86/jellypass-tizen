# JellyQuest Tizen: blank-canvas rebuild of the overlay layer

Status as of this doc: **Phase 0 and Phase 1 complete** (commits `bffa773`,
`a5078ab` on `claude/code-audit-issues-rha2bz`). Phase 2 is next. This
file is the handoff/plan doc for continuing the rebuild from a fresh
session (local CLI or otherwise) without needing the original
conversation history.

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

**Still to rewrite:**
- `README.md` — describe the new architecture once more of it exists
  (deferred to end of Phase 4)

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
   modules, no bundler** — the oldest Tizen this project targets (4.6,
   per README) ships Chromium ~M56-M63, predating native `<script
   type=module>` support (landed in M61). Plain concatenated scripts
   avoid that risk entirely with zero build complexity.
2. **Spatial navigation: `spatial-navigation-polyfill` (MIT), not
   hand-rolled geometry code.** Done in Phase 1 — see below. Its license
   is compatible with this project's GPLv2 (unlike BBC's `lrud`,
   Apache-2.0, which the FSF considers GPLv2-incompatible), and its
   plain-IIFE ES2015 syntax runs unmodified on the Tizen 4.6 floor.
3. **One passwordless session-switch primitive.** *(Phase 2, not yet
   built.)* A single `switchProfile(userId)` function in a new
   `src/overlay/session.js` performs the blank-password
   `AuthenticateByName` call, swaps the active `ApiClient` token/user in
   place, and re-issues data loads for the current screen — no full page
   navigation, no visible login form. Every "profile" surface (picker,
   in-app switcher) calls this one function.
4. **Requests/Jellyseerr as a real bounded module**, not an iframe bridge
   to a hand-duplicated standalone page. *(Phase 4, not yet built.)*
   Shares `src/overlay/focus.js` and the session/profile model instead of
   reimplementing focus handling independently the way the old
   `jellyseerr-login.html` did. The actual JellyPass backend bridge
   protocol (`/jellyquest-bridge/session`, `/eligibility`, `/proxy`)
   stays the transport; only the TV-side implementation is being
   rebuilt.
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
build. **Not verified in the sandbox this was built in**: `build:full`
(needs a real jellyfin-web clone) and `package:wgt` (needs the Tizen
CLI) — re-verify these on a machine that has both before relying on
them.

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
  containment.
- Two real bugs the harness caught immediately (both fixed, both in
  `dev/simulator.html`, not the polyfill): a `.jq-modal-backdrop {
  display: flex }` rule unconditionally beating the `hidden` attribute's
  UA default (author styles always win over UA defaults regardless of
  selector specificity — needed an explicit `.jq-modal-backdrop[hidden] {
  display: none }` override), and a hand-written Enter-to-click bridge
  that was redundant with native `<button>` Enter-activation and
  double-fired click handlers (removed — native buttons already do this).

**Phase 2 — Profile-centric shell. NOT STARTED. Do this next.**
- `src/overlay/session.js`: the passwordless `switchProfile()` primitive
  described in principle 3 above, backed by the household-scoped
  `/Users/Public` + `AuthenticateByName` flow. Extend
  `dev/fixtures/api-client-stub.js` as needed to develop this against the
  simulator before touching real hardware.
- Profile picker as the true landing screen (no login form, no
  admin/manual-login chrome — matches the household gateway's
  already-filtered public user list from the JellyPass side).
- Top-level nav shell (Home / Requests), no visible account-management
  surfaces.
- Playwright coverage: profile picker navigation, instant switch (assert
  the active user changes with no navigation/reload) — add
  `test/e2e/session.spec.mjs` or extend the existing spec file.

**Phase 3 — Core screens (Home, Library, Search, Detail/playback). NOT STARTED.**
- Port screen behavior using `DETAIL_ACTIONS.md`'s action matrix as
  literal Playwright test cases (Resume/Continue/Start Over/Trailer/
  Highlights/My List/More, per the table in that doc) rather than prose
  to re-derive later.
- Each screen ships with its Playwright focus/interaction tests alongside
  it, not after.

**Phase 4 — Requests/Jellyseerr module + README rewrite. NOT STARTED.**
- Rebuild as a module sharing `focus.js` and `session.js`, talking to the
  existing JellyPass bridge endpoints. Retire the standalone-page-in-an-
  iframe pattern.
- Rewrite `README.md` describing the new architecture, the config layer,
  and setup steps for a new deployer — this is the point where "reusable
  by others" gets written down, not just designed for.

**Phase 5 — Real hardware validation. NOT STARTED.**
- Package and sideload via the existing `install-tv.sh` /
  `georift/install-jellyfin-tizen` flow.
- Physical-TV testing is the final validation pass, not the primary
  feedback loop — the point of Phase 1.

## Verification

- `node --test test/configuration.test.mjs` — config/plumbing tests, 7/7
  passing as of Phase 1.
- `node --test test/e2e/focus.spec.mjs` (or `npm run test:e2e`) — the
  Playwright navigation harness, 3/3 passing as of Phase 1. This is the
  primary regression gate going forward; grow it alongside each phase's
  screens rather than after.
- `npm run build:full` and `npm run package:wgt` must still produce a
  valid WGT — **not verified in the environment this rebuild started in**
  (no jellyfin-web clone, no Tizen Studio). Verify on a machine with both
  before trusting them, ideally before or during Phase 2.
- Final Phase 5 sideload to real hardware via
  `npm run install:tv -- TV_IP`.

## Resolved decisions (were "open items" going into Phase 1)

- **Bundling approach: plain concatenation, no ES modules, no bundler.**
  Resolved above under "Architecture principles" #1.
- **Does `spatial-navigation-polyfill` cover row/grid/rail out of the
  box?** Yes, confirmed in Phase 1 — no custom glue needed beyond the
  CSS custom properties it already reads (`--spatial-navigation-contain`,
  `--spatial-navigation-function`), which `src/overlay/focus.css`
  exposes as the `.jq-rail`/`.jq-row`/`.jq-grid`/`.jq-modal` conventions.
