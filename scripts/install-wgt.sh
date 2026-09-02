#!/usr/bin/env bash
set -euo pipefail

tv_ip="${1:?TV IP is required}"
serial="${tv_ip}:26101"
app_id="JellyQuest.JellyQuest"
package_path="/project/artifacts/JellyQuest.wgt"
remote_path="/home/owner/share/tmp/sdk_tools/tmp/JellyQuest.wgt"

expected_version="$(unzip -p "${package_path}" config.xml | sed -n 's/.*<widget[^>]*version="\([^"]*\)".*/\1/p')"
[[ -n "${expected_version}" ]] || {
    echo "Unable to read the JellyQuest version from the WGT manifest." >&2
    exit 1
}

sdb connect "${tv_ip}"
sdb devices | awk -v serial="${serial}" '$1 == serial && $2 == "device" { found = 1 } END { exit(found ? 0 : 1) }' || {
    echo "The TV did not register as an SDB device at ${serial}." >&2
    exit 1
}

registry="$(sdb -s "${serial}" shell 0 vd_applist 2>/dev/null || true)"
if grep -q "app_id.*=${app_id}" <<<"${registry}"; then
    echo "Removing the existing JellyQuest installation..."
    uninstall_output="$(sdb -s "${serial}" shell 0 vd_appuninstall "${app_id}")"
    echo "${uninstall_output}"
    grep -q "uninstall completed" <<<"${uninstall_output}" || {
        echo "Automatic removal failed. Delete JellyQuest from Apps and rerun this command." >&2
        exit 1
    }
fi

echo "Transferring JellyQuest ${expected_version}..."
sdb -s "${serial}" push "${package_path}" "${remote_path}"

echo "Installing JellyQuest ${expected_version}..."
install_output="$(sdb -s "${serial}" shell 0 vd_appinstall "${app_id}" "${remote_path}")"
echo "${install_output}"
grep -q "app_id\[${app_id}\] install completed" <<<"${install_output}" || {
    echo "Samsung's installer did not report a completed installation." >&2
    exit 1
}

registry="$(sdb -s "${serial}" shell 0 vd_applist 2>/dev/null)"
grep -q "app_id.*=${app_id}" <<<"${registry}" || {
    echo "JellyQuest is missing from the TV registry after installation." >&2
    exit 1
}
grep -q "app_version.*=${expected_version}" <<<"${registry}" || {
    echo "The installed JellyQuest version does not match ${expected_version}." >&2
    exit 1
}

sdb -s "${serial}" shell 0 execute "${app_id}"
echo "JellyQuest ${expected_version} is installed, verified, and launched on ${tv_ip}."
