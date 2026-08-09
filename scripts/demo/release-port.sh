#!/usr/bin/env bash
#
# Glimmergrove demo — make sure nothing is still holding the app's port.
#
# `systemctl stop` returning is not the same as the socket being free. If
# anything is still listening — an orphan from a run through `npm run
# start`, a server someone launched by hand outside systemd, a socket in
# the process of closing — the next start dies with EADDRINUSE on every
# retry, and the deploy reports "the app did not respond on port 3000"
# minutes later, which sends everyone looking at configuration instead of
# at a stray process.
#
# install-service.sh removes the likeliest way to get into that state.
# This gets out of it, whatever put the droplet there.
#
# Usage (as root, after stopping the service):
#   APP_PORT=... SERVICE_NAME=... bash scripts/demo/release-port.sh

set -euo pipefail

for required in APP_PORT SERVICE_NAME; do
  if [ -z "${!required:-}" ]; then
    printf '\033[1;31mERROR: release-port.sh needs %s\033[0m\n' "$required" >&2
    exit 1
  fi
done

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

# Say so rather than reporting a free port. Without this the whole script
# degrades to "looks free to me" on a machine where it cannot look, which
# is the least useful thing it could do.
command -v ss >/dev/null 2>&1 || {
  printf '\033[1;33mWARNING: ss (iproute2) is not installed; cannot check port %s.\033[0m\n' \
    "$APP_PORT" >&2
  exit 0
}

port_held() {
  ss -ltn "sport = :${APP_PORT}" 2>/dev/null | grep -q ":${APP_PORT}"
}

for _ in $(seq 1 15); do
  port_held || exit 0
  sleep 1
done

log "Port ${APP_PORT} is still held after stopping ${SERVICE_NAME}"
ss -ltnp "sport = :${APP_PORT}" 2>/dev/null || true

# An orphan holding the app's own port on the app's own droplet is
# unambiguous, so it is cleared rather than reported. Nothing else here
# listens on it — nginx proxies to the port and never binds it.
#
# The pid comes from `ss` rather than `fuser`: iproute2 is on every Ubuntu
# image, psmisc is not, and a redeploy onto a droplet built by an older
# version of setup-droplet.sh cannot assume the latter.
log "Clearing it"
held_pid="$(ss -ltnp "sport = :${APP_PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
if [ -n "$held_pid" ]; then
  kill "$held_pid" 2>/dev/null || true
  sleep 3
  kill -9 "$held_pid" 2>/dev/null || true
fi
sleep 2

if port_held; then
  printf '\033[1;31mERROR: Port %s is still in use and could not be freed. Find the owner with: ss -ltnp %s\033[0m\n' \
    "$APP_PORT" "'sport = :${APP_PORT}'" >&2
  exit 1
fi
