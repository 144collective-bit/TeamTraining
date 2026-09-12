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
import { writeFileSync, readFileSync, existsSync } from "node:fs";

/**
 * Supabase's pooler caches each username's credential and does not notice an
 * ALTER ROLE ... PASSWORD. A role whose password has been rotated can therefore
 * be refused indefinitely while the database itself is perfectly happy.
 *
 * A name the pooler has never seen has nothing cached, so --role is the way out
 * of that: make a new one rather than fighting the cache.
 *
 *   node scripts/setup-supabase.mjs "<url>" --role tt_live
 */
const argv = process.argv.slice(2);
const roleAt = argv.indexOf("--role");
const APP_ROLE = roleAt === -1 ? "tt_app" : argv[roleAt + 1];

if (roleAt !== -1 && !/^[a-z_][a-z0-9_]{0,62}$/.test(APP_ROLE ?? "")) {
  console.error(
    "--role needs a plain lowercase name: letters, digits and underscores,\n" +
      "starting with a letter or underscore. For example: --role tt_live",
  );
  process.exit(1);
}

const raw = argv.filter((_, i) => i !== roleAt && i !== roleAt + 1)[0];
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

/** Sync, because the steps around it are. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const run = (label, args, { retryAfterMs = 0 } = {}) => {
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
    if (retryAfterMs) {
      // Supabase's pooler caches credentials, so a password set moments ago can
      // still be refused. It clears itself; worth one retry before reporting a
      // failure that was never real.
      console.error(
        `\n${label}: failed. This often means the pooler has not caught up with ` +
          `the new password yet — waiting ${Math.round(retryAfterMs / 1000)}s and trying once more.`,
      );
      pause(retryAfterMs);
      try {
        const argv2 = ["run", "--silent", ...args];
        if (IS_WINDOWS) {
          execFileSync(`${NPM} ${argv2.join(" ")}`, { env, stdio: "inherit", shell: true });
        } else {
          execFileSync(NPM, argv2, { env, stdio: "inherit" });
        }
        return;
      } catch {
        console.error(
          `\n${label}: failed again. The error is immediately above.\n\n` +
            `If that says "password authentication failed for user \"${APP_ROLE}\"",\n` +
            `Supabase's pooler is still serving a cached password for that name and\n` +
            `will not pick up the new one. Use a name it has never seen:\n\n` +
            `  node scripts/setup-supabase.mjs "<the same url>" --role ${APP_ROLE}_2\n`,
        );
        process.exit(1);
      }
    }
    console.error(`\n${label}: failed. The error is immediately above.`);
    process.exit(1);
  }
};

console.log(`\nOwner:       ${ownerUser}@${owner.hostname}`);
console.log(`Application: ${appUser}${projectRef ? `  (the role itself is "${APP_ROLE}")` : ""}\n`);

run("creating the tables", ["db:push"]);
run("applying guards and row-level security", ["db:sql"]);
run("checking tenant isolation holds", ["test:isolation"], { retryAfterMs: 30_000 });

/**
 * These three keys belong to this script: it has just created the role and set
 * its password, so anything else in a .env for them is now wrong. Other lines
 * are left exactly as they are.
 *
 * Refusing to touch an existing .env was worse than it sounds — a second run
 * rotates the role's password in the database, and a .env left holding the old
 * one authenticates against nothing.
 */
function upsertEnv(path, values) {
  const existed = existsSync(path);
  const lines = existed ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const replaced = [];

  for (const [key, value] of Object.entries(values)) {
    const at = lines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
    if (at === -1) {
      lines.push(`${key}=${value}`);
    } else {
      if (lines[at].trim() !== `${key}=${value}`) replaced.push(key);
      lines[at] = `${key}=${value}`;
    }
  }

  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  return { existed, replaced };
}

const values = {
  DATABASE_ADMIN_URL: adminUrl,
  DATABASE_URL: appUrl,
  SESSION_SECRET: sessionSecret,
};

writeFileSync(
  ".env.deploy",
  `# Written by scripts/setup-supabase.mjs. Not committed. Keep it.\n` +
    Object.entries(values).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
  { mode: 0o600 },
);

const dotEnv = upsertEnv(".env", values);

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
  dotEnv.existed
    ? `\n.env was updated in place${
        dotEnv.replaced.length ? ` (${dotEnv.replaced.join(", ")})` : ""
      } — the role's password has just\nbeen set, so the old values no longer authenticate. Anything else in that\nfile was left alone. Restart the dev server to pick them up.`
    : "\nThe same values were written to .env, so `npm run dev` works here too."
}
Then open the app. An empty database sends you to a one-time setup page.
`);
