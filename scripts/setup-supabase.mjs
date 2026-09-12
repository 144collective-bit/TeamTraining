/**
 * One command from a Supabase connection string to a deployable app.
 *
 *   npm run setup:supabase -- "<the string Supabase gives you>"
 *
 * Invents the application role and its password, creates the schema, applies
 * the integrity guards and row-level security policies, checks the isolation
 * actually took effect, and prints the two variables to paste into the host.
 *
 * Everything it does is idempotent, so re-running it is safe — except that it
 * invents a new password each time, so use the values from the last run.
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const APP_ROLE = "tt_app";

const raw = process.argv[2];
if (!raw) {
  console.error(`Usage: npm run setup:supabase -- "<connection string>"

In Supabase: Connect → Session pooler. It looks like

  postgres://postgres.abcdefghijklm:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres

Any Postgres URL works — Supabase is not special here, it is just the one with
the fiddly username.`);
  process.exit(1);
}

let owner;
try {
  owner = new URL(raw.trim());
} catch {
  console.error("That is not a connection URL. Paste the whole string, quoted.");
  process.exit(1);
}
if (!owner.password) {
  console.error(
    "That string has no password in it. Supabase shows a [YOUR-PASSWORD]\n" +
      "placeholder — replace it with the database password before pasting.",
  );
  process.exit(1);
}

const isPooler = /(^|\.)pooler\.supabase\.com$/i.test(owner.hostname);

/**
 * Supavisor routes on the username, so a custom role connects as
 * `tt_app.<project-ref>`. The reference is whatever follows the first dot in
 * the owner's username.
 */
const ownerUser = decodeURIComponent(owner.username);
const projectRef = isPooler && ownerUser.includes(".") ? ownerUser.slice(ownerUser.indexOf(".") + 1) : null;
const appUser = projectRef ? `${APP_ROLE}.${projectRef}` : APP_ROLE;

if (ownerUser === APP_ROLE || ownerUser.split(".")[0] === APP_ROLE) {
  console.error(`That string already authenticates as "${APP_ROLE}".
Paste the OWNER's string — the one Supabase gave you, usually "postgres".`);
  process.exit(1);
}

// URL-safe, so it survives being embedded in a connection string unencoded.
const appPassword = randomBytes(24).toString("base64url");
const sessionSecret = randomBytes(32).toString("base64");

const app = new URL(owner.toString());
app.username = encodeURIComponent(appUser);
app.password = encodeURIComponent(appPassword);

const adminUrl = owner.toString();
const appUrl = app.toString();
const env = { ...process.env, DATABASE_ADMIN_URL: adminUrl, DATABASE_URL: appUrl };

const run = (label, args) => {
  process.stdout.write(`${label} … `);
  try {
    const out = execFileSync("npm", ["run", "--silent", ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log("ok");
    // A NOTICE here is the database saying something happened that the person
    // running this did not ask for — most importantly, that the role already
    // existed and its password has just been changed.
    for (const line of String(out).split("\n")) {
      const at = line.indexOf("NOTICE:");
      if (at !== -1) console.log(`  ${line.slice(at).trim()}`);
    }
  } catch (e) {
    console.log("failed\n");
    console.error(String(e.stdout ?? "") + String(e.stderr ?? e.message));
    process.exit(1);
  }
};

console.log(`\nOwner:       ${ownerUser}@${owner.hostname}`);
console.log(`Application: ${appUser}${projectRef ? `  (the role itself is "${APP_ROLE}")` : ""}\n`);

run("creating the tables", ["db:push"]);
run("applying guards and row-level security", ["db:sql"]);
run("checking tenant isolation holds", ["test:isolation"]);

// So migrations can be re-run later without regenerating the password.
writeFileSync(
  ".env.deploy",
  `# Written by scripts/setup-supabase.mjs. Not committed. Keep it.\n` +
    `DATABASE_ADMIN_URL=${adminUrl}\n` +
    `DATABASE_URL=${appUrl}\n` +
    `SESSION_SECRET=${sessionSecret}\n`,
  { mode: 0o600 },
);

console.log(`
────────────────────────────────────────────────────────────────────────
Set these two in your host's environment panel, then redeploy:

DATABASE_URL=${appUrl}

SESSION_SECRET=${sessionSecret}

────────────────────────────────────────────────────────────────────────
DATABASE_ADMIN_URL is deliberately NOT one of them. It bypasses row-level
security and nothing serving a request needs it.

All three are saved in .env.deploy, which is gitignored. Keep it — without
it you cannot run migrations again, and a new SESSION_SECRET signs everyone
out.

Then open the app. An empty database sends you to a one-time setup page.
`);
