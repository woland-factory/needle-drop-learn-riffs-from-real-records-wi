#!/bin/sh
# Runs at container start (via nginx's /docker-entrypoint.d). Writes the
# runtime config the SPA reads, filling values from the environment. Empty
# values mean the related feature stays off. Values are escaped so they cannot
# break out of the JSON string.
set -eu

CONFIG_PATH="/usr/share/nginx/html/config.js"

esc() {
  printf '%s' "${1:-}" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat >"$CONFIG_PATH" <<EOF
window.__NEEDLE_DROP_ENV__ = {
  SENTRY_DSN: "$(esc "${SENTRY_DSN:-}")",
  UMAMI_WEBSITE_ID: "$(esc "${UMAMI_WEBSITE_ID:-}")",
  UMAMI_URL: "$(esc "${UMAMI_URL:-}")"
};
EOF
