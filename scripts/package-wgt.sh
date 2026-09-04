#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifact_dir="${project_dir}/artifacts"
artifact_path="${artifact_dir}/JellyQuest.wgt"

command -v tizen >/dev/null 2>&1 || {
    echo "Tizen CLI was not found. Install Tizen Studio and add its tools/ide/bin directory to PATH." >&2
    exit 1
}

[[ -f "${project_dir}/www/index.html" ]] || {
    echo "The prepared www tree is missing. Run npm run build:full first." >&2
    exit 1
}

# The Requests page is rebuilt as part of the JellyQuest overlay (see the
# blank-canvas rebuild plan); until it lands, there is nothing to copy here.
if [[ -f "${project_dir}/integration/jellyseerr-login.html" ]]; then
    cp "${project_dir}/integration/jellyseerr-login.html" "${project_dir}/www/jellyseerr-login.html"
fi

mkdir -p "${artifact_dir}"
rm -f "${artifact_path}"
rm -rf "${project_dir}/.buildResult"
cd "${project_dir}"
tizen build-web -e ".*" -e gulpfile.babel.js -e README.md -e DETAIL_ACTIONS.md \
    -e jellyquest.config.json -e "node_modules/*" -e "package*.json" \
    -e "artifacts/*" -e "dev/*" -e "docs/*" -e "integration/*" \
    -e "scripts/*" -e "src/*" -e "test/*"
tizen package -t wgt -o "${artifact_dir}" -- .buildResult

[[ -f "${artifact_path}" ]] || {
    echo "Tizen packaging completed without producing a WGT artifact." >&2
    exit 1
}

echo "Packaged ${artifact_path}"
