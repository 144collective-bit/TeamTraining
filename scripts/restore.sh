#!/usr/bin/env bash
#
# Restores a dump taken by scripts/backup.sh.
#
#   ./scripts/restore.sh backups/teamtraining-20260101T020000Z.dump
#
# DESTRUCTIVE: replaces the current contents of the database.

set -euo pipefail

cd "$(dirname "$0")/.."

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 <dump-file>" >&2
  echo "" >&2
  echo "Available:" >&2
  ls -1t backups/*.dump 2>/dev/null | head -10 >&2 || echo "  (none)" >&2
  exit 1
fi

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose)

# Sourcing the env file would otherwise overwrite a DB_NAME given on the command
# line — and a drill aimed at a scratch database would land on production.
DB_NAME_GIVEN="${DB_NAME:-}"

if [[ -f "$ENV_FILE" ]]; then
  COMPOSE=(docker compose --env-file "$ENV_FILE")
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi
if [[ -n "$DB_NAME_GIVEN" ]]; then DB_NAME="$DB_NAME_GIVEN"; fi

: "${DB_OWNER:?set DB_OWNER}"
: "${DB_NAME:=teamtraining}"

echo "This REPLACES the contents of ${DB_NAME} with ${DUMP}."
read -r -p "Type the database name to confirm: " CONFIRM
[[ "$CONFIRM" == "$DB_NAME" ]] || { echo "Aborted."; exit 1; }

echo "Stopping the application so nothing writes during the restore…"
"${COMPOSE[@]}" stop app

echo "Restoring…"
"${COMPOSE[@]}" exec -T -e PGPASSWORD="${DB_OWNER_PASSWORD}" db \
  pg_restore -U "$DB_OWNER" -d "$DB_NAME" --clean --if-exists --no-owner \
  < "$DUMP"

# The dump carries tables and data. Roles, grants, policies and the SECURITY
# DEFINER functions live outside it, so reapply them.
echo "Reapplying triggers and row-level security…"
"${COMPOSE[@]}" run --rm migrate

echo "Starting the application…"
"${COMPOSE[@]}" up -d app

echo ""
echo "Restored. Now prove it held:"
echo "  ${COMPOSE[*]} run --rm migrate npm run verify"
echo "  ${COMPOSE[*]} run --rm migrate npm run test:isolation"
