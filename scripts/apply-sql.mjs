/**
 * Applies the raw-SQL parts of the schema that Drizzle does not manage:
 * integrity triggers and the row-level security policies.
 *
 * Runs as the schema owner (DATABASE_ADMIN_URL), because creating roles and
 * policies requires privileges the application role deliberately lacks.
 *
 * No psql: a managed app host does not have it, and that put the one command
 * establishing tenant isolation out of reach on exactly the platforms most
 * likely to need it. scripts/sql-runner.mjs does the substitution instead.
 *
 *   npm run db:sql                            apply both files
 *   npm run --silent db:sql:print > setup.sql  render them instead, to paste
 *                                              into a hosted SQL editor when
 *                                              that is the only access you have
 *
 * The application role's name and password come from DATABASE_URL. They are
 * not written into the SQL, so nothing has to keep a credential in the
 * repository, and pointing the app at a different role is a matter of changing
 * one environment variable.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { prepareScript } from "./sql-runner.mjs";

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

const FILES = ["drizzle/guards.sql", "drizzle/rls.sql"];

/**
 * Render rather than run. The password is in the output, so it is written to
 * stdout only — never to a file this script chooses — and the warning goes to
 * stderr so a redirect still produces clean SQL.
 */
if (process.argv.includes("--print")) {
  console.error(
    `Rendered for role "${appRole}". The output CONTAINS ITS PASSWORD.\n` +
      "Paste it into your provider's SQL editor, then clear the editor's history.",
  );
  // npm writes its own banner to stdout, which would sit at the top of the file
  // as a syntax error waiting to happen.
  if (process.env.npm_lifecycle_event && !process.stdout.isTTY) {
    console.error(
      "If you are redirecting this to a file, run it as:\n" +
        "  npm run --silent db:sql:print > setup.sql",
    );
  }
  for (const file of FILES) {
    process.stdout.write(`\n-- ======== ${file} ========\n`);
    process.stdout.write(
      prepareScript(readFileSync(file, "utf8"), { app_role: appRole, app_password: appPassword }),
    );
  }
  process.exit(0);
}

const client = postgres(adminUrl, {
  max: 1,
  // One connection for the whole run. rls.sql sets tt.app_role for the DO
  // blocks that follow it, which only holds within a session.
  prepare: false,
  connect_timeout: 30,
  idle_timeout: 20,
  onnotice: (n) => {
    // "policy ... does not exist, skipping" is every DROP POLICY IF EXISTS on a
    // first run — the price of the files being re-runnable, and not news.
    if (!n.message || /does not exist, skipping/.test(n.message)) return;
    console.log(`  NOTICE: ${n.message}`);
  },
});

try {
  for (const file of FILES) {
    const script = prepareScript(readFileSync(file, "utf8"), {
      app_role: appRole,
      app_password: appPassword,
    });

    process.stdout.write(`applying ${file} … `);
    try {
      await client.unsafe(script).simple();
      console.log("ok");
    } catch (e) {
      console.log("failed");
      console.error(`${e.message}${e.position ? ` (at character ${e.position})` : ""}`);
      if (e.hint) console.error(`hint: ${e.hint}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end({ timeout: 5 });
}

if (process.exitCode) process.exit(process.exitCode);

console.log(`Integrity guards and row-level security applied. Application role: ${appRole}`);
