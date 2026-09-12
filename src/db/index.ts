import { existsSync } from "node:fs";
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

/**
 * Both variables live in .env, and the usual reason one is missing is that the
 * file has not been created yet. Say so, rather than naming a variable and
 * leaving someone to work out where it is meant to come from.
 */
function missingEnv(name: string, why: string): Error {
  // On a hosting platform there is no .env to write — the variable is set in
  // the platform's own panel, and a message about files sends someone looking
  // in the wrong place entirely.
  const onAPlatform = Boolean(process.env.VERCEL || process.env.HOSTINGER || process.env.RENDER);

  if (onAPlatform) {
    return new Error(
      `${name} is not set. ${why}\n\n` +
        `Set it in this host's environment variables panel, then redeploy — a\n` +
        `running build does not pick up new variables.\n\n` +
        `The value is the DATABASE_URL line written by scripts/setup-supabase.mjs,\n` +
        `saved locally in .env.deploy. Behind a transaction pooler (Supabase port\n` +
        `6543), leave DATABASE_PREPARE unset.\n`,
    );
  }

  return new Error(
    `${name} is not set. ${why}\n\n` +
      (existsSync(".env")
        ? `There is a .env file, but it has no ${name} line. Add one, or re-run\n` +
          `the setup below, which writes all three values.\n`
        : "There is no .env file yet, which is where it belongs.\n") +
      `\nTo create it, with the connection string from your database provider:\n` +
      `  node scripts/setup-supabase.mjs "<connection string>"\n\n` +
      `Supabase: Project Settings -> Database -> Connection string -> Session pooler.\n` +
      `Replace [YOUR-PASSWORD] with your database password. Keep the quotes.\n`,
  );
}

const globalForDb = globalThis as unknown as {
  __ttApp?: Db;
  __ttAdmin?: Db;
};

/**
 * A value the driver cannot parse does not fail — it quietly falls back to
 * localhost:5432 and reports ECONNREFUSED, which looks like a database that is
 * down rather than a variable that is wrong. On a hosting platform there is no
 * localhost to connect to, so the message points nowhere useful at all.
 *
 * The usual cause is pasting the whole `NAME=value` line into a panel's value
 * box, or pasting it with quotes around it.
 */
/**
 * Enough of the value to identify what went in, without disclosing it. A
 * connection string's first twelve characters are "postgresql:/"; anything
 * else here is not a connection string, so there is nothing to protect.
 */
function shapeOf(value: string): string {
  const head = value.slice(0, 12).replace(/[\r\n\t]/g, "·");
  return `got ${JSON.stringify(head)}… , length ${value.length}`;
}

function assertConnectionUrl(name: string, value: string): void {
  const trimmed = value.trim();

  if (trimmed.startsWith(`${name}=`)) {
    throw new Error(
      `${name} contains its own name: it starts with "${name}=".\n\n` +
        "Set the value only — everything after the first = — beginning with\n" +
        "postgresql:// and nothing before it.",
    );
  }

  if (/^["']|["']$/.test(trimmed)) {
    throw new Error(
      `${name} is wrapped in quotes. Quotes belong around it in a shell, not in\n` +
        "the stored value. Remove them.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `${name} is not a connection URL. It should look like\n` +
        "  postgresql://user:password@host:5432/database?sslmode=require\n\n" +
        `${shapeOf(trimmed)}`,
    );
  }

  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error(
      `${name} has the scheme "${parsed.protocol.replace(":", "")}". ` +
        `It must be postgres:// or postgresql://.\n\n${shapeOf(trimmed)}`,
    );
  }
  if (!parsed.hostname) {
    throw new Error(`${name} has no host in it.`);
  }
}

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
    throw missingEnv(
      "DATABASE_URL",
      "It must point at the application role — a role with NOSUPERUSER and " +
        "NOBYPASSRLS, so row-level security applies to it.",
    );
  }
  assertConnectionUrl("DATABASE_URL", url);
  const instance = makeDb(url.trim(), APP_POOL);
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
    throw missingEnv(
      "DATABASE_ADMIN_URL",
      "It is required for migrations and seeding, and must point at the schema " +
        "owner rather than the application role.",
    );
  }
  assertConnectionUrl("DATABASE_ADMIN_URL", url);
  const instance = makeDb(url.trim(), 2);
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
