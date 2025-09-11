#!/usr/bin/env sh
set -eu

# ---- required ----
: "${DOMAIN:?DOMAIN is required (e.g., example.com)}"

# ---- defaults for optional vars (override via ENV) ----
: "${RELAYER_BACKEND:=172.17.0.1:3031}"
: "${ORDERAPI_BACKEND:=172.17.0.1:3032}"
: "${AUTH_BACKEND:=172.17.0.1:5000}"
: "${WEB_BACKEND:=172.17.0.1:8088}"
: "${WS_BACKEND:=172.17.0.1:8088}"
: "${LCD_HOST:=172.17.0.1:1317}"
: "${RPC_HOST:=172.17.0.1:26657}"
: "${FAUCET_HOST:=172.17.0.1:6969}"
: "${EXPLORER_ORIGIN:=172.17.0.1:8081}"
: "${ZKOS_HOST:=172.17.0.1:3030}"
: "${ZKOS_KYC_HOST:=172.17.0.1:3001}"
: "${FRONTEND:=172.17.0.1:3000}"
: "${VERIFIER_URL:=172.17.0.1:8080}"
: "${WHITELIST_HOST:=172.17.0.1:8080}"
: "${PING_PONG_FAUCET_HOST:=172.17.0.1:8082}"
: "${BOOTSTRAP_HTTP_ONLY:=0}"  # 1 => render HTTP-only template
: "${NJS_DEBUG:=1}"

# Ensure output dir exists
mkdir -p /etc/nginx/conf.d
# Check if SSL cert exists, if not force HTTP-only mode
if [ ! -f "/etc/nginx/ssl/live/relayer.${DOMAIN}/fullchain.pem" ]; then
  echo "SSL certificate not found, forcing HTTP-only mode"
  BOOTSTRAP_HTTP_ONLY=1
fi

# Render template -> /etc/nginx/conf.d/default.conf
TEMPLATE="/etc/nginx/templates/nginx.conf.template"
if [ "$BOOTSTRAP_HTTP_ONLY" = "1" ]; then
  TEMPLATE="/etc/nginx/templates/nginx.http-only.template"
fi
# List every variable referenced in the template here:
envsubst '
  $DOMAIN
  $RELAYER_BACKEND
  $ORDERAPI_BACKEND
  $AUTH_BACKEND
  $WEB_BACKEND
  $WS_BACKEND
  $LCD_HOST
  $RPC_HOST
  $FAUCET_HOST
  $TXSUBMIT_HOST
  $EXPLORER_ORIGIN
  $ZKOS_HOST
  $ZKOS_KYC_HOST
  $FRONTEND
  $VERIFIER_URL
  $WHITELIST_HOST
  $PING_PONG_FAUCET_HOST
  $NJS_DEBUG
' < "$TEMPLATE" > /etc/nginx/conf.d/default.conf

# Validate config (fails fast if something's off)
nginx -t

# Run nginx (CMD usually: nginx -g "daemon off;")
exec "$@"
