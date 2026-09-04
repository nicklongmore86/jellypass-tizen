#!/usr/bin/env bash
set -euo pipefail

# dev/simulator.html + dev/fixtures/* are the actual dev loop now (see
# docs/rebuild-plan.md, Phase 1) -- serving the whole project root lets
# its relative references (../tizen.js, ../jellyquest.js/.css,
# fixtures/*) resolve exactly the way the Playwright harness's own local
# server (test/e2e/support/server.mjs) already relies on.
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preview_port="${JELLYQUEST_PREVIEW_PORT:-8090}"

echo "JellyQuest TV simulator: http://127.0.0.1:${preview_port}/dev/simulator.html"
echo "Press Ctrl+C to stop the preview server."
python3 -m http.server "${preview_port}" --bind 127.0.0.1 --directory "${project_dir}"
