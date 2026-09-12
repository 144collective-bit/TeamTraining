/**
 * Database to live deployment, in one command.
 *
 *   node scripts/go.mjs "<your Supabase session pooler string>"
 *
 * Creates a fresh application role, applies the schema, guards and row-level
 * security policies, checks the isolation holds, then sends the credentials to
 * Vercel and deploys.
 *
 * The role is new every time on purpose. Supabase's pooler caches a username's
 * credential and never notices ALTER ROLE ... PASSWORD, so reusing a name whose
 * password has changed is refused indefinitely — by the pooler, while the
 * database itself is perfectly happy. A name it has not seen has nothing
 * cached.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const url = process.argv[2];
if (!url) {
  console.error(`Usage: node scripts/go.mjs "<connection string>"

Supabase: Project Settings -> Database -> Connection string -> Session pooler,
with [YOUR-PASSWORD] replaced by your database password. Keep the quotes.`);
  process.exit(1);
}

const role = `tt_${randomBytes(4).toString("hex")}`;

function step(title, args) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
  try {
    // node running a script of ours: no shell, so nothing to quote wrongly.
    execFileSync(process.execPath, args, { stdio: "inherit" });
  } catch {
    console.error(`\n${title} — stopped here. The error is above.`);
    process.exit(1);
  }
}

step(`1 of 2 · Setting up the database as "${role}"`, [
  "scripts/setup-supabase.mjs",
  url,
  "--role",
  role,
]);

step("2 of 2 · Deploying to Vercel", ["scripts/deploy-vercel.mjs"]);
