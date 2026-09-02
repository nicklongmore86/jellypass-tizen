#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preview_port="${JELLYQUEST_PREVIEW_PORT:-8090}"

echo "JellyQuest TV simulator: http://127.0.0.1:${preview_port}/tv-simulator.html"
echo "Press Ctrl+C to stop the preview server."
python3 -m http.server "${preview_port}" --directory "${project_dir}/integration"
