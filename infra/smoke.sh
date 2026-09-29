#!/bin/sh
# Post-deploy smoke test against production: sh infra/smoke.sh <domain>
# Checks what users and attackers see from outside, not implementation details.
set -u
DOMAIN="${1:?usage: smoke.sh <domain>}"
SITE="https://$DOMAIN"
API="$SITE/api"
failed=0

check() { # <description> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1 (expected '$2', got '$3')"; failed=1; fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
header() { # <header name> <curl args...>: value of a response header ('' if absent)
  name="$1"; shift
  curl -s -o /dev/null -D - "$@" | tr -d '\r' | grep -i "^$name:" | cut -d' ' -f2- | head -n1
}

check "api health (app + database)"      200 "$(status "$API/health")"
check "public portfolio"                 200 "$(status "$API/portfolio")"
check "public GET cacheable at the edge" "public, max-age=60" "$(header cache-control "$API/portfolio")"
check "admin requires a token"           401 "$(status "$API/admin/profile")"
check "admin responses never cached"     "no-store" "$(header cache-control "$API/admin/profile")"
check "swagger hidden in production"     404 "$(status "$API/docs")"
check "site root"                        200 "$(status "$SITE/")"
check "SPA deep link"                    200 "$(status "$SITE/projetos")"
check "missing upload is a real 404"     404 "$(status "$SITE/uploads/does-not-exist.png")"
check "http redirects to https"          301 "$(status "http://$DOMAIN/")"
check "HSTS on the site"                 "max-age=31536000" "$(header strict-transport-security "$SITE/")"

exit "$failed"
