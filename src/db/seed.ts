/**
 * Seeds a working example modelled on Protektor's Kidderminster plant:
 * 6 press brakes, 2 punches, 1 large laser cutter, 1 welding bay.
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { db, schema } from "./index";
import { hashSecret, contentHash, sha256Bytes } from "@/lib/crypto";
import { appendEvent } from "@/lib/events";
import { sql } from "drizzle-orm";
import { placeholderPng } from "./placeholder-image";

type SeedStep = {
  step: string;
  keyPoints: string[];
  reasons: string[];
};
type SeedSop = {
  purpose: string;
  ppe: string[];
  hazards: string[];
  safetyCheck: string;
  carePoint: string;
  steps: SeedStep[];
};

function iso(daysAgo: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function addMonths(from: string, months: number) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}


/**
 * Deterministic expiry so re-seeding produces the same picture.
 * Spreads renewals across the coming ~2 years, with a few near-term.
 */
function expiryFor(
  c: { user: string; machine: string; status: string },
  revalidationMonths: number,
): string | null {
  if (c.status === "REQUIRES_REVALIDATION") return iso(20 + hash(c) % 40);
  if (c.status !== "COMPETENT" && c.status !== "SUSPENDED") return null;

  const h = hash(c);
  // One in seven falls due inside 60 days - enough to be visible, not noise.
  const monthsAhead = h % 7 === 0 ? 1 : 4 + (h % Math.max(1, revalidationMonths - 4));
  return addMonths(new Date().toISOString().slice(0, 10), monthsAhead);
}

function hash(c: { user: string; machine: string }): number {
  const s = `${c.user}|${c.machine}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}


/**
 * Stores (or reuses) one of four placeholder images. De-duplicated by content
 * hash, exactly as a real upload would be.
 */
async function placeholderAttachment(
  tenantId: string,
  uploadedBy: string,
  variant: number,
): Promise<string> {
  const png = placeholderPng(640, 480, variant);
  const hash = sha256Bytes(png);

  const [existing] = await db
    .select({ id: schema.attachments.id })
    .from(schema.attachments)
    .where(sql`tenant_id = ${tenantId} and sha256 = ${hash}`)
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.attachments)
    .values({
      tenantId,
      sha256: hash,
      mimeType: "image/png",
      byteSize: png.byteLength,
      filename: `placeholder-${variant}.png`,
      data: png,
      uploadedBy,
    })
    .returning({ id: schema.attachments.id });
  return created.id;
}

/** appendEvent requires a transaction; the seed appends one event at a time. */
function emit(input: Parameters<typeof appendEvent>[1]) {
  return db.transaction((tx) => appendEvent(tx, input));
}

async function main() {
  console.log("Clearing existing data...");
  // Order matters: events references tenants with onDelete restrict.
  await db.execute(sql`
    TRUNCATE TABLE events, signatures, daily_sign_offs, training_sessions,
      assessments, induction_items, inductions, competence_records,
      document_revisions, documents, attachments, machines, areas,
      auth_sessions, users, tenants
    RESTART IDENTITY CASCADE
  `);

  /* ---------------------------------------------------------------- *
   * Tenant
   * ---------------------------------------------------------------- */
  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: "Protektor UK", slug: "protektor", brandColor: "#C8102E" })
    .returning();
  const tenantId = tenant.id;

  /* ---------------------------------------------------------------- *
   * People
   * ---------------------------------------------------------------- */
  const password = await hashSecret("protektor");
  const pin = await hashSecret("1234");

  const staff: {
    name: string; email: string; ref: string; jobTitle: string;
    role: "ADMIN" | "MANAGER" | "TRAINER" | "OPERATOR"; startedOn: string;
  }[] = [
    { name: "David Whitfield", email: "d.whitfield@protektor.example", ref: "E-1001", jobTitle: "Operations Manager",   role: "ADMIN",    startedOn: iso(2900) },
    { name: "Karen Bhatti",    email: "k.bhatti@protektor.example",    ref: "E-1002", jobTitle: "Production Manager",   role: "MANAGER",  startedOn: iso(2100) },
    { name: "Ian Prosser",     email: "i.prosser@protektor.example",   ref: "E-1003", jobTitle: "Shift Supervisor",     role: "TRAINER",  startedOn: iso(3400) },
    { name: "Marta Kowalczyk", email: "m.kowalczyk@protektor.example", ref: "E-1004", jobTitle: "Senior Setter",        role: "TRAINER",  startedOn: iso(2600) },
    { name: "Gareth Lloyd",    email: "g.lloyd@protektor.example",     ref: "E-1005", jobTitle: "Welding Supervisor",   role: "TRAINER",  startedOn: iso(3100) },
    { name: "Tomasz Nowak",    email: "t.nowak@protektor.example",     ref: "E-1006", jobTitle: "Press Brake Operator", role: "OPERATOR", startedOn: iso(1500) },
    { name: "Sadia Rahman",    email: "s.rahman@protektor.example",    ref: "E-1007", jobTitle: "Press Brake Operator", role: "OPERATOR", startedOn: iso(900)  },
    { name: "Callum Reid",     email: "c.reid@protektor.example",      ref: "E-1008", jobTitle: "Laser Operator",       role: "OPERATOR", startedOn: iso(1200) },
    { name: "Jordan Ellis",    email: "j.ellis@protektor.example",     ref: "E-1009", jobTitle: "Punch Operator",       role: "OPERATOR", startedOn: iso(700)  },
    { name: "Priya Shah",      email: "p.shah@protektor.example",      ref: "E-1010", jobTitle: "Fabricator",           role: "OPERATOR", startedOn: iso(430)  },
    { name: "Wayne Docherty",  email: "w.docherty@protektor.example",  ref: "E-1011", jobTitle: "Welder",               role: "OPERATOR", startedOn: iso(1800) },
    { name: "Elena Petrova",   email: "e.petrova@protektor.example",   ref: "E-1012", jobTitle: "Fabricator",           role: "OPERATOR", startedOn: iso(210)  },
    { name: "Ryan McAllister", email: "r.mcallister@protektor.example",ref: "E-1013", jobTitle: "Trainee Operator",     role: "OPERATOR", startedOn: iso(45)   },
    { name: "Aisha Khan",      email: "a.khan@protektor.example",      ref: "E-1014", jobTitle: "Trainee Operator",     role: "OPERATOR", startedOn: iso(12)   },
  ];

  const users = await db
    .insert(schema.users)
    .values(
      staff.map((s) => ({
        tenantId, email: s.email, name: s.name, employeeRef: s.ref,
        jobTitle: s.jobTitle, role: s.role, startedOn: s.startedOn,
        passwordHash: password, pinHash: pin,
      })),
    )
    .returning();

  const byName = (n: string) => users.find((u) => u.name === n)!;
  const admin = byName("David Whitfield");
  const prodMgr = byName("Karen Bhatti");
  const ian = byName("Ian Prosser");
  const marta = byName("Marta Kowalczyk");
  const gareth = byName("Gareth Lloyd");

  /* ---------------------------------------------------------------- *
   * Areas and machines
   * ---------------------------------------------------------------- */
  const areaRows = await db
    .insert(schema.areas)
    .values([
      { tenantId, name: "Press Brake Bay", code: "PBB", sortOrder: 1 },
      { tenantId, name: "Punch Shop",      code: "PSH", sortOrder: 2 },
      { tenantId, name: "Laser",           code: "LAS", sortOrder: 3 },
      { tenantId, name: "Welding Bay",     code: "WLD", sortOrder: 4 },
    ])
    .returning();
  const area = (code: string) => areaRows.find((a) => a.code === code)!;

  const machineSpecs = [
    { code: "PB-01", name: "Press Brake 1", area: "PBB", manufacturer: "Amada",     model: "HFE 1303",       highRisk: true,  reval: 24, sort: 1 },
    { code: "PB-02", name: "Press Brake 2", area: "PBB", manufacturer: "Amada",     model: "HFE 1303",       highRisk: true,  reval: 24, sort: 2 },
    { code: "PB-03", name: "Press Brake 3", area: "PBB", manufacturer: "Bystronic", model: "Xpert 150",      highRisk: true,  reval: 24, sort: 3 },
    { code: "PB-04", name: "Press Brake 4", area: "PBB", manufacturer: "Bystronic", model: "Xpert 150",      highRisk: true,  reval: 24, sort: 4 },
    { code: "PB-05", name: "Press Brake 5", area: "PBB", manufacturer: "LVD",       model: "PPEB 135",       highRisk: true,  reval: 24, sort: 5 },
    { code: "PB-06", name: "Press Brake 6", area: "PBB", manufacturer: "LVD",       model: "PPEB 220",       highRisk: true,  reval: 24, sort: 6 },
    { code: "PN-01", name: "Punch 1",       area: "PSH", manufacturer: "Amada",     model: "EM 2510 NT",     highRisk: true,  reval: 24, sort: 7 },
    { code: "PN-02", name: "Punch 2",       area: "PSH", manufacturer: "Trumpf",    model: "TruPunch 3000",  highRisk: true,  reval: 24, sort: 8 },
    { code: "LC-01", name: "Laser Cutter",  area: "LAS", manufacturer: "Bystronic", model: "ByStar Fiber 6kW", highRisk: true, reval: 12, sort: 9 },
    { code: "WB-01", name: "Welding Bay",   area: "WLD", manufacturer: "Fronius",   model: "TransSteel 4000", highRisk: true, reval: 24, sort: 10 },
  ];

  const machines = await db
    .insert(schema.machines)
    .values(
      machineSpecs.map((m) => ({
        tenantId, areaId: area(m.area).id, code: m.code, name: m.name,
        manufacturer: m.manufacturer, model: m.model,
        assetRef: `AST-${m.code}`, highRisk: m.highRisk,
        revalidationMonths: m.reval, sortOrder: m.sort,
      })),
    )
    .returning();
  const machine = (code: string) => machines.find((m) => m.code === code)!;

  /* ---------------------------------------------------------------- *
   * Controlled documents - one SOP and one risk assessment per machine
   * ---------------------------------------------------------------- */
  const sopBodies: Record<string, SeedSop> = {
    PRESS_BRAKE: {
      purpose: "Safe setting and operation of the hydraulic press brake for forming sheet and section.",
      safetyCheck: "Guarding and light curtain tested, e-stops proven, bed clear of tools before the first stroke.",
      carePoint: "Never reach into the tool area without isolating first — the ram does not care that you are quick.",
      ppe: ["Safety footwear", "Cut-resistant gloves (handling only)", "Eye protection", "Hi-vis"],
      hazards: ["Crushing between tools", "Trapping at the back gauge", "Manual handling of sheet", "Falling tooling"],
      steps: [
        { step: "Pre-start checks", keyPoints: ["Guarding and light curtain intact", "E-stops function", "No oil leaks", "Bed and tools clean"], reasons: ["A defective light curtain removes the only barrier between the operator and the tool"] },
        { step: "Load the program", keyPoints: ["Confirm drawing issue number", "Match program to job card", "Verify material grade and thickness"], reasons: ["Forming to a superseded drawing scraps the whole batch"] },
        { step: "Set tooling", keyPoints: ["Isolate before entering the tool area", "Seat punch fully", "Check die opening against thickness", "Torque clamps"], reasons: ["Unseated tooling can be ejected under load"] },
        { step: "First-off", keyPoints: ["Form one part", "Check angle with protractor", "Check flange dimensions", "Get first-off signed"], reasons: ["Catching a setting error at part one rather than part two hundred"] },
        { step: "Run the batch", keyPoints: ["Hands clear of the tool line", "Support long parts", "Check every tenth part"], reasons: ["Springback drifts as tooling warms"] },
        { step: "Shut down", keyPoints: ["Return ram to top", "Isolate", "Clean bed", "Log output and downtime"], reasons: ["The next shift inherits the machine in a known state"] },
      ],
    },
    PUNCH: {
      purpose: "Safe setting and operation of the CNC turret punch press.",
      safetyCheck: "Guarding in place, slug tray empty, air pressure correct and clamps clear of the tool path.",
      carePoint: "Check punch-to-die clearance against material thickness. Wrong clearance destroys tooling in one hit.",
      ppe: ["Safety footwear", "Eye protection", "Hearing protection", "Cut-resistant gloves (handling only)"],
      hazards: ["Crushing at the ram", "Trapping at the clamps", "Noise", "Sharp slugs and edges"],
      steps: [
        { step: "Pre-start checks", keyPoints: ["Guarding in place", "E-stops function", "Slug tray empty", "Air pressure correct"], reasons: ["A full slug tray causes jams and unplanned intervention in the danger zone"] },
        { step: "Turret set-up", keyPoints: ["Isolate before loading tools", "Confirm tool station map", "Check punch and die clearance for thickness"], reasons: ["Wrong clearance tears the material and destroys tooling"] },
        { step: "Load material", keyPoints: ["Check grade and thickness", "Set clamps clear of the tool path", "Confirm sheet is flat"], reasons: ["Clamp collision is the most common crash on this machine"] },
        { step: "First-off", keyPoints: ["Run one sheet", "Check hole positions and sizes", "Check for burr", "Get first-off signed"], reasons: ["Burr indicates worn tooling and fails the customer standard"] },
        { step: "Run the batch", keyPoints: ["Clear slugs at set intervals", "Monitor for tool wear", "Stack parts to avoid damage"], reasons: ["Slug pulling causes scrap and tool damage"] },
        { step: "Shut down", keyPoints: ["Isolate", "Empty slug tray", "Return tools to store", "Log output and downtime"], reasons: ["Tooling left in the turret goes missing and is expensive to replace"] },
      ],
    },
    LASER: {
      purpose: "Safe operation of the fibre laser cutting machine.",
      safetyCheck: "Enclosure interlocks proven, extraction running, fire suppression in date before any beam on.",
      carePoint: "Never defeat an interlock. Watch the slat bed for fire throughout the nest.",
      ppe: ["Safety footwear", "Eye protection", "Hi-vis", "Heat-resistant gloves (part removal)"],
      hazards: ["Laser radiation", "Fume and particulate", "Hot parts and dross", "Fire", "Crushing at the pallet changer"],
      steps: [
        { step: "Pre-start checks", keyPoints: ["Enclosure interlocks function", "Extraction running", "Assist gas pressure correct", "Fire suppression in date"], reasons: ["Fibre laser radiation causes permanent eye injury; the enclosure is the primary control"] },
        { step: "Load the nest", keyPoints: ["Confirm nest matches the job card", "Verify material grade and thickness", "Check sheet is flat and clean"], reasons: ["A distorted sheet causes head collision and downtime"] },
        { step: "Set cutting parameters", keyPoints: ["Select the correct parameter set", "Check nozzle condition and centring", "Confirm focus position"], reasons: ["A damaged nozzle wrecks cut quality across the whole nest"] },
        { step: "First-off", keyPoints: ["Cut one part", "Check edge quality and squareness", "Check dimensions", "Get first-off signed"], reasons: ["Confirms parameters before committing an expensive sheet"] },
        { step: "Run the nest", keyPoints: ["Never defeat an interlock", "Monitor for dross build-up", "Watch for fire in the slat bed"], reasons: ["Slat bed fires are the most common serious incident on laser plant"] },
        { step: "Unload and shut down", keyPoints: ["Allow parts to cool", "Clean slats and dross drawer", "Isolate", "Log output and downtime"], reasons: ["Hot parts cause burns and warp when stacked"] },
      ],
    },
    WELDING: {
      purpose: "Safe MIG/TIG welding of fabricated steel assemblies in the welding bay.",
      safetyCheck: "Leads and torch checked, extraction at the arc, screens positioned, extinguisher present and in date.",
      carePoint: "Local extraction is mandatory, not optional — welding fume is a known carcinogen.",
      ppe: ["Welding helmet to correct shade", "Flame-retardant overalls", "Welding gauntlets", "Safety footwear", "Respiratory protection where directed"],
      hazards: ["Arc eye", "Welding fume", "Burns and hot metal", "Fire", "Electric shock", "Compressed gas cylinders"],
      steps: [
        { step: "Pre-start checks", keyPoints: ["Check leads and torch for damage", "Extraction at the arc and working", "Screens positioned", "Extinguisher present and in date"], reasons: ["Welding fume is a known carcinogen; local extraction is mandatory, not optional"] },
        { step: "Prepare the joint", keyPoints: ["Clean to bright metal", "Check fit-up and gap", "Confirm joint against the drawing"], reasons: ["Contamination causes porosity and weld failure"] },
        { step: "Set parameters", keyPoints: ["Select wire or electrode to spec", "Set voltage and wire feed", "Confirm gas type and flow"], reasons: ["Parameters outside the weld procedure invalidate the joint"] },
        { step: "Tack and check", keyPoints: ["Tack in sequence", "Check squareness and alignment", "Correct distortion before full weld"], reasons: ["Distortion is far cheaper to fix at tack stage"] },
        { step: "Weld to procedure", keyPoints: ["Maintain travel speed and angle", "Watch interpass temperature", "Clean between runs"], reasons: ["Consistency is what makes the weld inspectable"] },
        { step: "Inspect and shut down", keyPoints: ["Visual inspection to standard", "Deslag and clean", "Isolate the set", "Close cylinder valves"], reasons: ["Cylinders left open are a fire risk overnight"] },
      ],
    },
  };

  // Likelihood and severity are seeded deterministically from the hazard text
  // so the example shows a realistic spread of risk bands rather than one value.
  const raBody = (m: string, hazards: string[]) => ({
    scope: `Routine operation of ${m}, including setting, running and cleaning down.`,
    assessedBy: "Karen Bhatti",
    hazards: hazards.map((h, i) => {
      const likelihood = 2 + ((h.length + i) % 3);
      const severity = 3 + ((h.length + i * 2) % 3);
      return {
        hazard: h,
        whoAtRisk: "Operators, trainees, passing staff",
        existingControls: [
          "Fixed and interlocked guarding",
          "SOP followed; trained and signed-off operators only",
          "PPE issued and worn",
          "Planned maintenance regime",
        ],
        likelihood,
        severity,
        furtherAction:
          likelihood * severity >= 10
            ? "Re-brief at quarterly review; confirm guarding check on the daily start-up sheet."
            : "Monitor at quarterly review.",
        residualLikelihood: Math.max(1, likelihood - 1),
        residualSeverity: severity,
      };
    }),
  });

  const sopFor = (code: string) =>
    code.startsWith("PB") ? sopBodies.PRESS_BRAKE
    : code.startsWith("PN") ? sopBodies.PUNCH
    : code.startsWith("LC") ? sopBodies.LASER
    : sopBodies.WELDING;

  const publishedRevisions: Record<string, string> = {};   // machineCode -> SOP revision id
  const publishedHashes: Record<string, string> = {};

  for (const m of machineSpecs) {
    const mid = machine(m.code).id;

    // --- SOP -------------------------------------------------------
    const [sopDoc] = await db.insert(schema.documents).values({
      tenantId, machineId: mid, kind: "SOP",
      reference: `SOP-${m.code}`,
      title: `${m.name} - Standard Operating Procedure`,
      ownerId: prodMgr.id, reviewMonths: 12,
    }).returning();

    const seed = sopFor(m.code);

    // One placeholder photograph per step. Content-addressed, so the four
    // variants are stored once each and shared across every procedure.
    const steps = [];
    for (const [i, step] of seed.steps.entries()) {
      const imageId = await placeholderAttachment(tenantId, prodMgr.id, i);
      steps.push({
        instruction: step.step,
        keyPoints: step.keyPoints,
        reasons: step.reasons,
        imageId,
        imageCaption: `Placeholder — replace with a photograph of ${m.name.toLowerCase()} at this step.`,
      });
    }

    const body = {
      purpose: seed.purpose,
      ppe: seed.ppe,
      hazards: seed.hazards,
      safetyCheck: seed.safetyCheck,
      carePoint: seed.carePoint,
      steps,
    };
    const hash = contentHash(body);
    const [sopRev] = await db.insert(schema.documentRevisions).values({
      tenantId, documentId: sopDoc.id, revision: 3, status: "PUBLISHED",
      changeClass: "MINOR",
      changeSummary: "Clarified first-off checks following internal audit.",
      body, contentHash: hash,
      authoredBy: ian.id, approvedBy: prodMgr.id,
      publishedAt: new Date(`${iso(120)}T09:00:00Z`),
      nextReviewOn: addMonths(iso(120), 12),
    }).returning();

    publishedRevisions[m.code] = sopRev.id;
    publishedHashes[m.code] = hash;

    // --- Risk assessment -------------------------------------------
    const rab = raBody(m.name, sopFor(m.code).hazards);
    const [raDoc] = await db.insert(schema.documents).values({
      tenantId, machineId: mid, kind: "RISK_ASSESSMENT",
      reference: `RA-${m.code}`,
      title: `${m.name} - Risk Assessment`,
      ownerId: prodMgr.id, reviewMonths: 12,
    }).returning();

    await db.insert(schema.documentRevisions).values({
      tenantId, documentId: raDoc.id, revision: 2, status: "PUBLISHED",
      changeClass: "MINOR", changeSummary: "Annual review, controls unchanged.",
      body: rab, contentHash: contentHash(rab),
      authoredBy: prodMgr.id, approvedBy: admin.id,
      publishedAt: new Date(`${iso(200)}T09:00:00Z`),
      nextReviewOn: addMonths(iso(200), 12),
    });
  }

  // Site-wide induction risk assessment
  const siteRa = {
    scope: "General site induction: traffic, emergency procedures, manual handling, PPE.",
    assessedBy: "David Whitfield",
    hazards: [
      { hazard: "Site traffic and FLT movement", whoAtRisk: "All staff and visitors", existingControls: ["Marked pedestrian routes", "Hi-vis mandatory", "FLT segregation"], likelihood: 3, severity: 5, furtherAction: "Induction briefing before first entry to the shop floor.", residualLikelihood: 2, residualSeverity: 5 },
      { hazard: "Manual handling of sheet and section", whoAtRisk: "Operators", existingControls: ["Lifting aids provided", "Two-person lift policy", "Manual handling training"], likelihood: 4, severity: 3, furtherAction: "Refresher every 24 months.", residualLikelihood: 2, residualSeverity: 3 },
      { hazard: "Noise", whoAtRisk: "Shop floor staff", existingControls: ["Hearing protection zones signed", "PPE issued", "Health surveillance"], likelihood: 4, severity: 2, furtherAction: "Annual audiometry.", residualLikelihood: 2, residualSeverity: 2 },
    ],
  };
  const [siteRaDoc] = await db.insert(schema.documents).values({
    tenantId, machineId: null, kind: "RISK_ASSESSMENT",
    reference: "RA-SITE-001", title: "Site Induction - General Risk Assessment",
    ownerId: admin.id, reviewMonths: 12,
  }).returning();
  const [siteRaRev] = await db.insert(schema.documentRevisions).values({
    tenantId, documentId: siteRaDoc.id, revision: 4, status: "PUBLISHED",
    changeClass: "MINOR", changeSummary: "Updated FLT routes after yard remarking.",
    body: siteRa, contentHash: contentHash(siteRa),
    authoredBy: admin.id, approvedBy: prodMgr.id,
    publishedAt: new Date(`${iso(90)}T09:00:00Z`),
    nextReviewOn: addMonths(iso(90), 12),
  }).returning();

  /* ---------------------------------------------------------------- *
   * Training matrix
   * ---------------------------------------------------------------- */
  type Cell = { user: string; machine: string; status: keyof typeof statusMap; level: Lvl; trainer?: string; days?: number };
  type Lvl = "NONE" | "SUPERVISED" | "INDEPENDENT" | "EXPERT" | "TRAINER";
  const statusMap = {
    NOT_TRAINED: 1, INDUCTION: 1, IN_TRAINING: 1, ASSESSMENT: 1,
    COMPETENT: 1, REQUIRES_REVALIDATION: 1, SUSPENDED: 1,
  } as const;

  const C = (user: string, machine: string, status: Cell["status"], level: Lvl, trainer?: string, days?: number): Cell =>
    ({ user, machine, status, level, trainer, days });

  const cells: Cell[] = [
    // Supervisors and setters - broad, deep coverage
    ...["PB-01","PB-02","PB-03","PB-04","PB-05","PB-06"].map((m) => C("Ian Prosser", m, "COMPETENT", "TRAINER", "Ian Prosser", 1400)),
    ...["PN-01","PN-02"].map((m) => C("Ian Prosser", m, "COMPETENT", "EXPERT", "Ian Prosser", 1400)),
    ...["PB-01","PB-02","PB-03","PB-04"].map((m) => C("Marta Kowalczyk", m, "COMPETENT", "TRAINER", "Ian Prosser", 1100)),
    ...["PN-01","PN-02"].map((m) => C("Marta Kowalczyk", m, "COMPETENT", "TRAINER", "Ian Prosser", 1100)),
    C("Marta Kowalczyk", "LC-01", "COMPETENT", "INDEPENDENT", "Ian Prosser", 600),
    C("Gareth Lloyd", "WB-01", "COMPETENT", "TRAINER", "Gareth Lloyd", 1600),
    C("Gareth Lloyd", "PB-01", "COMPETENT", "INDEPENDENT", "Ian Prosser", 800),

    // Karen - manager, keeps a couple of competences current
    C("Karen Bhatti", "PB-01", "COMPETENT", "INDEPENDENT", "Ian Prosser", 900),
    C("Karen Bhatti", "LC-01", "REQUIRES_REVALIDATION", "INDEPENDENT", "Ian Prosser", 500),

    // Tomasz - experienced press brake operator
    ...["PB-01","PB-02","PB-03","PB-05"].map((m) => C("Tomasz Nowak", m, "COMPETENT", "EXPERT", "Ian Prosser", 1300)),
    C("Tomasz Nowak", "PB-04", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 400),
    C("Tomasz Nowak", "PN-01", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 300),

    // Sadia - solid, expanding
    ...["PB-01","PB-02"].map((m) => C("Sadia Rahman", m, "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 700)),
    C("Sadia Rahman", "PB-03", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 200),
    C("Sadia Rahman", "PB-06", "IN_TRAINING", "SUPERVISED", "Ian Prosser", 6),
    C("Sadia Rahman", "PN-01", "COMPETENT", "INDEPENDENT", "Ian Prosser", 150),

    // Callum - the only fully competent laser operator besides Marta
    C("Callum Reid", "LC-01", "COMPETENT", "EXPERT", "Ian Prosser", 1000),
    C("Callum Reid", "PN-02", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 500),
    C("Callum Reid", "PB-01", "COMPETENT", "INDEPENDENT", "Ian Prosser", 300),

    // Jordan - punch
    C("Jordan Ellis", "PN-01", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 550),
    C("Jordan Ellis", "PN-02", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 480),
    C("Jordan Ellis", "PB-02", "COMPETENT", "INDEPENDENT", "Ian Prosser", 220),
    C("Jordan Ellis", "LC-01", "IN_TRAINING", "SUPERVISED", "Callum Reid", 11),

    // Priya - fabricator, mixed
    C("Priya Shah", "WB-01", "COMPETENT", "INDEPENDENT", "Gareth Lloyd", 350),
    C("Priya Shah", "PB-01", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 260),
    C("Priya Shah", "PB-05", "REQUIRES_REVALIDATION", "INDEPENDENT", "Ian Prosser", 800),

    // Wayne - welder, one suspended competence after an SOP safety revision
    C("Wayne Docherty", "WB-01", "COMPETENT", "EXPERT", "Gareth Lloyd", 1500),
    C("Wayne Docherty", "PB-06", "SUSPENDED", "INDEPENDENT", "Ian Prosser", 900),

    // Elena - newer, coming up
    C("Elena Petrova", "PB-01", "COMPETENT", "INDEPENDENT", "Marta Kowalczyk", 120),
    C("Elena Petrova", "PB-02", "IN_TRAINING", "SUPERVISED", "Marta Kowalczyk", 9),
    C("Elena Petrova", "WB-01", "IN_TRAINING", "SUPERVISED", "Gareth Lloyd", 4),

    // Ryan - trainee, mid-training
    C("Ryan McAllister", "PB-01", "IN_TRAINING", "SUPERVISED", "Marta Kowalczyk", 14),
    C("Ryan McAllister", "PN-01", "ASSESSMENT", "SUPERVISED", "Ian Prosser", 21),

    // Aisha - brand new, still in induction
    C("Aisha Khan", "PB-01", "INDUCTION", "NONE", "Ian Prosser", 2),
  ];

  const competenceIds: Record<string, string> = {};

  for (const c of cells) {
    const u = byName(c.user);
    const m = machine(c.machine);
    const trainer = c.trainer ? byName(c.trainer) : null;
    const days = c.days ?? 30;
    const isCompetent = c.status === "COMPETENT" || c.status === "REQUIRES_REVALIDATION" || c.status === "SUSPENDED";
    const competentFrom = isCompetent ? iso(days) : null;

    const [rec] = await db.insert(schema.competenceRecords).values({
      tenantId, userId: u.id, machineId: m.id,
      status: c.status, level: c.level,
      sopRevisionId: publishedRevisions[c.machine],
      sopContentHash: publishedHashes[c.machine],
      trainerId: trainer?.id ?? null,
      assessedBy: isCompetent ? trainer?.id ?? null : null,
      approvedBy: isCompetent ? prodMgr.id : null,
      trainingStartedOn: iso(days + 14),
      competentFrom,
      // Expiry runs from the most recent revalidation, not from first sign-off,
      // so a long-serving operator is current rather than decades overdue.
      // REQUIRES_REVALIDATION records are genuinely in the past; a couple of
      // others fall due within 60 days so the matrix shows a real warning.
      expiresOn: expiryFor(c, m.revalidationMonths ?? 24),
      lastReviewOn: isCompetent ? iso(Math.min(days, 80)) : null,
      nextReviewDue: isCompetent ? addMonths(iso(Math.min(days, 80)), 3) : null,
      suspensionReason:
        c.status === "SUSPENDED"
          ? "Competence suspended pending re-brief: RA-PB-06 revised with new trapping hazard."
          : null,
    }).returning();

    competenceIds[`${c.user}|${c.machine}`] = rec.id;

    await emit({
      tenantId, streamId: rec.id, streamType: "competence_record",
      eventType: "CompetenceRecordCreated",
      payload: { userId: u.id, machineId: m.id, status: c.status, level: c.level },
      actorId: trainer?.id ?? admin.id,
      occurredAt: new Date(`${iso(days + 14)}T08:00:00Z`),
    });

    if (isCompetent) {
      await emit({
        tenantId, streamId: rec.id, streamType: "competence_record",
        eventType: "CompetenceGranted",
        payload: { level: c.level, sopRevisionId: publishedRevisions[c.machine], approvedBy: prodMgr.id },
        actorId: prodMgr.id,
        occurredAt: new Date(`${competentFrom}T15:30:00Z`),
      });

      // Tri-signature evidence bundle
      const decl = `I confirm that I have been trained on ${m.name} in accordance with SOP-${c.machine} rev 3, and that I am competent to operate it unsupervised.`;
      await db.insert(schema.signatures).values([
        { tenantId, subjectType: "competence_record", subjectId: rec.id, signerId: u.id,
          role: "TRAINEE", declaration: decl, contentHash: publishedHashes[c.machine],
          reauthenticated: true, occurredAt: new Date(`${competentFrom}T15:30:00Z`) },
        { tenantId, subjectType: "competence_record", subjectId: rec.id, signerId: trainer?.id ?? ian.id,
          role: "TRAINER", declaration: `I confirm I have trained and assessed ${u.name} on ${m.name} and consider them competent.`,
          contentHash: publishedHashes[c.machine], reauthenticated: true,
          occurredAt: new Date(`${competentFrom}T15:35:00Z`) },
        { tenantId, subjectType: "competence_record", subjectId: rec.id, signerId: prodMgr.id,
          role: "MANAGER", declaration: `I approve ${u.name} as competent to operate ${m.name} unsupervised.`,
          contentHash: publishedHashes[c.machine], reauthenticated: true,
          occurredAt: new Date(`${competentFrom}T16:00:00Z`) },
      ]);
    }

    if (c.status === "SUSPENDED") {
      await emit({
        tenantId, streamId: rec.id, streamType: "competence_record",
        eventType: "CompetenceSuspended",
        payload: { reason: "Risk assessment RA-PB-06 revised: new trapping hazard identified.", changeClass: "SAFETY_CRITICAL" },
        actorId: prodMgr.id, occurredAt: new Date(`${iso(5)}T11:00:00Z`),
      });
    }
    if (c.status === "REQUIRES_REVALIDATION") {
      await emit({
        tenantId, streamId: rec.id, streamType: "competence_record",
        eventType: "RevalidationRequired",
        payload: { reason: "Competence expired against machine revalidation period." },
        actorId: prodMgr.id, occurredAt: new Date(`${iso(9)}T09:15:00Z`),
      });
    }
  }

  /* ---------------------------------------------------------------- *
   * Live training sessions with daily sign-offs
   * ---------------------------------------------------------------- */
  const liveTraining: { user: string; machine: string; trainer: string; days: number }[] = [
    { user: "Ryan McAllister", machine: "PB-01", trainer: "Marta Kowalczyk", days: 14 },
    { user: "Elena Petrova",   machine: "PB-02", trainer: "Marta Kowalczyk", days: 9 },
    { user: "Sadia Rahman",    machine: "PB-06", trainer: "Ian Prosser",     days: 6 },
    { user: "Jordan Ellis",    machine: "LC-01", trainer: "Callum Reid",     days: 11 },
    { user: "Elena Petrova",   machine: "WB-01", trainer: "Gareth Lloyd",    days: 4 },
  ];

  for (const t of liveTraining) {
    const u = byName(t.user);
    const tr = byName(t.trainer);
    const m = machine(t.machine);
    const compId = competenceIds[`${t.user}|${t.machine}`];

    const [session] = await db.insert(schema.trainingSessions).values({
      tenantId, competenceId: compId, traineeId: u.id, trainerId: tr.id,
      machineId: m.id, sopRevisionId: publishedRevisions[t.machine],
      startedOn: iso(t.days),
    }).returning();

    const totalSteps = sopFor(t.machine).steps.length;
    const entries = Math.min(t.days, 6);
    for (let i = 0; i < entries; i++) {
      const dayOffset = t.days - i * 2;
      if (dayOffset < 0) continue;
      const progress = Math.min(totalSteps, Math.ceil(((i + 1) / entries) * totalSteps));
      await db.insert(schema.dailySignOffs).values({
        tenantId, trainingSessionId: session.id, onDate: iso(dayOffset),
        rating: Math.min(5, 2 + i),
        stepsCovered: Array.from({ length: progress }, (_, n) => n + 1),
        note: i === 0
          ? "Induction to machine and guarding. Observed only."
          : i === entries - 1
            ? "Working well. Consistent first-off checks. Ready for assessment shortly."
            : "Supervised practice. Improving on tool setting.",
        recordedBy: tr.id,
        occurredAt: new Date(`${iso(dayOffset)}T15:45:00Z`),
      });
    }

    await emit({
      tenantId, streamId: compId, streamType: "competence_record",
      eventType: "TrainingStarted",
      payload: { trainerId: tr.id, machineId: m.id, sopRevisionId: publishedRevisions[t.machine] },
      actorId: tr.id, occurredAt: new Date(`${iso(t.days)}T08:00:00Z`),
    });
  }

  /* ---------------------------------------------------------------- *
   * Induction in progress - Aisha, day 12
   * ---------------------------------------------------------------- */
  const aisha = byName("Aisha Khan");
  const [induction] = await db.insert(schema.inductions).values({
    tenantId, userId: aisha.id, trainerId: ian.id,
    startedAt: new Date(`${iso(2)}T08:00:00Z`),
  }).returning();

  const inductionChecklist = [
    { label: "Site tour and welfare facilities", done: true },
    { label: "Emergency procedures, alarms and assembly point", done: true },
    { label: "General site risk assessment briefed (RA-SITE-001)", done: true, rev: siteRaRev.id },
    { label: "PPE issued and fitted", done: true },
    { label: "Manual handling briefing", done: true },
    { label: "Fire marshals and first aiders identified", done: false },
    { label: "Accident and near-miss reporting process", done: false },
    { label: "Introduction to designated trainer", done: false },
  ];

  await db.insert(schema.inductionItems).values(
    inductionChecklist.map((item, i) => ({
      tenantId, inductionId: induction.id, label: item.label,
      documentRevisionId: item.rev ?? null, sortOrder: i + 1,
      completedAt: item.done ? new Date(`${iso(2)}T${String(9 + i).padStart(2, "0")}:00:00Z`) : null,
      completedBy: item.done ? ian.id : null,
    })),
  );

  await emit({
    tenantId, streamId: induction.id, streamType: "induction",
    eventType: "InductionStarted",
    payload: { userId: aisha.id, trainerId: ian.id },
    actorId: ian.id, occurredAt: new Date(`${iso(2)}T08:00:00Z`),
  });

  console.log(`
Seed complete.

  Tenant     Protektor UK
  Machines   ${machines.length}  (6 press brakes, 2 punches, 1 laser, 1 welding bay)
  People     ${users.length}
  Documents  ${machineSpecs.length * 2 + 1}  (SOP + RA per machine, plus site induction RA)
  Matrix     ${cells.length} competence records

  Sign in with any of:
    d.whitfield@protektor.example   (Admin)
    k.bhatti@protektor.example      (Manager)
    i.prosser@protektor.example     (Trainer)
  Password: protektor      Shop-floor PIN: 1234
`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
