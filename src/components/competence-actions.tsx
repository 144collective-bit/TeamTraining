"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  recordAssessment, signCompetence, changeStatus, recordReview,
  voidSignOff, readyForAssessment, type ActionState,
} from "@/lib/commands";
import { Banner } from "./sign-off-form";
import { REQUIRED_SIGNATURES, type SignatureRole } from "@/lib/state-machine";
import type { Status } from "@/lib/competence";

type Props = {
  competenceId: string;
  status: Status;
  traineeName: string;
  machineCode: string;
  openSessionId: string | null;
  signedRoles: string[];
  lastAssessmentPassed: boolean | null;
  canTrain: boolean;
  canManage: boolean;
};

export function CompetenceActions(props: Props) {
  const { status, canTrain } = props;
  if (!canTrain) return null;

  return (
    <section className="card card-pad space-y-4">
      <h2 className="text-[15px] font-semibold tracking-tight">Record an update</h2>

      {status === "IN_TRAINING" && <InTraining {...props} />}
      {status === "ASSESSMENT" && <AtAssessment {...props} />}
      {status === "COMPETENT" && <WhenCompetent {...props} />}
      {(status === "REQUIRES_REVALIDATION" || status === "SUSPENDED") && <NeedsAction {...props} />}
      {status === "NOT_TRAINED" && (
        <p className="text-[13px] text-[var(--ink-soft)]">
          No training recorded. Start training from the training matrix.
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- */

function InTraining({ competenceId, openSessionId, traineeName }: Props) {
  return (
    <div className="space-y-3">
      {openSessionId && (
        <Link href={`/signoff/${openSessionId}` as never} className="btn btn-primary w-full sm:w-auto">
          Record today&rsquo;s sign-off
        </Link>
      )}
      <Simple
        action={readyForAssessment}
        competenceId={competenceId}
        label="Put forward for assessment"
        hint={`Moves ${traineeName.split(" ")[0]} to formal assessment.`}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */

function AtAssessment(props: Props) {
  const { lastAssessmentPassed } = props;
  return lastAssessmentPassed ? <Signatures {...props} /> : <AssessmentForm {...props} />;
}

function AssessmentForm({ competenceId, traineeName, machineCode }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordAssessment, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="competenceId" value={competenceId} />
      <p className="text-[13px] text-[var(--ink-soft)]">
        Assess {traineeName} against the procedure for {machineCode}. A pass opens the
        three signatures; anything else returns them to training.
      </p>

      <div>
        <label htmlFor="a-note" className="label mb-1.5 block">
          Assessment note <span className="font-normal normal-case tracking-normal">(optional)</span>
        </label>
        <textarea id="a-note" name="note" rows={2} className="input !h-auto py-2"
                  placeholder="What was assessed, and how they did…" />
      </div>

      {state.error && <Banner tone="bad">{state.error}</Banner>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" name="outcome" value="PASS" className="btn btn-primary" disabled={pending}>
          Passed — competent
        </button>
        <button type="submit" name="outcome" value="FAIL" className="btn" disabled={pending}>
          Not yet — continue training
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- */

function Signatures({ competenceId, signedRoles, traineeName, canManage }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signCompetence, {});
  const [active, setActive] = useState<SignatureRole | null>(null);

  useEffect(() => {
    if (state.ok) { setActive(null); router.refresh(); }
  }, [state.ok, router]);

  const whoSigns: Record<SignatureRole, string> = {
    TRAINEE: traineeName,
    TRAINER: "the designated trainer",
    MANAGER: "an authorising manager",
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--ink-soft)]">
        Assessment passed. Competence is granted once all three signatures are recorded.
        Each signer enters their own PIN — the signature is attributed to them, not to
        whoever is holding the device.
      </p>

      <ul className="space-y-2">
        {REQUIRED_SIGNATURES.map((role) => {
          const done = signedRoles.includes(role);
          const blocked = role === "MANAGER" && !canManage;
          return (
            <li key={role}>
              <div
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2.5"
                style={{
                  borderColor: done ? "var(--st-competent-br)" : "var(--border-strong)",
                  background: done ? "var(--st-competent-bg)" : "var(--surface)",
                }}
              >
                <span className="label !text-[10.5px] w-16">{role}</span>
                <span className="flex-1 text-[13px]" style={done ? { color: "var(--st-competent-fg)" } : undefined}>
                  {done ? "Signed" : whoSigns[role]}
                </span>
                {!done && (
                  <button
                    type="button"
                    className="btn !h-8 text-[12.5px]"
                    onClick={() => setActive(active === role ? null : role)}
                    disabled={blocked}
                    title={blocked ? "Manager access required" : undefined}
                  >
                    {active === role ? "Cancel" : "Sign"}
                  </button>
                )}
              </div>

              {active === role && (
                <form action={formAction} className="mt-2 rounded-lg border p-3.5"
                      style={{ borderColor: "var(--accent)", background: "var(--surface-sunk)" }}>
                  <input type="hidden" name="competenceId" value={competenceId} />
                  <input type="hidden" name="role" value={role} />
                  <DeviceTime />
                  <label htmlFor={`pin-${role}`} className="label mb-1.5 block">
                    {role === "TRAINEE" ? `${traineeName}'s PIN` : "Your PIN"}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`pin-${role}`} name="pin" type="password" inputMode="numeric"
                      autoComplete="off" required autoFocus
                      className="input max-w-[10rem]" placeholder="••••"
                    />
                    <button type="submit" className="btn btn-primary" disabled={pending}>
                      {pending ? "Signing…" : "Confirm signature"}
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {state.error && <Banner tone="bad">{state.error}</Banner>}
      {state.ok && <Banner tone="good">{state.ok}</Banner>}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function WhenCompetent({ competenceId, canManage }: Props) {
  return (
    <div className="space-y-4">
      <ReviewForm competenceId={competenceId} />
      {canManage && (
        <WithReason
          competenceId={competenceId}
          transition="SUSPEND"
          label="Suspend competence"
          hint="Use when a risk assessment changes, after an incident, or when authorisation is withdrawn. They stop operating immediately."
          destructive
        />
      )}
    </div>
  );
}

function ReviewForm({ competenceId }: { competenceId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordReview, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="competenceId" value={competenceId} />
      <p className="label">Quarterly review</p>
      <textarea name="note" rows={2} className="input !h-auto py-2"
                placeholder="How are they getting on? Anything they need to work more comfortably?" />
      {state.error && <Banner tone="bad">{state.error}</Banner>}
      {state.ok && <Banner tone="good">{state.ok}</Banner>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="outcome" value="CONFIRMED" className="btn btn-primary" disabled={pending}>
          Confirm still competent
        </button>
        <button type="submit" name="outcome" value="REVALIDATE" className="btn" disabled={pending}>
          Needs revalidation
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- */

function NeedsAction({ competenceId, status, canManage }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--ink-soft)]">
        {status === "SUSPENDED"
          ? "This person is not authorised to operate. Re-train them, or reinstate if the reason no longer applies."
          : "Competence has lapsed. Re-training is required before they operate unsupervised again."}
      </p>
      <p className="text-[13px]">
        Start re-training from the{" "}
        <Link href="/matrix" className="font-medium underline">training matrix</Link>.
      </p>
      {status === "SUSPENDED" && canManage && (
        <Simple
          action={(p: ActionState, f: FormData) => { f.set("transition", "REINSTATE"); return changeStatus(p, f); }}
          competenceId={competenceId}
          label="Reinstate competence"
          hint="Only when the reason for suspension no longer applies and no re-training is needed."
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function WithReason({
  competenceId, transition, label, hint, destructive,
}: {
  competenceId: string; transition: string; label: string; hint: string; destructive?: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changeStatus, {});
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.ok) { setOpen(false); router.refresh(); } }, [state.ok, router]);

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}
              style={destructive ? { color: "var(--st-suspended-fg)" } : undefined}>
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2.5 rounded-lg border p-3.5"
          style={{ borderColor: "var(--st-suspended-br)", background: "var(--st-suspended-bg)" }}>
      <input type="hidden" name="competenceId" value={competenceId} />
      <input type="hidden" name="transition" value={transition} />
      <p className="text-[12.5px]" style={{ color: "var(--st-suspended-fg)" }}>{hint}</p>
      <textarea name="reason" rows={2} required className="input !h-auto py-2"
                placeholder="Reason — this goes on the permanent record" />
      {state.error && <Banner tone="bad">{state.error}</Banner>}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Recording…" : label}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function Simple({
  action, competenceId, label, hint,
}: {
  action: (p: ActionState, f: FormData) => Promise<ActionState>;
  competenceId: string; label: string; hint: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="competenceId" value={competenceId} />
      <p className="text-[12.5px] text-[var(--ink-soft)]">{hint}</p>
      {state.error && <Banner tone="bad">{state.error}</Banner>}
      {state.ok && <Banner tone="good">{state.ok}</Banner>}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Recording…" : label}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- */

export function VoidSignOff({ signOffId }: { signOffId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(voidSignOff, {});
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.ok) { setOpen(false); router.refresh(); } }, [state.ok, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="text-[11px] font-medium text-[var(--ink-faint)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink)]">
        Void this entry
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-wrap gap-2">
      <input type="hidden" name="signOffId" value={signOffId} />
      <input name="reason" required autoFocus className="input max-w-[18rem] !h-8 text-[12.5px]"
             placeholder="Reason for voiding" />
      <button type="submit" className="btn !h-8 text-[12px]" disabled={pending}>
        {pending ? "…" : "Confirm"}
      </button>
      <button type="button" className="btn !h-8 text-[12px]" onClick={() => setOpen(false)}>Cancel</button>
      {state.error && <div className="w-full"><Banner tone="bad">{state.error}</Banner></div>}
    </form>
  );
}

function DeviceTime() {
  const [now, setNow] = useState("");
  useEffect(() => { setNow(new Date().toISOString()); }, []);
  return <input type="hidden" name="occurredAt" value={now} />;
}
