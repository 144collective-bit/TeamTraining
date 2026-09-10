import { asTenant, schema, type Tx } from "@/db";
import { streamHistory, verifyStream } from "./events";
import { eq, and, or, asc, desc, sql, inArray, isNotNull } from "drizzle-orm";
import type { Status, Level } from "./competence";

/* ------------------------------------------------------------------ *
 * Training matrix
 * ------------------------------------------------------------------ */

export type MatrixCell = {
  competenceId: string;
  status: Status;
  level: Level;
  expiresOn: string | null;
  competentFrom: string | null;
  suspensionReason: string | null;
};

export type MatrixRow = {
  userId: string;
  name: string;
  employeeRef: string | null;
  jobTitle: string | null;
  role: string;
  cells: Record<string, MatrixCell>; // keyed by machineId
};

export type MatrixMachine = {
  id: string;
  code: string;
  name: string;
  areaId: string;
  areaName: string;
  highRisk: boolean;
};

export async function getMatrix(tenantId: string) {
  return asTenant(tenantId, async (tx) => {
    const machines = await tx
      .select({
        id: schema.machines.id,
        code: schema.machines.code,
        name: schema.machines.name,
        areaId: schema.machines.areaId,
        areaName: schema.areas.name,
        highRisk: schema.machines.highRisk,
        sortOrder: schema.machines.sortOrder,
      })
      .from(schema.machines)
      .innerJoin(schema.areas, eq(schema.machines.areaId, schema.areas.id))
      .where(and(eq(schema.machines.tenantId, tenantId), eq(schema.machines.active, true)))
      .orderBy(asc(schema.machines.sortOrder));

    const people = await tx
      .select({
        id: schema.users.id,
        name: schema.users.name,
        employeeRef: schema.users.employeeRef,
        jobTitle: schema.users.jobTitle,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.status, "ACTIVE")))
      .orderBy(asc(schema.users.name));

    const records = await tx
      .select({
        id: schema.competenceRecords.id,
        userId: schema.competenceRecords.userId,
        machineId: schema.competenceRecords.machineId,
        status: schema.competenceRecords.status,
        level: schema.competenceRecords.level,
        expiresOn: schema.competenceRecords.expiresOn,
        competentFrom: schema.competenceRecords.competentFrom,
        suspensionReason: schema.competenceRecords.suspensionReason,
      })
      .from(schema.competenceRecords)
      .where(eq(schema.competenceRecords.tenantId, tenantId));

    const byUser = new Map<string, Record<string, MatrixCell>>();
    for (const r of records) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, {});
      byUser.get(r.userId)![r.machineId] = {
        competenceId: r.id,
        status: r.status as Status,
        level: r.level as Level,
        expiresOn: r.expiresOn,
        competentFrom: r.competentFrom,
        suspensionReason: r.suspensionReason,
      };
    }

    const rows: MatrixRow[] = people.map((p) => ({
      userId: p.id,
      name: p.name,
      employeeRef: p.employeeRef,
      jobTitle: p.jobTitle,
      role: p.role,
      cells: byUser.get(p.id) ?? {},
    }));

    return { machines: machines as MatrixMachine[], rows };
  });
}

/* ------------------------------------------------------------------ *
 * Coverage - how exposed is each machine
 * ------------------------------------------------------------------ */

export type Coverage = {
  machineId: string;
  code: string;
  name: string;
  areaName: string;
  competent: number;
  trainers: number;
  inTraining: number;
  needsAction: number;
};

export async function getCoverage(tenantId: string): Promise<Coverage[]> {
  return asTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        machineId: schema.machines.id,
        code: schema.machines.code,
        name: schema.machines.name,
        areaName: schema.areas.name,
        sortOrder: schema.machines.sortOrder,
        competent: sql<number>`count(*) filter (where ${schema.competenceRecords.status} = 'COMPETENT')`.mapWith(Number),
        trainers: sql<number>`count(*) filter (where ${schema.competenceRecords.status} = 'COMPETENT' and ${schema.competenceRecords.level} = 'TRAINER')`.mapWith(Number),
        inTraining: sql<number>`count(*) filter (where ${schema.competenceRecords.status} in ('IN_TRAINING','ASSESSMENT','INDUCTION'))`.mapWith(Number),
        needsAction: sql<number>`count(*) filter (where ${schema.competenceRecords.status} in ('REQUIRES_REVALIDATION','SUSPENDED'))`.mapWith(Number),
      })
      .from(schema.machines)
      .innerJoin(schema.areas, eq(schema.machines.areaId, schema.areas.id))
      .leftJoin(
        schema.competenceRecords,
        eq(schema.competenceRecords.machineId, schema.machines.id),
      )
      .where(and(eq(schema.machines.tenantId, tenantId), eq(schema.machines.active, true)))
      .groupBy(
        schema.machines.id, schema.machines.code, schema.machines.name,
        schema.areas.name, schema.machines.sortOrder,
      )
      .orderBy(asc(schema.machines.sortOrder));

    return rows.map(({ sortOrder, ...r }) => r);
  });
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export async function getDashboard(tenantId: string) {
  return asTenant(tenantId, async (tx) => {
    const [counts] = await tx
      .select({
        people: sql<number>`(select count(*) from ${schema.users} where tenant_id = ${tenantId} and status = 'ACTIVE')`.mapWith(Number),
        machines: sql<number>`(select count(*) from ${schema.machines} where tenant_id = ${tenantId} and active = true)`.mapWith(Number),
        competent: sql<number>`count(*) filter (where ${schema.competenceRecords.status} = 'COMPETENT')`.mapWith(Number),
        inTraining: sql<number>`count(*) filter (where ${schema.competenceRecords.status} in ('IN_TRAINING','ASSESSMENT'))`.mapWith(Number),
        inInduction: sql<number>`count(*) filter (where ${schema.competenceRecords.status} = 'INDUCTION')`.mapWith(Number),
        revalidate: sql<number>`count(*) filter (where ${schema.competenceRecords.status} = 'REQUIRES_REVALIDATION')`.mapWith(Number),
        suspended: sql<number>`count(*) filter (where ${schema.competenceRecords.status} = 'SUSPENDED')`.mapWith(Number),
        expiringSoon: sql<number>`count(*) filter (where ${schema.competenceRecords.status} = 'COMPETENT' and ${schema.competenceRecords.expiresOn} is not null and ${schema.competenceRecords.expiresOn} < current_date + interval '60 days')`.mapWith(Number),
        reviewsDue: sql<number>`count(*) filter (where ${schema.competenceRecords.nextReviewDue} is not null and ${schema.competenceRecords.nextReviewDue} < current_date)`.mapWith(Number),
        pendingAck: sql<number>`count(*) filter (where ${schema.competenceRecords.ackRequiredRevisionId} is not null)`.mapWith(Number),
      })
      .from(schema.competenceRecords)
      .where(eq(schema.competenceRecords.tenantId, tenantId));

    return counts;
  });
}

export type ActionReason =
  | "SUSPENDED" | "REVALIDATION" | "EXPIRING" | "REVIEW_OVERDUE" | "ACKNOWLEDGEMENT";

/**
 * Everything on this tenant that needs a manager to do something, most urgent
 * first. Suspensions stop production now; a lapsed competence means someone is
 * working unauthorised; the rest are housekeeping that becomes an audit finding
 * if left.
 */
export async function getActionList(tenantId: string) {
  return asTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        competenceId: schema.competenceRecords.id,
        status: schema.competenceRecords.status,
        expiresOn: schema.competenceRecords.expiresOn,
        nextReviewDue: schema.competenceRecords.nextReviewDue,
        suspensionReason: schema.competenceRecords.suspensionReason,
        ackRequired: schema.competenceRecords.ackRequiredRevisionId,
        userId: schema.users.id,
        userName: schema.users.name,
        machineId: schema.machines.id,
        machineCode: schema.machines.code,
        machineName: schema.machines.name,
      })
      .from(schema.competenceRecords)
      .innerJoin(schema.users, eq(schema.competenceRecords.userId, schema.users.id))
      .innerJoin(schema.machines, eq(schema.competenceRecords.machineId, schema.machines.id))
      .where(and(
        eq(schema.competenceRecords.tenantId, tenantId),
        eq(schema.users.status, "ACTIVE"),
        or(
          inArray(schema.competenceRecords.status, ["SUSPENDED", "REQUIRES_REVALIDATION"]),
          isNotNull(schema.competenceRecords.ackRequiredRevisionId),
          and(
            eq(schema.competenceRecords.status, "COMPETENT"),
            isNotNull(schema.competenceRecords.expiresOn),
            sql`${schema.competenceRecords.expiresOn} < current_date + interval '60 days'`,
          ),
          and(
            eq(schema.competenceRecords.status, "COMPETENT"),
            isNotNull(schema.competenceRecords.nextReviewDue),
            sql`${schema.competenceRecords.nextReviewDue} < current_date`,
          ),
        ),
      ))
      .orderBy(asc(schema.users.name));

    const PRIORITY: Record<ActionReason, number> = {
      SUSPENDED: 0, REVALIDATION: 1, EXPIRING: 2, ACKNOWLEDGEMENT: 3, REVIEW_OVERDUE: 4,
    };

    return rows
      .map((r) => {
        const reason: ActionReason =
          r.status === "SUSPENDED" ? "SUSPENDED"
          : r.status === "REQUIRES_REVALIDATION" ? "REVALIDATION"
          : r.ackRequired ? "ACKNOWLEDGEMENT"
          : r.expiresOn && r.expiresOn < inDays(60) ? "EXPIRING"
          : "REVIEW_OVERDUE";
        return { ...r, reason };
      })
      .sort((a, b) => PRIORITY[a.reason] - PRIORITY[b.reason] || a.userName.localeCompare(b.userName));
  });
}

function inDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Training currently under way, with progress from the daily sign-offs. */
export async function getActiveTraining(tenantId: string) {
  return asTenant(tenantId, async (tx) => {
    return tx
      .select({
        sessionId: schema.trainingSessions.id,
        competenceId: schema.trainingSessions.competenceId,
        startedOn: schema.trainingSessions.startedOn,
        traineeId: schema.users.id,
        traineeName: schema.users.name,
        machineCode: schema.machines.code,
        machineName: schema.machines.name,
        status: schema.competenceRecords.status,
        entries: sql<number>`(select count(*) from ${schema.dailySignOffs} d where d.training_session_id = ${schema.trainingSessions.id} and d.voided_at is null)`.mapWith(Number),
        lastRating: sql<number | null>`(select d.rating from ${schema.dailySignOffs} d where d.training_session_id = ${schema.trainingSessions.id} and d.voided_at is null order by d.on_date desc limit 1)`.mapWith(Number),
        lastEntry: sql<string | null>`(select d.on_date from ${schema.dailySignOffs} d where d.training_session_id = ${schema.trainingSessions.id} and d.voided_at is null order by d.on_date desc limit 1)`,
      })
      .from(schema.trainingSessions)
      .innerJoin(schema.users, eq(schema.trainingSessions.traineeId, schema.users.id))
      .innerJoin(schema.machines, eq(schema.trainingSessions.machineId, schema.machines.id))
      .innerJoin(schema.competenceRecords, eq(schema.trainingSessions.competenceId, schema.competenceRecords.id))
      .where(
        and(
          eq(schema.trainingSessions.tenantId, tenantId),
          sql`${schema.trainingSessions.completedOn} is null`,
        ),
      )
      .orderBy(desc(schema.trainingSessions.startedOn));
  });
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export async function getPerson(tenantId: string, userId: string) {
  return asTenant(tenantId, async (tx) => {
    const [person] = await tx
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, userId)))
      .limit(1);
    if (!person) return null;

    const competences = await tx
      .select({
        id: schema.competenceRecords.id,
        status: schema.competenceRecords.status,
        level: schema.competenceRecords.level,
        competentFrom: schema.competenceRecords.competentFrom,
        expiresOn: schema.competenceRecords.expiresOn,
        nextReviewDue: schema.competenceRecords.nextReviewDue,
        suspensionReason: schema.competenceRecords.suspensionReason,
        machineId: schema.machines.id,
        machineCode: schema.machines.code,
        machineName: schema.machines.name,
        areaName: schema.areas.name,
        trainerName: sql<string | null>`(select name from ${schema.users} t where t.id = ${schema.competenceRecords.trainerId})`,
      })
      .from(schema.competenceRecords)
      .innerJoin(schema.machines, eq(schema.competenceRecords.machineId, schema.machines.id))
      .innerJoin(schema.areas, eq(schema.machines.areaId, schema.areas.id))
      .where(and(eq(schema.competenceRecords.tenantId, tenantId), eq(schema.competenceRecords.userId, userId)))
      .orderBy(asc(schema.machines.sortOrder));

    const induction = await tx
      .select({
        id: schema.inductions.id,
        startedAt: schema.inductions.startedAt,
        completedAt: schema.inductions.completedAt,
        trainerName: sql<string>`(select name from ${schema.users} t where t.id = ${schema.inductions.trainerId})`,
      })
      .from(schema.inductions)
      .where(and(eq(schema.inductions.tenantId, tenantId), eq(schema.inductions.userId, userId)))
      .orderBy(desc(schema.inductions.startedAt))
      .limit(1);

    const inductionItems = induction[0]
      ? await tx
          .select()
          .from(schema.inductionItems)
          .where(and(eq(schema.inductionItems.tenantId, tenantId), eq(schema.inductionItems.inductionId, induction[0].id)))
          .orderBy(asc(schema.inductionItems.sortOrder))
      : [];

    return { person, competences, induction: induction[0] ?? null, inductionItems };
  });
}

/* ------------------------------------------------------------------ *
 * Machines
 * ------------------------------------------------------------------ */

export async function getMachine(tenantId: string, machineId: string) {
  return asTenant(tenantId, async (tx) => {
    const [machine] = await tx
      .select({
        id: schema.machines.id,
        code: schema.machines.code,
        name: schema.machines.name,
        manufacturer: schema.machines.manufacturer,
        model: schema.machines.model,
        assetRef: schema.machines.assetRef,
        serialNumber: schema.machines.serialNumber,
        highRisk: schema.machines.highRisk,
        revalidationMonths: schema.machines.revalidationMonths,
        areaName: schema.areas.name,
      })
      .from(schema.machines)
      .innerJoin(schema.areas, eq(schema.machines.areaId, schema.areas.id))
      .where(and(eq(schema.machines.tenantId, tenantId), eq(schema.machines.id, machineId)))
      .limit(1);
    if (!machine) return null;

    const people = await tx
      .select({
        id: schema.competenceRecords.id,
        status: schema.competenceRecords.status,
        level: schema.competenceRecords.level,
        competentFrom: schema.competenceRecords.competentFrom,
        expiresOn: schema.competenceRecords.expiresOn,
        userId: schema.users.id,
        userName: schema.users.name,
        jobTitle: schema.users.jobTitle,
      })
      .from(schema.competenceRecords)
      .innerJoin(schema.users, eq(schema.competenceRecords.userId, schema.users.id))
      .where(and(eq(schema.competenceRecords.tenantId, tenantId), eq(schema.competenceRecords.machineId, machineId)))
      .orderBy(asc(schema.users.name));

    const documents = await documentsForMachine(tx, tenantId, machineId);

    return { machine, people, documents };
  });
}

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

const currentRevision = {
  revisionId: sql<string | null>`(select r.id from ${schema.documentRevisions} r where r.document_id = ${schema.documents.id} and r.status = 'PUBLISHED' limit 1)`,
  revision: sql<number | null>`(select r.revision from ${schema.documentRevisions} r where r.document_id = ${schema.documents.id} and r.status = 'PUBLISHED' limit 1)`.mapWith(Number),
  publishedAt: sql<Date | null>`(select r.published_at from ${schema.documentRevisions} r where r.document_id = ${schema.documents.id} and r.status = 'PUBLISHED' limit 1)`,
  nextReviewOn: sql<string | null>`(select r.next_review_on from ${schema.documentRevisions} r where r.document_id = ${schema.documents.id} and r.status = 'PUBLISHED' limit 1)`,
};

export async function getDocuments(tenantId: string) {
  return asTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: schema.documents.id,
        reference: schema.documents.reference,
        title: schema.documents.title,
        kind: schema.documents.kind,
        machineCode: schema.machines.code,
        machineId: schema.machines.id,
        ...currentRevision,
      })
      .from(schema.documents)
      .leftJoin(schema.machines, eq(schema.documents.machineId, schema.machines.id))
      .where(and(eq(schema.documents.tenantId, tenantId), eq(schema.documents.archived, false)))
      .orderBy(asc(schema.documents.kind), asc(schema.documents.reference));
  });
}

/** Documents attached to one machine. Runs on the caller's transaction. */
function documentsForMachine(tx: Tx, tenantId: string, machineId: string) {
  return tx
    .select({
      id: schema.documents.id,
      reference: schema.documents.reference,
      title: schema.documents.title,
      kind: schema.documents.kind,
      ...currentRevision,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.tenantId, tenantId), eq(schema.documents.machineId, machineId), eq(schema.documents.archived, false)))
    .orderBy(asc(schema.documents.kind));
}

/** One draft revision, with everything the editor needs to render it. */
export async function getDraftRevision(tenantId: string, documentId: string, revisionId: string) {
  return asTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        revisionId: schema.documentRevisions.id,
        revision: schema.documentRevisions.revision,
        status: schema.documentRevisions.status,
        body: schema.documentRevisions.body,
        changeSummary: schema.documentRevisions.changeSummary,
        documentId: schema.documents.id,
        kind: schema.documents.kind,
        title: schema.documents.title,
        reference: schema.documents.reference,
        machineCode: schema.machines.code,
      })
      .from(schema.documentRevisions)
      .innerJoin(schema.documents, eq(schema.documentRevisions.documentId, schema.documents.id))
      .leftJoin(schema.machines, eq(schema.documents.machineId, schema.machines.id))
      .where(and(
        eq(schema.documentRevisions.tenantId, tenantId),
        eq(schema.documentRevisions.id, revisionId),
        eq(schema.documents.id, documentId),
      ))
      .limit(1);
    return row ?? null;
  });
}

/** Active people with their competence position, for the people list. */
export async function getPeopleOverview(tenantId: string) {
  return asTenant(tenantId, (tx) =>
    tx
      .select({
        id: schema.users.id,
        name: schema.users.name,
        employeeRef: schema.users.employeeRef,
        jobTitle: schema.users.jobTitle,
        role: schema.users.role,
        startedOn: schema.users.startedOn,
        competent: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status = 'COMPETENT')`.mapWith(Number),
        training: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status in ('IN_TRAINING','ASSESSMENT','INDUCTION'))`.mapWith(Number),
        action: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status in ('REQUIRES_REVALIDATION','SUSPENDED'))`.mapWith(Number),
        canTrain: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status = 'COMPETENT' and c.level = 'TRAINER')`.mapWith(Number),
      })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.status, "ACTIVE")))
      .orderBy(asc(schema.users.name)),
  );
}

export async function getDocument(tenantId: string, documentId: string) {
  return asTenant(tenantId, async (tx) => {
    const [doc] = await tx
      .select({
        id: schema.documents.id,
        reference: schema.documents.reference,
        title: schema.documents.title,
        kind: schema.documents.kind,
        reviewMonths: schema.documents.reviewMonths,
        machineId: schema.machines.id,
        machineCode: schema.machines.code,
        machineName: schema.machines.name,
        ownerName: sql<string | null>`(select name from ${schema.users} u where u.id = ${schema.documents.ownerId})`,
      })
      .from(schema.documents)
      .leftJoin(schema.machines, eq(schema.documents.machineId, schema.machines.id))
      .where(and(eq(schema.documents.tenantId, tenantId), eq(schema.documents.id, documentId)))
      .limit(1);
    if (!doc) return null;

    const revisions = await tx
      .select({
        id: schema.documentRevisions.id,
        revision: schema.documentRevisions.revision,
        status: schema.documentRevisions.status,
        changeClass: schema.documentRevisions.changeClass,
        changeSummary: schema.documentRevisions.changeSummary,
        body: schema.documentRevisions.body,
        contentHash: schema.documentRevisions.contentHash,
        publishedAt: schema.documentRevisions.publishedAt,
        nextReviewOn: schema.documentRevisions.nextReviewOn,
        authorName: sql<string | null>`(select name from ${schema.users} u where u.id = ${schema.documentRevisions.authoredBy})`,
        approverName: sql<string | null>`(select name from ${schema.users} u where u.id = ${schema.documentRevisions.approvedBy})`,
      })
      .from(schema.documentRevisions)
      .where(and(eq(schema.documentRevisions.tenantId, tenantId), eq(schema.documentRevisions.documentId, documentId)))
      .orderBy(desc(schema.documentRevisions.revision));

    return { doc, revisions };
  });
}

/* ------------------------------------------------------------------ *
 * Competence detail - the evidence view
 * ------------------------------------------------------------------ */

export async function getCompetence(tenantId: string, competenceId: string) {
  return asTenant(tenantId, async (tx) => {
    const [record] = await tx
      .select({
        id: schema.competenceRecords.id,
        status: schema.competenceRecords.status,
        level: schema.competenceRecords.level,
        competentFrom: schema.competenceRecords.competentFrom,
        expiresOn: schema.competenceRecords.expiresOn,
        trainingStartedOn: schema.competenceRecords.trainingStartedOn,
        lastReviewOn: schema.competenceRecords.lastReviewOn,
        nextReviewDue: schema.competenceRecords.nextReviewDue,
        suspensionReason: schema.competenceRecords.suspensionReason,
        sopContentHash: schema.competenceRecords.sopContentHash,
        sopRevisionId: schema.competenceRecords.sopRevisionId,
        ackRequiredRevisionId: schema.competenceRecords.ackRequiredRevisionId,
        userId: schema.users.id,
        userName: schema.users.name,
        employeeRef: schema.users.employeeRef,
        machineId: schema.machines.id,
        machineCode: schema.machines.code,
        machineName: schema.machines.name,
        trainerId: schema.competenceRecords.trainerId,
        trainerName: sql<string | null>`(select name from ${schema.users} t where t.id = ${schema.competenceRecords.trainerId})`,
        approverName: sql<string | null>`(select name from ${schema.users} t where t.id = ${schema.competenceRecords.approvedBy})`,
      })
      .from(schema.competenceRecords)
      .innerJoin(schema.users, eq(schema.competenceRecords.userId, schema.users.id))
      .innerJoin(schema.machines, eq(schema.competenceRecords.machineId, schema.machines.id))
      .where(and(eq(schema.competenceRecords.tenantId, tenantId), eq(schema.competenceRecords.id, competenceId)))
      .limit(1);
    if (!record) return null;

    const sigs = await tx
      .select({
        id: schema.signatures.id,
        role: schema.signatures.role,
        declaration: schema.signatures.declaration,
        contentHash: schema.signatures.contentHash,
        reauthenticated: schema.signatures.reauthenticated,
        occurredAt: schema.signatures.occurredAt,
        recordedAt: schema.signatures.recordedAt,
        signerName: schema.users.name,
      })
      .from(schema.signatures)
      .innerJoin(schema.users, eq(schema.signatures.signerId, schema.users.id))
      .where(
        and(
          eq(schema.signatures.subjectType, "competence_record"),
          eq(schema.signatures.subjectId, competenceId),
        ),
      )
      .orderBy(asc(schema.signatures.occurredAt));

    const sessions = await tx
      .select({
        id: schema.trainingSessions.id,
        startedOn: schema.trainingSessions.startedOn,
        completedOn: schema.trainingSessions.completedOn,
        trainerName: sql<string>`(select name from ${schema.users} t where t.id = ${schema.trainingSessions.trainerId})`,
      })
      .from(schema.trainingSessions)
      .where(and(eq(schema.trainingSessions.tenantId, tenantId), eq(schema.trainingSessions.competenceId, competenceId)))
      .orderBy(desc(schema.trainingSessions.startedOn));

    const signOffs = sessions.length
      ? await tx
          .select({
            id: schema.dailySignOffs.id,
            onDate: schema.dailySignOffs.onDate,
            rating: schema.dailySignOffs.rating,
            stepsCovered: schema.dailySignOffs.stepsCovered,
            note: schema.dailySignOffs.note,
            occurredAt: schema.dailySignOffs.occurredAt,
            recordedAt: schema.dailySignOffs.recordedAt,
            voidedAt: schema.dailySignOffs.voidedAt,
            voidReason: schema.dailySignOffs.voidReason,
            recorderName: schema.users.name,
          })
          .from(schema.dailySignOffs)
          .innerJoin(schema.users, eq(schema.dailySignOffs.recordedBy, schema.users.id))
          .where(and(eq(schema.dailySignOffs.tenantId, tenantId), inArray(schema.dailySignOffs.trainingSessionId, sessions.map((s) => s.id))))
          .orderBy(desc(schema.dailySignOffs.onDate))
      : [];

    const assessmentRows = await tx
      .select({
        id: schema.assessments.id,
        passed: schema.assessments.passed,
        note: schema.assessments.note,
        assessedAt: schema.assessments.assessedAt,
        assessorName: schema.users.name,
      })
      .from(schema.assessments)
      .innerJoin(schema.users, eq(schema.assessments.assessorId, schema.users.id))
      .where(and(eq(schema.assessments.tenantId, tenantId), eq(schema.assessments.competenceId, competenceId)))
      .orderBy(desc(schema.assessments.assessedAt));

    // A minor revision leaves people competent but owing a read-and-confirm.
    const ackRequired = record.ackRequiredRevisionId
      ? (
          await tx
            .select({
              revisionId: schema.documentRevisions.id,
              revision: schema.documentRevisions.revision,
              changeSummary: schema.documentRevisions.changeSummary,
              documentId: schema.documents.id,
              reference: schema.documents.reference,
            })
            .from(schema.documentRevisions)
            .innerJoin(schema.documents, eq(schema.documentRevisions.documentId, schema.documents.id))
            .where(and(eq(schema.documentRevisions.tenantId, tenantId), eq(schema.documentRevisions.id, record.ackRequiredRevisionId)))
            .limit(1)
        )[0] ?? null
      : null;

    const openSession = sessions.find((s) => !s.completedOn) ?? null;

    return { record, signatures: sigs, sessions, signOffs, assessments: assessmentRows, openSession, ackRequired };
  });
}

/**
 * The audit trail for one record, plus a verification of its hash chain.
 * Both run inside the same tenant-scoped transaction as everything else.
 */
export async function getCompetenceAudit(tenantId: string, competenceId: string) {
  return asTenant(tenantId, async (tx) => {
    const [history, integrity] = await Promise.all([
      streamHistory(tx, competenceId),
      verifyStream(tx, competenceId),
    ]);
    return { history, integrity };
  });
}

/* ------------------------------------------------------------------ *
 * Sign-off capture
 * ------------------------------------------------------------------ */

/**
 * Open training sessions. A trainer sees their own; managers see everything,
 * because they cover when a trainer is off.
 */
export async function getOpenSessions(
  tenantId: string,
  userId: string,
  seeAll: boolean,
) {
  return asTenant(tenantId, async (tx) => {
    const where = seeAll
      ? and(
          eq(schema.trainingSessions.tenantId, tenantId),
          sql`${schema.trainingSessions.completedOn} is null`,
        )
      : and(
          eq(schema.trainingSessions.tenantId, tenantId),
          eq(schema.trainingSessions.trainerId, userId),
          sql`${schema.trainingSessions.completedOn} is null`,
        );

    return tx
      .select({
        sessionId: schema.trainingSessions.id,
        competenceId: schema.trainingSessions.competenceId,
        startedOn: schema.trainingSessions.startedOn,
        traineeId: schema.users.id,
        traineeName: schema.users.name,
        traineeRef: schema.users.employeeRef,
        machineId: schema.machines.id,
        machineCode: schema.machines.code,
        machineName: schema.machines.name,
        status: schema.competenceRecords.status,
        trainerId: schema.trainingSessions.trainerId,
        trainerName: sql<string>`(select name from ${schema.users} t where t.id = ${schema.trainingSessions.trainerId})`,
        entries: sql<number>`(select count(*) from ${schema.dailySignOffs} d where d.training_session_id = ${schema.trainingSessions.id} and d.voided_at is null)`.mapWith(Number),
        lastEntry: sql<string | null>`(select max(d.on_date) from ${schema.dailySignOffs} d where d.training_session_id = ${schema.trainingSessions.id} and d.voided_at is null)`,
        signedToday: sql<boolean>`exists (select 1 from ${schema.dailySignOffs} d where d.training_session_id = ${schema.trainingSessions.id} and d.voided_at is null and d.on_date = current_date)`,
      })
      .from(schema.trainingSessions)
      .innerJoin(schema.users, eq(schema.trainingSessions.traineeId, schema.users.id))
      .innerJoin(schema.machines, eq(schema.trainingSessions.machineId, schema.machines.id))
      .innerJoin(schema.competenceRecords, eq(schema.trainingSessions.competenceId, schema.competenceRecords.id))
      .where(where)
      .orderBy(asc(schema.users.name));
  });
}

/** One session plus the SOP steps the trainer ticks against. */
export async function getSessionForCapture(tenantId: string, sessionId: string) {
  return asTenant(tenantId, async (tx) => {
    const [session] = await tx
      .select({
        sessionId: schema.trainingSessions.id,
        competenceId: schema.trainingSessions.competenceId,
        startedOn: schema.trainingSessions.startedOn,
        trainerId: schema.trainingSessions.trainerId,
        traineeId: schema.users.id,
        traineeName: schema.users.name,
        traineeRef: schema.users.employeeRef,
        machineId: schema.machines.id,
        machineCode: schema.machines.code,
        machineName: schema.machines.name,
        sopRevisionId: schema.trainingSessions.sopRevisionId,
        sopBody: schema.documentRevisions.body,
        sopRevision: schema.documentRevisions.revision,
        sopReference: schema.documents.reference,
        sopDocumentId: schema.documents.id,
      })
      .from(schema.trainingSessions)
      .innerJoin(schema.users, eq(schema.trainingSessions.traineeId, schema.users.id))
      .innerJoin(schema.machines, eq(schema.trainingSessions.machineId, schema.machines.id))
      .leftJoin(schema.documentRevisions, eq(schema.trainingSessions.sopRevisionId, schema.documentRevisions.id))
      .leftJoin(schema.documents, eq(schema.documentRevisions.documentId, schema.documents.id))
      .where(and(
        eq(schema.trainingSessions.tenantId, tenantId),
        eq(schema.trainingSessions.id, sessionId),
      ))
      .limit(1);

    if (!session) return null;

    const recent = await tx
      .select({
        id: schema.dailySignOffs.id,
        onDate: schema.dailySignOffs.onDate,
        rating: schema.dailySignOffs.rating,
        stepsCovered: schema.dailySignOffs.stepsCovered,
        note: schema.dailySignOffs.note,
        voidedAt: schema.dailySignOffs.voidedAt,
        recorderName: schema.users.name,
      })
      .from(schema.dailySignOffs)
      .innerJoin(schema.users, eq(schema.dailySignOffs.recordedBy, schema.users.id))
      .where(and(eq(schema.dailySignOffs.tenantId, tenantId), eq(schema.dailySignOffs.trainingSessionId, sessionId)))
      .orderBy(desc(schema.dailySignOffs.onDate))
      .limit(5);

    return { session, recent };
  });
}

/** People and machines available to start training on. */
export async function getTrainingOptions(tenantId: string) {
  return asTenant(tenantId, async (tx) => {
    const people = await tx
      .select({ id: schema.users.id, name: schema.users.name, employeeRef: schema.users.employeeRef, role: schema.users.role })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.status, "ACTIVE")))
      .orderBy(asc(schema.users.name));

    const machines = await tx
      .select({ id: schema.machines.id, code: schema.machines.code, name: schema.machines.name })
      .from(schema.machines)
      .where(and(eq(schema.machines.tenantId, tenantId), eq(schema.machines.active, true)))
      .orderBy(asc(schema.machines.sortOrder));

    return { people, machines };
  });
}

/** Who can train on a given machine - level TRAINER competences. */
export async function getEligibleTrainers(tenantId: string, machineId?: string) {
  return asTenant(tenantId, async (tx) => {
    const base = tx
      .select({
        id: schema.users.id,
        name: schema.users.name,
        role: schema.users.role,
        machineId: schema.competenceRecords.machineId,
      })
      .from(schema.users)
      .leftJoin(
        schema.competenceRecords,
        and(
          eq(schema.competenceRecords.userId, schema.users.id),
          eq(schema.competenceRecords.status, "COMPETENT"),
          eq(schema.competenceRecords.level, "TRAINER"),
        ),
      )
      .where(and(
        eq(schema.users.tenantId, tenantId),
        eq(schema.users.status, "ACTIVE"),
        inArray(schema.users.role, ["TRAINER", "MANAGER", "ADMIN"]),
      ))
      .orderBy(asc(schema.users.name));

    const rows = await base;
    const byId = new Map<string, { id: string; name: string; role: string; machines: string[] }>();
    for (const r of rows) {
      if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, role: r.role, machines: [] });
      if (r.machineId) byId.get(r.id)!.machines.push(r.machineId);
    }
    return [...byId.values()];
  });
}
