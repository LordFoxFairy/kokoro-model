#!/usr/bin/env sh
set -eu

cleanup() {
  docker compose down
}
trap cleanup EXIT

docker compose up --build -d

ready=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:4221/readyz >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" = 1
curl --fail --silent --show-error http://127.0.0.1:4221/healthz >/dev/null

catalog_status=$(curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
  -H "x-kokoro-service: web-bff" \
  -H "x-kokoro-internal-secret: kokoro-local-web-bff" \
  -H "x-kokoro-tenant-id: smoke-tenant" \
  http://127.0.0.1:4221/bff/model-catalog)
test "$catalog_status" = 200

resolve_status=$(curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
  -X POST -H "content-type: application/json" \
  -d '{"requestId":"smoke-resolve","tenantId":"00000000-0000-0000-0000-000000000001","label":"missing"}' \
  http://127.0.0.1:4221/resolve)
test "$resolve_status" = 404

echo "HTTP production smoke passed: /readyz /healthz /bff/model-catalog /resolve"
