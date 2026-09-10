"use client";

import { useActionState, useState } from "react";
import { createDocument } from "@/lib/document-commands";
import type { ActionState } from "@/lib/commands";
import { Banner } from "./sign-off-form";
import { Field } from "./editor-bits";

export function NewDocumentForm({
  machines,
  defaultKind,
  defaultMachineId,
}: {
  machines: { id: string; code: string; name: string }[];
  defaultKind: "SOP" | "RISK_ASSESSMENT";
  defaultMachineId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createDocument, {});
  const [kind, setKind] = useState(defaultKind);

  return (
    <form action={formAction} className="card card-pad space-y-4">
      <fieldset>
        <legend className="label mb-2">Document type</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {([
            ["SOP", "Standard operating procedure", "Step-by-step method with photographs"],
            ["RISK_ASSESSMENT", "Risk assessment", "Hazards, controls and risk scores"],
          ] as const).map(([value, label, hint]) => {
            const active = kind === value;
            return (
              <label
                key={value}
                className="cursor-pointer rounded-lg border px-3.5 py-3 transition-colors"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border-strong)",
                  background: active ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
                }}
              >
                <input
                  type="radio" name="kind" value={value} checked={active}
                  onChange={() => setKind(value)} className="sr-only"
                />
                <span className="block text-[13.5px] font-medium">{label}</span>
                <span className="mt-0.5 block text-[12px] text-[var(--ink-soft)]">{hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field label="Title" htmlFor="title">
        <input
          id="title" name="title" required className="input"
          placeholder={kind === "SOP" ? "Press Brake 1 — Standard Operating Procedure" : "Press Brake 1 — Risk Assessment"}
        />
      </Field>

      <Field label="Machine" htmlFor="machineId" hint="Leave blank for a site-wide document. Machine documents drive the re-training rules.">
        <select id="machineId" name="machineId" className="input" defaultValue={defaultMachineId}>
          <option value="">Site-wide</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Review interval" htmlFor="reviewMonths">
        <select id="reviewMonths" name="reviewMonths" className="input" defaultValue="12">
          <option value="6">Every 6 months</option>
          <option value="12">Every 12 months</option>
          <option value="24">Every 24 months</option>
        </select>
      </Field>

      {state.error && <Banner tone="bad">{state.error}</Banner>}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
