"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startInduction } from "@/lib/commands";
import type { ActionState } from "@/lib/command-support";
import { Banner } from "./banner";

export function StartInduction({
  userId,
  personName,
  trainers,
}: {
  userId: string;
  personName: string;
  trainers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(startInduction, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  return (
    <section className="card card-pad">
      <h2 className="text-[15px] font-semibold tracking-tight">Induction</h2>
      <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
        {personName.split(" ")[0]} has not been inducted yet. Starting one copies the
        current checklist, so the record stays accurate even after the checklist changes.
      </p>

      <form action={formAction} className="mt-3.5 flex flex-wrap items-end gap-2">
        <input type="hidden" name="userId" value={userId} />
        <label className="flex-1 min-w-[12rem]">
          <span className="label mb-1.5 block">Designated trainer</span>
          <select name="trainerId" className="input" defaultValue={trainers[0]?.id ?? ""}>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Starting…" : "Start induction"}
        </button>
      </form>

      {state.error && <div className="mt-2.5"><Banner tone="bad">{state.error}</Banner></div>}
    </section>
  );
}
