# Restoring from a backup

Read this once now, not for the first time during an incident.

## What the backups contain

`scripts/backup.sh` writes a `pg_dump` custom-format archive of the whole
database to `backups/` every night: tables, data, indexes and constraints,
including every training record, signature, audit event and uploaded
photograph.

It does **not** contain roles, grants, row-level security policies or the
`SECURITY DEFINER` functions authentication depends on. Those live in
`drizzle/guards.sql` and `drizzle/rls.sql` and are reapplied on restore, which
`scripts/restore.sh` does for you.

## Restoring

```bash
cd /opt/teamtraining
./scripts/restore.sh backups/teamtraining-20260101T020000Z.dump
```

It stops the application, restores, reapplies the triggers and policies, and
starts the application again. It asks you to type the database name first,
because it replaces everything.

## Then prove it

A restore that appears to work is not the same as a restore that worked.

```bash
docker compose run --rm migrate npm run verify
docker compose run --rm migrate npm run test:isolation
```

`verify` walks every audit-trail hash chain and every stored photograph, and
confirms each database guard still refuses what it must. If a chain does not
verify after a restore, the archive is damaged — use an older one.

`test:isolation` confirms the application role came back without superuser
rights. A restore that silently left the app connecting as the owner would work
perfectly and have no tenant isolation at all.

## Practise it

Do this once, before there are real records, and again whenever the schema
changes materially. It restores into a scratch database alongside the live one,
so nothing in production is touched:

```bash
cd /opt/teamtraining
set -a; source .env.production; set +a

# A scratch database inside the running Postgres container
docker compose exec -T db createdb -U "$DB_OWNER" teamtraining_drill

docker compose exec -T db \
  pg_restore -U "$DB_OWNER" -d teamtraining_drill --no-owner \
  < backups/<a recent dump>

# Did the records actually come back?
docker compose exec -T db psql -U "$DB_OWNER" -d teamtraining_drill -c \
  "SELECT (SELECT count(*) FROM users)      AS people,
          (SELECT count(*) FROM signatures) AS signatures,
          (SELECT count(*) FROM events)     AS audit_events;"

docker compose exec -T db dropdb -U "$DB_OWNER" teamtraining_drill
```

Time it. A restore you have rehearsed is a twenty-minute inconvenience; one you
have not is an open-ended outage.

`scripts/restore.sh` is the real thing and restores **over** the live database,
so do not reach for it as a drill.

## If the machine is gone

The backups live on the same machine as the database, which protects you from a
mistake but not from losing the box. `scripts/backup.sh` has a commented block
near the bottom for copying each dump offsite — set one of those up.

To rebuild from nothing:

```bash
git clone https://github.com/144collective-bit/TeamTraining.git /opt/teamtraining
cd /opt/teamtraining
cp .env.production.example .env.production   # restore your saved values
docker compose --env-file .env.production up -d --build
./scripts/restore.sh <your offsite dump>
```

Keep a copy of `.env.production` somewhere safe and separate. Without
`SESSION_SECRET` everyone is signed out; without the database passwords the
dump is not much use.
