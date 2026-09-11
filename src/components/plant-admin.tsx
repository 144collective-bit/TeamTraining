"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveArea, saveMachine, setMachineActive } from "@/lib/admin-commands";
import type { ActionState } from "@/lib/command-support";
import { Banner } from "./banner";
import { Field } from "./editor-bits";

type Area = { id: string; name: string; code: string };
type Machine = {
  id: string; areaId: string; code: string; name: string;
  manufacturer: string | null; model: string | null;
  serialNumber: string | null; assetRef: string | null;
  highRisk: boolean; revalidationMonths: number | null;
  active: boolean; competences: number;
};

export function PlantAdmin({ areas, machines }: { areas: Area[]; machines: Machine[] }) {
  const [editingArea, setEditingArea] = useState<Area | "new" | null>(
    areas.length === 0 ? "new" : null,
  );
  const [editingMachine, setEditingMachine] = useState<Machine | "new" | null>(null);

  return (
    <div className="space-y-7">
      {/* Areas come first: a machine needs one. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="label">
            Areas <span className="ml-1.5 tabular text-[var(--ink-faint)]">{areas.length}</span>
          </h2>
          {!editingArea && (
            <button type="button" className="btn !h-8 text-[12.5px]" onClick={() => setEditingArea("new")}>
              Add an area
            </button>
          )}
        </div>

        {editingArea && (
          <div className="mb-3">
            <AreaForm
              area={editingArea === "new" ? null : editingArea}
              onDone={() => setEditingArea(null)}
            />
          </div>
        )}

        {areas.length === 0 ? (
          <p className="card card-pad text-center text-[13px] text-[var(--ink-faint)]">
            No areas yet. An area is a part of the shop floor — press shop, welding bay, fabrication.
          </p>
        ) : (
          <ul className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {areas.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="font-mono text-[12.5px] font-bold w-16">{a.code}</span>
                <span className="flex-1 text-[13.5px]">{a.name}</span>
                <span className="text-[11.5px] text-[var(--ink-faint)] tabular">
                  {machines.filter((m) => m.areaId === a.id).length} machines
                </span>
                <button type="button" className="btn !h-7 !px-2 text-[12px]" onClick={() => setEditingArea(a)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Machines */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="label">
            Machines <span className="ml-1.5 tabular text-[var(--ink-faint)]">{machines.length}</span>
          </h2>
          {!editingMachine && areas.length > 0 && (
            <button type="button" className="btn !h-8 text-[12.5px]" onClick={() => setEditingMachine("new")}>
              Add a machine
            </button>
          )}
        </div>

        {editingMachine && (
          <div className="mb-3">
            <MachineForm
              machine={editingMachine === "new" ? null : editingMachine}
              areas={areas}
              onDone={() => setEditingMachine(null)}
            />
          </div>
        )}

        {areas.length === 0 ? (
          <p className="card card-pad text-center text-[13px] text-[var(--ink-faint)]">
            Add an area first — every machine belongs to one.
          </p>
        ) : machines.length === 0 ? (
          <p className="card card-pad text-center text-[13px] text-[var(--ink-faint)]">
            No machines yet. These become the columns of your training matrix.
          </p>
        ) : (
          <ul className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {machines.map((m) => {
              const area = areas.find((a) => a.id === m.areaId);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
                    style={m.active ? undefined : { opacity: 0.6 }}>
                  <span className="font-mono text-[13px] font-bold w-16">{m.code}</span>
                  <span className="min-w-[10rem] flex-1">
                    <span className="block text-[13.5px] font-medium">{m.name}</span>
                    <span className="block text-[11.5px] text-[var(--ink-faint)]">
                      {[area?.name, m.manufacturer, m.model].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {m.highRisk && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: "var(--st-suspended-bg)", color: "var(--st-suspended-fg)" }}>
                      High risk
                    </span>
                  )}
                  {!m.active && (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: "var(--st-none-bg)", color: "var(--st-none-fg)" }}>
                      Retired
                    </span>
                  )}
                  <span className="text-[11.5px] text-[var(--ink-faint)] tabular">
                    {m.revalidationMonths ? `${m.revalidationMonths}mo` : "No expiry"}
                  </span>
                  <button type="button" className="btn !h-7 !px-2 text-[12px]" onClick={() => setEditingMachine(m)}>
                    Edit
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function AreaForm({ area, onDone }: { area: Area | null; onDone: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveArea, {});
  useEffect(() => { if (state.ok) { router.refresh(); if (area) onDone(); } }, [state.ok, router, area, onDone]);

  return (
    <form action={formAction} className="card card-pad space-y-3.5">
      {area && <input type="hidden" name="id" value={area.id} />}
      <div className="grid gap-3.5 sm:grid-cols-[1fr_10rem]">
        <Field label="Area name" htmlFor="a-name">
          <input id="a-name" name="name" required className="input"
                 defaultValue={area?.name ?? ""} placeholder="e.g. Press Brake Bay" />
        </Field>
        <Field label="Code" htmlFor="a-code" hint="Short reference.">
          <input id="a-code" name="code" required className="input font-mono"
                 defaultValue={area?.code ?? ""} placeholder="PBB" maxLength={12} />
        </Field>
      </div>
      {state.error && <Banner tone="bad">{state.error}</Banner>}
      {state.ok && <Banner tone="good">{state.ok}</Banner>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : area ? "Save area" : "Add area"}
        </button>
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function MachineForm({
  machine, areas, onDone,
}: { machine: Machine | null; areas: Area[]; onDone: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveMachine, {});
  useEffect(() => { if (state.ok) { router.refresh(); if (machine) onDone(); } }, [state.ok, router, machine, onDone]);

  return (
    <section className="card card-pad space-y-4">
      <form action={formAction} className="space-y-4">
        {machine && <input type="hidden" name="id" value={machine.id} />}

        <div className="grid gap-3.5 sm:grid-cols-[8rem_1fr_1fr]">
          <Field label="Code" htmlFor="m-code" hint="Matrix column header.">
            <input id="m-code" name="code" required className="input font-mono"
                   defaultValue={machine?.code ?? ""} placeholder="PB-01" maxLength={12} />
          </Field>
          <Field label="Machine name" htmlFor="m-name">
            <input id="m-name" name="name" required className="input"
                   defaultValue={machine?.name ?? ""} placeholder="e.g. Press Brake 1" />
          </Field>
          <Field label="Area" htmlFor="m-area">
            <select id="m-area" name="areaId" required className="input" defaultValue={machine?.areaId ?? ""}>
              <option value="" disabled>Choose an area…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-4">
          <Field label="Manufacturer" htmlFor="m-manu">
            <input id="m-manu" name="manufacturer" className="input" defaultValue={machine?.manufacturer ?? ""} />
          </Field>
          <Field label="Model" htmlFor="m-model">
            <input id="m-model" name="model" className="input" defaultValue={machine?.model ?? ""} />
          </Field>
          <Field label="Serial number" htmlFor="m-serial">
            <input id="m-serial" name="serialNumber" className="input" defaultValue={machine?.serialNumber ?? ""} />
          </Field>
          <Field label="Asset reference" htmlFor="m-asset">
            <input id="m-asset" name="assetRef" className="input" defaultValue={machine?.assetRef ?? ""} />
          </Field>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 items-start">
          <Field
            label="Revalidation" htmlFor="m-reval"
            hint="How often competence must be reconfirmed. Blank means it never expires."
          >
            <select id="m-reval" name="revalidationMonths" className="input"
                    defaultValue={machine?.revalidationMonths?.toString() ?? "24"}>
              <option value="">No expiry</option>
              <option value="6">Every 6 months</option>
              <option value="12">Every 12 months</option>
              <option value="24">Every 24 months</option>
              <option value="36">Every 36 months</option>
            </select>
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 mt-[1.4rem]"
                 style={{ borderColor: "var(--border-strong)" }}>
            <input type="checkbox" name="highRisk" defaultChecked={machine?.highRisk ?? true} className="mt-0.5" />
            <span>
              <span className="block text-[13.5px] font-medium">High risk</span>
              <span className="block text-[12px] text-[var(--ink-soft)]">
                Flags the machine as one where an untrained operator could be seriously hurt.
              </span>
            </span>
          </label>
        </div>

        {state.error && <Banner tone="bad">{state.error}</Banner>}
        {state.ok && <Banner tone="good">{state.ok}</Banner>}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : machine ? "Save machine" : "Add machine"}
          </button>
          <button type="button" className="btn" onClick={onDone}>Cancel</button>
          {machine && <RetireControl machine={machine} />}
        </div>
      </form>
    </section>
  );
}

function RetireControl({ machine }: { machine: Machine }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setMachineActive, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="submit" form="retire-form" name="active" value={machine.active ? "false" : "true"}
        className="btn" disabled={pending}
        style={machine.active ? { color: "var(--st-suspended-fg)" } : undefined}
      >
        {pending ? "…" : machine.active ? "Retire machine" : "Return to service"}
      </button>
      <form id="retire-form" action={formAction} className="contents">
        <input type="hidden" name="id" value={machine.id} />
      </form>
      {machine.competences > 0 && (
        <span className="text-[11.5px] text-[var(--ink-faint)]">
          {machine.competences} training record{machine.competences === 1 ? "" : "s"} kept either way
        </span>
      )}
      {state.error && <span className="w-full"><Banner tone="bad">{state.error}</Banner></span>}
    </span>
  );
}
