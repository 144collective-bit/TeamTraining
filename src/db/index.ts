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
 * `adminDb` connects as the schema owner and is NOT subject to those policies.
 * It exists for migrations and seeding only — never for request handling.
 */

const appUrl = process.env.DATABASE_URL;
if (!appUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const globalForDb = globalThis as unknown as {
  __ttApp?: postgres.Sql;
  __ttAdmin?: postgres.Sql;
};

const poolSize = process.env.NODE_ENV === "production" ? 10 : 3;

const appClient = globalForDb.__ttApp ?? postgres(appUrl, { max: poolSize });
if (process.env.NODE_ENV !== "production") globalForDb.__ttApp = appClient;

export const db = drizzle(appClient, { schema });

/** Migrations and seeding only. Bypasses row-level security. */
export function getAdminDb() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error(
      "DATABASE_ADMIN_URL is not set. It is required for migrations and seeding, " +
        "and must point at the schema owner rather than the application role.",
    );
  }
  const client = globalForDb.__ttAdmin ?? postgres(adminUrl, { max: 2 });
  if (process.env.NODE_ENV !== "production") globalForDb.__ttAdmin = client;
  return drizzle(client, { schema });
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
