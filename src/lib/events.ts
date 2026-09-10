import { db, schema } from "@/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { sha256, canonicalJson } from "./crypto";
import type { PgTransaction } from "drizzle-orm/pg-core";

export type EventInput = {
  tenantId: string;
  streamId: string;
  streamType: string;
  eventType: string;
  payload: Record<string, unknown>;
  actorId?: string | null;
  /** Device clock. Defaults to now when the action happens server-side. */
  occurredAt?: Date;
  deviceId?: string | null;
};

type Db = typeof db | PgTransaction<any, typeof schema, any>;

/**
 * Append one event to the log, chaining its hash to the previous event in the
 * same stream. The events table rejects UPDATE and DELETE at the database
 * level, so this is the only way records change.
 *
 * MUST be called inside a transaction, alongside the projection write, so the
 * log and the read model can never disagree.
 *
 * Concurrency: reading the last sequence number and inserting the next one is
 * a read-modify-write, so two simultaneous appends to the same stream would
 * otherwise collide on the (stream_id, seq) unique index and one would be
 * rejected. The unique index protects integrity, but losing a trainer's
 * sign-off because a colleague saved at the same moment is not acceptable.
 *
 * A transaction-scoped advisory lock keyed on the stream serialises appends to
 * that stream only — writes to every other stream proceed in parallel — and
 * releases automatically on commit or rollback.
 */
export async function appendEvent(tx: Db, input: EventInput) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.streamId}::text, 0))`,
  );

  const [previous] = await tx
    .select({ seq: schema.events.seq, hash: schema.events.hash })
    .from(schema.events)
    .where(eq(schema.events.streamId, input.streamId))
    .orderBy(desc(schema.events.seq))
    .limit(1);

  const seq = (previous?.seq ?? 0) + 1;
  const prevHash = previous?.hash ?? null;
  const occurredAt = input.occurredAt ?? new Date();

  // Chain over the fields that carry meaning. Changing any of them without
  // rewriting every later hash will fail verification.
  const hash = sha256(
    [
      prevHash ?? "",
      input.streamId,
      seq,
      input.eventType,
      canonicalJson(input.payload),
      input.actorId ?? "",
      occurredAt.toISOString(),
    ].join("|"),
  );

  const [row] = await tx
    .insert(schema.events)
    .values({
      tenantId: input.tenantId,
      streamId: input.streamId,
      streamType: input.streamType,
      seq,
      eventType: input.eventType,
      payload: input.payload,
      actorId: input.actorId ?? null,
      occurredAt,
      deviceId: input.deviceId ?? null,
      prevHash,
      hash,
    })
    .returning();

  return row;
}

export type VerifyResult = {
  ok: boolean;
  checked: number;
  brokenAt?: { id: string; seq: number; reason: string };
};

/**
 * Walk a stream's hash chain and confirm nothing has been altered.
 * This is what turns "trust our database" into a demonstrable claim.
 */
export async function verifyStream(streamId: string): Promise<VerifyResult> {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.streamId, streamId))
    .orderBy(schema.events.seq);

  let prevHash: string | null = null;

  for (const [i, row] of rows.entries()) {
    if (row.seq !== i + 1) {
      return { ok: false, checked: i, brokenAt: { id: row.id, seq: row.seq, reason: "sequence gap" } };
    }
    if (row.prevHash !== prevHash) {
      return { ok: false, checked: i, brokenAt: { id: row.id, seq: row.seq, reason: "broken chain link" } };
    }
    const expected = sha256(
      [
        prevHash ?? "",
        row.streamId,
        row.seq,
        row.eventType,
        canonicalJson(row.payload),
        row.actorId ?? "",
        row.occurredAt.toISOString(),
      ].join("|"),
    );
    if (expected !== row.hash) {
      return { ok: false, checked: i, brokenAt: { id: row.id, seq: row.seq, reason: "content altered" } };
    }
    prevHash = row.hash;
  }

  return { ok: true, checked: rows.length };
}

/** Full history for a stream, oldest first. */
export async function streamHistory(streamId: string) {
  return db
    .select({
      id: schema.events.id,
      seq: schema.events.seq,
      eventType: schema.events.eventType,
      payload: schema.events.payload,
      occurredAt: schema.events.occurredAt,
      recordedAt: schema.events.recordedAt,
      actorName: schema.users.name,
    })
    .from(schema.events)
    .leftJoin(schema.users, eq(schema.events.actorId, schema.users.id))
    .where(eq(schema.events.streamId, streamId))
    .orderBy(schema.events.seq);
}
