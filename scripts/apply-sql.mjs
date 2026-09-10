/**
 * Applies the raw-SQL parts of the schema that Drizzle does not manage:
 * integrity triggers and the row-level security policies.
 *
 * Runs as the schema owner (DATABASE_ADMIN_URL), because creating roles and
 * policies requires privileges the application role deliberately lacks.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL is not set. It must point at the schema owner.");
  process.exit(1);
}

for (const file of ["drizzle/guards.sql", "drizzle/rls.sql"]) {
  readFileSync(file); // fail loudly if it is missing
  process.stdout.write(`applying ${file} … `);
  try {
    execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    console.log("ok");
  } catch (e) {
    console.log("failed");
    console.error(String(e.stderr ?? e.message));
    process.exit(1);
  }
}
console.log("Integrity guards and row-level security applied.");
