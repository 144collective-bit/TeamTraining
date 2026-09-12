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
import { writeFileSync, existsSync } from "node:fs";

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

// The placeholder survives URL parsing as %5BYOUR-PASSWORD%5D, so it would
// otherwise get as far as the database and come back as a puzzling auth error.
if (/%5B|%5D|YOUR-PASSWORD|your-password/i.test(owner.password)) {
  console.error(`The password is still the placeholder Supabase shows you:

  ${decodeURIComponent(owner.password)}

Replace it — square brackets and all — with your project's database password.
That is the one you chose when you created the project. If you no longer have
it: Supabase → Project Settings → Database → Reset database password.`);
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

/**
 * Hosted Postgres requires TLS, and the driver defaults to plaintext — so a
 * string copied straight out of a provider's dashboard fails to connect at all
 * unless sslmode says otherwise. Added only for remote hosts: a local Postgres
 * usually has no certificate, and asking for TLS there fails just as hard.
 */
function withSsl(value) {
  const url = new URL(value);
  const isLocal =
    ["localhost", "127.0.0.1", "::1", "[::1]", "db"].includes(url.hostname) ||
    url.hostname.endsWith(".local");
  if (!isLocal && !url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

// URL-safe, so it survives being embedded in a connection string unencoded.
const appPassword = randomBytes(24).toString("base64url");
const sessionSecret = randomBytes(32).toString("base64");

const app = new URL(owner.toString());
app.username = encodeURIComponent(appUser);
app.password = encodeURIComponent(appPassword);

const adminUrl = withSsl(owner.toString());
const appUrl = withSsl(app.toString());
const env = { ...process.env, DATABASE_ADMIN_URL: adminUrl, DATABASE_URL: appUrl };

/**
 * On Windows npm is a .cmd shim, which has to be named and run through a shell.
 * The arguments here are fixed literals, so there is nothing to quote badly.
 */
const IS_WINDOWS = process.platform === "win32";
const NPM = IS_WINDOWS ? "npm.cmd" : "npm";

const run = (label, args) => {
  console.log(`\n── ${label} ──`);
  try {
    /**
     * inherit, not pipe. Piping buried the database's own error underneath a
     * "failed" line and, worse, left drizzle-kit's confirmation prompt with no
     * stdin to read — so a push that wanted an answer simply hung. Output goes
     * straight to the terminal now: slower steps show progress, and prompts can
     * be answered.
     */
    const argv = ["run", "--silent", ...args];
    if (IS_WINDOWS) {
      // A .cmd shim needs a shell, and passing an args array alongside shell
      // raises DEP0190 because Node concatenates rather than escapes them. The
      // arguments here are fixed literals, so hand over one finished string.
      execFileSync(`${NPM} ${argv.join(" ")}`, { env, stdio: "inherit", shell: true });
    } else {
      execFileSync(NPM, argv, { env, stdio: "inherit" });
    }
  } catch {
    console.error(`\n${label}: failed. The error is immediately above.`);
    process.exit(1);
  }
};

console.log(`\nOwner:       ${ownerUser}@${owner.hostname}`);
console.log(`Application: ${appUser}${projectRef ? `  (the role itself is "${APP_ROLE}")` : ""}\n`);

run("creating the tables", ["db:push"]);
run("applying guards and row-level security", ["db:sql"]);
run("checking tenant isolation holds", ["test:isolation"]);

// So migrations can be re-run later without regenerating the password.
const envBody =
  `DATABASE_ADMIN_URL=${adminUrl}\n` +
  `DATABASE_URL=${appUrl}\n` +
  `SESSION_SECRET=${sessionSecret}\n`;

writeFileSync(
  ".env.deploy",
  `# Written by scripts/setup-supabase.mjs. Not committed. Keep it.\n${envBody}`,
  { mode: 0o600 },
);

// The same three values are what `npm run dev` reads. Written only when there
// is nothing to lose — an existing .env is someone's own setup.
let wroteDotEnv = false;
if (!existsSync(".env")) {
  writeFileSync(".env", `# Written by scripts/setup-supabase.mjs.\n${envBody}`, { mode: 0o600 });
  wroteDotEnv = true;
}

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
${
  wroteDotEnv
    ? "\nThe same values were written to .env, so `npm run dev` works here too."
    : "\n.env already existed and was left alone. To run locally against this\ndatabase, copy the values across yourself."
}
Then open the app. An empty database sends you to a one-time setup page.
`);
