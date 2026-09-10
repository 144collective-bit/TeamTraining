import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Standard operating procedure
 * ------------------------------------------------------------------ */

export const sopStepSchema = z.object({
  /** What the operator does. One instruction per step. */
  instruction: z.string().trim().min(1, "Every step needs an instruction."),
  /** TWI key points: the things that make or break the step. */
  keyPoints: z.array(z.string().trim().min(1)).default([]),
  /** Why those key points matter - what goes wrong without them. */
  reasons: z.array(z.string().trim().min(1)).default([]),
  imageId: z.string().uuid().nullable().default(null),
  imageCaption: z.string().trim().max(200).nullable().default(null),
});

export const sopBodySchema = z.object({
  purpose: z.string().trim().min(1, "Give the procedure a purpose."),
  ppe: z.array(z.string().trim().min(1)).default([]),
  hazards: z.array(z.string().trim().min(1)).default([]),
  /** The green strip on a printed SOP: the check before starting. */
  safetyCheck: z.string().trim().max(300).default(""),
  /** The red strip: the one thing most often got wrong. */
  carePoint: z.string().trim().max(300).default(""),
  steps: z.array(sopStepSchema).min(1, "A procedure needs at least one step."),
});

export type SopBody = z.infer<typeof sopBodySchema>;
export type SopStep = z.infer<typeof sopStepSchema>;

export const EMPTY_SOP: SopBody = {
  purpose: "",
  ppe: [],
  hazards: [],
  safetyCheck: "",
  carePoint: "",
  steps: [{ instruction: "", keyPoints: [], reasons: [], imageId: null, imageCaption: null }],
};

/* ------------------------------------------------------------------ *
 * Risk assessment
 * ------------------------------------------------------------------ */

const score = z.coerce.number().int().min(1).max(5);

export const raHazardSchema = z.object({
  hazard: z.string().trim().min(1, "Name the hazard."),
  whoAtRisk: z.string().trim().default(""),
  existingControls: z.array(z.string().trim().min(1)).default([]),
  likelihood: score.default(3),
  severity: score.default(3),
  furtherAction: z.string().trim().default(""),
  /** Risk remaining once the further action is in place. */
  residualLikelihood: score.nullable().default(null),
  residualSeverity: score.nullable().default(null),
});

export const raBodySchema = z.object({
  scope: z.string().trim().min(1, "Describe what this assessment covers."),
  assessedBy: z.string().trim().default(""),
  hazards: z.array(raHazardSchema).min(1, "A risk assessment needs at least one hazard."),
});

export type RaBody = z.infer<typeof raBodySchema>;
export type RaHazard = z.infer<typeof raHazardSchema>;

export const EMPTY_RA: RaBody = {
  scope: "",
  assessedBy: "",
  hazards: [{
    hazard: "", whoAtRisk: "", existingControls: [],
    likelihood: 3, severity: 3, furtherAction: "",
    residualLikelihood: null, residualSeverity: null,
  }],
};

/* ------------------------------------------------------------------ *
 * Risk scoring - the standard 5x5 matrix
 * ------------------------------------------------------------------ */

export const LIKELIHOOD_LABELS = [
  "", "Very unlikely", "Unlikely", "Possible", "Likely", "Almost certain",
] as const;

export const SEVERITY_LABELS = [
  "", "Negligible", "Minor injury", "Injury — 7+ days", "Major injury", "Fatality",
] as const;

export type RiskBand = {
  label: string;
  /** CSS custom-property names, so bands follow the theme. */
  bg: string;
  fg: string;
  border: string;
};

export function riskScore(likelihood: number, severity: number): number {
  return likelihood * severity;
}

export function riskBand(scoreValue: number): RiskBand {
  if (scoreValue <= 4)  return { label: "Low",       bg: "var(--st-competent-bg)",  fg: "var(--st-competent-fg)",  border: "var(--st-competent-br)" };
  if (scoreValue <= 9)  return { label: "Medium",    bg: "var(--st-training-bg)",   fg: "var(--st-training-fg)",   border: "var(--st-training-br)" };
  if (scoreValue <= 14) return { label: "High",      bg: "var(--st-revalidate-bg)", fg: "var(--st-revalidate-fg)", border: "var(--st-revalidate-br)" };
  return                       { label: "Very high", bg: "var(--st-suspended-bg)",  fg: "var(--st-suspended-fg)",  border: "var(--st-suspended-br)" };
}

/* ------------------------------------------------------------------ *
 * Attachments
 * ------------------------------------------------------------------ */

/**
 * Raster formats only. SVG is deliberately excluded: it can carry script, and
 * these files are served back to other users.
 */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Every image referenced by a set of steps, in order, de-duplicated. */
export function stepImageIds(steps: { imageId?: string | null }[]): string[] {
  return [...new Set(steps.map((s) => s.imageId).filter((id): id is string => Boolean(id)))];
}

/* ------------------------------------------------------------------ *
 * Parsing stored bodies
 * ------------------------------------------------------------------ */

/**
 * Published revisions may predate a schema change, so reading is forgiving
 * where writing is strict: a body that no longer parses still renders what it
 * can rather than blanking a controlled document.
 */
export function readSop(body: unknown): SopBody {
  const parsed = sopBodySchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const raw = (body ?? {}) as Record<string, unknown>;
  return {
    purpose: typeof raw.purpose === "string" ? raw.purpose : "",
    ppe: Array.isArray(raw.ppe) ? (raw.ppe as string[]) : [],
    hazards: Array.isArray(raw.hazards) ? (raw.hazards as string[]).filter((h) => typeof h === "string") : [],
    safetyCheck: typeof raw.safetyCheck === "string" ? raw.safetyCheck : "",
    carePoint: typeof raw.carePoint === "string" ? raw.carePoint : "",
    steps: Array.isArray(raw.steps)
      ? (raw.steps as Record<string, unknown>[]).map((s) => ({
          instruction: String(s.instruction ?? s.step ?? ""),
          keyPoints: Array.isArray(s.keyPoints) ? (s.keyPoints as string[]) : [],
          reasons: Array.isArray(s.reasons) ? (s.reasons as string[]) : [],
          imageId: typeof s.imageId === "string" ? s.imageId : null,
          imageCaption: typeof s.imageCaption === "string" ? s.imageCaption : null,
        }))
      : [],
  };
}

export function readRa(body: unknown): RaBody {
  const parsed = raBodySchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const raw = (body ?? {}) as Record<string, unknown>;
  return {
    scope: typeof raw.scope === "string" ? raw.scope : "",
    assessedBy: typeof raw.assessedBy === "string" ? raw.assessedBy : "",
    hazards: Array.isArray(raw.hazards)
      ? (raw.hazards as Record<string, unknown>[])
          .filter((h) => h && typeof h === "object")
          .map((h) => ({
            hazard: String(h.hazard ?? ""),
            whoAtRisk: String(h.whoAtRisk ?? ""),
            existingControls: Array.isArray(h.existingControls) ? (h.existingControls as string[]) : [],
            likelihood: Number(h.likelihood) || 3,
            severity: Number(h.severity) || 3,
            furtherAction: String(h.furtherAction ?? ""),
            residualLikelihood: h.residualLikelihood ? Number(h.residualLikelihood) : null,
            residualSeverity: h.residualSeverity ? Number(h.residualSeverity) : null,
          }))
      : [],
  };
}
