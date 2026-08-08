#!/usr/bin/env bash
#
# Glimmergrove demo — wipe everything and redeploy from scratch.
#
# Stops the app, DROPS the demo database (all players, pets, and items),
# deletes the app directory, clones a fresh copy of the repository,
# rebuilds, re-migrates, re-seeds, and restarts the server.
#
# Usage (as root on the droplet):
#   glimmergrove-redeploy          # asks for confirmation
#   glimmergrove-redeploy --yes    # no prompt (for scripted use)
#
# Reads its settings (repo, branch, domain, database credentials) from
# /etc/glimmergrove-demo.conf, which is written by setup-droplet.sh.
# Edit that file to deploy a different branch, then re-run this script.

set -euo pipefail

CONF_FILE="/etc/glimmergrove-demo.conf"
# next build's type-check worker needs more heap than Node's default cap
# (roughly half of RAM — under 512 MB on a 1 GB droplet). The swap check
# below makes this size safe even on the smallest droplets.
BUILD_NODE_OPTIONS="--max-old-space-size=2048"

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this script as root (e.g. sudo glimmergrove-redeploy)."
[ -f "$CONF_FILE" ] || die "Missing ${CONF_FILE}. Run scripts/demo/setup-droplet.sh first."

# shellcheck source=/dev/null
source "$CONF_FILE"

for required in DOMAIN REPO_URL BRANCH APP_USER APP_DIR APP_PORT DB_NAME DB_USER DB_PASSWORD SERVICE_NAME; do
  [ -n "${!required:-}" ] || die "${CONF_FILE} is missing ${required}."
done

# Secrets required by production startup validation. Conf files written
# before these existed get them generated and persisted here.
if [ -z "${RESTOCK_SEED_SECRET:-}" ]; then
  RESTOCK_SEED_SECRET="$(openssl rand -hex 32)"
  echo "RESTOCK_SEED_SECRET=\"${RESTOCK_SEED_SECRET}\"" >> "$CONF_FILE"
fi
if [ -z "${CRON_SECRET:-}" ]; then
  CRON_SECRET="$(openssl rand -hex 32)"
  echo "CRON_SECRET=\"${CRON_SECRET}\"" >> "$CONF_FILE"
fi
# Keys every per-band rotation (ADR-44, ADR-45, ADR-53). Persisted rather
# than regenerated per deploy: rotating it moves every band's future word,
# hiding place, and slate, which is survivable but not something a routine
# redeploy should do silently.
if [ -z "${DAILY_ROTATION_SECRET:-}" ]; then
  DAILY_ROTATION_SECRET="$(openssl rand -hex 32)"
  echo "DAILY_ROTATION_SECRET=\"${DAILY_ROTATION_SECRET}\"" >> "$CONF_FILE"
fi

ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    *) die "Unknown option: ${arg} (only -y/--yes is supported)" ;;
  esac
done

echo "This will:"
echo "  1. Stop the ${SERVICE_NAME} service"
echo "  2. DROP the '${DB_NAME}' database — all players, pets, and inventories are deleted"
echo "  3. Delete ${APP_DIR}"
echo "  4. Clone ${REPO_URL} (branch: ${BRANCH})"
echo "  5. Rebuild, re-migrate, re-seed, and restart"
if [ "$ASSUME_YES" -ne 1 ]; then
  [ -t 0 ] || die "No terminal available for confirmation. Re-run with --yes."
  read -r -p "Continue? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) die "Aborted — nothing was changed." ;;
  esac
fi

log "Stopping ${SERVICE_NAME}"
systemctl stop "$SERVICE_NAME" 2>/dev/null || true

# Safety net: even a deliberate wipe keeps one restorable copy
# (docs/operations.md — Backups and restore).
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  BACKUP_DIR="/var/backups/glimmergrove"
  BACKUP_FILE="${BACKUP_DIR}/pre-redeploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
  log "Backing up ${DB_NAME} to ${BACKUP_FILE}"
  mkdir -p "$BACKUP_DIR"
  chown postgres:postgres "$BACKUP_DIR"
  sudo -u postgres pg_dump --format=custom --file="$BACKUP_FILE" "$DB_NAME"
  # Keep the five most recent pre-redeploy backups.
  ls -1t "${BACKUP_DIR}"/pre-redeploy-*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

log "Recreating database ${DB_NAME}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);"
sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

log "Fetching a fresh copy of the repository"
rm -rf "$APP_DIR"
sudo -u "$APP_USER" -H git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"

[ -f "$APP_DIR/package.json" ] || die "Branch '${BRANCH}' does not contain the game (no package.json). \
Fix BRANCH in ${CONF_FILE} and re-run."

# Update the installed command from the fresh clone NOW, not only after a
# successful deploy — otherwise a fix to this script can never reach a
# droplet whose current copy fails partway (the run that would install
# the fix dies first). The running process keeps executing the old copy;
# the fix applies on the next invocation.
if [ -f "$APP_DIR/scripts/demo/redeploy.sh" ]; then
  install -m 755 "$APP_DIR/scripts/demo/redeploy.sh" /usr/local/bin/glimmergrove-redeploy
fi

log "Writing app .env"
cat > "$APP_DIR/.env" <<ENV
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
RESTOCK_SEED_SECRET="${RESTOCK_SEED_SECRET}"
CRON_SECRET="${CRON_SECRET}"
DAILY_ROTATION_SECRET="${DAILY_ROTATION_SECRET}"
APP_URL="https://${DOMAIN}"
# nginx in front of the app OVERWRITES X-Real-IP and X-Forwarded-For
# with the real peer address (never appends the client's own value),
# so the app may trust them.
TRUSTED_PROXY="true"
ENV
chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# Droplets set up before swap provisioning was added (or that lost their
# swapfile) would OOM during the build; mirror setup-droplet.sh here.
if ! swapon --show | grep -q .; then
  total_mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  if [ "$total_mem_kb" -lt 2000000 ]; then
    log "Adding a 2G swapfile (small droplet, needed for the Next.js build)"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

log "Installing dependencies and building (this can take a few minutes)"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && NEXT_TELEMETRY_DISABLED=1 npm ci"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='${BUILD_NODE_OPTIONS}' npm run build"

log "Applying database migrations and seed data"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npx prisma migrate deploy"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npx prisma db seed"

log "Starting ${SERVICE_NAME}"
systemctl start "$SERVICE_NAME"

log "Waiting for the app to answer"
app_ok=0
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/sign-in" >/dev/null 2>&1; then
    app_ok=1
    break
  fi
  sleep 2
done
[ "$app_ok" -eq 1 ] || die "The app did not respond on port ${APP_PORT}. Check: journalctl -u ${SERVICE_NAME} -n 100"

log "Done!"
cat <<SUMMARY

  Fresh deployment is live.

  URL:      https://${DOMAIN}
  Branch:   ${BRANCH}
  Commit:   $(cd "$APP_DIR" && git rev-parse --short HEAD)
  Logs:     journalctl -u ${SERVICE_NAME} -f

  The database was reset: all demo accounts and pets were wiped, and
  seed data (species, items, shop) was reloaded.

SUMMARY
