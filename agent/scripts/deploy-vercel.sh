#!/usr/bin/env bash
# One-shot Vercel deploy for apps/store-heating.
# Run this AFTER `vercel login` (one-time browser auth).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$REPO_ROOT/apps/store-heating"

if ! vercel whoami >/dev/null 2>&1; then
  echo "ERROR: Not logged in to Vercel. Run 'vercel login' first."
  exit 1
fi

echo "[deploy] linked to Vercel as: $(vercel whoami 2>&1 | tail -1)"

cd "$APP_DIR"

# Pull current Vercel project (creates one if missing). --yes accepts defaults.
if [ ! -d ".vercel" ]; then
  echo "[deploy] linking project..."
  vercel link --yes --project gberg-store-heating
fi

# Read env from local .env.local and push to Vercel as production env vars.
# Skip empty/placeholder values.
declare -A ENVS
while IFS='=' read -r key val; do
  [[ -z "$key" || "$key" == "#"* ]] && continue
  val="${val%\"}"; val="${val#\"}"
  [[ -z "$val" ]] && continue
  ENVS["$key"]="$val"
done < "$APP_DIR/.env.local"

for key in "${!ENVS[@]}"; do
  val="${ENVS[$key]}"
  echo "[deploy] env $key = ...${val: -6}"
  echo "$val" | vercel env add "$key" production --force --yes 2>&1 | tail -1 || true
done

echo "[deploy] starting production deploy..."
vercel --prod --yes
