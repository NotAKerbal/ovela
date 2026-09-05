#!/bin/sh
set -eu
# stdin keeps secret values out of command arguments and CLI output.
printf '%s' "$BETTER_AUTH_SECRET" | npx convex env set BETTER_AUTH_SECRET
printf '%s' "$SITE_URL" | npx convex env set SITE_URL
printf '%s' "$OVELA_SETUP_TOKEN" | npx convex env set OVELA_SETUP_TOKEN
printf '%s' 'http://127.0.0.1:3211' | npx convex env set OVELA_INTERNAL_CONVEX_SITE_URL
printf '%s' "$OVELA_IMMICH_CLIENT_SECRET" | npx convex env set OVELA_IMMICH_CLIENT_SECRET
printf '%s' "$IMMICH_URL" | npx convex env set IMMICH_URL
npx convex deploy --yes
npx convex run providers:configureImmich
npx convex run sso:configureImmich
