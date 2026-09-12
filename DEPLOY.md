# Deploying

The app is a standard Next.js deployment, but it needs a Postgres database with
two roles and the SQL in `drizzle/` applied. That setup is not optional: the
security model depends on the application connecting as a role that cannot
bypass row-level security.

There are two supported routes:

| | **A — one VPS** | **B — managed Postgres** |
|---|---|---|
| Where | Hostinger, Hetzner, any Ubuntu box | Vercel + Neon/Supabase |
| Database | In the stack, on the same machine | The provider's |
| TLS | Caddy, automatic | The platform's |
| Backups | `scripts/backup.sh` — **yours to run** | The provider's, usually |
| Prepared statements | On (direct connection) | Off (pooler) |
| Read | [Route A](#route-a--one-vps) | [Route B](#route-b--managed-postgres), from step 1 |

Route A is the one to take if the records must stay on hardware you control, or
if you would rather pay for one box than for a platform and a database.
Everything in Route B still applies underneath it — Route A just runs those same
steps for you inside containers.

---

# Route A — one VPS

Tested against Ubuntu 22.04/24.04 with 2 vCPU and 4 GB of memory, which is
comfortable for a few hundred people. The stack is four containers: Postgres,
a one-shot migration job, the app, and Caddy for TLS.

## A1. Point the domain at the box

An `A` record for, say, `training.yourcompany.co.uk` to the server's IPv4
address. Do this first — Caddy will not get a certificate until DNS resolves.

## A2. Install Docker

```bash
ssh root@<your-server-ip>
curl -fsSL https://get.docker.com | sh
```

Then close the machine up. This is a box on the public internet holding
personnel records:

```bash
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable
```

Nothing else needs to be reachable. Postgres is not published to the host at
all — the containers talk to it over the internal network.

## A3. Get the code and fill in the secrets

```bash
git clone https://github.com/144collective-bit/TeamTraining.git /opt/teamtraining
cd /opt/teamtraining
cp .env.production.example .env.production
```

Edit `.env.production`. Every blank in it matters:

| Variable | What to put |
|---|---|
| `SITE_ADDRESS` | Your domain, e.g. `training.yourcompany.co.uk`. Caddy gets the certificate for exactly this name |
| `DB_NAME` | `teamtraining` is fine |
| `DB_OWNER` / `DB_OWNER_PASSWORD` | The schema owner. Migrations only |
| `DB_APP_USER` / `DB_APP_PASSWORD` | The role the app connects as. **Must differ from the owner** — see step 2 below for why |
| `SESSION_SECRET` | `openssl rand -base64 32` |

```bash
chmod 600 .env.production
```

Two passwords and a session secret. Generate all three, and keep a copy
somewhere other than this machine — `RESTORE.md` explains what each one costs
you if it is lost.

## A4. Bring it up

```bash
docker compose --env-file .env.production up -d --build
```

The first run builds two images, starts Postgres, runs the migration container
to completion — schema, then the triggers and row-level security policies — and
only then starts the app. If migration fails, the app never starts against a
half-migrated database.

```bash
docker compose --env-file .env.production ps          # all up, db healthy
docker compose --env-file .env.production logs -f app
curl -sS https://training.yourcompany.co.uk/api/health
```

`{"status":"ok","database":"ok"}` means the app is up and can reach the
database. That is the same endpoint Caddy and the container healthcheck poll.

## A5. Prove the isolation took effect

Before anyone signs in:

```bash
docker compose --env-file .env.production run --rm migrate npm run test:isolation
```

Read [step 6](#6-verify) for what it is actually checking. If the first two
lines fail, the app is connecting as the owner and there is no tenant isolation
— stop and fix `.env.production`.

## A6. Create the organisation

Open `https://training.yourcompany.co.uk`. An empty database sends you to a
one-time setup page that creates your organisation and your administrator
account, then closes permanently. There are no default credentials.

## A7. Back it up — before it matters

```bash
crontab -e
```

```cron
0 2 * * * cd /opt/teamtraining && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Each run dumps the database, checks the dump is readable by `pg_restore`, and
prunes ones older than 30 days while always keeping the newest.

**The dumps land on the same machine as the database.** That covers a mistake,
not a lost server. `scripts/backup.sh` has a commented block near the bottom for
copying each dump offsite — set one up, and then read `RESTORE.md` and actually
rehearse a restore once. This system exists so that a competence record still
stands up in three years.

## A8. Deploying a change

```bash
cd /opt/teamtraining
./scripts/deploy.sh
```

Backs up, fetches, rebuilds, migrates, restarts, and waits for the health
endpoint. A failed migration stops it before the new app starts.

## Notes on Route A

- **Prepared statements are on** (`DATABASE_PREPARE=true` in the compose file).
  The app talks to Postgres directly, with no transaction pooler in between, so
  they are both safe and worth having.
- **Postgres is initialised with `--locale=C`**, so text ordering cannot change
  under a base-image upgrade and quietly corrupt an index.
- **Caddy renews the certificate itself.** There is no certbot cron to forget.
- **Upload size** is capped at 12 MB by Caddy and 8 MB by the app.
- Hostinger's one-click "Docker" or "Ubuntu" VPS images both work. The managed
  *shared hosting* plans do not — they run PHP, not Node, and give you MySQL
  rather than Postgres.

---

# Route B — managed Postgres

## 1. Provision Postgres

Any Postgres 14+ works. On Vercel, the marketplace options (Neon, Supabase) are
the least friction.

Whatever you use, note **two** connection strings:

- The **pooled** string — for the application.
- The **direct** (unpooled) string — for migrations.

## 2. Decide the two roles

This is the step the rest depends on. **If the application connects as the
database owner, the row-level security policies do not apply to it** and tenant
isolation is only as good as the application code. Two different roles:

- **The owner.** Whatever the provider gave you — on Neon that is usually
  `neondb_owner`. Used only for migrations.
- **The application role.** A separate login you invent, with a password you
  choose. `npm run db:sql` creates it for you; you do not create it by hand.

Take the provider's connection string and swap the credentials to build the
application URL:

```
# what Neon gives you (the owner)
postgres://neondb_owner:AbC123@ep-xyz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require

# what DATABASE_URL should be — same host and database, different credentials
postgres://tt_app:<a strong password you choose>@ep-xyz-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require
```

Keep `?sslmode=require` and everything after the `@`. Change only the username
and password.

### If the provider is Supabase

Two things differ, and both will stop you if you do not know them.

**The app talks to Postgres directly. It does not use `@supabase/supabase-js`.**
Supabase's client library speaks to their REST API and relies on *their* RLS
model, keyed on a JWT. This app has its own: policies keyed on
`app_current_tenant()`, set per transaction, enforced against a role that cannot
bypass them. Adding the client library and a `db.js` alongside it connects
nothing — the app never imports either — while making a provisioning wizard
report success. What connects the database is the two environment variables
below and `npm run db:setup`. Nothing else.

**The pooler puts the project reference in the username.** Supabase gives you
three strings under *Connect*:

| | Host | Port | Use it for |
|---|---|---|---|
| Direct | `db.<ref>.supabase.co` | 5432 | Migrations — but it is IPv6-only unless you have bought the IPv4 add-on |
| Session pooler | `aws-0-<region>.pooler.supabase.com` | 5432 | Migrations, over IPv4 |
| Transaction pooler | `aws-0-<region>.pooler.supabase.com` | 6543 | `DATABASE_URL` |

Through either pooler the role `tt_app` connects as `tt_app.<ref>`:

```
# DATABASE_ADMIN_URL — session pooler, as the owner Supabase gave you
postgres://postgres.abcdefghijklm:<their password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres

# DATABASE_URL — transaction pooler, as the role you are about to create
postgres://tt_app.abcdefghijklm:<a strong password you choose>@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
```

`db:sql` knows that `.abcdefghijklm` is routing information rather than part of
the role name, and creates `tt_app`. It says so when it does. If some other host
mangles the username differently, set `DATABASE_APP_ROLE` to the role name you
want and it will use that instead.

Leave `DATABASE_PREPARE` unset: port 6543 is a transaction pooler.

Use the **session** pooler (5432) for `DATABASE_ADMIN_URL`, not the transaction
one — `db:setup` creates roles and functions, which needs a session.

## 3. Set the environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | The **pooled** string, with the application role's credentials |
| `DATABASE_ADMIN_URL` | The **direct** string, as the owner |
| `SESSION_SECRET` | 32+ random characters — `openssl rand -base64 32` |
| `DATABASE_POOL_MAX` | Optional. Defaults to 1 on Vercel, 5 elsewhere |
| `DATABASE_APP_ROLE` | Optional. The application role's name, when the host does not let you put it in `DATABASE_URL` as-is |

On Vercel, set these under Project → Settings → Environment Variables for
Production (and Preview, if previews should work).

> Provider integrations often set `DATABASE_URL` to the **owner** automatically.
> Overwrite it. `npm run db:sql` refuses to run if both URLs name the same role,
> which is the one mistake that quietly disables everything below.

`DATABASE_ADMIN_URL` is only read by the migration scripts. Nothing on the
request path touches it, but keep it out of any environment that does not need
it.

## 4. Apply the schema

From a machine that can reach the database, with **both** variables set:

```bash
npm run db:setup     # tables, then triggers and RLS policies
```

`db:setup` runs `db:push` and `db:sql`. The second reads the application role's
name and password out of `DATABASE_URL` and creates the role with them — the
credential lives in your environment, never in the repository.

Both are idempotent and safe to re-run after every schema change. `db:sql` also
creates the `SECURITY DEFINER` functions that authentication depends on, so the
app cannot sign anyone in until it has run.

## 5. Create the organisation

Open the deployed app. With an empty database it sends you to a one-time setup
page that creates your organisation and your administrator account. That page
closes permanently as soon as an organisation exists.

`npm run db:demo` loads a demonstration organisation instead. It **truncates
every table first**, so never run it against a database holding real records.

## 6. Verify

Run this against the deployed database, with both variables set:

```bash
npm run test:isolation
```

It stands up two throwaway organisations, proves neither can read, update,
delete or write into the other, tries to disable the policies, and removes both.
It works against an empty database, so run it immediately after setup and before
anyone signs in.

This is the check that the role split actually took effect. A deployment where
the application role turned out to be the owner fails its first two lines:

```
  PASS  the application role is not a superuser
  PASS  the application role cannot bypass RLS
```

`npm run verify` additionally walks every audit-trail hash chain and every
stored photograph, and proves each database guard refuses what it must — worth
running once there is data.

## Notes for serverless

- Use the **pooled** connection string. Serverless instances each open their own
  connections and a direct string will exhaust the database's limit.
- Prepared statements are off by default, because transaction-mode poolers do
  not support them. Leave `DATABASE_PREPARE` unset here. (On a direct
  connection — Route A — set it to `true`.)
- The tenant context survives pooling because it is set with
  `set_config(..., is_local => true)` inside a transaction, and transaction
  pooling holds one server connection for the whole transaction.

---

# Before this is public

Either route. A real installation has no default credentials — the first administrator sets
their own password during setup, and everyone else is added from inside the app.

The **demo** fixture is different: every account in it shares one published
password. If you load it, keep the deployment behind Vercel Authentication,
HTTP basic auth in the Caddyfile, or a firewall — and never load it into a
database that holds real records, because `db:demo` truncates every table
first.

And run the checks once against the real deployment:

```bash
npm run test:isolation    # tenant isolation, on an empty database
npm run verify            # hash chains and database guards, once there is data
```
