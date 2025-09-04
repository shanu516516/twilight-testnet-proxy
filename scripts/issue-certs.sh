#!/usr/bin/env bash
set -euo pipefail

# ================= USER CONFIG =================
# Base zone, e.g. "testnet.twilight.rest"
DOMAIN="${DOMAIN:-example.com}"

# Subdomains to issue (one cert per subdomain)
# e.g., relayer -> relayer.example.com, etc.
SUBDOMAINS=(
  relayer
  frontend
  lcd
  rpc
  zkos
  faucet
  explorer
  zk-kyc
)

# Set to 1 to ALSO include each host's www alias (www.relayer.example.com)
WITH_WWW="${WITH_WWW:-0}"

# Email for Let's Encrypt registration
LE_EMAIL="${LE_EMAIL:-admin@${DOMAIN}}"

# 1 = use Let's Encrypt STAGING (safe, no rate limits). Set to 0 for production.
STAGING="${STAGING:-0}"

# Host paths (must match docker-compose volumes)
CERTBOT_CONF_DIR="${CERTBOT_CONF_DIR:-./certbot/conf}"   # -> /etc/letsencrypt in certbot
CERTBOT_WWW_DIR="${CERTBOT_WWW_DIR:-./certbot/www}"      # -> /var/www/certbot in certbot

# Name of your running nginx container (to reload at the end)
NGINX_CONTAINER="${NGINX_CONTAINER:-nginx}"
# ===============================================


# ---------- sanity ----------
if [[ -z "$DOMAIN" ]]; then
  echo "ERROR: DOMAIN is empty."
  exit 1
fi

mkdir -p "$CERTBOT_CONF_DIR" "$CERTBOT_WWW_DIR"

# Compose static args
CERTBOT_IMAGE="certbot/certbot:latest"
EMAIL_ARGS=(--email "$LE_EMAIL" --agree-tos --non-interactive)
[[ "$STAGING" == "1" ]] && STAGING_ARG="--staging" || STAGING_ARG=""
WEBROOT_ARGS=(--webroot -w /var/www/certbot)

echo "==> Issuing PER-HOST certificates under domain: $DOMAIN"
echo "==> Using webroot: $CERTBOT_WWW_DIR  and config: $CERTBOT_CONF_DIR"
echo "==> Staging: $STAGING  |  Email: $LE_EMAIL"
echo

# Helpful hint: ensure nginx (HTTP-only or full) is serving:
# location /.well-known/acme-challenge/ { root /var/www/certbot; try_files $uri =404; }

# Loop each subdomain and issue a single-host cert
for sub in "${SUBDOMAINS[@]}"; do
  host="${sub}.${DOMAIN}"

  echo "----> Processing: $host"
  # Build domain list (host plus optional www.host)
  DOMS=(-d "$host")
  if [[ "$WITH_WWW" == "1" ]]; then
    DOMS+=(-d "www.$host")
  fi

  # Use --keep-until-expiring so reruns won't replace valid certs early
  docker run --rm \
    -v "${CERTBOT_CONF_DIR}:/etc/letsencrypt" \
    -v "${CERTBOT_WWW_DIR}:/var/www/certbot" \
    "${CERTBOT_IMAGE}" certonly \
      "${EMAIL_ARGS[@]}" \
      ${STAGING_ARG} \
      "${WEBROOT_ARGS[@]}" \
      --keep-until-expiring \
      "${DOMS[@]}"

  echo "     ✓ Issued/verified: ${host}"
done

# Reload nginx once at the end (no deploy-hook inside certbot container)
echo
echo "==> Reloading Nginx..."
docker exec "${NGINX_CONTAINER}" nginx -s reload
echo "==> Done."

echo
echo "Certs directory tree:"
echo "  ${CERTBOT_CONF_DIR}/live/"
