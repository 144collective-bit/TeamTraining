"use server";

import { db, schema } from "@/db";
import { eq, and, ne, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "./session";
import { appendEvent } from "./events";
import { contentHash } from "./crypto";
import { atLeast, PermissionError } from "./state-machine";
import { sopBodySchema, raBodySchema, EMPTY_SOP, EMPTY_RA } from "./documents";
import type { ActionState } from "./commands";

function fail(e: unknown): ActionState {
  if (e instanceof PermissionError) return { error: e.message };
  console.error("[document-command]", e);
  return { error: "Something went wrong saving that. Nothing was changed." };
}

function need(role: string, minimum: "TRAINER" | "MANAGER" | "ADMIN", what: string) {
  if (!atLeast(role as never, minimum)) {
    throw new PermissionError(`You need ${minimum.toLowerCase()} access to ${what}.`);
  }
}

const today = () => new Date().toISOString().slice(0, 10);
function addMonths(months: number) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Create
 * ------------------------------------------------------------------ */

export async function createDocument(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let target: string | null = null;
  try {
    const user = await requireUser();
    need(user.role, "MANAGER", "create a controlled document");

    const kind = String(formData.get("kind") ?? "SOP");
    const title = String(formData.get("title") ?? "").trim();
    const machineId = String(formData.get("machineId") ?? "") || null;
    const reviewMonths = Number(formData.get("reviewMonths")) || 12;

    if (!title) return { error: "Give the document a title." };
    if (kind !== "SOP" && kind !== "RISK_ASSESSMENT") {
      return { error: "Unknown document type." };
    }

    const reference = await nextReference(user.tenantId, kind, machineId);

    const created = await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(schema.documents)
        .values({
          tenantId: user.tenantId, machineId, kind,
          reference, title, ownerId: user.id, reviewMonths,
        })
        .returning();

      const [rev] = await tx
        .insert(schema.documentRevisions)
        .values({
          tenantId: user.tenantId, documentId: doc.id, revision: 1,
          status: "DRAFT", changeClass: "MINOR",
          changeSummary: "First issue.",
          body: kind === "SOP" ? EMPTY_SOP : EMPTY_RA,
          contentHash: contentHash(kind === "SOP" ? EMPTY_SOP : EMPTY_RA),
          authoredBy: user.id,
        })
        .returning();

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: doc.id, streamType: "document",
        eventType: "DocumentCreated",
        payload: { kind, reference, title, machineId },
        actorId: user.id,
      });

      return { docId: doc.id, revId: rev.id };
    });

    revalidatePath("/documents");
    target = `/documents/${created.docId}/edit/${created.revId}`;
  } catch (e) {
    return fail(e);
  }
  if (target) redirect(target as never);
  return {};
}

/** SOP-PB-01, SOP-PB-01-2, RA-SITE-003 - readable and unique per tenant. */
async function nextReference(tenantId: string, kind: string, machineId: string | null) {
  const prefix = kind === "SOP" ? "SOP" : "RA";
  let base: string;

  if (machineId) {
    const [m] = await db
      .select({ code: schema.machines.code })
      .from(schema.machines)
      .where(eq(schema.machines.id, machineId))
      .limit(1);
    base = `${prefix}-${m?.code ?? "GEN"}`;
  } else {
    base = `${prefix}-SITE`;
  }

  const taken = await db
    .select({ reference: schema.documents.reference })
    .from(schema.documents)
    .where(and(
      eq(schema.documents.tenantId, tenantId),
      sql`${schema.documents.reference} like ${base + "%"}`,
    ));

  const used = new Set(taken.map((t) => t.reference));
  if (!used.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${String(n).padStart(3, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/* ------------------------------------------------------------------ *
 * Draft a new revision of an existing document
 * ------------------------------------------------------------------ */

export async function createDraftRevision(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let target: string | null = null;
  try {
    const user = await requireUser();
    need(user.role, "MANAGER", "revise a controlled document");

    const documentId = String(formData.get("documentId") ?? "");

    const [doc] = await db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.tenantId, user.tenantId), eq(schema.documents.id, documentId)))
      .limit(1);
    if (!doc) return { error: "That document could not be found." };

    const revisions = await db
      .select()
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.documentId, documentId))
      .orderBy(sql`${schema.documentRevisions.revision} desc`);

    const openDraft = revisions.find((r) => r.status === "DRAFT");
    if (openDraft) {
      target = `/documents/${documentId}/edit/${openDraft.id}`;
    } else {
      const current = revisions.find((r) => r.status === "PUBLISHED") ?? revisions[0];
      const nextNumber = (revisions[0]?.revision ?? 0) + 1;

      const [rev] = await db
        .insert(schema.documentRevisions)
        .values({
          tenantId: user.tenantId, documentId, revision: nextNumber,
          status: "DRAFT", changeClass: "MINOR", changeSummary: "",
          // Start from what is in force, so a revision is an edit, not a rewrite.
          body: current?.body ?? (doc.kind === "SOP" ? EMPTY_SOP : EMPTY_RA),
          contentHash: current?.contentHash ?? "",
          authoredBy: user.id,
        })
        .returning();

      target = `/documents/${documentId}/edit/${rev.id}`;
    }
  } catch (e) {
    return fail(e);
  }
  if (target) redirect(target as never);
  return {};
}

/* ------------------------------------------------------------------ *
 * Save a draft
 * ------------------------------------------------------------------ */

export async function saveDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    need(user.role, "MANAGER", "edit a controlled document");

    const revisionId = String(formData.get("revisionId") ?? "");
    const bodyRaw = String(formData.get("body") ?? "");
    const changeSummary = String(formData.get("changeSummary") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();

    const rev = await loadDraft(user.tenantId, revisionId);
    if ("error" in rev) return rev;

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyRaw);
    } catch {
      return { error: "The document content could not be read." };
    }

    const schemaFor = rev.kind === "SOP" ? sopBodySchema : raBodySchema;
    const result = schemaFor.safeParse(parsedBody);
    if (!result.success) {
      return { error: result.error.issues[0]?.message ?? "Check the document for missing details." };
    }

    const body = result.data;
    await db.transaction(async (tx) => {
      await tx
        .update(schema.documentRevisions)
        .set({ body, contentHash: contentHash(body), changeSummary })
        .where(eq(schema.documentRevisions.id, revisionId));

      if (title && title !== rev.title) {
        await tx
          .update(schema.documents)
          .set({ title })
          .where(eq(schema.documents.id, rev.documentId));
      }
    });

    revalidatePath(`/documents/${rev.documentId}`);
    return { ok: "Draft saved." };
  } catch (e) {
    return fail(e);
  }
}

async function loadDraft(tenantId: string, revisionId: string) {
  const [row] = await db
    .select({
      id: schema.documentRevisions.id,
      status: schema.documentRevisions.status,
      revision: schema.documentRevisions.revision,
      documentId: schema.documents.id,
      kind: schema.documents.kind,
      title: schema.documents.title,
      machineId: schema.documents.machineId,
      reference: schema.documents.reference,
      reviewMonths: schema.documents.reviewMonths,
    })
    .from(schema.documentRevisions)
    .innerJoin(schema.documents, eq(schema.documentRevisions.documentId, schema.documents.id))
    .where(and(
      eq(schema.documentRevisions.tenantId, tenantId),
      eq(schema.documentRevisions.id, revisionId),
    ))
    .limit(1);

  if (!row) return { error: "That revision could not be found." } as const;
  if (row.status !== "DRAFT") {
    return { error: "Published revisions cannot be edited. Create a new revision instead." } as const;
  }
  return row;
}

/* ------------------------------------------------------------------ *
 * Publish - and the consequences for everyone already trained
 * ------------------------------------------------------------------ */

export async function publishRevision(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    need(user.role, "MANAGER", "publish a controlled document");

    const revisionId = String(formData.get("revisionId") ?? "");
    const changeClass = String(formData.get("changeClass") ?? "MINOR");
    const changeSummary = String(formData.get("changeSummary") ?? "").trim();

    if (!["EDITORIAL", "MINOR", "MAJOR", "SAFETY_CRITICAL"].includes(changeClass)) {
      return { error: "Choose how significant this change is." };
    }
    if (!changeSummary) {
      return { error: "Summarise what changed — it goes on the permanent record." };
    }

    const rev = await loadDraft(user.tenantId, revisionId);
    if ("error" in rev) return rev;

    const [draft] = await db
      .select({ body: schema.documentRevisions.body, authoredBy: schema.documentRevisions.authoredBy })
      .from(schema.documentRevisions)
      .where(eq(schema.documentRevisions.id, revisionId))
      .limit(1);

    // The editor sends its current content, so publishing commits exactly what
    // the author is looking at rather than whatever was last saved.
    const bodyRaw = formData.get("body");
    let candidate: unknown = draft.body;
    if (typeof bodyRaw === "string" && bodyRaw.length > 0) {
      try {
        candidate = JSON.parse(bodyRaw);
      } catch {
        return { error: "The document content could not be read." };
      }
    }

    const schemaFor = rev.kind === "SOP" ? sopBodySchema : raBodySchema;
    const parsed = schemaFor.safeParse(candidate);
    if (!parsed.success) {
      return { error: `Cannot publish: ${parsed.error.issues[0]?.message}` };
    }

    const title = String(formData.get("title") ?? "").trim();
    if (title && title !== rev.title) {
      await db
        .update(schema.documents)
        .set({ title })
        .where(eq(schema.documents.id, rev.documentId));
    }

    // An author approving their own procedure defeats the point of approval,
    // and a first issue is no exception - that is the revision nobody has ever
    // checked. The fallback below keeps a one-manager business unblocked.
    if (draft.authoredBy === user.id) {
      const [ownerCount] = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(schema.users)
        .where(and(
          eq(schema.users.tenantId, user.tenantId),
          eq(schema.users.status, "ACTIVE"),
          inArray(schema.users.role, ["MANAGER", "ADMIN"]),
          ne(schema.users.id, user.id),
        ));
      if (ownerCount.n > 0) {
        return {
          error: "You wrote this revision, so someone else with manager access needs to approve it.",
        };
      }
    }

    const affected = await publishAndCascade({
      tenantId: user.tenantId,
      actorId: user.id,
      revisionId,
      documentId: rev.documentId,
      machineId: rev.machineId,
      kind: rev.kind,
      reference: rev.reference,
      revisionNumber: rev.revision,
      changeClass: changeClass as never,
      changeSummary,
      reviewMonths: rev.reviewMonths,
      body: parsed.data,
    });

    revalidatePath("/documents");
    revalidatePath(`/documents/${rev.documentId}`);
    revalidatePath("/matrix");
    revalidatePath("/dashboard");

    return { ok: describeOutcome(changeClass, affected) };
  } catch (e) {
    return fail(e);
  }
}

type CascadeArgs = {
  tenantId: string; actorId: string; revisionId: string; documentId: string;
  machineId: string | null; kind: string; reference: string; revisionNumber: number;
  changeClass: "EDITORIAL" | "MINOR" | "MAJOR" | "SAFETY_CRITICAL";
  changeSummary: string; reviewMonths: number; body: unknown;
};

/**
 * Publishing is the moment the training system earns its keep.
 *
 * Note what is deliberately NOT done: a competence record's sopRevisionId is
 * left pointing at the revision the person actually trained against. That is
 * the evidence. What changes is their *status*, which records the consequence
 * of the procedure having moved on beneath them.
 */
async function publishAndCascade(a: CascadeArgs): Promise<number> {
  return db.transaction(async (tx) => {
    // Supersede first: only one published revision per document is allowed,
    // and the database enforces it.
    const [previous] = await tx
      .select({ id: schema.documentRevisions.id, revision: schema.documentRevisions.revision })
      .from(schema.documentRevisions)
      .where(and(
        eq(schema.documentRevisions.documentId, a.documentId),
        eq(schema.documentRevisions.status, "PUBLISHED"),
      ))
      .limit(1);

    if (previous) {
      await tx
        .update(schema.documentRevisions)
        .set({ status: "SUPERSEDED", supersededAt: new Date() })
        .where(eq(schema.documentRevisions.id, previous.id));
    }

    await tx
      .update(schema.documentRevisions)
      .set({
        status: "PUBLISHED",
        body: a.body as never,
        changeClass: a.changeClass,
        changeSummary: a.changeSummary,
        contentHash: contentHash(a.body),
        approvedBy: a.actorId,
        publishedAt: new Date(),
        nextReviewOn: addMonths(a.reviewMonths),
      })
      .where(eq(schema.documentRevisions.id, a.revisionId));

    await appendEvent(tx, {
      tenantId: a.tenantId, streamId: a.documentId, streamType: "document",
      eventType: "RevisionPublished",
      payload: {
        revisionId: a.revisionId, revision: a.revisionNumber,
        changeClass: a.changeClass, changeSummary: a.changeSummary,
        supersededRevisionId: previous?.id ?? null,
      },
      actorId: a.actorId,
    });

    // Editorial changes affect nobody's competence, and a document with no
    // machine (a site-wide assessment) has no matrix column to cascade to.
    if (a.changeClass === "EDITORIAL" || !a.machineId) return 0;

    const records = await tx
      .select({
        id: schema.competenceRecords.id,
        status: schema.competenceRecords.status,
        userId: schema.competenceRecords.userId,
      })
      .from(schema.competenceRecords)
      .where(and(
        eq(schema.competenceRecords.machineId, a.machineId),
        inArray(schema.competenceRecords.status, ["COMPETENT", "IN_TRAINING", "ASSESSMENT"]),
      ));

    if (records.length === 0) return 0;

    const reason =
      a.changeClass === "SAFETY_CRITICAL"
        ? `Competence suspended: ${a.reference} rev ${a.revisionNumber} introduces a safety-critical change — ${a.changeSummary}`
        : `${a.reference} rev ${a.revisionNumber} changes the method — ${a.changeSummary}`;

    for (const record of records) {
      if (a.changeClass === "MINOR") {
        // They stay competent, but must read and confirm the change.
        await tx
          .update(schema.competenceRecords)
          .set({ ackRequiredRevisionId: a.revisionId, updatedAt: new Date() })
          .where(eq(schema.competenceRecords.id, record.id));

        await appendEvent(tx, {
          tenantId: a.tenantId, streamId: record.id, streamType: "competence_record",
          eventType: "AcknowledgementRequired",
          payload: { revisionId: a.revisionId, reference: a.reference, revision: a.revisionNumber, changeSummary: a.changeSummary },
          actorId: a.actorId,
        });
        continue;
      }

      const nextStatus = a.changeClass === "SAFETY_CRITICAL" ? "SUSPENDED" : "REQUIRES_REVALIDATION";

      await tx
        .update(schema.competenceRecords)
        .set({
          status: nextStatus,
          suspensionReason: a.changeClass === "SAFETY_CRITICAL" ? reason : null,
          ackRequiredRevisionId: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.competenceRecords.id, record.id));

      await appendEvent(tx, {
        tenantId: a.tenantId, streamId: record.id, streamType: "competence_record",
        eventType: a.changeClass === "SAFETY_CRITICAL" ? "CompetenceSuspended" : "RevalidationRequired",
        payload: {
          from: record.status, to: nextStatus, reason,
          triggeredBy: { revisionId: a.revisionId, reference: a.reference, revision: a.revisionNumber, changeClass: a.changeClass },
        },
        actorId: a.actorId,
      });
    }

    return records.length;
  });
}

function describeOutcome(changeClass: string, affected: number) {
  if (changeClass === "EDITORIAL") return "Published. Editorial change — no action for trained staff.";
  if (affected === 0) return "Published. Nobody is currently trained on this machine.";
  const people = `${affected} ${affected === 1 ? "person" : "people"}`;
  if (changeClass === "MINOR") return `Published. ${people} must read and confirm the change.`;
  if (changeClass === "MAJOR") return `Published. ${people} now require revalidation before operating unsupervised.`;
  return `Published. ${people} suspended immediately pending a re-brief.`;
}

/* ------------------------------------------------------------------ *
 * Acknowledge a minor change
 * ------------------------------------------------------------------ */

export async function acknowledgeRevision(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const competenceId = String(formData.get("competenceId") ?? "");

    const [record] = await db
      .select({
        id: schema.competenceRecords.id,
        userId: schema.competenceRecords.userId,
        machineId: schema.competenceRecords.machineId,
        ackRequiredRevisionId: schema.competenceRecords.ackRequiredRevisionId,
      })
      .from(schema.competenceRecords)
      .where(and(
        eq(schema.competenceRecords.tenantId, user.tenantId),
        eq(schema.competenceRecords.id, competenceId),
      ))
      .limit(1);

    if (!record) return { error: "That record could not be found." };
    if (!record.ackRequiredRevisionId) return { error: "Nothing to acknowledge." };
    if (record.userId !== user.id && !atLeast(user.role as never, "MANAGER")) {
      return { error: "Only the operator can confirm they have read the change." };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.competenceRecords)
        .set({ ackRequiredRevisionId: null, updatedAt: new Date() })
        .where(eq(schema.competenceRecords.id, competenceId));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: competenceId, streamType: "competence_record",
        eventType: "RevisionAcknowledged",
        payload: { revisionId: record.ackRequiredRevisionId, acknowledgedBy: record.userId },
        actorId: user.id,
      });
    });

    revalidatePath(`/competence/${competenceId}`);
    revalidatePath("/matrix");
    return { ok: "Change acknowledged." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Discard a draft
 * ------------------------------------------------------------------ */

export async function discardDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let target: string | null = null;
  try {
    const user = await requireUser();
    need(user.role, "MANAGER", "discard a draft");

    const revisionId = String(formData.get("revisionId") ?? "");
    const rev = await loadDraft(user.tenantId, revisionId);
    if ("error" in rev) return rev;

    await db.transaction(async (tx) => {
      // Only ever a DRAFT: the database refuses to delete anything published.
      await tx.delete(schema.documentRevisions).where(eq(schema.documentRevisions.id, revisionId));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: rev.documentId, streamType: "document",
        eventType: "DraftDiscarded",
        payload: { revision: rev.revision },
        actorId: user.id,
      });
    });

    revalidatePath(`/documents/${rev.documentId}`);
    target = `/documents/${rev.documentId}`;
  } catch (e) {
    return fail(e);
  }
  if (target) redirect(target as never);
  return {};
}
