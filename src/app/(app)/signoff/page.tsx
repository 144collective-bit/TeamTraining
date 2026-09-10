import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getOpenSessions } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";
import { PageHeader } from "@/components/page-header";
import { formatDate } from "@/lib/competence";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function SignOffPage() {
  const user = await requireUser();
  const seeAll = atLeast(user.role, "MANAGER");
  const sessions = await getOpenSessions(user.tenantId, user.id, seeAll);

  const outstanding = sessions.filter((s) => !s.signedToday);
  const done = sessions.filter((s) => s.signedToday);

  return (
    <>
      <PageHeader
        eyebrow="Shop floor"
        title="Today's sign-offs"
        description={
          seeAll
            ? "Every open training session. Tap a trainee to record today's progress."
            : "Your trainees. Tap one to record today's progress."
        }
      />

      <div className="p-4 sm:p-7 space-y-6 max-w-3xl">
        {sessions.length === 0 && (
          <div className="card card-pad text-center">
            <p className="text-[14px] font-medium">No training in progress.</p>
            <p className="mt-1 text-[13px] text-[var(--ink-soft)]">
              {seeAll
                ? "Start training from any empty cell on the training matrix."
                : "You have no trainees assigned at the moment."}
            </p>
            <Link href="/matrix" className="btn mt-4 inline-flex">Open training matrix</Link>
          </div>
        )}

        {outstanding.length > 0 && (
          <section>
            <h2 className="label mb-2.5">
              Not signed off today
              <span className="ml-2 tabular text-[var(--ink-faint)]">{outstanding.length}</span>
            </h2>
            <ul className="space-y-2.5">
              {outstanding.map((s) => <SessionCard key={s.sessionId} s={s} />)}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <h2 className="label mb-2.5">
              Signed off today
              <span className="ml-2 tabular text-[var(--ink-faint)]">{done.length}</span>
            </h2>
            <ul className="space-y-2.5">
              {done.map((s) => <SessionCard key={s.sessionId} s={s} done />)}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function SessionCard({
  s,
  done = false,
}: {
  s: Awaited<ReturnType<typeof getOpenSessions>>[number];
  done?: boolean;
}) {
  return (
    <li>
      <Link
        href={routes.captureSignOff(s.sessionId)}
        className="card flex items-center gap-4 p-4 transition-colors hover:bg-[var(--surface-sunk)]"
        style={done ? { opacity: 0.7 } : undefined}
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[13px] font-bold"
          style={
            done
              ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)" }
              : { background: "var(--st-training-bg)", color: "var(--st-training-fg)" }
          }
          aria-hidden
        >
          {done ? "✓" : s.traineeName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{s.traineeName}</span>
          <span className="block text-[13px] text-[var(--ink-soft)]">
            <span className="font-mono font-medium">{s.machineCode}</span> {s.machineName}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-[var(--ink-faint)]">
            Started {formatDate(s.startedOn)} · {s.entries} sign-off{s.entries === 1 ? "" : "s"}
            {s.lastEntry ? ` · last ${formatDate(s.lastEntry)}` : ""}
          </span>
        </span>

        <span className="shrink-0 text-[var(--ink-faint)]" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 3.5 12 9l-5.5 5.5" />
          </svg>
        </span>
      </Link>
    </li>
  );
}
