#!/usr/bin/env bash
# JARVIS OS — verify the library-upgrade deployment end-to-end.
# Usage: bash builds/jarvis-os/scripts/verify-library-upgrade.sh [convex-url-host]
# e.g.  bash builds/jarvis-os/scripts/verify-library-upgrade.sh successful-squirrel-121.convex.cloud
set -uo pipefail

CONVEX_HOST="${1:-successful-squirrel-121.convex.cloud}"
WEB="https://jarvis-os-alpha-two.vercel.app"
TOKEN="verify-$(date +%s)-0123456789abcdef" # fake token: auth check must reject it

fail=0

echo "── Web (Vercel production) ──────────────────────"
for p in / /dashboard/library /dashboard/admin; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$WEB$p")
  echo "$p -> $code"
  [ "$code" = "200" ] || fail=1
done

echo "── Convex backend ($CONVEX_HOST) ────────────────"
for fn in documents:tagCloud documents:listFolders admin:usageByUser; do
  res=$(curl -s --max-time 15 -X POST "https://$CONVEX_HOST/api/query" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$fn\",\"args\":{\"sessionToken\":\"$TOKEN\"},\"format\":\"json\"}")
  if echo "$res" | grep -q "Could not find public function"; then
    echo "$fn → ✗ NOT DEPLOYED (promote the Convex deployment or run a prod deploy)"
    fail=1
  elif echo "$res" | grep -q "unauthorized\|invalid session"; then
    echo "$fn → ✓ live (correctly rejects bad session)"
  else
    echo "$fn → ? unexpected response: $(echo "$res" | head -c 120)"
    fail=1
  fi
done

echo
if [ "$fail" = "0" ]; then
  echo "VERDICT: PASS — library upgrade fully live in production."
else
  echo "VERDICT: INCOMPLETE — fix the ✗ items above and re-run."
fi
exit $fail
