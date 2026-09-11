# Deploying

The app is a standard Next.js deployment, but it needs a Postgres database with
two roles and the SQL in `drizzle/` applied. That setup is not optional: the
security model depends on the application connecting as a role that cannot
bypass row-level security.

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

## 3. Set the environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | The **pooled** string, with the application role's credentials |
| `DATABASE_ADMIN_URL` | The **direct** string, as the owner |
| `SESSION_SECRET` | 32+ random characters — `openssl rand -base64 32` |
| `DATABASE_POOL_MAX` | Optional. Defaults to 1 on Vercel, 5 elsewhere |

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
- Prepared statements are disabled (`prepare: false` in `src/db/index.ts`)
  because transaction-mode poolers do not support them.
- The tenant context survives pooling because it is set with
  `set_config(..., is_local => true)` inside a transaction, and transaction
  pooling holds one server connection for the whole transaction.

## Before this is public

A real installation has no default credentials — the first administrator sets
their own password during setup, and everyone else is added from inside the app.

The **demo** fixture is different: every account in it shares one published
password. If you load it, keep the deployment behind Vercel Authentication or
password protection.
