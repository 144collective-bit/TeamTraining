"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startTraining, type ActionState } from "@/lib/commands";
import { Banner } from "./banner";

export type Trainer = { id: string; name: string; role: string; machines: string[] };

export function StartTrainingDialog({
  target,
  trainers,
  onClose,
}: {
  target: { userId: string; userName: string; machineId: string; machineCode: string; machineName: string };
  trainers: Trainer[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(startTraining, {});

  useEffect(() => {
    if (state.ok) { router.refresh(); onClose(); }
  }, [state.ok, router, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Someone signed off to trainer level on this machine is the right default;
  // supervisors and managers remain available as a fallback.
  const qualified = trainers.filter((t) => t.machines.includes(target.machineId));
  const others = trainers.filter(
    (t) => !t.machines.includes(target.machineId) && t.id !== target.userId,
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgb(0 0 0 / 0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-training-title"
    >
      <div className="card w-full max-w-md p-5" style={{ boxShadow: "0 12px 40px rgb(0 0 0 / 0.25)" }}>
        <h2 id="start-training-title" className="text-[17px] font-semibold tracking-tight">
          Start training
        </h2>
        <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
          {target.userName} on <span className="font-mono font-medium">{target.machineCode}</span>{" "}
          {target.machineName}
        </p>

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="userId" value={target.userId} />
          <input type="hidden" name="machineId" value={target.machineId} />

          <div>
            <label htmlFor="trainerId" className="label mb-1.5 block">Designated trainer</label>
            <select id="trainerId" name="trainerId" required className="input" defaultValue="">
              <option value="" disabled>Choose a trainer…</option>
              {qualified.length > 0 && (
                <optgroup label="Signed off to train on this machine">
                  {qualified.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other supervisors and managers">
                  {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
            {qualified.length === 0 && (
              <p className="mt-1.5 text-[12px]" style={{ color: "var(--st-revalidate-fg)" }}>
                Nobody is signed off to train on this machine yet. Whoever you pick should be
                brought up to trainer level themselves.
              </p>
            )}
          </div>

          <p className="text-[12px] text-[var(--ink-faint)]">
            This records the training start against the SOP revision currently in force, and
            opens a session for daily sign-offs.
          </p>

          {state.error && <Banner tone="bad">{state.error}</Banner>}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1" disabled={pending}>
              {pending ? "Starting…" : "Start training"}
            </button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
