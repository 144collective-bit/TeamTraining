import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

/** Postgres bytea <-> Node Buffer. */
const customBytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

/** Where a person sits in the training lifecycle for one machine. */
export const competenceStatus = pgEnum("competence_status", [
  "NOT_TRAINED",
  "INDUCTION",
  "IN_TRAINING",
  "ASSESSMENT",
  "COMPETENT",
  "REQUIRES_REVALIDATION",
  "SUSPENDED",
]);

/** Depth of capability, held separately from status. */
export const competenceLevel = pgEnum("competence_level", [
  "NONE",         // 0 - no training
  "SUPERVISED",   // 1 - can operate under supervision
  "INDEPENDENT",  // 2 - signed off, works unsupervised
  "EXPERT",       // 3 - deep capability, handles exceptions
  "TRAINER",      // 4 - authorised to train others
]);

export const documentKind = pgEnum("document_kind", [
  "SOP",
  "RISK_ASSESSMENT",
  /** A process training sign-off: the numbered areas a trainee is signed off on. */
  "TRAINING_DOC",
  /** The induction checklist an induction is instantiated from. */
  "INDUCTION",
  "COSHH",
  "OTHER",
]);

export const revisionStatus = pgEnum("revision_status", [
  "DRAFT",
  "PUBLISHED",
  "SUPERSEDED",
  "WITHDRAWN",
]);

/**
 * How much a new revision disrupts people already trained on the old one.
 * Drives the automatic re-training trigger.
 */
export const changeClass = pgEnum("change_class", [
  "EDITORIAL",       // typo/formatting - no action
  "MINOR",           // clarification - acknowledgement required
  "MAJOR",           // method change - revalidation required
  "SAFETY_CRITICAL", // new hazard/PPE - competence suspended immediately
]);

export const userRole = pgEnum("user_role", [
  "ADMIN",
  "MANAGER",
  "TRAINER",
  "OPERATOR",
]);

export const signatureRole = pgEnum("signature_role", [
  "TRAINEE",
  "TRAINER",
  "MANAGER",
]);

export const employmentStatus = pgEnum("employment_status", [
  "ACTIVE",
  "ON_LEAVE",
  "LEFT",
]);

/* ------------------------------------------------------------------ *
 * Tenancy
 * ------------------------------------------------------------------ */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  brandColor: text("brand_color").notNull().default("#c8102e"),
  /** Uploaded logo, shown in the navigation rail and on printed documents. */
  logoAttachmentId: uuid("logo_attachment_id"),
  siteName: text("site_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** Works badge / clock number - how the shop floor identifies people. */
    employeeRef: text("employee_ref"),
    jobTitle: text("job_title"),
    role: userRole("role").notNull().default("OPERATOR"),
    status: employmentStatus("status").notNull().default("ACTIVE"),
    startedOn: date("started_on"),
    /** scrypt hash; null means the account cannot log in (floor-only staff). */
    passwordHash: text("password_hash"),
    /** Short PIN for fast shop-floor signing, stored hashed. */
    pinHash: text("pin_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_tenant_email_idx").on(t.tenantId, t.email),
    index("users_tenant_idx").on(t.tenantId),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ *
 * Plant structure
 * ------------------------------------------------------------------ */

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("areas_tenant_code_idx").on(t.tenantId, t.code)],
);

/**
 * A machine is the column axis of the training matrix and the anchor for
 * SOPs and risk assessments.
 */
export const machines = pgTable(
  "machines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").notNull().references(() => areas.id, { onDelete: "restrict" }),
    /** Short label used as the matrix column header, e.g. "PB-01". */
    code: text("code").notNull(),
    name: text("name").notNull(),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    assetRef: text("asset_ref"),
    /** True for machines with elevated risk - drives stricter sign-off rules. */
    highRisk: boolean("high_risk").notNull().default(false),
    /** Months until competence expires. Null = no expiry. */
    revalidationMonths: integer("revalidation_months"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("machines_tenant_code_idx").on(t.tenantId, t.code),
    index("machines_area_idx").on(t.areaId),
  ],
);

/* ------------------------------------------------------------------ *
 * Controlled documents
 * ------------------------------------------------------------------ */

/**
 * A document is a container. Its content lives in immutable revisions,
 * so a sign-off can point at exactly what was read.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    machineId: uuid("machine_id").references(() => machines.id, { onDelete: "set null" }),
    kind: documentKind("kind").notNull(),
    /** Controlled reference, e.g. "SOP-PB-001". */
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Months between scheduled reviews. */
    reviewMonths: integer("review_months").notNull().default(12),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_tenant_ref_idx").on(t.tenantId, t.reference),
    index("documents_machine_idx").on(t.machineId),
    index("documents_kind_idx").on(t.tenantId, t.kind),
  ],
);

/**
 * Immutable once PUBLISHED. Never edit a published revision - supersede it.
 * Enforced by a database trigger, see drizzle/0001_guards.sql.
 */
export const documentRevisions = pgTable(
  "document_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    status: revisionStatus("status").notNull().default("DRAFT"),
    changeClass: changeClass("change_class").notNull().default("MINOR"),
    changeSummary: text("change_summary"),
    /**
     * Structured content. For SOPs this is the TWI Job Instruction breakdown:
     * { steps: [{ step, keyPoints[], reasons[] }], ppe: [], hazards: [] }
     */
    body: jsonb("body").notNull(),
    /** SHA-256 of the canonical body - proves what was signed. */
    contentHash: text("content_hash").notNull(),
    authoredBy: uuid("authored_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    nextReviewOn: date("next_review_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("doc_revisions_doc_rev_idx").on(t.documentId, t.revision),
    index("doc_revisions_status_idx").on(t.tenantId, t.status),
  ],
);

/**
 * Step photographs and other uploads.
 *
 * Stored in the database rather than on disk so that a backup of the database
 * is a complete backup of the evidence - a training record that references a
 * photo which has since vanished from a bucket is not evidence.
 *
 * Content-addressed: the same image uploaded twice is stored once, and the
 * hash is what the SOP revision references, so the images form part of what a
 * person provably signed against.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    sha256: text("sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    filename: text("filename"),
    data: customBytea("data").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attachments_tenant_sha_idx").on(t.tenantId, t.sha256)],
);

/* ------------------------------------------------------------------ *
 * Training matrix
 * ------------------------------------------------------------------ */

/**
 * One cell of the training matrix: this person, on this machine.
 * Never a boolean - status, level, evidence and expiry all matter.
 */
export const competenceRecords = pgTable(
  "competence_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
    status: competenceStatus("status").notNull().default("NOT_TRAINED"),
    level: competenceLevel("level").notNull().default("NONE"),
    /** The exact revision trained against - never the document id. */
    sopRevisionId: uuid("sop_revision_id").references(() => documentRevisions.id, { onDelete: "set null" }),
    /** Copy of the revision hash at sign-off, so proof survives deletion. */
    sopContentHash: text("sop_content_hash"),
    trainerId: uuid("trainer_id").references(() => users.id, { onDelete: "set null" }),
    assessedBy: uuid("assessed_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    trainingStartedOn: date("training_started_on"),
    competentFrom: date("competent_from"),
    expiresOn: date("expires_on"),
    lastReviewOn: date("last_review_on"),
    nextReviewDue: date("next_review_due"),
    suspensionReason: text("suspension_reason"),
    /**
     * Set when a MINOR revision supersedes what this person trained on: they
     * stay competent but must read and confirm the change.
     */
    ackRequiredRevisionId: uuid("ack_required_revision_id"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("competence_user_machine_idx").on(t.userId, t.machineId),
    index("competence_tenant_status_idx").on(t.tenantId, t.status),
    index("competence_machine_idx").on(t.machineId),
  ],
);

/* ------------------------------------------------------------------ *
 * Training delivery
 * ------------------------------------------------------------------ */

export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    competenceId: uuid("competence_id").notNull().references(() => competenceRecords.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    trainerId: uuid("trainer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    machineId: uuid("machine_id").notNull().references(() => machines.id, { onDelete: "cascade" }),
    sopRevisionId: uuid("sop_revision_id").references(() => documentRevisions.id, { onDelete: "set null" }),
    startedOn: date("started_on").notNull(),
    completedOn: date("completed_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("training_sessions_competence_idx").on(t.competenceId)],
);

/**
 * The trainer's daily progress entry. Must stay under 30 seconds to complete
 * on a phone, or it will not get used.
 */
export const dailySignOffs = pgTable(
  "daily_sign_offs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    trainingSessionId: uuid("training_session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
    /** Date the training actually happened, as asserted by the trainer. */
    onDate: date("on_date").notNull(),
    /** 1-5 progress rating against the SOP steps. */
    rating: integer("rating").notNull(),
    /** Which SOP step numbers were covered in this session. */
    stepsCovered: jsonb("steps_covered").notNull().default([]),
    note: text("note"),
    recordedBy: uuid("recorded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    /** Device clock - what the user asserts. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Server clock - authoritative. Gap between the two is the sync delay. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [
    index("daily_sign_offs_session_idx").on(t.trainingSessionId),
    index("daily_sign_offs_date_idx").on(t.tenantId, t.onDate),
  ],
);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    competenceId: uuid("competence_id").notNull().references(() => competenceRecords.id, { onDelete: "cascade" }),
    assessorId: uuid("assessor_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    sopRevisionId: uuid("sop_revision_id").references(() => documentRevisions.id, { onDelete: "set null" }),
    passed: boolean("passed").notNull(),
    /** Per-criterion outcomes: [{ criterion, met, note }] */
    criteria: jsonb("criteria").notNull().default([]),
    note: text("note"),
    assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assessments_competence_idx").on(t.competenceId)],
);

/**
 * One row per training area on a process training sign-off.
 *
 * The paper version is a numbered list with a date and two signatures beside
 * each line; this is that, tracked. The area label is snapshotted so the record
 * still reads correctly after the training document is revised and the
 * numbering moves.
 */
export const trainingAreaProgress = pgTable(
  "training_area_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    competenceId: uuid("competence_id").notNull().references(() => competenceRecords.id, { onDelete: "cascade" }),
    trainingRevisionId: uuid("training_revision_id").references(() => documentRevisions.id, { onDelete: "set null" }),
    areaIndex: integer("area_index").notNull(),
    areaLabel: text("area_label").notNull(),
    /** The training key: 0 none … 5 fully trained. */
    level: integer("level").notNull().default(0),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("training_area_competence_idx").on(t.competenceId, t.areaIndex),
    index("training_area_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ *
 * Induction
 * ------------------------------------------------------------------ */

export const inductions = pgTable(
  "inductions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    trainerId: uuid("trainer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    /** The checklist revision this induction was instantiated from. */
    checklistRevisionId: uuid("checklist_revision_id").references(() => documentRevisions.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("inductions_user_idx").on(t.userId)],
);

export const inductionItems = pgTable(
  "induction_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    inductionId: uuid("induction_id").notNull().references(() => inductions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Optional controlled document backing this item, e.g. a risk assessment. */
    documentRevisionId: uuid("document_revision_id").references(() => documentRevisions.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("induction_items_induction_idx").on(t.inductionId)],
);

/* ------------------------------------------------------------------ *
 * Signatures
 * ------------------------------------------------------------------ */

/**
 * An evidence bundle, not a drawn squiggle. Captures who signed, what exact
 * content they signed, the wording they agreed to, and both clocks.
 */
export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    /** Polymorphic target, e.g. "competence_record" / "induction". */
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    signerId: uuid("signer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    role: signatureRole("role").notNull(),
    /** Exact declaration text shown at the time of signing. */
    declaration: text("declaration").notNull(),
    /** Hash of the content the signature covers. */
    contentHash: text("content_hash").notNull(),
    /** True only if the signer re-entered a credential at the point of signing. */
    reauthenticated: boolean("reauthenticated").notNull().default(false),
    deviceId: text("device_id"),
    ipAddress: text("ip_address"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("signatures_subject_idx").on(t.subjectType, t.subjectId),
    index("signatures_signer_idx").on(t.signerId),
  ],
);

/* ------------------------------------------------------------------ *
 * Append-only audit log
 * ------------------------------------------------------------------ */

/**
 * The system of record. Append-only, hash-chained, enforced by a database
 * trigger that rejects UPDATE and DELETE outright.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
    /** The entity this event belongs to, e.g. a competence record id. */
    streamId: uuid("stream_id").notNull(),
    streamType: text("stream_type").notNull(),
    seq: integer("seq").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (t) => [
    uniqueIndex("events_stream_seq_idx").on(t.streamId, t.seq),
    index("events_tenant_recorded_idx").on(t.tenantId, t.recordedAt),
    index("events_type_idx").on(t.tenantId, t.eventType),
  ],
);

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const areasRelations = relations(areas, ({ many }) => ({
  machines: many(machines),
}));

export const machinesRelations = relations(machines, ({ one, many }) => ({
  area: one(areas, { fields: [machines.areaId], references: [areas.id] }),
  documents: many(documents),
  competences: many(competenceRecords),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  machine: one(machines, { fields: [documents.machineId], references: [machines.id] }),
  revisions: many(documentRevisions),
}));

export const documentRevisionsRelations = relations(documentRevisions, ({ one }) => ({
  document: one(documents, { fields: [documentRevisions.documentId], references: [documents.id] }),
}));

export const competenceRecordsRelations = relations(competenceRecords, ({ one, many }) => ({
  user: one(users, { fields: [competenceRecords.userId], references: [users.id] }),
  machine: one(machines, { fields: [competenceRecords.machineId], references: [machines.id] }),
  sopRevision: one(documentRevisions, {
    fields: [competenceRecords.sopRevisionId],
    references: [documentRevisions.id],
  }),
  sessions: many(trainingSessions),
}));

export const trainingSessionsRelations = relations(trainingSessions, ({ one, many }) => ({
  competence: one(competenceRecords, {
    fields: [trainingSessions.competenceId],
    references: [competenceRecords.id],
  }),
  signOffs: many(dailySignOffs),
}));

export const dailySignOffsRelations = relations(dailySignOffs, ({ one }) => ({
  session: one(trainingSessions, {
    fields: [dailySignOffs.trainingSessionId],
    references: [trainingSessions.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  competences: many(competenceRecords),
}));
