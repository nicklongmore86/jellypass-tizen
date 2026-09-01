#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_dir="${project_dir}/artifacts"

command -v tizen >/dev/null 2>&1 || {
    echo "Tizen CLI was not found. Install Tizen Studio and add its tools/ide/bin directory to PATH." >&2
    exit 1
}

[[ -f "${project_dir}/www/index.html" ]] || {
    echo "The prepared www tree is missing. Run npm run build:full first." >&2
    exit 1
}

mkdir -p "${artifact_dir}"
cd "${project_dir}"
tizen build-web -e ".*" -e gulpfile.babel.js -e README.md -e "node_modules/*" -e "package*.json" -e scripts -e test
tizen package -t wgt -o "${artifact_dir}" -- .buildResult

if [[ -f "${artifact_dir}/Jellyfin.wgt" ]]; then
    mv "${artifact_dir}/Jellyfin.wgt" "${artifact_dir}/JellyPass.wgt"
fi

echo "Packaged ${artifact_dir}/JellyPass.wgt"
