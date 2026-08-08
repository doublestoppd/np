#!/usr/bin/env bash
#
# Glimmergrove demo — write (or rewrite) the systemd unit.
#
# Both setup-droplet.sh and redeploy.sh run this, which is the point: a
# droplet set up months ago must pick up a corrected unit on its next
# redeploy. When this lived only in setup-droplet.sh, a bad unit was
# permanent on any droplet that had already been built — redeploy cloned
# new code, rebuilt it, and then started it with the old, broken unit.
#
# Usage (as root, after the app is built at APP_DIR):
#   APP_DIR=... APP_USER=... APP_PORT=... SERVICE_NAME=... \
#     bash scripts/demo/install-service.sh
#
# Writes the unit and reloads systemd. Starting the service is the
# caller's business — setup and redeploy want it at different moments.

set -euo pipefail

for required in APP_DIR APP_USER APP_PORT SERVICE_NAME; do
  if [ -z "${!required:-}" ]; then
    printf '\033[1;31mERROR: install-service.sh needs %s\033[0m\n' "$required" >&2
    exit 1
  fi
done

# The server is started DIRECTLY, not through `npm run start`.
#
# With npm in front, the unit's main process is npm and the actual server
# is a grandchild. npm does not forward SIGTERM, so a stop can leave the
# server holding the port while systemd believes the unit is down — and
# every restart after that dies with EADDRINUSE, in a loop that reads
# like a configuration fault and is not one. Running next directly makes
# the main PID the process that owns the port, so stopping the unit
# actually stops the thing listening.
NODE_BIN="$(command -v node)"
NEXT_BIN="${APP_DIR}/node_modules/next/dist/bin/next"
[ -x "$NEXT_BIN" ] || {
  printf '\033[1;31mERROR: %s is missing — build the app before installing the service.\033[0m\n' \
    "$NEXT_BIN" >&2
  exit 1
}

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=Glimmergrove virtual pet demo
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
EnvironmentFile=${APP_DIR}/.env
ExecStart=${NODE_BIN} ${NEXT_BIN} start --hostname 127.0.0.1 --port ${APP_PORT}
Restart=on-failure
RestartSec=5
# Kill the whole control group, and give the server a moment to close its
# listener before SIGKILL. Without this, a hard kill can leave the socket
# held long enough for the next start to lose a race with the last one.
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
