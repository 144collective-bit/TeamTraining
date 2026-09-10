import type { Status, Level } from "./competence";

/**
 * The training lifecycle, as described in the Lean Solutions business plan:
 *
 *   NOT_TRAINED → INDUCTION → IN_TRAINING → ASSESSMENT → COMPETENT
 *
 * plus the two states the written plan omits but an audit requires:
 * REQUIRES_REVALIDATION (expiry, or a superseding SOP revision) and
 * SUSPENDED (safety-critical change, incident, withdrawal).
 *
 * Transitions are declared here and enforced in one place, so no command can
 * quietly move a record somewhere it should not go.
 */

export type Transition =
  | "START_INDUCTION"
  | "START_TRAINING"
  | "READY_FOR_ASSESSMENT"
  | "ASSESSMENT_PASSED"
  | "ASSESSMENT_FAILED"
  | "GRANT_COMPETENCE"
  | "REQUIRE_REVALIDATION"
  | "SUSPEND"
  | "REINSTATE";

const TRANSITIONS: Record<Transition, { from: Status[]; to: Status }> = {
  START_INDUCTION:      { from: ["NOT_TRAINED"],                                          to: "INDUCTION" },
  START_TRAINING:       { from: ["NOT_TRAINED", "INDUCTION", "REQUIRES_REVALIDATION", "SUSPENDED"], to: "IN_TRAINING" },
  READY_FOR_ASSESSMENT: { from: ["IN_TRAINING"],                                          to: "ASSESSMENT" },
  ASSESSMENT_PASSED:    { from: ["ASSESSMENT"],                                           to: "ASSESSMENT" },
  ASSESSMENT_FAILED:    { from: ["ASSESSMENT"],                                           to: "IN_TRAINING" },
  GRANT_COMPETENCE:     { from: ["ASSESSMENT"],                                           to: "COMPETENT" },
  REQUIRE_REVALIDATION: { from: ["COMPETENT"],                                            to: "REQUIRES_REVALIDATION" },
  SUSPEND:              { from: ["COMPETENT", "IN_TRAINING", "ASSESSMENT", "REQUIRES_REVALIDATION"], to: "SUSPENDED" },
  REINSTATE:            { from: ["SUSPENDED"],                                            to: "COMPETENT" },
};

export function canTransition(from: Status, transition: Transition): boolean {
  return TRANSITIONS[transition].from.includes(from);
}

export function nextStatus(from: Status, transition: Transition): Status {
  if (!canTransition(from, transition)) {
    throw new TransitionError(
      `Cannot ${humanise(transition)} from ${from}.`,
    );
  }
  return TRANSITIONS[transition].to;
}

/** What a manager can do to this record right now. */
export function availableTransitions(status: Status): Transition[] {
  return (Object.keys(TRANSITIONS) as Transition[]).filter((t) =>
    canTransition(status, t),
  );
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

function humanise(t: Transition) {
  return t.toLowerCase().replace(/_/g, " ");
}

/* ------------------------------------------------------------------ *
 * Signature requirements
 * ------------------------------------------------------------------ */

export const REQUIRED_SIGNATURES = ["TRAINEE", "TRAINER", "MANAGER"] as const;
export type SignatureRole = (typeof REQUIRED_SIGNATURES)[number];

/**
 * Competence is granted only when all three signatures are present.
 * The business plan is explicit about this and it is what an auditor checks.
 */
export function missingSignatures(present: string[]): SignatureRole[] {
  return REQUIRED_SIGNATURES.filter((r) => !present.includes(r));
}

/** The exact wording a signer agrees to. Stored with the signature verbatim. */
export function declarationFor(
  role: SignatureRole,
  ctx: { trainee: string; machine: string; sopRef: string; revision: number },
): string {
  switch (role) {
    case "TRAINEE":
      return `I confirm that I have been trained on ${ctx.machine} in accordance with ${ctx.sopRef} rev ${ctx.revision}, and that I am competent to operate it unsupervised.`;
    case "TRAINER":
      return `I confirm I have trained and assessed ${ctx.trainee} on ${ctx.machine} against ${ctx.sopRef} rev ${ctx.revision} and consider them competent.`;
    case "MANAGER":
      return `I approve ${ctx.trainee} as competent to operate ${ctx.machine} unsupervised.`;
  }
}

/* ------------------------------------------------------------------ *
 * Who may do what
 * ------------------------------------------------------------------ */

export type Role = "ADMIN" | "MANAGER" | "TRAINER" | "OPERATOR";

const RANK: Record<Role, number> = { OPERATOR: 0, TRAINER: 1, MANAGER: 2, ADMIN: 3 };

export function atLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
