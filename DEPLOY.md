# Deploying

The app is a standard Next.js deployment, but it needs a Postgres database with
two roles and the SQL in `drizzle/` applied. That setup is not optional: the
security model depends on the application connecting as a role that cannot
bypass row-level security.

## 1. Provision Postgres

Any Postgres 14+ works. On Vercel, the marketplace options (Neon, Supabase) are
the least friction. Take note of two connection strings:

- The **pooled** string, for the application.
- The **direct** string, for migrations and seeding.

## 2. Create the application role

Connect as the database owner and run:

```sql
CREATE ROLE tt_app LOGIN PASSWORD '<a strong password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;
```

`drizzle/rls.sql` creates this role too, so this step is only needed if the
platform refuses `CREATE ROLE` from a script — some managed providers do.

> **This is the step that makes the rest work.** If the app connects as the
> owner or a superuser, the row-level security policies are bypassed entirely
> and tenant isolation is only as good as the application code.

## 3. Set the environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | The **pooled** string, authenticating as `tt_app` |
| `DATABASE_ADMIN_URL` | The **direct** string, authenticating as the owner |
| `SESSION_SECRET` | 32+ random characters — `openssl rand -base64 32` |
| `DATABASE_POOL_MAX` | Optional. Defaults to 1 on Vercel, 5 elsewhere |

On Vercel, set these under Project → Settings → Environment Variables for
Production (and Preview, if previews should work).

`DATABASE_ADMIN_URL` is only read by the migration and seed scripts. Nothing on
the request path touches it, but keep it out of any environment that does not
need it.

## 4. Apply the schema

From a machine that can reach the database:

```bash
DATABASE_ADMIN_URL="<direct string>" npm run db:push   # tables
DATABASE_ADMIN_URL="<direct string>" npm run db:sql    # triggers + RLS policies
```

`db:sql` is idempotent and safe to re-run after every schema change. It is what
creates the policies, the application role's grants, and the four
`SECURITY DEFINER` functions that authentication depends on — the app will not
be able to sign anyone in until it has run.

## 5. Seed, or don't

`npm run db:seed` loads the Protektor worked example. It **truncates every
table first**, so never run it against a database holding real records.

For a real deployment, skip it and create the first tenant and administrator
directly. There is no sign-up flow yet — see *Not built yet* in the README.

## 6. Verify

```bash
DATABASE_URL=... DATABASE_ADMIN_URL=... npm run verify          # integrity guards
DATABASE_URL=... DATABASE_ADMIN_URL=... npm run test:isolation  # tenant isolation
```

`test:isolation` creates a throwaway second tenant, proves it cannot reach the
first, and removes it. Running it against the deployed database is the check
that the role split and the policies actually took effect there — a deployment
where the app role turned out to be the owner will fail its first two checks.

## Notes for serverless

- Use the **pooled** connection string. Serverless instances each open their own
  connections and a direct string will exhaust the database's limit.
- Prepared statements are disabled (`prepare: false` in `src/db/index.ts`)
  because transaction-mode poolers do not support them.
- The tenant context survives pooling because it is set with
  `set_config(..., is_local => true)` inside a transaction, and transaction
  pooling holds one server connection for the whole transaction.

## Before this is public

The seeded example ships with published credentials (`protektor`, PIN `1234`)
and every account shares them. That is fine for a demo behind Vercel
Authentication or password protection; it is not fine on an open URL. Either
enable deployment protection, or seed nothing and create real accounts.
