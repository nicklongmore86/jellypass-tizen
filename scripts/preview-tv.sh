#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preview_port="${JELLYQUEST_PREVIEW_PORT:-8090}"
preview_dir="$(mktemp -d)"

cleanup() {
    rm -rf "${preview_dir}"
}
trap cleanup EXIT

cp "${project_dir}/integration/"*.html "${preview_dir}/"
cp "${project_dir}/integration/"*.css "${preview_dir}/"
cp "${project_dir}/integration/"*.js "${preview_dir}/"
cp "${project_dir}/jellyquest.css" "${project_dir}/jellyquest.js" "${project_dir}/icon.png" "${preview_dir}/"

echo "JellyQuest TV simulator: http://127.0.0.1:${preview_port}/tv-simulator.html"
echo "Press Ctrl+C to stop the preview server."
python3 -m http.server "${preview_port}" --directory "${preview_dir}"
