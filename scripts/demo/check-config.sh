#!/usr/bin/env bash
# Why won't it start? — a read-only check of the deployed configuration.
#
# Run this on the droplet when the service crash-loops with "Invalid
# production configuration". It answers the question the log makes hard
# to read: which variable is the app actually missing?
#
# It prints names and never values. Everything here is read-only; it
# changes nothing and starts nothing.
set -euo pipefail

CONF_FILE="${CONF_FILE:-/etc/glimmergrove-demo.conf}"
SERVICE_NAME="${SERVICE_NAME:-glimmergrove}"
APP_DIR="${APP_DIR:-}"

# Required by src/server/security/configuration.ts in production.
REQUIRED=(
  DATABASE_URL
  RESTOCK_SEED_SECRET
  CRON_SECRET
  DAILY_ROTATION_SECRET
  APP_URL
  TRUSTED_PROXY
)

# Values that mean "this is a local development setup" and are refused in
# production — a present-but-wrong variable fails exactly like a missing
# one, and reads as more confusing.
DEV_FALLBACKS="dev-only-restock-seed dev-local-restock-seed dev-local-cron-secret dev-only-daily-rotation change-me"

if [ -z "$APP_DIR" ]; then
  if [ -f "$CONF_FILE" ]; then
    APP_DIR="$(grep -E '^APP_DIR=' "$CONF_FILE" | cut -d= -f2- | tr -d '"')"
  fi
  APP_DIR="${APP_DIR:-/srv/glimmergrove/app}"
fi
ENV_FILE="$APP_DIR/.env"

echo "app dir:      $APP_DIR"
echo "env file:     $ENV_FILE"
echo "conf file:    $CONF_FILE"

# What systemd is ACTUALLY told to read, which is not always what you
# just edited — a service installed before a path changed keeps the old
# one until daemon-reload.
if command -v systemctl >/dev/null 2>&1; then
  echo "unit reads:   $(systemctl show "$SERVICE_NAME" -p EnvironmentFiles --value 2>/dev/null || echo '(unit not found)')"
  echo "unit workdir: $(systemctl show "$SERVICE_NAME" -p WorkingDirectory --value 2>/dev/null || true)"
fi
echo

if [ ! -f "$ENV_FILE" ]; then
  echo "MISSING      $ENV_FILE does not exist — the app has no configuration at all."
  exit 1
fi

status=0
for name in "${REQUIRED[@]}"; do
  line="$(grep -E "^${name}=" "$ENV_FILE" | tail -1 || true)"
  if [ -z "$line" ]; then
    echo "MISSING      $name"
    status=1
    continue
  fi
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  if [ -z "$value" ]; then
    echo "EMPTY        $name"
    status=1
  elif printf '%s\n' $DEV_FALLBACKS | grep -qxF "$value"; then
    echo "DEV VALUE    $name — refused in production"
    status=1
  elif [ "$name" = "TRUSTED_PROXY" ] && [ "$value" != "true" ] && [ "$value" != "false" ]; then
    echo "NOT true/false  $name — must be exactly \"true\" or \"false\""
    status=1
  else
    echo "ok           $name"
  fi
done

echo
# The conf file is what survives a redeploy. A secret present only in
# .env comes back missing the next time the scripts rewrite it, which is
# the same outage again a week later.
if [ -f "$CONF_FILE" ]; then
  for name in RESTOCK_SEED_SECRET CRON_SECRET DAILY_ROTATION_SECRET; do
    if ! grep -qE "^${name}=" "$CONF_FILE"; then
      echo "NOT PERSISTED  $name is in .env but not in $CONF_FILE —"
      echo "               the next redeploy will lose it."
      status=1
    fi
  done
fi

if [ "$status" -eq 0 ]; then
  echo "Configuration looks complete. If the service still will not start,"
  echo "read the whole error (the pager chops long lines):"
  echo
  echo "  journalctl -u ${SERVICE_NAME} -n 200 --no-pager | tail -40"
fi
exit "$status"
