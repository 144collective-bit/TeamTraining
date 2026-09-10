"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordSignOff, readyForAssessment, type ActionState } from "@/lib/commands";
import { Banner } from "./banner";
import { DeviceClock } from "./device-clock";

const RATINGS = [
  { value: 1, label: "Observed only" },
  { value: 2, label: "Needs prompting" },
  { value: 3, label: "Working with support" },
  { value: 4, label: "Mostly independent" },
  { value: 5, label: "Ready for assessment" },
];

export function SignOffForm({
  sessionId,
  competenceId,
  steps,
  alreadyCovered,
  traineeName,
}: {
  sessionId: string;
  competenceId: string;
  steps: { number: number; label: string }[];
  alreadyCovered: number[];
  traineeName: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordSignOff, {});
  const [rating, setRating] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set(alreadyCovered));
  const formRef = useRef<HTMLFormElement>(null);

  // Reset after a successful save so the trainer can move to the next trainee.
  useEffect(() => {
    if (state.ok) {
      setRating(null);
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  function toggleStep(n: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} action={formAction} className="space-y-5">
        <input type="hidden" name="sessionId" value={sessionId} />
        {/* Device clock, so a late sync is visible on the record */}
        <DeviceClock />
        {[...selected].map((n) => (
          <input key={n} type="hidden" name="steps" value={n} />
        ))}

        {/* Rating - the only required field, five big targets */}
        <fieldset>
          <legend className="label mb-2">Progress today</legend>
          <div className="grid gap-1.5">
            {RATINGS.map((r) => {
              const active = rating === r.value;
              return (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--border-strong)",
                    background: active ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
                  }}
                >
                  <input
                    type="radio" name="rating" value={r.value} required
                    checked={active}
                    onChange={() => setRating(r.value)}
                    className="sr-only"
                  />
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular"
                    style={
                      active
                        ? { background: "var(--accent)", color: "#fff" }
                        : { background: "var(--surface-sunk)", color: "var(--ink-faint)" }
                    }
                    aria-hidden
                  >
                    {r.value}
                  </span>
                  <span className="text-[14px] font-medium">{r.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Steps covered - pre-ticked from history, so this is confirm-not-enter */}
        {steps.length > 0 && (
          <fieldset>
            <legend className="label mb-2">
              Procedure steps covered
              <span className="ml-2 tabular font-normal text-[var(--ink-faint)]">
                {selected.size} of {steps.length}
              </span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {steps.map((s) => {
                const on = selected.has(s.number);
                return (
                  <button
                    key={s.number}
                    type="button"
                    onClick={() => toggleStep(s.number)}
                    aria-pressed={on}
                    className="rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors"
                    style={
                      on
                        ? { borderColor: "var(--st-competent-br)", background: "var(--st-competent-bg)", color: "var(--st-competent-fg)" }
                        : { borderColor: "var(--border-strong)", background: "var(--surface)", color: "var(--ink-soft)" }
                    }
                  >
                    <span className="font-mono text-[11px] opacity-70">{s.number}</span>{" "}
                    {s.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor="note" className="label mb-1.5 block">
            Note <span className="font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <textarea
            id="note" name="note" rows={2}
            className="input !h-auto py-2"
            placeholder="Anything worth recording about today…"
          />
        </div>

        {state.error && <Banner tone="bad">{state.error}</Banner>}
        {state.ok && <Banner tone="good">{state.ok}</Banner>}

        <button
          type="submit"
          className="btn btn-primary w-full !h-12 text-[15px]"
          disabled={pending || rating === null}
        >
          {pending ? "Recording…" : "Record sign-off"}
        </button>
      </form>

      {/* Once they're at 5, the natural next step is assessment */}
      {rating === 5 && !pending && (
        <ReadyForAssessment competenceId={competenceId} traineeName={traineeName} />
      )}
    </div>
  );
}

function ReadyForAssessment({
  competenceId,
  traineeName,
}: {
  competenceId: string;
  traineeName: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(readyForAssessment, {});
  return (
    <form action={formAction} className="card card-pad">
      <input type="hidden" name="competenceId" value={competenceId} />
      <p className="text-[13.5px]">
        <span className="font-semibold">Ready for assessment?</span>{" "}
        <span className="text-[var(--ink-soft)]">
          This moves {traineeName.split(" ")[0]} to formal assessment. Training sign-offs stay on the record.
        </span>
      </p>
      {state.error && <div className="mt-2"><Banner tone="bad">{state.error}</Banner></div>}
      {state.ok && <div className="mt-2"><Banner tone="good">{state.ok}</Banner></div>}
      <button type="submit" className="btn mt-3" disabled={pending}>
        {pending ? "Recording…" : "Put forward for assessment"}
      </button>
    </form>
  );
}


