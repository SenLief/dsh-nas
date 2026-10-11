#!/bin/sh
set -eu
set -f
umask 077

# Non-Web commands, such as `docker run IMAGE dsh --version`, pass through.
if [ "${1:-}" != "dsh" ] || [ "${2:-}" != "web" ]; then
    exec "$@"
fi

mkdir -p "$DSH_HOME"
if [ ! -w "$DSH_HOME" ] || [ ! -w /workspace ]; then
    echo "DSH_HOME and /workspace must be writable by UID/GID $(id -u):$(id -g)." >&2
    exit 1
fi

# The published DSH CLI rejects 0.0.0.0. Bind the container's concrete IPv4.
bind_host="${DSH_BIND_ADDRESS:-$(node -e '
const os = require("node:os");
const interfaces = os.networkInterfaces();
const addresses = [...(interfaces.eth0 || []), ...Object.values(interfaces).flat()];
const address = addresses.find(x => x && x.family === "IPv4" && !x.internal);
if (!address) { console.error("No container IPv4 address found"); process.exit(1); }
process.stdout.write(address.address);
')}"
set -- "$@" --host "$bind_host"

# Comma-separated NAS IPs / browser-facing hostnames; no URL scheme or path.
for authority in $(printf '%s' "${DSH_TRUSTED_HOSTS:-}" | tr ',' ' '); do
    set -- "$@" --trusted-host "$authority"
done

echo "DSH listener: $bind_host:3080; workspace: /workspace"
case "${DSH_DISABLE_BROWSER_AUTH:-0}" in
    1) echo "Browser login is disabled: open http://NAS_IP:PUBLISHED_PORT/ directly." ;;
    0) echo "Open the logged dsh web URL using your NAS IP and published port; preserve its token query." ;;
    *) echo "DSH_DISABLE_BROWSER_AUTH must be 0 or 1." >&2; exit 1 ;;
esac
exec "$@"
