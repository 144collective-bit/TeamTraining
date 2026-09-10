import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getSessionForCapture } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";
import { SignOffForm } from "@/components/sign-off-form";
import { formatDate } from "@/lib/competence";

export const dynamic = "force-dynamic";

type SopBody = { steps?: { step: string; keyPoints: string[] }[] };

export default async function CapturePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireUser();
  const data = await getSessionForCapture(user.tenantId, sessionId);
  if (!data) notFound();

  const { session, recent } = data;
  const canRecord =
    session.trainerId === user.id || atLeast(user.role as never, "MANAGER");

  const steps = ((session.sopBody as SopBody | null)?.steps ?? []).map((s, i) => ({
    number: i + 1,
    label: s.step,
  }));

  // Pre-tick what has already been covered, so the trainer confirms rather
  // than re-enters. Fewer taps is the whole point.
  const covered = new Set<number>(
    recent
      .filter((r) => !r.voidedAt)
      .flatMap((r) => (Array.isArray(r.stepsCovered) ? (r.stepsCovered as number[]) : [])),
  );

  return (
    <div className="p-4 sm:p-7 max-w-2xl">
      <Link
        href="/signoff"
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-soft)] hover:underline"
      >
        <span aria-hidden>←</span> All sign-offs
      </Link>

      <header className="mt-3 mb-5">
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
          {session.traineeName}
        </h1>
        <p className="mt-1 text-[14px] text-[var(--ink-soft)]">
          <Link href={`/machines/${session.machineId}` as never} className="hover:underline">
            <span className="font-mono font-medium">{session.machineCode}</span> {session.machineName}
          </Link>
          {session.sopReference && (
            <>
              {" · "}
              <Link href={`/documents/${session.sopDocumentId}` as never} className="hover:underline">
                {session.sopReference} rev {session.sopRevision}
              </Link>
            </>
          )}
        </p>
        <p className="mt-0.5 text-[12.5px] text-[var(--ink-faint)]">
          Training started {formatDate(session.startedOn)}
        </p>
      </header>

      {!canRecord ? (
        <div
          className="card px-4 py-3 text-[13.5px]"
          style={{
            borderColor: "var(--st-revalidate-br)",
            background: "var(--st-revalidate-bg)",
            color: "var(--st-revalidate-fg)",
          }}
        >
          Only the designated trainer or a manager can record sign-offs for this trainee.
        </div>
      ) : (
        <SignOffForm
          sessionId={session.sessionId}
          competenceId={session.competenceId}
          steps={steps}
          alreadyCovered={[...covered]}
          traineeName={session.traineeName}
        />
      )}

      {recent.length > 0 && (
        <section className="card mt-6">
          <div className="px-4 pt-3.5 pb-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-[14px] font-semibold tracking-tight">Recent entries</h2>
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {recent.map((r) => (
              <li key={r.id} className="px-4 py-2.5" style={r.voidedAt ? { opacity: 0.5 } : undefined}>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[13px] font-semibold tabular">{formatDate(r.onDate)}</span>
                  <span className="flex gap-0.5" aria-label={`Rating ${r.rating} of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className="h-3 w-1 rounded-full"
                            style={{ background: n <= r.rating ? "var(--st-training-fg)" : "var(--border-strong)" }} />
                    ))}
                  </span>
                  {r.voidedAt && (
                    <span className="text-[11px] font-semibold" style={{ color: "var(--st-suspended-fg)" }}>
                      VOID
                    </span>
                  )}
                  <span className="ml-auto text-[11.5px] text-[var(--ink-faint)]">{r.recorderName}</span>
                </div>
                {r.note && <p className="mt-0.5 text-[12.5px] text-[var(--ink-soft)]">{r.note}</p>}
              </li>
            ))}
          </ul>
          <Link
            href={`/competence/${session.competenceId}` as never}
            className="block px-4 py-2.5 text-[12.5px] font-medium border-t hover:bg-[var(--surface-sunk)]"
            style={{ borderColor: "var(--border)" }}
          >
            Full training record →
          </Link>
        </section>
      )}
    </div>
  );
}
