/**
 * Walks every event stream and confirms the hash chain is intact, then checks
 * that the database guards actually reject tampering.
 *
 * Run with: npm run verify
 */
import "dotenv/config";
import { db, schema } from "@/db";
import { verifyStream } from "@/lib/events";
import { sql } from "drizzle-orm";

async function main() {
  let failures = 0;

  // 1. Every stream verifies
  const streams = await db
    .selectDistinct({ streamId: schema.events.streamId })
    .from(schema.events);

  for (const { streamId } of streams) {
    const result = await verifyStream(streamId);
    if (!result.ok) {
      failures++;
      console.error(`  FAIL ${streamId}: ${result.brokenAt?.reason} at #${result.brokenAt?.seq}`);
    }
  }
  console.log(
    failures === 0
      ? `  PASS  hash chains intact across ${streams.length} streams`
      : `  FAIL  ${failures} of ${streams.length} streams broken`,
  );

  // 2. The guards reject what they must reject
  const guards: [string, string][] = [
    ["events cannot be updated", `UPDATE events SET payload = '{}'::jsonb WHERE id = (SELECT id FROM events LIMIT 1)`],
    ["events cannot be deleted", `DELETE FROM events WHERE id = (SELECT id FROM events LIMIT 1)`],
    ["published revisions are frozen", `UPDATE document_revisions SET body = '{}'::jsonb WHERE status = 'PUBLISHED'`],
    ["published revisions cannot be deleted", `DELETE FROM document_revisions WHERE status = 'PUBLISHED'`],
    ["signatures are immutable", `UPDATE signatures SET declaration = 'x' WHERE id = (SELECT id FROM signatures LIMIT 1)`],
  ];

  for (const [name, statement] of guards) {
    try {
      await db.execute(sql.raw(statement));
      failures++;
      console.error(`  FAIL  ${name} — the write was allowed`);
    } catch {
      console.log(`  PASS  ${name}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} integrity check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll integrity checks passed.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
