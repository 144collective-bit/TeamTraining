/**
 * Applies the raw-SQL parts of the schema that Drizzle does not manage:
 * integrity triggers and the row-level security policies.
 *
 * Runs as the schema owner (DATABASE_ADMIN_URL), because creating roles and
 * policies requires privileges the application role deliberately lacks.
 *
 * The application role's name and password come from DATABASE_URL. They are
 * not written into the SQL, so nothing has to keep a credential in the
 * repository, and pointing the app at a different role is a matter of changing
 * one environment variable.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * Supavisor — Supabase's connection pooler — identifies the project in the
 * username rather than the hostname, so the role `tt_app` connects as
 * `tt_app.abcdefghijklm`. That suffix is routing information, not part of the
 * role: the role in the database is still `tt_app`, and creating one called
 * `tt_app.abcdefghijklm` would leave the app unable to authenticate at all.
 *
 * Only stripped for pooler hosts, and only ever announced, never silent.
 */
function roleFromUsername(url, label) {
  const parsed = new URL(url);
  const username = decodeURIComponent(parsed.username);
  if (!/(^|\.)pooler\.supabase\.com$/i.test(parsed.hostname)) return username;

  const cut = username.lastIndexOf(".");
  if (cut <= 0) return username;

  const role = username.slice(0, cut);
  console.log(
    `${label}: connecting through the Supabase pooler as "${username}" — ` +
      `the role itself is "${role}".`,
  );
  return role;
}

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

if (!adminUrl) {
  console.error("DATABASE_ADMIN_URL is not set. It must point at the schema owner.");
  process.exit(1);
}
if (!appUrl) {
  console.error(
    "DATABASE_URL is not set. The application role's name and password are read from it.",
  );
  process.exit(1);
}

let appRole, appPassword;
try {
  appRole = roleFromUsername(appUrl, "DATABASE_URL");
  appPassword = decodeURIComponent(new URL(appUrl).password);
} catch {
  console.error("DATABASE_URL could not be parsed as a connection URL.");
  process.exit(1);
}

// An explicit override, for any host that mangles the username in its own way.
if (process.env.DATABASE_APP_ROLE) {
  appRole = process.env.DATABASE_APP_ROLE;
  console.log(`DATABASE_APP_ROLE is set: creating "${appRole}".`);
}

if (!appRole) {
  console.error("DATABASE_URL has no username. It must authenticate as the application role.");
  process.exit(1);
}
if (!appPassword) {
  console.error(
    `DATABASE_URL has no password for "${appRole}". ` +
      "The role is created with that password, so it cannot be blank.",
  );
  process.exit(1);
}

// Catching the mistake that quietly disables every policy in rls.sql. Compared
// after stripping the pooler suffix, so `postgres.abc` and `tt_app.abc` are
// correctly seen as two different roles — and `postgres.abc` and `postgres` as
// the same one.
try {
  if (roleFromUsername(adminUrl, "DATABASE_ADMIN_URL") === appRole) {
    console.error(
      `DATABASE_URL and DATABASE_ADMIN_URL both authenticate as "${appRole}".\n` +
        "They must be different roles: the owner is not subject to row-level security,\n" +
        "so an application connecting as the owner bypasses tenant isolation entirely.",
    );
    process.exit(1);
  }
} catch {
  console.error("DATABASE_ADMIN_URL could not be parsed as a connection URL.");
  process.exit(1);
}

for (const file of ["drizzle/guards.sql", "drizzle/rls.sql"]) {
  readFileSync(file); // fail loudly if it is missing
  process.stdout.write(`applying ${file} … `);
  try {
    const out = execFileSync(
      "psql",
      [
        adminUrl,
        "-v", "ON_ERROR_STOP=1",
        "-v", `app_role=${appRole}`,
        "-v", `app_password=${appPassword}`,
        "-q", "-f", file,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    console.log("ok");
    // Surface NOTICEs (the "could not set role attributes" case), not the noise.
    const notices = String(out).split("\n").filter((l) => l.startsWith("NOTICE:"));
    for (const n of notices) console.log(`  ${n}`);
  } catch (e) {
    console.log("failed");
    console.error(String(e.stderr ?? e.message));
    process.exit(1);
  }
}

console.log(`Integrity guards and row-level security applied. Application role: ${appRole}`);
