/**
 * Says, in one line, whether this machine can reach the database — and if not,
 * why. drizzle-kit reports a connection it cannot open as a spinner that runs
 * and then stops, which tells you nothing.
 *
 *   node scripts/check-db.mjs                    # whatever .env says
 *   node scripts/check-db.mjs "<connection url>" # a string you are testing
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.argv[2] ?? process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("No connection string. Pass one as an argument, or set DATABASE_ADMIN_URL.");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error("That is not a connection URL.");
  process.exit(1);
}

console.log(`host     ${parsed.hostname}`);
console.log(`port     ${parsed.port || 5432}`);
console.log(`user     ${decodeURIComponent(parsed.username)}`);
console.log(`database ${parsed.pathname.replace(/^\//, "")}`);
console.log(`tls      ${parsed.searchParams.get("sslmode") ?? "off (no sslmode in the string)"}`);
console.log("\nconnecting …");

const started = Date.now();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15, idle_timeout: 2 });

/** The handful of failures worth explaining rather than just printing. */
function explain(e) {
  const text = `${e.code ?? ""} ${e.message ?? ""}`;
  if (/ETIMEDOUT|ECONNREFUSED|ENETUNREACH|CONNECT_TIMEOUT/i.test(text))
    return `Nothing answered on port ${parsed.port || 5432}.

Most often this is outbound ${parsed.port || 5432} blocked by your network — many office
and home ISPs block database ports. Confirm with:

  Test-NetConnection ${parsed.hostname} -Port ${parsed.port || 5432}

If that says False, the database is fine and the network is in the way: try a
phone hotspot, or a different connection.`;
  if (/ENOTFOUND|EAI_AGAIN/i.test(text))
    return `The host name does not resolve. Check the region part of
${parsed.hostname} against the one in your provider's dashboard.`;
  if (/insecure/i.test(text))
    return "The server requires TLS. Add ?sslmode=require to the end of the string.";
  if (/28P01|password authentication/i.test(text))
    return "The password is wrong. Reset it in the provider's dashboard and rebuild the string.";
  if (/Tenant or user not found/i.test(text))
    return `Through a Supabase pooler the username must be <role>.<project-ref>,
and the host must be the right region. One of those two is off.`;
  return null;
}

try {
  const [row] = await sql`select current_user as who, current_database() as db, version() as version`;
  console.log(`\nconnected in ${Date.now() - started} ms`);
  console.log(`  as        ${row.who}`);
  console.log(`  database  ${row.db}`);
  console.log(`  server    ${String(row.version).split(" on ")[0]}`);
  await sql.end({ timeout: 5 });
  process.exit(0);
} catch (e) {
  console.error(`\nfailed after ${Date.now() - started} ms`);
  console.error(`  ${e.code ? `${e.code}: ` : ""}${e.message}`);
  const hint = explain(e);
  if (hint) console.error(`\n${hint}`);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
