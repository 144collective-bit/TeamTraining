/**
 * Everything between a working local setup and a live deployment, in one
 * command:
 *
 *   node scripts/deploy-vercel.mjs
 *
 * Reads .env.deploy, finds which pooler port actually authenticates, sends both
 * variables to Vercel through its CLI, and deploys. Nothing passes through the
 * clipboard, so nothing can be pasted into the wrong box.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

const IS_WINDOWS = process.platform === "win32";
const NPX = IS_WINDOWS ? "npx.cmd" : "npx";
const PROJECT = "teamtraining";

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** npx through a shell on Windows, where it is a .cmd shim. */
function npx(args, { input, allowFailure = false, quiet = false } = {}) {
  const options = {
    stdio: input === undefined ? (quiet ? "pipe" : "inherit") : ["pipe", "pipe", "pipe"],
    input,
    encoding: "utf8",
  };
  try {
    if (IS_WINDOWS) {
      return execFileSync(`${NPX} ${args.join(" ")}`, { ...options, shell: true });
    }
    return execFileSync(NPX, args, options);
  } catch (e) {
    if (allowFailure) return null;
    throw e;
  }
}

// ---------------------------------------------------------------- values
if (!existsSync(".env.deploy")) {
  fail(
    "No .env.deploy here.\n\n" +
      "Run this first, from the project folder:\n" +
      '  node scripts/setup-supabase.mjs "<your Supabase session pooler string>"',
  );
}

const env = Object.fromEntries(
  readFileSync(".env.deploy", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

for (const key of ["DATABASE_URL", "SESSION_SECRET"]) {
  if (!env[key]) fail(`.env.deploy has no ${key}. Re-run scripts/setup-supabase.mjs.`);
}

// ---------------------------------------------------------------- port
/**
 * Supabase offers two pooler ports and they do not always accept the same role.
 * 6543 (transaction) suits serverless better, so it is tried first — but a port
 * that authenticates beats one that theoretically scales better.
 */
const base = new URL(env.DATABASE_URL);
const candidates = [...new Set([base.port === "6543" ? "5432" : "6543", base.port || "5432"])];

let working = null;
console.log("Checking which port authenticates …");
for (const port of candidates) {
  const candidate = new URL(env.DATABASE_URL);
  candidate.port = port;
  const sql = postgres(candidate.toString(), { max: 1, prepare: false, connect_timeout: 15 });
  try {
    await sql`select 1`;
    console.log(`  port ${port}  ok`);
    working = candidate.toString();
    await sql.end({ timeout: 3 });
    break;
  } catch (e) {
    console.log(`  port ${port}  ${e.code ?? ""} ${String(e.message).split("\n")[0]}`);
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

if (!working) {
  fail(
    "Neither pooler port accepted these credentials.\n\n" +
      "The database and .env.deploy have drifted apart. Re-run:\n" +
      '  node scripts/setup-supabase.mjs "<your Supabase session pooler string>"\n' +
      "then run this again.",
  );
}

// ---------------------------------------------------------------- vercel
console.log(`\nLinking the Vercel project …`);
try {
  npx(["vercel", "link", "--yes", "--project", PROJECT]);
} catch {
  fail("Could not link the project. Run `npx vercel login` first, then try again.");
}

for (const [key, value] of [
  ["DATABASE_URL", working],
  ["SESSION_SECRET", env.SESSION_SECRET],
]) {
  console.log(`\nSetting ${key} …`);
  npx(["vercel", "env", "rm", key, "production", "--yes"], { allowFailure: true, quiet: true });
  npx(["vercel", "env", "add", key, "production"], { input: `${value}\n` });
  console.log(`  ${key} set`);
}

console.log(`\nDeploying …`);
npx(["vercel", "--prod"]);

console.log(`
Done. Check it is really up:

  https://teamtraining-ten.vercel.app/api/health

You want {"status":"ok","database":"ok"}.
`);
