#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tv_ip="${1:-}"
installer_image="${JELLYQUEST_TIZEN_IMAGE:-ghcr.io/georift/install-jellyfin-tizen:latest}"

if [[ ! "${tv_ip}" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    echo "Usage: npm run install:tv -- TV_IP" >&2
    exit 2
fi

[[ -f "${project_dir}/artifacts/JellyQuest.wgt" ]] || {
    echo "artifacts/JellyQuest.wgt is missing. Run npm run package:wgt first." >&2
    exit 1
}

docker run --rm --network host \
    -v "${project_dir}:/project:ro" \
    --entrypoint /bin/bash \
    "${installer_image}" /project/scripts/install-wgt.sh "${tv_ip}"
