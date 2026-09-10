"use server";

import { db, schema } from "@/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser, type SessionUser } from "./session";
import { appendEvent } from "./events";
import { verifySecret } from "./crypto";
import {
  nextStatus, canTransition, TransitionError, PermissionError,
  atLeast, missingSignatures, declarationFor,
  type Transition, type Role, type SignatureRole,
} from "./state-machine";
import type { Status } from "./competence";

export type ActionState = { error?: string; ok?: string };

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function fail(e: unknown): ActionState {
  if (e instanceof TransitionError || e instanceof PermissionError) {
    return { error: e.message };
  }
  console.error("[command]", e);
  return { error: "Something went wrong recording that. Nothing was saved." };
}

function require(role: Role, minimum: Role, what: string) {
  if (!atLeast(role, minimum)) {
    throw new PermissionError(`You need ${minimum.toLowerCase()} access to ${what}.`);
  }
}

/** Device clock as asserted by the browser, bounded so it cannot be absurd. */
function assertedTime(raw: FormDataEntryValue | null): Date {
  const now = Date.now();
  const parsed = raw ? Date.parse(String(raw)) : NaN;
  if (Number.isNaN(parsed)) return new Date();
  // Reject a device clock more than a day out in either direction: record the
  // server time instead rather than accept an obviously wrong assertion.
  if (Math.abs(parsed - now) > 86_400_000) return new Date();
  return new Date(parsed);
}

async function requestContext() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    deviceId: h.get("user-agent")?.slice(0, 200) ?? null,
  };
}

/** Everything a command needs to know about the record it is acting on. */
async function loadCompetence(tenantId: string, competenceId: string) {
  const [row] = await db
    .select({
      id: schema.competenceRecords.id,
      status: schema.competenceRecords.status,
      level: schema.competenceRecords.level,
      userId: schema.competenceRecords.userId,
      machineId: schema.competenceRecords.machineId,
      trainerId: schema.competenceRecords.trainerId,
      sopRevisionId: schema.competenceRecords.sopRevisionId,
      sopContentHash: schema.competenceRecords.sopContentHash,
      traineeName: schema.users.name,
      machineName: schema.machines.name,
      machineCode: schema.machines.code,
      revalidationMonths: schema.machines.revalidationMonths,
    })
    .from(schema.competenceRecords)
    .innerJoin(schema.users, eq(schema.competenceRecords.userId, schema.users.id))
    .innerJoin(schema.machines, eq(schema.competenceRecords.machineId, schema.machines.id))
    .where(and(
      eq(schema.competenceRecords.tenantId, tenantId),
      eq(schema.competenceRecords.id, competenceId),
    ))
    .limit(1);

  if (!row) throw new PermissionError("That training record could not be found.");
  return row;
}

async function sopContext(sopRevisionId: string | null) {
  if (!sopRevisionId) return { sopRef: "the machine procedure", revision: 0, hash: "" };
  const [r] = await db
    .select({
      revision: schema.documentRevisions.revision,
      hash: schema.documentRevisions.contentHash,
      reference: schema.documents.reference,
    })
    .from(schema.documentRevisions)
    .innerJoin(schema.documents, eq(schema.documentRevisions.documentId, schema.documents.id))
    .where(eq(schema.documentRevisions.id, sopRevisionId))
    .limit(1);
  return r
    ? { sopRef: r.reference, revision: r.revision, hash: r.hash }
    : { sopRef: "the machine procedure", revision: 0, hash: "" };
}

function refresh(competenceId: string, userId: string, machineId: string) {
  revalidatePath(`/competence/${competenceId}`);
  revalidatePath(`/people/${userId}`);
  revalidatePath(`/machines/${machineId}`);
  revalidatePath("/matrix");
  revalidatePath("/dashboard");
  revalidatePath("/signoff");
}

function addMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ *
 * Start training  (business plan steps 1-3)
 * ------------------------------------------------------------------ */

export async function startTraining(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "TRAINER", "start training");

    const userId = String(formData.get("userId") ?? "");
    const machineId = String(formData.get("machineId") ?? "");
    const trainerId = String(formData.get("trainerId") ?? "");
    if (!userId || !machineId || !trainerId) {
      return { error: "Choose an operator, a machine and a trainer." };
    }
    if (userId === trainerId) {
      return { error: "Someone cannot be their own designated trainer." };
    }

    // The SOP revision in force right now - the trainee is trained on this,
    // and the record must point at it rather than at the document.
    const [sop] = await db
      .select({ id: schema.documentRevisions.id, hash: schema.documentRevisions.contentHash })
      .from(schema.documentRevisions)
      .innerJoin(schema.documents, eq(schema.documentRevisions.documentId, schema.documents.id))
      .where(and(
        eq(schema.documents.machineId, machineId),
        eq(schema.documents.kind, "SOP"),
        eq(schema.documentRevisions.status, "PUBLISHED"),
      ))
      .limit(1);

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.competenceRecords)
        .where(and(
          eq(schema.competenceRecords.userId, userId),
          eq(schema.competenceRecords.machineId, machineId),
        ))
        .limit(1);

      const from: Status = (existing?.status as Status) ?? "NOT_TRAINED";
      const to = nextStatus(from, "START_TRAINING");

      let competenceId: string;
      if (existing) {
        await tx
          .update(schema.competenceRecords)
          .set({
            status: to,
            level: "SUPERVISED",
            trainerId,
            sopRevisionId: sop?.id ?? null,
            sopContentHash: sop?.hash ?? null,
            trainingStartedOn: today(),
            suspensionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.competenceRecords.id, existing.id));
        competenceId = existing.id;
      } else {
        const [created] = await tx
          .insert(schema.competenceRecords)
          .values({
            tenantId: user.tenantId, userId, machineId,
            status: to, level: "SUPERVISED", trainerId,
            sopRevisionId: sop?.id ?? null, sopContentHash: sop?.hash ?? null,
            trainingStartedOn: today(),
          })
          .returning();
        competenceId = created.id;

        await appendEvent(tx, {
          tenantId: user.tenantId, streamId: competenceId,
          streamType: "competence_record",
          eventType: "CompetenceRecordCreated",
          payload: { userId, machineId, status: "NOT_TRAINED" },
          actorId: user.id,
        });
      }

      const [session] = await tx
        .insert(schema.trainingSessions)
        .values({
          tenantId: user.tenantId, competenceId, traineeId: userId,
          trainerId, machineId, sopRevisionId: sop?.id ?? null,
          startedOn: today(),
        })
        .returning();

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: competenceId,
        streamType: "competence_record",
        eventType: "TrainingStarted",
        payload: { from, to, trainerId, machineId, sopRevisionId: sop?.id ?? null, sessionId: session.id },
        actorId: user.id,
      });

      return { competenceId, userId, machineId };
    });

    refresh(result.competenceId, result.userId, result.machineId);
    return { ok: "Training started." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Daily sign-off  (business plan steps 4-6)
 * The one that has to be fast, or the whole system goes unused.
 * ------------------------------------------------------------------ */

export async function recordSignOff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "TRAINER", "record a training sign-off");

    const sessionId = String(formData.get("sessionId") ?? "");
    const rating = Number(formData.get("rating"));
    const note = String(formData.get("note") ?? "").trim() || null;
    const stepsRaw = formData.getAll("steps").map((s) => Number(s)).filter((n) => !Number.isNaN(n));
    const occurredAt = assertedTime(formData.get("occurredAt"));

    if (!sessionId) return { error: "No training session selected." };
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { error: "Give a progress rating from 1 to 5." };
    }

    const [session] = await db
      .select({
        id: schema.trainingSessions.id,
        competenceId: schema.trainingSessions.competenceId,
        trainerId: schema.trainingSessions.trainerId,
        traineeId: schema.trainingSessions.traineeId,
        machineId: schema.trainingSessions.machineId,
        completedOn: schema.trainingSessions.completedOn,
      })
      .from(schema.trainingSessions)
      .where(and(
        eq(schema.trainingSessions.tenantId, user.tenantId),
        eq(schema.trainingSessions.id, sessionId),
      ))
      .limit(1);

    if (!session) return { error: "That training session could not be found." };
    if (session.completedOn) return { error: "That training session is already closed." };

    // A trainer records against their own trainees; managers can record for anyone.
    if (session.trainerId !== user.id && !atLeast(user.role, "MANAGER")) {
      return { error: "Only the designated trainer or a manager can sign off this training." };
    }

    const onDate = occurredAt.toISOString().slice(0, 10);

    await db.transaction(async (tx) => {
      const [entry] = await tx
        .insert(schema.dailySignOffs)
        .values({
          tenantId: user.tenantId,
          trainingSessionId: sessionId,
          onDate,
          rating,
          stepsCovered: stepsRaw,
          note,
          recordedBy: user.id,
          occurredAt,
        })
        .returning();

      await appendEvent(tx, {
        tenantId: user.tenantId,
        streamId: session.competenceId,
        streamType: "competence_record",
        eventType: "DailySignOffRecorded",
        payload: { signOffId: entry.id, sessionId, onDate, rating, stepsCovered: stepsRaw, note },
        actorId: user.id,
        occurredAt,
      });
    });

    refresh(session.competenceId, session.traineeId, session.machineId);
    return { ok: "Sign-off recorded." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Corrections never overwrite. The original entry stays visible, struck
 * through, with a reason and an author - the way a paper record is corrected.
 */
export async function voidSignOff(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "TRAINER", "void a sign-off");

    const signOffId = String(formData.get("signOffId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return { error: "Give a reason for voiding this entry." };

    const [entry] = await db
      .select({
        id: schema.dailySignOffs.id,
        recordedBy: schema.dailySignOffs.recordedBy,
        voidedAt: schema.dailySignOffs.voidedAt,
        competenceId: schema.trainingSessions.competenceId,
        traineeId: schema.trainingSessions.traineeId,
        machineId: schema.trainingSessions.machineId,
      })
      .from(schema.dailySignOffs)
      .innerJoin(schema.trainingSessions, eq(schema.dailySignOffs.trainingSessionId, schema.trainingSessions.id))
      .where(and(
        eq(schema.dailySignOffs.tenantId, user.tenantId),
        eq(schema.dailySignOffs.id, signOffId),
      ))
      .limit(1);

    if (!entry) return { error: "That entry could not be found." };
    if (entry.voidedAt) return { error: "That entry is already voided." };
    if (entry.recordedBy !== user.id && !atLeast(user.role, "MANAGER")) {
      return { error: "Only the person who recorded it, or a manager, can void it." };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.dailySignOffs)
        .set({ voidedAt: new Date(), voidedBy: user.id, voidReason: reason })
        .where(eq(schema.dailySignOffs.id, signOffId));

      await appendEvent(tx, {
        tenantId: user.tenantId,
        streamId: entry.competenceId,
        streamType: "competence_record",
        eventType: "DailySignOffVoided",
        payload: { signOffId, reason },
        actorId: user.id,
      });
    });

    refresh(entry.competenceId, entry.traineeId, entry.machineId);
    return { ok: "Entry voided. It remains in the record, marked void." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Assessment  (business plan step 6-7)
 * ------------------------------------------------------------------ */

export async function readyForAssessment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "TRAINER", "put someone forward for assessment");

    const competenceId = String(formData.get("competenceId") ?? "");
    const record = await loadCompetence(user.tenantId, competenceId);
    const to = nextStatus(record.status as Status, "READY_FOR_ASSESSMENT");

    await db.transaction(async (tx) => {
      await tx
        .update(schema.competenceRecords)
        .set({ status: to, updatedAt: new Date() })
        .where(eq(schema.competenceRecords.id, competenceId));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: competenceId,
        streamType: "competence_record",
        eventType: "ReadyForAssessment",
        payload: { from: record.status, to },
        actorId: user.id,
      });
    });

    refresh(competenceId, record.userId, record.machineId);
    return { ok: "Put forward for assessment." };
  } catch (e) {
    return fail(e);
  }
}

export async function recordAssessment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "TRAINER", "record an assessment");

    const competenceId = String(formData.get("competenceId") ?? "");
    const passed = formData.get("outcome") === "PASS";
    const note = String(formData.get("note") ?? "").trim() || null;
    const criteria = formData.getAll("criteria").map((c) => ({ criterion: String(c), met: passed }));

    const record = await loadCompetence(user.tenantId, competenceId);
    if (record.userId === user.id) {
      return { error: "You cannot assess your own competence." };
    }
    const to = nextStatus(record.status as Status, passed ? "ASSESSMENT_PASSED" : "ASSESSMENT_FAILED");

    await db.transaction(async (tx) => {
      await tx.insert(schema.assessments).values({
        tenantId: user.tenantId, competenceId, assessorId: user.id,
        sopRevisionId: record.sopRevisionId, passed, criteria, note,
      });

      await tx
        .update(schema.competenceRecords)
        .set({ status: to, assessedBy: user.id, updatedAt: new Date() })
        .where(eq(schema.competenceRecords.id, competenceId));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: competenceId,
        streamType: "competence_record",
        eventType: passed ? "AssessmentPassed" : "AssessmentFailed",
        payload: { from: record.status, to, passed, note },
        actorId: user.id,
      });
    });

    refresh(competenceId, record.userId, record.machineId);
    return {
      ok: passed
        ? "Assessment passed. Three signatures are now needed to grant competence."
        : "Assessment recorded as not yet passed. Training continues.",
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Signing  (business plan step 7-8)
 *
 * A signature is an evidence bundle: the named signer re-enters their PIN,
 * and we store the declaration wording shown, the content hash signed
 * against, and both clocks. Competence is granted automatically once all
 * three signatures are present.
 * ------------------------------------------------------------------ */

export async function signCompetence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();

    const competenceId = String(formData.get("competenceId") ?? "");
    const role = String(formData.get("role") ?? "") as SignatureRole;
    const pin = String(formData.get("pin") ?? "");
    const occurredAt = assertedTime(formData.get("occurredAt"));

    if (!["TRAINEE", "TRAINER", "MANAGER"].includes(role)) {
      return { error: "Unknown signature role." };
    }
    if (!pin) return { error: "Enter your PIN to sign." };

    const record = await loadCompetence(user.tenantId, competenceId);
    if (record.status !== "ASSESSMENT") {
      return { error: "This record is not awaiting signatures." };
    }

    // Who is entitled to provide this particular signature.
    const signerId =
      role === "TRAINEE" ? record.userId
      : role === "TRAINER" ? (record.trainerId ?? user.id)
      : user.id;

    if (role === "MANAGER" && !atLeast(user.role, "MANAGER")) {
      return { error: "Only a manager can give the approving signature." };
    }
    if (role !== "MANAGER" && signerId !== user.id && !atLeast(user.role, "MANAGER")) {
      return { error: "You cannot sign on someone else's behalf." };
    }

    // Re-authenticate against the person whose signature this is, not the
    // person holding the tablet.
    const [signer] = await db
      .select({ id: schema.users.id, name: schema.users.name, pinHash: schema.users.pinHash })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, user.tenantId), eq(schema.users.id, signerId)))
      .limit(1);

    if (!signer) return { error: "That signer could not be found." };
    if (!(await verifySecret(pin, signer.pinHash))) {
      return { error: `That PIN does not match ${signer.name}'s.` };
    }

    const existing = await db
      .select({ role: schema.signatures.role })
      .from(schema.signatures)
      .where(and(
        eq(schema.signatures.subjectType, "competence_record"),
        eq(schema.signatures.subjectId, competenceId),
      ));

    if (existing.some((s) => s.role === role)) {
      return { error: `The ${role.toLowerCase()} signature is already recorded.` };
    }

    const sop = await sopContext(record.sopRevisionId);
    const declaration = declarationFor(role, {
      trainee: record.traineeName,
      machine: record.machineName,
      sopRef: sop.sopRef,
      revision: sop.revision,
    });
    const ctx = await requestContext();

    const stillMissing = missingSignatures([...existing.map((s) => s.role), role]);
    const grantsCompetence = stillMissing.length === 0;

    await db.transaction(async (tx) => {
      await tx.insert(schema.signatures).values({
        tenantId: user.tenantId,
        subjectType: "competence_record",
        subjectId: competenceId,
        signerId: signer.id,
        role,
        declaration,
        contentHash: record.sopContentHash ?? sop.hash,
        reauthenticated: true,
        deviceId: ctx.deviceId,
        ipAddress: ctx.ip,
        occurredAt,
      });

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: competenceId,
        streamType: "competence_record",
        eventType: "CompetenceSigned",
        payload: { role, signerId: signer.id, declaration, contentHash: record.sopContentHash ?? sop.hash },
        actorId: user.id,
        occurredAt,
      });

      if (grantsCompetence) {
        const to = nextStatus(record.status as Status, "GRANT_COMPETENCE");
        const from = new Date();
        await tx
          .update(schema.competenceRecords)
          .set({
            status: to,
            level: "INDEPENDENT",
            competentFrom: today(),
            expiresOn: record.revalidationMonths ? addMonths(from, record.revalidationMonths) : null,
            lastReviewOn: today(),
            nextReviewDue: addMonths(from, 3),
            approvedBy: user.id,
            updatedAt: new Date(),
          })
          .where(eq(schema.competenceRecords.id, competenceId));

        await tx
          .update(schema.trainingSessions)
          .set({ completedOn: today() })
          .where(and(
            eq(schema.trainingSessions.competenceId, competenceId),
            sql`${schema.trainingSessions.completedOn} is null`,
          ));

        await appendEvent(tx, {
          tenantId: user.tenantId, streamId: competenceId,
          streamType: "competence_record",
          eventType: "CompetenceGranted",
          payload: { from: record.status, to, level: "INDEPENDENT", approvedBy: user.id },
          actorId: user.id,
        });
      }
    });

    refresh(competenceId, record.userId, record.machineId);
    return {
      ok: grantsCompetence
        ? `Signed. All three signatures present — ${record.traineeName} is now competent on ${record.machineCode}.`
        : `Signed as ${role.toLowerCase()}. Still needed: ${stillMissing.map((r) => r.toLowerCase()).join(", ")}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Suspend, revalidate, review  (business plan step 9)
 * ------------------------------------------------------------------ */

export async function changeStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "MANAGER", "change a competence status");

    const competenceId = String(formData.get("competenceId") ?? "");
    const transition = String(formData.get("transition") ?? "") as Transition;
    const reason = String(formData.get("reason") ?? "").trim();

    const record = await loadCompetence(user.tenantId, competenceId);
    if (!canTransition(record.status as Status, transition)) {
      return { error: `Cannot do that from ${record.status}.` };
    }
    if ((transition === "SUSPEND" || transition === "REQUIRE_REVALIDATION") && !reason) {
      return { error: "Give a reason — it goes on the record." };
    }

    const to = nextStatus(record.status as Status, transition);

    await db.transaction(async (tx) => {
      await tx
        .update(schema.competenceRecords)
        .set({
          status: to,
          suspensionReason: transition === "SUSPEND" ? reason : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.competenceRecords.id, competenceId));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: competenceId,
        streamType: "competence_record",
        eventType:
          transition === "SUSPEND" ? "CompetenceSuspended"
          : transition === "REQUIRE_REVALIDATION" ? "RevalidationRequired"
          : "CompetenceReinstated",
        payload: { from: record.status, to, reason: reason || null },
        actorId: user.id,
      });
    });

    refresh(competenceId, record.userId, record.machineId);
    return { ok: "Status updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function recordReview(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "TRAINER", "record a review");

    const competenceId = String(formData.get("competenceId") ?? "");
    const outcome = String(formData.get("outcome") ?? "CONFIRMED");
    const note = String(formData.get("note") ?? "").trim() || null;

    const record = await loadCompetence(user.tenantId, competenceId);
    const from = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(schema.competenceRecords)
        .set({
          lastReviewOn: today(),
          nextReviewDue: addMonths(from, 3),
          status: outcome === "REVALIDATE" ? "REQUIRES_REVALIDATION" : record.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.competenceRecords.id, competenceId));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: competenceId,
        streamType: "competence_record",
        eventType: "QuarterlyReviewRecorded",
        payload: { outcome, note, nextReviewDue: addMonths(from, 3) },
        actorId: user.id,
      });
    });

    refresh(competenceId, record.userId, record.machineId);
    return { ok: "Review recorded." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Induction  (business plan steps 1-2)
 * ------------------------------------------------------------------ */

export async function toggleInductionItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    require(user.role, "TRAINER", "complete induction items");

    const itemId = String(formData.get("itemId") ?? "");
    const [item] = await db
      .select({
        id: schema.inductionItems.id,
        completedAt: schema.inductionItems.completedAt,
        inductionId: schema.inductionItems.inductionId,
        label: schema.inductionItems.label,
        userId: schema.inductions.userId,
      })
      .from(schema.inductionItems)
      .innerJoin(schema.inductions, eq(schema.inductionItems.inductionId, schema.inductions.id))
      .where(and(
        eq(schema.inductionItems.tenantId, user.tenantId),
        eq(schema.inductionItems.id, itemId),
      ))
      .limit(1);

    if (!item) return { error: "That induction item could not be found." };
    const completing = !item.completedAt;

    await db.transaction(async (tx) => {
      await tx
        .update(schema.inductionItems)
        .set({
          completedAt: completing ? new Date() : null,
          completedBy: completing ? user.id : null,
        })
        .where(eq(schema.inductionItems.id, itemId));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: item.inductionId,
        streamType: "induction",
        eventType: completing ? "InductionItemCompleted" : "InductionItemReopened",
        payload: { itemId, label: item.label },
        actorId: user.id,
      });

      // Close the induction once every item is done.
      const remaining = await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(schema.inductionItems)
        .where(and(
          eq(schema.inductionItems.inductionId, item.inductionId),
          sql`${schema.inductionItems.completedAt} is null`,
        ));

      const done = remaining[0].n === 0;
      await tx
        .update(schema.inductions)
        .set({ completedAt: done ? new Date() : null })
        .where(eq(schema.inductions.id, item.inductionId));

      if (done) {
        await appendEvent(tx, {
          tenantId: user.tenantId, streamId: item.inductionId,
          streamType: "induction",
          eventType: "InductionCompleted",
          payload: {},
          actorId: user.id,
        });
      }
    });

    revalidatePath(`/people/${item.userId}`);
    revalidatePath("/dashboard");
    return { ok: completing ? "Marked complete." : "Reopened." };
  } catch (e) {
    return fail(e);
  }
}
