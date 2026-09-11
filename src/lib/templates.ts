import type { DocumentKind } from "./documents";
import type { SopBody, RaBody, TrainingBody, InductionBody } from "./documents";

/**
 * Starter templates.
 *
 * A blank page is the reason procedures never get written. These give a team
 * leader a structure to edit rather than something to invent — generic enough
 * for any workshop, specific enough to be worth keeping. They ship with the
 * app rather than living in the database, so every organisation gets them and
 * improvements reach everyone.
 *
 * Nothing here is authoritative. Every field is meant to be replaced.
 */

export type Template = {
  id: string;
  kind: DocumentKind;
  name: string;
  summary: string;
  /** Roughly how much is pre-filled, so the chooser can say. */
  detail: string;
  body: SopBody | RaBody | TrainingBody | InductionBody;
};

const GENERIC_SOP: SopBody = {
  purpose: "Safe setting and operation of [machine] for [what it makes].",
  ppe: ["Safety footwear", "Eye protection"],
  hazards: ["Crushing", "Sharp edges", "Noise"],
  safetyCheck: "Guarding in place and tested, e-stops proven, area clear before starting.",
  carePoint: "Isolate before entering the danger zone. Every time, no exceptions.",
  steps: [
    {
      instruction: "Pre-start checks.",
      keyPoints: ["Guarding intact and secure", "E-stops function", "No damage or leaks", "Work area clean and clear"],
      reasons: ["Guarding is the only thing between the operator and the moving parts"],
      imageId: null, imageCaption: null,
    },
    {
      instruction: "Set up for the job.",
      keyPoints: ["Check the job card against the drawing issue", "Confirm material grade and thickness", "Isolate before changing tooling"],
      reasons: ["Working to a superseded drawing scraps the whole batch"],
      imageId: null, imageCaption: null,
    },
    {
      instruction: "Produce and check the first-off.",
      keyPoints: ["Make one part", "Check against the drawing", "Get the first-off signed before continuing"],
      reasons: ["Catching a setting error at part one rather than part two hundred"],
      imageId: null, imageCaption: null,
    },
    {
      instruction: "Run the batch.",
      keyPoints: ["Keep hands clear of moving parts", "Check at a set interval", "Stack parts to avoid damage"],
      reasons: ["Settings drift as the machine warms and tooling wears"],
      imageId: null, imageCaption: null,
    },
    {
      instruction: "Shut down and hand over.",
      keyPoints: ["Return to a safe state", "Isolate", "Clean down", "Log output and any downtime"],
      reasons: ["The next shift inherits the machine in a known state"],
      imageId: null, imageCaption: null,
    },
  ],
};

const BLANK_SOP: SopBody = {
  purpose: "",
  ppe: [], hazards: [], safetyCheck: "", carePoint: "",
  steps: [{ instruction: "", keyPoints: [], reasons: [], imageId: null, imageCaption: null }],
};

const GENERIC_RA: RaBody = {
  scope: "Routine operation of [machine], including setting, running and cleaning down.",
  assessedBy: "",
  hazards: [
    {
      hazard: "Contact with moving parts",
      whoAtRisk: "Operators, trainees, passing staff",
      existingControls: ["Fixed and interlocked guarding", "Trained and signed-off operators only", "Isolation before any intervention"],
      likelihood: 2, severity: 5,
      furtherAction: "Guarding check added to the daily start-up sheet.",
      residualLikelihood: 1, residualSeverity: 5,
    },
    {
      hazard: "Manual handling",
      whoAtRisk: "Operators",
      existingControls: ["Lifting aids provided", "Two-person lift policy above [weight]", "Manual handling training"],
      likelihood: 3, severity: 3,
      furtherAction: "Review at quarterly competence review.",
      residualLikelihood: 2, residualSeverity: 3,
    },
    {
      hazard: "Noise",
      whoAtRisk: "Anyone in the area",
      existingControls: ["Hearing protection zone signed", "PPE issued", "Health surveillance"],
      likelihood: 4, severity: 2,
      furtherAction: "Annual audiometry.",
      residualLikelihood: 2, residualSeverity: 2,
    },
  ],
};

const BLANK_RA: RaBody = {
  scope: "", assessedBy: "",
  hazards: [{
    hazard: "", whoAtRisk: "", existingControls: [],
    likelihood: 3, severity: 3, furtherAction: "",
    residualLikelihood: null, residualSeverity: null,
  }],
};

const PROCESS_TRAINING: TrainingBody = {
  process: "[Process name]",
  sopReference: "",
  equipment: { type: "", manufacturer: "", model: "", location: "", targetAverage: "" },
  notes: "",
  areas: [
    { label: "Machine induction, guarding and emergency stops", reference: "" },
    { label: "Risk assessment briefed and understood", reference: "" },
    { label: "Pre-start checks", reference: "" },
    { label: "Setting up for a job", reference: "" },
    { label: "Tooling change and isolation", reference: "" },
    { label: "First-off checks and sign-off", reference: "" },
    { label: "Running a batch", reference: "" },
    { label: "In-process quality checks", reference: "" },
    { label: "Dealing with a stoppage", reference: "" },
    { label: "Completing paperwork", reference: "" },
    { label: "Clean down and shift handover", reference: "" },
    { label: "Question and answer sheet", reference: "" },
  ],
};

const BLANK_TRAINING: TrainingBody = {
  process: "", sopReference: "", notes: "",
  equipment: { type: "", manufacturer: "", model: "", location: "", targetAverage: "" },
  areas: [{ label: "", reference: "" }],
};

const SITE_INDUCTION: InductionBody = {
  scope: "General site induction, completed before a new starter enters the shop floor.",
  items: [
    { label: "Site tour and welfare facilities", reference: "" },
    { label: "Emergency procedures, alarms and assembly point", reference: "" },
    { label: "General site risk assessment briefed", reference: "" },
    { label: "PPE issued and fitted", reference: "" },
    { label: "Manual handling briefing", reference: "" },
    { label: "Traffic routes and FLT segregation", reference: "" },
    { label: "Fire marshals and first aiders identified", reference: "" },
    { label: "Accident and near-miss reporting process", reference: "" },
    { label: "Introduction to designated trainer", reference: "" },
    { label: "Hours, breaks and absence reporting", reference: "" },
  ],
};

const BLANK_INDUCTION: InductionBody = { scope: "", items: [{ label: "", reference: "" }] };

export const TEMPLATES: Template[] = [
  {
    id: "sop-machine",
    kind: "SOP",
    name: "Machine operating procedure",
    summary: "Five-step structure covering pre-start, set-up, first-off, running and hand-over.",
    detail: "5 steps with key points and reasons, PPE and hazards started, safety check and care point written.",
    body: GENERIC_SOP,
  },
  {
    id: "sop-blank",
    kind: "SOP",
    name: "Blank procedure",
    summary: "One empty step. Start from nothing.",
    detail: "Nothing pre-filled.",
    body: BLANK_SOP,
  },
  {
    id: "ra-machine",
    kind: "RISK_ASSESSMENT",
    name: "Machine risk assessment",
    summary: "The three hazards nearly every machine assessment starts with, scored and controlled.",
    detail: "3 hazards with controls, likelihood and severity scored, residual risk set.",
    body: GENERIC_RA,
  },
  {
    id: "ra-blank",
    kind: "RISK_ASSESSMENT",
    name: "Blank risk assessment",
    summary: "One empty hazard row.",
    detail: "Nothing pre-filled.",
    body: BLANK_RA,
  },
  {
    id: "training-process",
    kind: "TRAINING_DOC",
    name: "Process training sign-off",
    summary: "Twelve training areas covering a machine from induction to hand-over, ready to edit.",
    detail: "12 numbered areas, equipment block ready to complete.",
    body: PROCESS_TRAINING,
  },
  {
    id: "training-blank",
    kind: "TRAINING_DOC",
    name: "Blank training sign-off",
    summary: "One empty area. Build the list yourself.",
    detail: "Nothing pre-filled.",
    body: BLANK_TRAINING,
  },
  {
    id: "induction-site",
    kind: "INDUCTION",
    name: "Site induction checklist",
    summary: "Ten items covering the first morning: emergency procedures, PPE, traffic, reporting.",
    detail: "10 checklist items.",
    body: SITE_INDUCTION,
  },
  {
    id: "induction-blank",
    kind: "INDUCTION",
    name: "Blank induction checklist",
    summary: "One empty item.",
    detail: "Nothing pre-filled.",
    body: BLANK_INDUCTION,
  },
];

export function templatesFor(kind: DocumentKind): Template[] {
  return TEMPLATES.filter((t) => t.kind === kind);
}

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
