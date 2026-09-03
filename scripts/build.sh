#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
web_dir="${JELLYFIN_WEB_SOURCE_DIR:-${project_dir}/.cache/jellyfin-web}"
web_ref="$(tr -d '[:space:]' < "${project_dir}/.jellyfin-web-ref")"
npm10=(npx --yes npm@10.9.4)

if [[ ! -d "${web_dir}/.git" ]]; then
    git clone https://github.com/jellyfin/jellyfin-web.git "${web_dir}"
fi

git -C "${web_dir}" fetch origin "${web_ref}"
git -C "${web_dir}" checkout --detach "${web_ref}"
node "${project_dir}/scripts/patch-jellyfin-web.mjs" "${web_dir}"
"${npm10[@]}" --prefix "${web_dir}" ci --no-audit
USE_SYSTEM_FONTS=1 "${npm10[@]}" --prefix "${web_dir}" run build:production

cd "${project_dir}"
JELLYFIN_WEB_DIR="${web_dir}/dist" npm ci --no-audit
npm test

echo "Prepared ${project_dir}/www from Jellyfin Web ${web_ref}"
