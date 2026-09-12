export type Status =
  | "NOT_TRAINED" | "INDUCTION" | "IN_TRAINING" | "ASSESSMENT"
  | "COMPETENT" | "REQUIRES_REVALIDATION" | "SUSPENDED";

export type Level = "NONE" | "SUPERVISED" | "INDEPENDENT" | "EXPERT" | "TRAINER";

/**
 * Every status carries a glyph as well as a colour. The matrix must be
 * readable in greyscale, on a printout, and by someone with a colour vision
 * deficiency - it is evidence, not decoration.
 */
export const STATUS_META: Record<Status, { label: string; glyph: string; short: string; description: string }> = {
  COMPETENT:             { label: "Competent",   glyph: "✓", short: "Competent",   description: "Signed off, works unsupervised" },
  IN_TRAINING:           { label: "In training", glyph: "◐", short: "Training",    description: "Training under way with a designated trainer" },
  ASSESSMENT:            { label: "Assessment",  glyph: "◑", short: "Assessment",  description: "Training complete, awaiting practical assessment" },
  INDUCTION:             { label: "Induction",   glyph: "◔", short: "Induction",   description: "Site or machine induction in progress" },
  REQUIRES_REVALIDATION: { label: "Revalidate",  glyph: "↻", short: "Revalidate",  description: "Expired or superseded - re-training required" },
  SUSPENDED:             { label: "Suspended",   glyph: "✕", short: "Suspended",   description: "Not authorised to operate pending action" },
  NOT_TRAINED:           { label: "Not trained", glyph: "·", short: "Gap",         description: "No training recorded" },
};

export const LEVEL_META: Record<Level, { label: string; abbr: string; rank: number }> = {
  NONE:        { label: "None",                 abbr: "",   rank: 0 },
  SUPERVISED:  { label: "Supervised",           abbr: "L1", rank: 1 },
  INDEPENDENT: { label: "Independent",          abbr: "L2", rank: 2 },
  EXPERT:      { label: "Expert",               abbr: "L3", rank: 3 },
  TRAINER:     { label: "Can train others",     abbr: "L4", rank: 4 },
};

/** Statuses that need a manager to do something. */
export function needsAction(status: Status) {
  return status === "REQUIRES_REVALIDATION" || status === "SUSPENDED";
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const then = new Date(`${date}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.floor((then - now) / 86400_000);
}

/**
 * Postgres hands back two shapes and they parse differently: a `date` column
 * arrives as "2027-05-15", which must be read as UTC or it shifts a day west of
 * Greenwich, while a `timestamptz` arrives already carrying its offset —
 * "2026-05-15 09:00:00+00" — and appending a time to that produces nonsense.
 *
 * Anything unparseable reads as "—". A record with a broken date should look
 * like a record with no date, never like "Invalid Date" on a printed procedure.
 */
export function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  const d =
    typeof date === "string"
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date)
      : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export const DOC_KIND_META: Record<string, { label: string; abbr: string; blurb: string }> = {
  SOP: {
    label: "Standard Operating Procedure", abbr: "SOP",
    blurb: "Numbered steps with photographs — the method a trainer teaches from.",
  },
  RISK_ASSESSMENT: {
    label: "Risk Assessment", abbr: "RA",
    blurb: "Hazards, controls and a 5×5 risk score.",
  },
  TRAINING_DOC: {
    label: "Process Training Sign-Off", abbr: "PT",
    blurb: "The numbered areas a trainee is signed off on, one at a time.",
  },
  INDUCTION: {
    label: "Induction Checklist", abbr: "IND",
    blurb: "What a new starter is walked through before they reach the floor.",
  },
  COSHH:  { label: "COSHH Assessment", abbr: "COSHH", blurb: "Hazardous substances." },
  OTHER:  { label: "Other",            abbr: "DOC",   blurb: "" },
};

export const CHANGE_CLASS_META: Record<string, { label: string; effect: string }> = {
  EDITORIAL:       { label: "Editorial",       effect: "No action for trained staff" },
  MINOR:           { label: "Minor",           effect: "Acknowledgement required" },
  MAJOR:           { label: "Major",           effect: "Re-training required" },
  SAFETY_CRITICAL: { label: "Safety critical", effect: "Competence suspended immediately" },
};
