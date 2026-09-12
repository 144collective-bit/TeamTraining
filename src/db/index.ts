import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Two connections, deliberately.
 *
 * `db` connects as the application role, which has no superuser rights and no
 * BYPASSRLS, so every statement it runs is filtered by the row-level security
 * policies in drizzle/rls.sql. Nothing it reads or writes can escape the tenant
 * set for the current transaction.
 *
 * `getAdminDb()` connects as the schema owner and is NOT subject to those
 * policies. It exists for migrations and seeding only — never for serving a
 * request.
 *
 * Both are created lazily. Next imports every route module while collecting
 * page data at build time, so connecting (or throwing over a missing variable)
 * at module scope fails the build on any machine without the database
 * configured — which is exactly what happened on the first Vercel deploy.
 */

type Db = ReturnType<typeof makeDb>;

const globalForDb = globalThis as unknown as {
  __ttApp?: Db;
  __ttAdmin?: Db;
};

function makeDb(url: string, max: number) {
  const client = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    /**
     * Transaction-mode connection poolers (PgBouncer, and the Neon and
     * Supabase poolers) do not support prepared statements, so this defaults
     * off: the failure behind a pooler is real errors, while the cost of
     * leaving it off is only re-parsing each query.
     *
     * On a direct connection — a database on the same host, say — set
     * DATABASE_PREPARE=true and get them back.
     *
     * The tenant context is safe either way: it is set with
     * `set_config(..., is_local => true)` inside a transaction, and transaction
     * pooling holds one server connection for the whole transaction.
     */
    prepare: process.env.DATABASE_PREPARE === "true",
  });
  return drizzle(client, { schema });
}

/** How many connections one serverless instance may hold. */
const APP_POOL = Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 1 : 5));

function appDb(): Db {
  if (globalForDb.__ttApp) return globalForDb.__ttApp;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. It must point at the application role — a role with " +
        "NOSUPERUSER and NOBYPASSRLS, so row-level security applies. See .env.example.",
    );
  }
  const instance = makeDb(url, APP_POOL);
  globalForDb.__ttApp = instance;
  return instance;
}

/**
 * The application connection. Every request-path read and write goes through
 * `asTenant` rather than touching this directly.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(appDb() as object, prop, receiver);
  },
});

/** Migrations and seeding only. Bypasses row-level security. */
export function getAdminDb(): Db {
  if (globalForDb.__ttAdmin) return globalForDb.__ttAdmin;
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error(
      "DATABASE_ADMIN_URL is not set. It is required for migrations and seeding, " +
        "and must point at the schema owner rather than the application role.",
    );
  }
  const instance = makeDb(url, 2);
  globalForDb.__ttAdmin = instance;
  return instance;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run work with a tenant in scope.
 *
 * The tenant is set with `set_config(..., is_local => true)`, so it lives for
 * exactly this transaction and cannot leak to the next request that borrows the
 * same pooled connection. Policies compare with `=` against a NULL-when-unset
 * value, so forgetting to call this returns nothing rather than everything.
 *
 * Every request-path read and write must go through here.
 */
export async function asTenant<T>(
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

export { schema };
