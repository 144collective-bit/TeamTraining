#!/usr/bin/env bash
#
# Takes a compressed dump of the database, verifies it is readable, and prunes
# old ones.
#
#   ./scripts/backup.sh
#
# Intended for cron. Add on the server:
#
#   0 2 * * * cd /opt/teamtraining && ./scripts/backup.sh >> backups/backup.log 2>&1
#
# This system exists so that training records hold up years later. A backup you
# have never restored is not a backup — see RESTORE.md, and actually do it once.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose)
if [[ -f "$ENV_FILE" ]]; then
  COMPOSE=(docker compose --env-file "$ENV_FILE")
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi

: "${DB_OWNER:?set DB_OWNER, or point ENV_FILE at your env file}"
: "${DB_NAME:=teamtraining}"

RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="backups"
OUT="${OUT_DIR}/${DB_NAME}-${STAMP}.dump"

mkdir -p "$OUT_DIR"

echo "[$(date -u +%FT%TZ)] dumping ${DB_NAME}"

# Custom format: compressed, and restorable selectively with pg_restore.
"${COMPOSE[@]}" exec -T -e PGPASSWORD="${DB_OWNER_PASSWORD}" db \
  pg_dump -U "$DB_OWNER" -d "$DB_NAME" --format=custom --no-owner \
  > "$OUT"

if [[ ! -s "$OUT" ]]; then
  echo "FAILED: dump is empty" >&2
  rm -f "$OUT"
  exit 1
fi

# A dump that pg_restore cannot list is not a dump. Catch it now, not during an
# emergency at 3am.
if ! "${COMPOSE[@]}" exec -T db pg_restore --list /dev/stdin < "$OUT" > /dev/null 2>&1; then
  echo "FAILED: dump is not readable by pg_restore" >&2
  mv "$OUT" "${OUT}.corrupt"
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date -u +%FT%TZ)] wrote ${OUT} (${SIZE}), verified readable"

# The dump just taken is excluded by name, so that if backups have not run for
# longer than the retention window the pruning cannot leave you with nothing.
find "$OUT_DIR" -name "${DB_NAME}-*.dump" -type f \
  ! -name "$(basename "$OUT")" \
  -mtime "+${RETAIN_DAYS}" -print -delete \
  | sed 's/^/  pruned /' || true

COUNT="$(find "$OUT_DIR" -name "${DB_NAME}-*.dump" -type f | wc -l | tr -d ' ')"
echo "[$(date -u +%FT%TZ)] ${COUNT} backup(s) retained"

# ---------------------------------------------------------------------------
# Offsite.
#
# A backup on the same machine as the database protects you from a mistake, not
# from losing the machine. Uncomment one of these, or add your own.
# ---------------------------------------------------------------------------
# rclone copy "$OUT" remote:teamtraining-backups/
# aws s3 cp "$OUT" s3://your-bucket/teamtraining/
# scp "$OUT" backups@another-host:/srv/teamtraining/
if [[ -z "${BACKUP_OFFSITE_CONFIGURED:-}" ]]; then
  echo "NOTE: backups are only on this machine. Configure an offsite copy in scripts/backup.sh."
fi
