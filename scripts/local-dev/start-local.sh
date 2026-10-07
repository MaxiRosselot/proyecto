#!/usr/bin/env bash
# Starts the whole local stack for client testing through the ngrok tunnel.
#   bash scripts/local-dev/start-local.sh [public-url]
# Everything is local: no Google Calendar / Sheets and no production data are touched.
set -euo pipefail

PUBLIC_URL="${1:-https://d981-200-86-209-227.ngrok-free.app}"
ERP_DIR="V:/dev/repisas-mini-erp"
THREED_DIR="V:/dev/repisas-3d-quote-demo"

echo "Public URL: $PUBLIC_URL"

# 1. Configurador 3D ya compilado (pnpm build), servido con vite preview
cd "$THREED_DIR/apps/web"
./node_modules/.bin/vite preview --host 127.0.0.1 --port 3000 --strictPort > /tmp/repisas-web.log 2>&1 &
echo "  configurador -> http://127.0.0.1:3000"

# 2. Local functions backend (seeded visits/quotes instead of Google)
cd "$ERP_DIR"
LOCAL_PUBLIC_URL="$PUBLIC_URL" node scripts/local-dev/server.mjs > /tmp/local-api.log 2>&1 &
echo "  functions   -> http://127.0.0.1:8899"

# 3. Mini ERP dev server, proxying functions + configurator through one origin
VITE_NETLIFY_FUNCTIONS_PROXY=http://127.0.0.1:8899 \
VITE_REPISAS_3D_PROXY=http://127.0.0.1:3000 \
./node_modules/.bin/vite --host 0.0.0.0 --port 5176 > mini-erp-dev.stdout.log 2>&1 &
echo "  mini ERP    -> http://127.0.0.1:5176/admin"

sleep 12
echo
curl -s -o /dev/null -w "%{http_code}" -m 5 http://127.0.0.1:3000/embed && echo " <- configurador"
tail -4 /tmp/local-api.log
