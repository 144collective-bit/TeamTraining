import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

// Reuse the client across hot reloads in dev so we don't exhaust connections.
const globalForDb = globalThis as unknown as { __ttClient?: postgres.Sql };

const client =
  globalForDb.__ttClient ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 3,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__ttClient = client;

export const db = drizzle(client, { schema });
export { schema };
