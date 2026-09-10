/**
 * Walks every event stream and confirms the hash chain is intact, then checks
 * that the database guards actually reject tampering.
 *
 * Run with: npm run verify
 */
import "dotenv/config";
import { getAdminDb, schema } from "@/db";

const db = getAdminDb();
import { verifyStream } from "@/lib/events";
import { sha256Bytes } from "@/lib/crypto";
import { sql } from "drizzle-orm";

async function main() {
  let failures = 0;

  // 1. Every stream verifies
  const streams = await db
    .selectDistinct({ streamId: schema.events.streamId })
    .from(schema.events);

  for (const { streamId } of streams) {
    const result = await db.transaction((tx) => verifyStream(tx, streamId));
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

  // 2. Every stored photograph still hashes to its recorded content address.
  //    A SOP revision references an image by id and the revision hash covers
  //    that id, so if the bytes behind an id changed, the revision would still
  //    verify while the procedure people signed against had not.
  const attachments = await db
    .select({
      id: schema.attachments.id,
      sha256: schema.attachments.sha256,
      data: schema.attachments.data,
      byteSize: schema.attachments.byteSize,
    })
    .from(schema.attachments);

  let badImages = 0;
  for (const a of attachments) {
    const actual = sha256Bytes(Buffer.from(a.data));
    if (actual !== a.sha256 || a.data.length !== a.byteSize) {
      badImages++;
      console.error(`  FAIL  attachment ${a.id} does not match its content address`);
    }
  }
  if (badImages > 0) failures += badImages;
  console.log(
    badImages === 0
      ? `  PASS  ${attachments.length} attachment(s) match their content address`
      : `  FAIL  ${badImages} attachment(s) altered`,
  );

  // 3. The guards reject what they must reject
  const guards: [string, string][] = [
    ["events cannot be updated", `UPDATE events SET payload = '{}'::jsonb WHERE id = (SELECT id FROM events LIMIT 1)`],
    ["events cannot be deleted", `DELETE FROM events WHERE id = (SELECT id FROM events LIMIT 1)`],
    ["published revisions are frozen", `UPDATE document_revisions SET body = '{}'::jsonb WHERE status = 'PUBLISHED'`],
    ["published revisions cannot be deleted", `DELETE FROM document_revisions WHERE status = 'PUBLISHED'`],
    ["signatures are immutable", `UPDATE signatures SET declaration = 'x' WHERE id = (SELECT id FROM signatures LIMIT 1)`],
    ["attachments cannot be altered", `UPDATE attachments SET data = '\\x00'::bytea WHERE id = (SELECT id FROM attachments LIMIT 1)`],
    ["referenced attachments cannot be deleted", `DELETE FROM attachments WHERE id = (SELECT id FROM attachments LIMIT 1)`],
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
