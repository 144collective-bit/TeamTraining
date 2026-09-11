"use client";

import { useActionState, useState } from "react";
import { createDocument } from "@/lib/document-commands";
import type { ActionState } from "@/lib/command-support";
import { Banner } from "./banner";
import { Field } from "./editor-bits";
import { templatesFor, type Template } from "@/lib/templates";
import { DOC_KIND_META } from "@/lib/competence";
import type { DocumentKind } from "@/lib/documents";

const KINDS: DocumentKind[] = ["SOP", "RISK_ASSESSMENT", "TRAINING_DOC", "INDUCTION"];

/** Machine documents drive the re-training rules; the rest are site-wide. */
const MACHINE_KINDS: DocumentKind[] = ["SOP", "RISK_ASSESSMENT", "TRAINING_DOC"];

export function NewDocumentForm({
  machines,
  defaultKind,
  defaultMachineId,
}: {
  machines: { id: string; code: string; name: string }[];
  defaultKind: DocumentKind;
  defaultMachineId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createDocument, {});
  const [kind, setKind] = useState<DocumentKind>(defaultKind);
  const [templateId, setTemplateId] = useState<string>(() => templatesFor(defaultKind)[0]?.id ?? "");

  const templates = templatesFor(kind);
  const wantsMachine = MACHINE_KINDS.includes(kind);

  function chooseKind(next: DocumentKind) {
    setKind(next);
    setTemplateId(templatesFor(next)[0]?.id ?? "");
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="templateId" value={templateId} />

      <section className="card card-pad space-y-4">
        <fieldset>
          <legend className="label mb-2">What are you writing?</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {KINDS.map((k) => {
              const meta = DOC_KIND_META[k];
              const active = kind === k;
              return (
                <button
                  key={k} type="button" onClick={() => chooseKind(k)}
                  aria-pressed={active}
                  className="rounded-lg border px-3.5 py-3 text-left transition-colors"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--border-strong)",
                    background: active ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
                  }}
                >
                  <span className="block text-[13.5px] font-medium">{meta.label}</span>
                  <span className="mt-0.5 block text-[12px] text-[var(--ink-soft)]">{meta.blurb}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section className="card card-pad space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Start from</h2>
          <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">
            A template is a starting point, not a rule. Every line is yours to change,
            and nothing is in force until you publish it.
          </p>
        </div>

        <div className="grid gap-1.5">
          {templates.map((t) => (
            <TemplateOption
              key={t.id} template={t}
              active={templateId === t.id}
              onSelect={() => setTemplateId(t.id)}
            />
          ))}
        </div>
      </section>

      <section className="card card-pad space-y-4">
        <Field label="Title" htmlFor="title">
          <input
            id="title" name="title" required className="input"
            placeholder={placeholderFor(kind)}
          />
        </Field>

        {wantsMachine ? (
          <Field
            label="Machine" htmlFor="machineId"
            hint="Attaching a document to a machine is what lets a revision flag everyone trained on it."
          >
            <select id="machineId" name="machineId" className="input" defaultValue={defaultMachineId}>
              <option value="">Not machine-specific</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
              ))}
            </select>
            {machines.length === 0 && (
              <p className="mt-1.5 text-[12px]" style={{ color: "var(--st-revalidate-fg)" }}>
                No machines yet. You can write this now and attach it later, but adding your
                machines first makes the re-training rules work.
              </p>
            )}
          </Field>
        ) : (
          <input type="hidden" name="machineId" value="" />
        )}

        <Field label="Review interval" htmlFor="reviewMonths" hint="How often this comes back round for review.">
          <select id="reviewMonths" name="reviewMonths" className="input" defaultValue="12">
            <option value="6">Every 6 months</option>
            <option value="12">Every 12 months</option>
            <option value="24">Every 24 months</option>
          </select>
        </Field>
      </section>

      {state.error && <Banner tone="bad">{state.error}</Banner>}

      <button type="submit" className="btn btn-primary w-full !h-11" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}

function TemplateOption({
  template, active, onSelect,
}: { template: Template; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button" onClick={onSelect} aria-pressed={active}
      className="flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border-strong)",
        background: active ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
      }}
    >
      <span
        className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2"
        style={{ borderColor: active ? "var(--accent)" : "var(--border-strong)" }}
        aria-hidden
      >
        {active && <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{template.name}</span>
        <span className="mt-0.5 block text-[12.5px] text-[var(--ink-soft)]">{template.summary}</span>
        <span className="mt-1 block text-[11.5px] text-[var(--ink-faint)]">{template.detail}</span>
      </span>
    </button>
  );
}

function placeholderFor(kind: DocumentKind): string {
  switch (kind) {
    case "SOP": return "e.g. Press Brake 1 — Standard Operating Procedure";
    case "RISK_ASSESSMENT": return "e.g. Press Brake 1 — Risk Assessment";
    case "TRAINING_DOC": return "e.g. Press Brake Operation — Training Sign-Off";
    case "INDUCTION": return "e.g. Shop Floor Induction";
  }
}
