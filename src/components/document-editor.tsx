"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveDraft, publishRevision, discardDraft } from "@/lib/document-commands";
import type { ActionState } from "@/lib/commands";
import { Banner } from "./banner";
import { TagInput, ListInput, ImagePicker, Field } from "./editor-bits";
import { SopDocument } from "./sop-document";
import { RaDocument } from "./ra-document";
import {
  type SopBody, type RaBody, type SopStep, type RaHazard,
  LIKELIHOOD_LABELS, SEVERITY_LABELS, riskScore, riskBand,
} from "@/lib/documents";
import { CHANGE_CLASS_META } from "@/lib/competence";
import { routes } from "@/lib/routes";

const PPE_SUGGESTIONS = [
  "Safety footwear", "Eye protection", "Hearing protection", "Cut-resistant gloves",
  "Hi-vis", "Welding helmet", "Flame-retardant overalls", "Respiratory protection",
];
const HAZARD_SUGGESTIONS = [
  "Crushing", "Trapping", "Sharp edges", "Noise", "Manual handling",
  "Hot surfaces", "Fume", "Fire", "Electric shock", "Laser radiation",
];

type Meta = {
  documentId: string;
  revisionId: string;
  reference: string;
  revision: number;
  kind: "SOP" | "RISK_ASSESSMENT";
  machineCode: string | null;
  isFirstIssue: boolean;
};

export function DocumentEditor({
  meta,
  initialTitle,
  initialBody,
  initialSummary,
}: {
  meta: Meta;
  initialTitle: string;
  initialBody: SopBody | RaBody;
  initialSummary: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [summary, setSummary] = useState(initialSummary);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(saveDraft, {});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    if (saveState.ok) {
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      router.refresh();
    }
  }, [saveState.ok, router]);

  // A half-written procedure is worse than none, so warn before losing it.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update<T extends SopBody | RaBody>(next: T) {
    setBody(next);
    setDirty(true);
  }

  const docMeta = {
    title,
    reference: meta.reference,
    revision: meta.revision,
    issuedOn: null,
    machineCode: meta.machineCode,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
          {[["Edit", false], ["Preview", true]].map(([label, value]) => (
            <button
              key={String(label)}
              type="button"
              onClick={() => setPreview(value as boolean)}
              aria-pressed={preview === value}
              className="rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors"
              style={preview === value ? { background: "var(--accent)", color: "#fff" } : { color: "var(--ink-soft)" }}
            >
              {label}
            </button>
          ))}
        </div>

        {dirty && (
          <span className="text-[12.5px] font-medium" style={{ color: "var(--st-revalidate-fg)" }}>
            Unsaved changes
          </span>
        )}

        <form action={saveAction} className="ml-auto flex items-center gap-2">
          <input type="hidden" name="revisionId" value={meta.revisionId} />
          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="changeSummary" value={summary} />
          <input type="hidden" name="body" value={JSON.stringify(body)} />
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Saving…" : "Save draft"}
          </button>
        </form>
      </div>

      {saveState.error && <Banner tone="bad">{saveState.error}</Banner>}
      {saveState.ok && !dirty && savedAt && <Banner tone="good">Draft saved at {savedAt}.</Banner>}

      {preview ? (
        meta.kind === "SOP"
          ? <SopDocument body={body as SopBody} meta={docMeta} draft />
          : <RaDocument body={body as RaBody} meta={docMeta} draft />
      ) : (
        <div className="space-y-5">
          <section className="card card-pad space-y-4">
            <Field label="Title" htmlFor="doc-title">
              <input
                id="doc-title" value={title}
                onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
                className="input" placeholder="Press Brake 1 — Standard Operating Procedure"
              />
            </Field>
          </section>

          {meta.kind === "SOP"
            ? <SopFields body={body as SopBody} onChange={update} />
            : <RaFields body={body as RaBody} onChange={update} />}
        </div>
      )}

      <PublishPanel
        meta={meta}
        summary={summary}
        onSummaryChange={(v) => { setSummary(v); setDirty(true); }}
        title={title}
        body={body}
        onPublished={() => setDirty(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * SOP fields
 * ------------------------------------------------------------------ */

function SopFields({ body, onChange }: { body: SopBody; onChange: (b: SopBody) => void }) {
  function setStep(i: number, patch: Partial<SopStep>) {
    const steps = [...body.steps];
    steps[i] = { ...steps[i], ...patch };
    onChange({ ...body, steps });
  }
  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= body.steps.length) return;
    const steps = [...body.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    onChange({ ...body, steps });
  }

  return (
    <>
      <section className="card card-pad space-y-4">
        <Field label="Purpose" htmlFor="purpose" hint="One or two sentences: what this procedure is for.">
          <textarea
            id="purpose" value={body.purpose}
            onChange={(e) => onChange({ ...body, purpose: e.target.value })}
            rows={2} className="input !h-auto py-2"
            placeholder="Safe setting and operation of…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <TagInput
            label="PPE required" values={body.ppe}
            onChange={(ppe) => onChange({ ...body, ppe })}
            placeholder="Add PPE…" suggestions={PPE_SUGGESTIONS}
          />
          <TagInput
            label="Hazards" values={body.hazards}
            onChange={(hazards) => onChange({ ...body, hazards })}
            placeholder="Add hazard…" suggestions={HAZARD_SUGGESTIONS} tone="hazard"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Steps <span className="ml-1.5 tabular text-[var(--ink-faint)]">{body.steps.length}</span>
          </h2>
          <p className="text-[12px] text-[var(--ink-faint)]">
            One instruction per step, with a photo of what the operator should see.
          </p>
        </div>

        {body.steps.map((step, i) => (
          <div key={i} className="card card-pad">
            <div className="mb-3 flex items-center gap-2">
              <span className="doc-step-no">Step {i + 1}</span>
              <div className="ml-auto flex gap-1">
                <button type="button" className="btn !h-7 !px-2 text-[12px]"
                        onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>↑</button>
                <button type="button" className="btn !h-7 !px-2 text-[12px]"
                        onClick={() => move(i, 1)} disabled={i === body.steps.length - 1} aria-label={`Move step ${i + 1} down`}>↓</button>
                <button
                  type="button" className="btn !h-7 !px-2 text-[12px]"
                  style={{ color: "var(--st-suspended-fg)" }}
                  onClick={() => onChange({ ...body, steps: body.steps.filter((_, n) => n !== i) })}
                  disabled={body.steps.length === 1}
                  aria-label={`Delete step ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
              <div className="space-y-3.5 min-w-0">
                <Field label="Instruction" htmlFor={`step-${i}`}>
                  <textarea
                    id={`step-${i}`} value={step.instruction}
                    onChange={(e) => setStep(i, { instruction: e.target.value })}
                    rows={2} className="input !h-auto py-2"
                    placeholder="What the operator does at this step…"
                  />
                </Field>
                <ListInput
                  label="Key points" values={step.keyPoints}
                  onChange={(keyPoints) => setStep(i, { keyPoints })}
                  placeholder="The thing that makes or breaks this step"
                  hint="What must go right — the detail an experienced operator would insist on."
                />
                <ListInput
                  label="Reasons" values={step.reasons}
                  onChange={(reasons) => setStep(i, { reasons })}
                  placeholder="What goes wrong without it"
                  hint="Why the key point matters. People follow procedures they understand."
                />
              </div>

              <ImagePicker
                imageId={step.imageId}
                caption={step.imageCaption}
                stepNumber={i + 1}
                onChange={(patch) => setStep(i, patch)}
              />
            </div>
          </div>
        ))}

        <button
          type="button" className="btn w-full"
          onClick={() => onChange({
            ...body,
            steps: [...body.steps, { instruction: "", keyPoints: [], reasons: [], imageId: null, imageCaption: null }],
          })}
        >
          Add step
        </button>
      </section>

      <section className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Safety check" htmlFor="safety" hint="The check that must happen before starting.">
          <textarea
            id="safety" value={body.safetyCheck}
            onChange={(e) => onChange({ ...body, safetyCheck: e.target.value })}
            rows={2} className="input !h-auto py-2"
            placeholder="Guarding in place, e-stops tested, area clear."
          />
        </Field>
        <Field label="Care point" htmlFor="care" hint="The one thing most often got wrong.">
          <textarea
            id="care" value={body.carePoint}
            onChange={(e) => onChange({ ...body, carePoint: e.target.value })}
            rows={2} className="input !h-auto py-2"
            placeholder="Never reach into the tool area without isolating first."
          />
        </Field>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Risk assessment fields
 * ------------------------------------------------------------------ */

function RaFields({ body, onChange }: { body: RaBody; onChange: (b: RaBody) => void }) {
  function setHazard(i: number, patch: Partial<RaHazard>) {
    const hazards = [...body.hazards];
    hazards[i] = { ...hazards[i], ...patch };
    onChange({ ...body, hazards });
  }

  return (
    <>
      <section className="card card-pad grid gap-4 sm:grid-cols-2">
        <Field label="Scope" htmlFor="scope" hint="What activity this assessment covers.">
          <textarea
            id="scope" value={body.scope}
            onChange={(e) => onChange({ ...body, scope: e.target.value })}
            rows={2} className="input !h-auto py-2"
            placeholder="Routine operation of…, including setting, running and cleaning down."
          />
        </Field>
        <Field label="Assessed by" htmlFor="assessedBy">
          <input
            id="assessedBy" value={body.assessedBy}
            onChange={(e) => onChange({ ...body, assessedBy: e.target.value })}
            className="input" placeholder="Name of the competent person"
          />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Hazards <span className="ml-1.5 tabular text-[var(--ink-faint)]">{body.hazards.length}</span>
          </h2>
          <p className="text-[12px] text-[var(--ink-faint)]">Likelihood × severity, each 1 to 5.</p>
        </div>

        {body.hazards.map((h, i) => {
          const initial = riskScore(h.likelihood, h.severity);
          const band = riskBand(initial);
          const residual = h.residualLikelihood && h.residualSeverity
            ? riskScore(h.residualLikelihood, h.residualSeverity) : null;

          return (
            <div key={i} className="card card-pad space-y-3.5">
              <div className="flex items-center gap-2">
                <span
                  className="ra-score"
                  style={{ background: band.bg, color: band.fg, borderColor: band.border }}
                >
                  <span className="tabular">{h.likelihood}×{h.severity}={initial}</span>
                  <span>{band.label}</span>
                </span>
                <button
                  type="button" className="btn !h-7 !px-2 ml-auto text-[12px]"
                  style={{ color: "var(--st-suspended-fg)" }}
                  onClick={() => onChange({ ...body, hazards: body.hazards.filter((_, n) => n !== i) })}
                  disabled={body.hazards.length === 1}
                  aria-label={`Delete hazard ${i + 1}`}
                >
                  ✕
                </button>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Hazard" htmlFor={`hz-${i}`}>
                  <input
                    id={`hz-${i}`} value={h.hazard}
                    onChange={(e) => setHazard(i, { hazard: e.target.value })}
                    className="input" placeholder="Crushing between tools"
                  />
                </Field>
                <Field label="Who is at risk" htmlFor={`who-${i}`}>
                  <input
                    id={`who-${i}`} value={h.whoAtRisk}
                    onChange={(e) => setHazard(i, { whoAtRisk: e.target.value })}
                    className="input" placeholder="Operators, trainees, passing staff"
                  />
                </Field>
              </div>

              <ListInput
                label="Existing controls" values={h.existingControls}
                onChange={(existingControls) => setHazard(i, { existingControls })}
                placeholder="What already reduces this risk"
              />

              <div className="grid gap-3.5 sm:grid-cols-2">
                <ScoreSelect
                  label="Likelihood" id={`lk-${i}`} value={h.likelihood}
                  labels={LIKELIHOOD_LABELS}
                  onChange={(likelihood) => setHazard(i, { likelihood })}
                />
                <ScoreSelect
                  label="Severity" id={`sv-${i}`} value={h.severity}
                  labels={SEVERITY_LABELS}
                  onChange={(severity) => setHazard(i, { severity })}
                />
              </div>

              <Field label="Further action" htmlFor={`fa-${i}`} hint="Required if the score is high or above.">
                <input
                  id={`fa-${i}`} value={h.furtherAction}
                  onChange={(e) => setHazard(i, { furtherAction: e.target.value })}
                  className="input" placeholder="What else will be done, and by when"
                />
              </Field>

              <div className="grid gap-3.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <ScoreSelect
                  label="Residual likelihood" id={`rlk-${i}`} value={h.residualLikelihood ?? 0}
                  labels={LIKELIHOOD_LABELS} allowEmpty
                  onChange={(v) => setHazard(i, { residualLikelihood: v || null })}
                />
                <ScoreSelect
                  label="Residual severity" id={`rsv-${i}`} value={h.residualSeverity ?? 0}
                  labels={SEVERITY_LABELS} allowEmpty
                  onChange={(v) => setHazard(i, { residualSeverity: v || null })}
                />
                {residual !== null && (
                  <span
                    className="ra-score mb-1"
                    style={{
                      background: riskBand(residual).bg,
                      color: riskBand(residual).fg,
                      borderColor: riskBand(residual).border,
                    }}
                  >
                    <span className="tabular">={residual}</span>
                    <span>{riskBand(residual).label}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button" className="btn w-full"
          onClick={() => onChange({
            ...body,
            hazards: [...body.hazards, {
              hazard: "", whoAtRisk: "", existingControls: [],
              likelihood: 3, severity: 3, furtherAction: "",
              residualLikelihood: null, residualSeverity: null,
            }],
          })}
        >
          Add hazard
        </button>
      </section>
    </>
  );
}

function ScoreSelect({
  label, id, value, labels, onChange, allowEmpty,
}: {
  label: string; id: string; value: number;
  labels: readonly string[];
  onChange: (v: number) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id} className="input" value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {allowEmpty && <option value={0}>Not assessed</option>}
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>{n} — {labels[n]}</option>
        ))}
      </select>
    </Field>
  );
}

/* ------------------------------------------------------------------ *
 * Publish
 * ------------------------------------------------------------------ */

function PublishPanel({
  meta, summary, onSummaryChange, title, body, onPublished,
}: {
  meta: Meta;
  summary: string;
  onSummaryChange: (v: string) => void;
  title: string;
  body: SopBody | RaBody;
  onPublished: () => void;
}) {
  const [changeClass, setChangeClass] = useState(meta.isFirstIssue ? "MINOR" : "MINOR");
  const [pubState, pubAction, publishing] = useActionState<ActionState, FormData>(publishRevision, {});
  const [discardState, discardAction] = useActionState<ActionState, FormData>(discardDraft, {});
  const router = useRouter();
  useEffect(() => {
    if (pubState.ok) { onPublished(); router.refresh(); }
  }, [pubState.ok, router, onPublished]);

  const classes = ["EDITORIAL", "MINOR", "MAJOR", "SAFETY_CRITICAL"] as const;

  return (
    <section className="card card-pad space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">Publish this revision</h2>
        <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
          Publishing saves and freezes this revision — it can never be edited again. How
          significant the change is decides what happens to everyone already signed off on
          this machine.
        </p>
      </div>

      <form action={pubAction} className="space-y-4">
        <input type="hidden" name="revisionId" value={meta.revisionId} />
        <input type="hidden" name="changeSummary" value={summary} />
        {/* Publishing commits what the author is looking at, so there is no
            "you forgot to save" trap between editing and publishing. */}
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="body" value={JSON.stringify(body)} />

        <fieldset>
          <legend className="label mb-2">How significant is this change?</legend>
          <div className="grid gap-1.5">
            {classes.map((c) => {
              const active = changeClass === c;
              const severe = c === "MAJOR" || c === "SAFETY_CRITICAL";
              return (
                <label
                  key={c}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 transition-colors"
                  style={{
                    borderColor: active ? (severe ? "var(--st-suspended-br)" : "var(--accent)") : "var(--border-strong)",
                    background: active
                      ? (severe ? "var(--st-suspended-bg)" : "color-mix(in srgb, var(--accent) 8%, var(--surface))")
                      : "var(--surface)",
                  }}
                >
                  <input
                    type="radio" name="changeClass" value={c} checked={active}
                    onChange={() => setChangeClass(c)} className="sr-only"
                  />
                  <span
                    className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2"
                    style={{ borderColor: active ? "var(--accent)" : "var(--border-strong)" }}
                    aria-hidden
                  >
                    {active && <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />}
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-medium">{CHANGE_CLASS_META[c].label}</span>
                    <span className="block text-[12px] text-[var(--ink-soft)]">{CHANGE_CLASS_META[c].effect}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field label="What changed" htmlFor="summary" hint="Goes on the permanent record and is shown to affected staff.">
          <textarea
            id="summary" value={summary}
            onChange={(e) => onSummaryChange(e.target.value)}
            rows={2} className="input !h-auto py-2"
            placeholder="Clarified the first-off checks following internal audit."
          />
        </Field>

        {pubState.error && <Banner tone="bad">{pubState.error}</Banner>}
        {pubState.ok && <Banner tone="good">{pubState.ok}</Banner>}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={publishing || !summary.trim()}>
            {publishing ? "Publishing…" : `Publish revision ${meta.revision}`}
          </button>
          <Link href={routes.document(meta.documentId)} className="btn">Back to document</Link>
        </div>
      </form>

      <form action={discardAction} className="border-t pt-3.5" style={{ borderColor: "var(--border)" }}>
        <input type="hidden" name="revisionId" value={meta.revisionId} />
        {discardState.error && <div className="mb-2"><Banner tone="bad">{discardState.error}</Banner></div>}
        <button type="submit" className="text-[12px] font-medium text-[var(--ink-faint)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink)]">
          Discard this draft
        </button>
      </form>
    </section>
  );
}
