import { db, schema } from "@/db";
import { eq, and, asc, desc, sql, inArray, isNotNull } from "drizzle-orm";
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
  const machines = await db
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

  const people = await db
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

  const records = await db
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
  const rows = await db
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
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export async function getDashboard(tenantId: string) {
  const [counts] = await db
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
    })
    .from(schema.competenceRecords)
    .where(eq(schema.competenceRecords.tenantId, tenantId));

  return counts;
}

/** Competences that need a manager to act, most urgent first. */
export async function getActionList(tenantId: string) {
  return db
    .select({
      competenceId: schema.competenceRecords.id,
      status: schema.competenceRecords.status,
      expiresOn: schema.competenceRecords.expiresOn,
      suspensionReason: schema.competenceRecords.suspensionReason,
      userId: schema.users.id,
      userName: schema.users.name,
      machineId: schema.machines.id,
      machineCode: schema.machines.code,
      machineName: schema.machines.name,
    })
    .from(schema.competenceRecords)
    .innerJoin(schema.users, eq(schema.competenceRecords.userId, schema.users.id))
    .innerJoin(schema.machines, eq(schema.competenceRecords.machineId, schema.machines.id))
    .where(
      and(
        eq(schema.competenceRecords.tenantId, tenantId),
        inArray(schema.competenceRecords.status, ["SUSPENDED", "REQUIRES_REVALIDATION"]),
      ),
    )
    .orderBy(asc(schema.competenceRecords.status), asc(schema.users.name));
}

/** Training currently under way, with progress from the daily sign-offs. */
export async function getActiveTraining(tenantId: string) {
  return db
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
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export async function getPerson(tenantId: string, userId: string) {
  const [person] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, userId)))
    .limit(1);
  if (!person) return null;

  const competences = await db
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
    .where(eq(schema.competenceRecords.userId, userId))
    .orderBy(asc(schema.machines.sortOrder));

  const induction = await db
    .select({
      id: schema.inductions.id,
      startedAt: schema.inductions.startedAt,
      completedAt: schema.inductions.completedAt,
      trainerName: sql<string>`(select name from ${schema.users} t where t.id = ${schema.inductions.trainerId})`,
    })
    .from(schema.inductions)
    .where(eq(schema.inductions.userId, userId))
    .orderBy(desc(schema.inductions.startedAt))
    .limit(1);

  const inductionItems = induction[0]
    ? await db
        .select()
        .from(schema.inductionItems)
        .where(eq(schema.inductionItems.inductionId, induction[0].id))
        .orderBy(asc(schema.inductionItems.sortOrder))
    : [];

  return { person, competences, induction: induction[0] ?? null, inductionItems };
}

/* ------------------------------------------------------------------ *
 * Machines
 * ------------------------------------------------------------------ */

export async function getMachine(tenantId: string, machineId: string) {
  const [machine] = await db
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

  const people = await db
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
    .where(eq(schema.competenceRecords.machineId, machineId))
    .orderBy(asc(schema.users.name));

  const documents = await getDocumentsForMachine(tenantId, machineId);

  return { machine, people, documents };
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
  return db
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
}

export async function getDocumentsForMachine(tenantId: string, machineId: string) {
  return db
    .select({
      id: schema.documents.id,
      reference: schema.documents.reference,
      title: schema.documents.title,
      kind: schema.documents.kind,
      ...currentRevision,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.machineId, machineId), eq(schema.documents.archived, false)))
    .orderBy(asc(schema.documents.kind));
}

export async function getDocument(tenantId: string, documentId: string) {
  const [doc] = await db
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

  const revisions = await db
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
    .where(eq(schema.documentRevisions.documentId, documentId))
    .orderBy(desc(schema.documentRevisions.revision));

  return { doc, revisions };
}

/* ------------------------------------------------------------------ *
 * Competence detail - the evidence view
 * ------------------------------------------------------------------ */

export async function getCompetence(tenantId: string, competenceId: string) {
  const [record] = await db
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
      userId: schema.users.id,
      userName: schema.users.name,
      employeeRef: schema.users.employeeRef,
      machineId: schema.machines.id,
      machineCode: schema.machines.code,
      machineName: schema.machines.name,
      trainerName: sql<string | null>`(select name from ${schema.users} t where t.id = ${schema.competenceRecords.trainerId})`,
      approverName: sql<string | null>`(select name from ${schema.users} t where t.id = ${schema.competenceRecords.approvedBy})`,
    })
    .from(schema.competenceRecords)
    .innerJoin(schema.users, eq(schema.competenceRecords.userId, schema.users.id))
    .innerJoin(schema.machines, eq(schema.competenceRecords.machineId, schema.machines.id))
    .where(and(eq(schema.competenceRecords.tenantId, tenantId), eq(schema.competenceRecords.id, competenceId)))
    .limit(1);
  if (!record) return null;

  const sigs = await db
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

  const sessions = await db
    .select({
      id: schema.trainingSessions.id,
      startedOn: schema.trainingSessions.startedOn,
      completedOn: schema.trainingSessions.completedOn,
      trainerName: sql<string>`(select name from ${schema.users} t where t.id = ${schema.trainingSessions.trainerId})`,
    })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.competenceId, competenceId))
    .orderBy(desc(schema.trainingSessions.startedOn));

  const signOffs = sessions.length
    ? await db
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
        .where(inArray(schema.dailySignOffs.trainingSessionId, sessions.map((s) => s.id)))
        .orderBy(desc(schema.dailySignOffs.onDate))
    : [];

  return { record, signatures: sigs, sessions, signOffs };
}
