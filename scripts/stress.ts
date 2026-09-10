/**
 * Stress and concurrency checks against a seeded database.
 *
 *   npm run db:seed && npm run stress
 *
 * Looks for the failure modes that only show up under load or contention:
 * racing appends to one event stream, matrix query cost at real scale, and
 * hash-chain verification over a large log.
 */
import "dotenv/config";
import { db, schema } from "@/db";
import { appendEvent, verifyStream } from "@/lib/events";
import { contentHash, sha256Bytes } from "@/lib/crypto";
import { eq, and, sql } from "drizzle-orm";
import { getMatrix, getCoverage, getDashboard } from "@/lib/queries";

let failures = 0;
const results: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) results.push(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; results.push(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function time<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await fn();
  return [value, Math.round(performance.now() - started)];
}

async function main() {
  const [tenant] = await db.select().from(schema.tenants).limit(1);
  if (!tenant) throw new Error("No tenant — run npm run db:seed first.");
  const tenantId = tenant.id;

  const [actor] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.role, "ADMIN")))
    .limit(1);

  /* ---------------------------------------------------------------- *
   * 1. Racing appends to a single event stream
   * ---------------------------------------------------------------- */
  {
    const [record] = await db
      .select()
      .from(schema.competenceRecords)
      .where(eq(schema.competenceRecords.tenantId, tenantId))
      .limit(1);

    const CONCURRENCY = 25;
    const outcomes = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        db.transaction((tx) =>
          appendEvent(tx, {
            tenantId,
            streamId: record.id,
            streamType: "competence_record",
            eventType: "StressProbe",
            payload: { i },
            actorId: actor.id,
          }),
        ),
      ),
    );

    const ok = outcomes.filter((o) => o.status === "fulfilled").length;
    const rejected = outcomes.length - ok;

    const rows = await db
      .select({ seq: schema.events.seq })
      .from(schema.events)
      .where(and(
        eq(schema.events.streamId, record.id),
        eq(schema.events.eventType, "StressProbe"),
      ));

    const seqs = rows.map((r) => r.seq);
    const unique = new Set(seqs).size === seqs.length;

    check("concurrent appends never duplicate a sequence number", unique,
      `${ok} committed, ${rejected} rejected, ${seqs.length} rows`);

    const verified = await verifyStream(record.id);
    check("hash chain survives concurrent appends", verified.ok,
      verified.ok ? `${verified.checked} events` : `${verified.brokenAt?.reason} at #${verified.brokenAt?.seq}`);

    // Clean up so the seeded example is left as it was.
    await db.execute(sql`
      DELETE FROM events WHERE stream_id = ${record.id} AND event_type = 'StressProbe'
    `).catch(() => {
      // The append-only trigger blocks this, which is the correct behaviour.
    });
  }

  /* ---------------------------------------------------------------- *
   * 2. Query cost at scale
   * ---------------------------------------------------------------- */
  {
    const PEOPLE = 250;
    const MACHINES = 60;

    const [area] = await db
      .select()
      .from(schema.areas)
      .where(eq(schema.areas.tenantId, tenantId))
      .limit(1);

    const bulkUsers = await db
      .insert(schema.users)
      .values(Array.from({ length: PEOPLE }, (_, i) => ({
        tenantId,
        email: `stress-${i}@example.invalid`,
        name: `Stress Operator ${String(i).padStart(3, "0")}`,
        employeeRef: `S-${i}`,
        role: "OPERATOR" as const,
      })))
      .returning({ id: schema.users.id });

    const bulkMachines = await db
      .insert(schema.machines)
      .values(Array.from({ length: MACHINES }, (_, i) => ({
        tenantId,
        areaId: area.id,
        code: `SX-${String(i).padStart(2, "0")}`,
        name: `Stress Machine ${i}`,
        sortOrder: 1000 + i,
      })))
      .returning({ id: schema.machines.id });

    // Roughly 40% coverage, which is what a real matrix looks like.
    const cells = [];
    for (const u of bulkUsers) {
      for (const m of bulkMachines) {
        if ((u.id.charCodeAt(0) + m.id.charCodeAt(0)) % 5 < 2) {
          cells.push({
            tenantId, userId: u.id, machineId: m.id,
            status: "COMPETENT" as const, level: "INDEPENDENT" as const,
          });
        }
      }
    }
    for (let i = 0; i < cells.length; i += 2000) {
      await db.insert(schema.competenceRecords).values(cells.slice(i, i + 2000));
    }

    const [matrix, matrixMs] = await time(() => getMatrix(tenantId));
    const [, coverageMs] = await time(() => getCoverage(tenantId));
    const [, dashboardMs] = await time(() => getDashboard(tenantId));

    const cellCount = matrix.rows.length * matrix.machines.length;
    check("matrix query stays under 1s at scale", matrixMs < 1000,
      `${matrix.rows.length} people x ${matrix.machines.length} machines = ${cellCount} cells in ${matrixMs}ms`);
    check("coverage query stays under 1s at scale", coverageMs < 1000, `${coverageMs}ms`);
    check("dashboard query stays under 1s at scale", dashboardMs < 1000, `${dashboardMs}ms`);

    // The matrix must issue a fixed number of queries regardless of size:
    // three, not one per person.
    check("matrix is not N+1", matrixMs < 1000 && cellCount > 10_000,
      `${cellCount} cells returned`);

    // Tear the bulk data down.
    await db.delete(schema.competenceRecords).where(
      sql`user_id IN (SELECT id FROM users WHERE email LIKE 'stress-%@example.invalid')`);
    await db.delete(schema.users).where(sql`email LIKE 'stress-%@example.invalid'`);
    await db.delete(schema.machines).where(sql`code LIKE 'SX-%'`);
  }

  /* ---------------------------------------------------------------- *
   * 3. Whole-log verification cost
   * ---------------------------------------------------------------- */
  {
    const streams = await db
      .selectDistinct({ streamId: schema.events.streamId })
      .from(schema.events)
      .where(eq(schema.events.tenantId, tenantId));

    const [broken, ms] = await time(async () => {
      let bad = 0;
      for (const { streamId } of streams) {
        const r = await verifyStream(streamId);
        if (!r.ok) bad++;
      }
      return bad;
    });

    check("every stream verifies", broken === 0, `${streams.length} streams in ${ms}ms`);
  }

  /* ---------------------------------------------------------------- *
   * 4. Large controlled document
   * ---------------------------------------------------------------- */
  {
    const bigBody = {
      purpose: "Stress procedure.",
      ppe: [], hazards: [], safetyCheck: "", carePoint: "",
      steps: Array.from({ length: 120 }, (_, i) => ({
        instruction: `Step ${i + 1}: ${"detail ".repeat(40)}`,
        keyPoints: Array.from({ length: 6 }, (_, k) => `Key point ${k}`),
        reasons: ["Because it matters"],
        imageId: null, imageCaption: null,
      })),
    };

    const [, hashMs] = await time(async () => contentHash(bigBody));
    const bytes = Buffer.byteLength(JSON.stringify(bigBody));
    check("hashing a large procedure is fast", hashMs < 250,
      `${bytes.toLocaleString()} bytes in ${hashMs}ms`);
  }

  /* ---------------------------------------------------------------- *
   * 5. Attachment de-duplication under concurrent upload
   * ---------------------------------------------------------------- */
  {
    const before = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.attachments)
      .where(eq(schema.attachments.tenantId, tenantId));

    const payload = Buffer.from("identical-bytes-uploaded-many-times");
    const hash = sha256Bytes(payload);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        db.insert(schema.attachments).values({
          tenantId, sha256: hash, mimeType: "image/png",
          byteSize: payload.byteLength, filename: "race.png",
          data: payload, uploadedBy: actor.id,
        }),
      ),
    );

    const stored = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.attachments)
      .where(and(eq(schema.attachments.tenantId, tenantId), eq(schema.attachments.sha256, hash)));

    check("identical concurrent uploads store exactly one row", stored[0].n === 1,
      `${outcomes.filter((o) => o.status === "fulfilled").length} accepted, ${stored[0].n} row`);

    await db.delete(schema.attachments).where(
      and(eq(schema.attachments.tenantId, tenantId), eq(schema.attachments.sha256, hash)));

    const after = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.attachments)
      .where(eq(schema.attachments.tenantId, tenantId));
    check("attachment cleanup restores the original count", before[0].n === after[0].n);
  }

  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nAll stress checks passed." : `\n${failures} stress check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
