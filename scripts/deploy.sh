#!/usr/bin/env bash
#
# Pulls the latest code, rebuilds, migrates and restarts.
#
#   ./scripts/deploy.sh              # deploy the current branch
#   ./scripts/deploy.sh main         # deploy a specific branch
#
# Takes a backup first, so a bad migration is recoverable.

set -euo pipefail

cd "$(dirname "$0")/.."

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.production.example and fill it in." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file "$ENV_FILE")

echo "==> Backing up before changing anything"
# Through COMPOSE, not a bare `docker compose`: the file interpolates required
# variables, so without the env file this check fails and would silently skip
# the backup on every deploy.
if "${COMPOSE[@]}" ps --status running --services | grep -q '^db$'; then
  ENV_FILE="$ENV_FILE" ./scripts/backup.sh
else
  echo "    database is not running yet — first deploy, nothing to back up"
fi

echo "==> Fetching ${BRANCH}"
git fetch --quiet origin "$BRANCH"
# -B, so this works whether or not the branch already exists locally, and
# discards any drift on the server.
git checkout --quiet -B "$BRANCH" FETCH_HEAD
echo "    $(git log --oneline -1)"

echo "==> Building"
"${COMPOSE[@]}" build

echo "==> Migrating"
# Runs to completion and exits; a failure here stops the deploy before the new
# application starts against a half-migrated database.
"${COMPOSE[@]}" run --rm migrate

echo "==> Starting"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> Waiting for health"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T app node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      2>/dev/null; then
    echo "    healthy"
    echo ""
    echo "Deployed. Confirm tenant isolation still holds:"
    echo "  ${COMPOSE[*]} run --rm migrate npm run test:isolation"
    exit 0
  fi
  sleep 2
done

echo "    did not become healthy in 60s" >&2
"${COMPOSE[@]}" logs --tail 40 app >&2
exit 1
