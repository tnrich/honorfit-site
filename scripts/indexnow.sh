#!/usr/bin/env bash
# Submit every URL in sitemap.xml to IndexNow (Bing, Yandex, Seznam, Naver...).
#
# Usage: scripts/indexnow.sh [sitemap]   (default: ./sitemap.xml, or the live one
# with SITEMAP=https://honorfitapp.com/sitemap.xml)
#
# The key file /a3cf61dedfd1e4b0792a76457d1ac53f.txt must be deployed first: the
# search engines fetch keyLocation to verify we own the host.
set -euo pipefail

HOST="honorfitapp.com"
KEY="a3cf61dedfd1e4b0792a76457d1ac53f"
KEY_LOCATION="https://${HOST}/${KEY}.txt"
ENDPOINT="https://api.indexnow.org/indexnow"

cd "$(dirname "$0")/.."
SITEMAP="${1:-${SITEMAP:-sitemap.xml}}"

if [[ "$SITEMAP" == http* ]]; then
  xml="$(curl -fsSL "$SITEMAP")"
else
  xml="$(cat "$SITEMAP")"
fi

# Pull every <loc>…</loc> and turn it into a JSON string array.
urls="$(printf '%s' "$xml" | grep -o '<loc>[^<]*</loc>' | sed -e 's#<loc>##' -e 's#</loc>##')"
if [[ -z "$urls" ]]; then
  echo "No <loc> entries found in $SITEMAP" >&2
  exit 1
fi
url_list="$(printf '%s\n' "$urls" | sed -e 's/"/\\"/g' -e 's/.*/"&"/' | paste -sd, -)"

payload="{\"host\":\"${HOST}\",\"key\":\"${KEY}\",\"keyLocation\":\"${KEY_LOCATION}\",\"urlList\":[${url_list}]}"

echo "Submitting $(printf '%s\n' "$urls" | wc -l | tr -d ' ') URLs to IndexNow..."
status="$(curl -sS -o /dev/stderr -w '%{http_code}' -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data "$payload")"
echo
echo "HTTP $status (200/202 = accepted; 403 = key file not reachable; 422 = URL/host mismatch)"
[[ "$status" == 200 || "$status" == 202 ]]
