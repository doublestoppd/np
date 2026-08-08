#!/usr/bin/env bash
#
# Glimmergrove demo — one-shot DigitalOcean droplet setup.
#
# Installs and configures everything needed to serve the game at
# https://$DOMAIN on a fresh Ubuntu droplet:
#   Node.js 22, PostgreSQL, nginx (TLS via an existing Let's Encrypt
#   certificate), a dedicated app user, a systemd service, a firewall,
#   and the app itself (clone, build, migrate, seed).
#
# Usage (as root on the droplet):
#   bash setup-droplet.sh
#
# Overridable via environment variables:
#   DOMAIN    (default: anrpg.com)
#   REPO_URL  (default: https://github.com/doublestoppd/np.git)
#   BRANCH    (default: main)
#
# Safe to re-run: re-running redeploys the app and refreshes config.
# See demo-hosting.md at the repository root for the full guide.

set -euo pipefail

DOMAIN="${DOMAIN:-anrpg.com}"
REPO_URL="${REPO_URL:-https://github.com/doublestoppd/np.git}"
BRANCH="${BRANCH:-main}"

APP_USER="glimmer"
APP_ROOT="/srv/glimmergrove"
APP_DIR="${APP_ROOT}/app"
APP_PORT="3000"
DB_NAME="virtualpet"
DB_USER="vpet"
SERVICE_NAME="glimmergrove"
CONF_FILE="/etc/glimmergrove-demo.conf"
NODE_MAJOR="22"
# next build's type-check worker needs more heap than Node's default cap
# (roughly half of RAM — under 512 MB on a 1 GB droplet). The swapfile
# provisioned below makes this size safe even on the smallest droplets.
BUILD_NODE_OPTIONS="--max-old-space-size=2048"

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this script as root (e.g. sudo bash setup-droplet.sh)."
command -v apt-get >/dev/null 2>&1 || die "This script expects an Ubuntu/Debian droplet (apt-get not found)."

export DEBIAN_FRONTEND=noninteractive

log "Installing system packages"
apt-get update -y
apt-get install -y \
  ca-certificates curl git gnupg openssl sudo ufw \
  nginx postgresql postgresql-contrib \
  certbot python3-certbot-nginx

log "Ensuring swap space (protects small droplets during the Next.js build)"
if ! swapon --show | grep -q .; then
  total_mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  if [ "$total_mem_kb" -lt 2000000 ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Added a 2G swapfile."
  else
    echo "Droplet has >= 2GB RAM; no swap needed."
  fi
else
  echo "Swap already present."
fi

log "Installing Node.js ${NODE_MAJOR}"
need_node=1
if command -v node >/dev/null 2>&1; then
  installed_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$installed_major" -ge "$NODE_MAJOR" ]; then
    need_node=0
  fi
fi
if [ "$need_node" -eq 1 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "Using Node $(node --version) / npm $(npm --version)"

log "Creating app user and directories"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_ROOT" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_ROOT"
chown "$APP_USER":"$APP_USER" "$APP_ROOT"

log "Configuring PostgreSQL"
systemctl enable --now postgresql

# Reuse existing credentials/secrets when re-running.
conf_value() {
  [ -f "$CONF_FILE" ] || return 0
  grep -E "^$1=" "$CONF_FILE" | cut -d= -f2- | tr -d '"' || true
}
DB_PASSWORD="$(conf_value DB_PASSWORD)"
[ -n "$DB_PASSWORD" ] || DB_PASSWORD="$(openssl rand -hex 24)"
# Production startup validation refuses to boot without real values for
# these (src/server/security/configuration.ts). Rotating the restock seed
# changes all future NPC restock results, so it is preserved across runs.
RESTOCK_SEED_SECRET="$(conf_value RESTOCK_SEED_SECRET)"
[ -n "$RESTOCK_SEED_SECRET" ] || RESTOCK_SEED_SECRET="$(openssl rand -hex 32)"
CRON_SECRET="$(conf_value CRON_SECRET)"
[ -n "$CRON_SECRET" ] || CRON_SECRET="$(openssl rand -hex 32)"
# Keys every per-band rotation (ADR-44, ADR-45, ADR-53). Preserved across
# runs for the same reason as the restock seed: rotating it moves every
# band's future word, hiding place, and slate.
DAILY_ROTATION_SECRET="$(conf_value DAILY_ROTATION_SECRET)"
[ -n "$DAILY_ROTATION_SECRET" ] || DAILY_ROTATION_SECRET="$(openssl rand -hex 32)"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE ${DB_USER} LOGIN;"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

log "Writing ${CONF_FILE}"
cat > "$CONF_FILE" <<CONF
# Glimmergrove demo configuration.
# Written by setup-droplet.sh; read by glimmergrove-redeploy.
# Edit REPO_URL/BRANCH here to change what gets deployed, then run
# glimmergrove-redeploy.
DOMAIN="${DOMAIN}"
REPO_URL="${REPO_URL}"
BRANCH="${BRANCH}"
APP_USER="${APP_USER}"
APP_ROOT="${APP_ROOT}"
APP_DIR="${APP_DIR}"
APP_PORT="${APP_PORT}"
DB_NAME="${DB_NAME}"
DB_USER="${DB_USER}"
DB_PASSWORD="${DB_PASSWORD}"
SERVICE_NAME="${SERVICE_NAME}"
RESTOCK_SEED_SECRET="${RESTOCK_SEED_SECRET}"
CRON_SECRET="${CRON_SECRET}"
DAILY_ROTATION_SECRET="${DAILY_ROTATION_SECRET}"
CONF
chmod 600 "$CONF_FILE"

log "Cloning ${REPO_URL} (branch: ${BRANCH})"
rm -rf "$APP_DIR"
sudo -u "$APP_USER" -H git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"

[ -f "$APP_DIR/package.json" ] || die "Branch '${BRANCH}' does not contain the game (no package.json). \
Re-run with BRANCH set to the branch that has the game code."

# Install the redeploy helper from the fresh clone before anything that
# can fail (like the build), so script fixes always reach the droplet.
log "Installing the glimmergrove-redeploy helper"
if [ -f "$APP_DIR/scripts/demo/redeploy.sh" ]; then
  install -m 755 "$APP_DIR/scripts/demo/redeploy.sh" /usr/local/bin/glimmergrove-redeploy
else
  warn "scripts/demo/redeploy.sh not found in the deployed branch; skipping helper install."
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

log "Installing dependencies and building (this can take a few minutes)"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && NEXT_TELEMETRY_DISABLED=1 npm ci"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS='${BUILD_NODE_OPTIONS}' npm run build"

log "Applying database migrations and seed data"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npx prisma migrate deploy"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npx prisma db seed"

log "Installing systemd service"
NPM_BIN="$(command -v npm)"
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
ExecStart=${NPM_BIN} run start -- --hostname 127.0.0.1 --port ${APP_PORT}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

log "Configuring nginx for ${DOMAIN}"
mkdir -p /var/www/letsencrypt

CERT_DIR=""
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
else
  # Certbot sometimes suffixes the directory (e.g. anrpg.com-0001).
  CERT_DIR="$(find /etc/letsencrypt/live -maxdepth 1 -type d -name "${DOMAIN}*" 2>/dev/null | head -n 1 || true)"
  [ -n "$CERT_DIR" ] && [ ! -f "$CERT_DIR/fullchain.pem" ] && CERT_DIR=""
fi

if [ -n "$CERT_DIR" ]; then
  echo "Using certificate at ${CERT_DIR}"
  cat > /etc/nginx/sites-available/glimmergrove <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NGINX
else
  warn "No Let's Encrypt certificate found under /etc/letsencrypt/live for ${DOMAIN}."
  warn "Serving over plain HTTP for now. To enable HTTPS:"
  warn "  1. Make sure DNS for ${DOMAIN} points at this droplet."
  warn "  2. Run: certbot --nginx -d ${DOMAIN}"
  warn "  3. Re-run this setup script to switch nginx to the HTTPS config."
  cat > /etc/nginx/sites-available/glimmergrove <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto http;
    }
}
NGINX
fi

ln -sf ../sites-available/glimmergrove /etc/nginx/sites-enabled/glimmergrove
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Configuring firewall (ufw)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable

log "Installing scheduled jobs (restock + nightly backup)"
mkdir -p /var/backups/glimmergrove
cat > /etc/cron.d/glimmergrove <<CRON
# NPC shop restocks (idempotent; the app also restocks lazily on demand).
*/30 * * * * root curl -fsS -m 60 -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:${APP_PORT}/api/internal/restock >/dev/null 2>&1
# Nightly database backup with 14-day retention (docs/operations.md).
15 4 * * * postgres pg_dump --format=custom --file=/var/backups/glimmergrove/nightly-\$(date -u +\%Y\%m\%d).dump ${DB_NAME} && find /var/backups/glimmergrove -name 'nightly-*.dump' -mtime +14 -delete
CRON
chmod 644 /etc/cron.d/glimmergrove
chown postgres:postgres /var/backups/glimmergrove

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

  Glimmergrove demo is running.

  URL:            $([ -n "$CERT_DIR" ] && echo "https://${DOMAIN}" || echo "http://${DOMAIN}  (HTTPS not yet enabled)")
  App directory:  ${APP_DIR}
  Service:        systemctl status ${SERVICE_NAME}
  Logs:           journalctl -u ${SERVICE_NAME} -f
  Config:         ${CONF_FILE}
  Wipe+redeploy:  glimmergrove-redeploy

  If the domain does not load, confirm the DNS A record for ${DOMAIN}
  points at this droplet's public IP.

SUMMARY
