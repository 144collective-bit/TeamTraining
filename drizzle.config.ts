import type { Config } from "drizzle-kit";

/**
 * Migrations create and alter tables, which the application role deliberately
 * cannot do — so schema work runs as the owner. Falls back to DATABASE_URL only
 * for setups that have not split the two roles.
 */
const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("Set DATABASE_ADMIN_URL (preferred) or DATABASE_URL to run migrations.");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config;
