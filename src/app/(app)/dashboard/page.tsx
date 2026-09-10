import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDashboard, getActionList, getActiveTraining, getCoverage } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { STATUS_META, formatDate, daysUntil } from "@/lib/competence";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

/** Enough to act on this morning; the rest live on the matrix. */
const ACTION_LIMIT = 8;

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, actions, training, coverage] = await Promise.all([
    getDashboard(user.tenantId),
    getActionList(user.tenantId),
    getActiveTraining(user.tenantId),
    getCoverage(user.tenantId),
  ]);

  const singlePoints = coverage.filter((c) => c.competent <= 1);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="Protektor UK · Kidderminster"
        title={`Good ${greeting()}, ${firstName}`}
        description="Where training stands across the shop floor right now."
      />

      <div className="p-5 sm:p-7 space-y-6">
        <section aria-label="Summary">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Stat label="People" value={stats.people} hint="Active on site" href="/people" />
            <Stat label="Machines" value={stats.machines} hint="In service" href="/machines" />
            <Stat label="Competent" value={stats.competent} tone="good" hint="Signed-off competences" href="/matrix" />
            <Stat label="In training" value={stats.inTraining + stats.inInduction} tone="neutral" hint="Including induction" href="/matrix" />
            <Stat label="Needs action" value={stats.revalidate + stats.suspended} tone={stats.revalidate + stats.suspended > 0 ? "warn" : "neutral"} hint="Expired or suspended" href="/matrix" />
            <Stat label="Single points" value={singlePoints.length} tone={singlePoints.length > 0 ? "bad" : "good"} hint="≤1 competent operator" href="/machines" />
            <Stat label="Expiring soon" value={stats.expiringSoon} tone={stats.expiringSoon > 0 ? "warn" : "neutral"} hint="Within 60 days" href="/matrix" />
            <Stat label="Reviews due" value={stats.reviewsDue} tone={stats.reviewsDue > 0 ? "warn" : "neutral"} hint="Quarterly reviews overdue" href="/matrix" />
            <Stat label="To acknowledge" value={stats.pendingAck} tone={stats.pendingAck > 0 ? "warn" : "neutral"} hint="Minor SOP changes unread" href="/matrix" />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Needs action */}
          <section className="card">
            <div className="flex items-baseline justify-between px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-[15px] font-semibold tracking-tight">Needs your attention</h2>
              <span className="text-[12px] text-[var(--ink-faint)] tabular">{actions.length}</span>
            </div>
            {actions.length === 0 ? (
              <Empty>Nothing outstanding. Every competence is current.</Empty>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {actions.slice(0, ACTION_LIMIT).map((a) => (
                  <li key={a.competenceId}>
                    <Link
                      href={routes.competence(a.competenceId)}
                      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-sunk)]"
                    >
                      <span className={`chip st-${a.status} shrink-0`} style={{ width: "2rem", height: "2rem", fontSize: "0.875rem" }} aria-hidden>
                        {STATUS_META[a.status as keyof typeof STATUS_META].glyph}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">
                          {a.userName} <span className="text-[var(--ink-faint)]">on</span>{" "}
                          <span className="font-mono">{a.machineCode}</span>
                        </span>
                        <span className="block text-[12px] text-[var(--ink-soft)] mt-0.5">
                          {describeAction(a)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
                {actions.length > ACTION_LIMIT && (
                  <li>
                    <Link
                      href={routes.matrix}
                      className="block px-5 py-3 text-[12.5px] font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-sunk)]"
                    >
                      {actions.length - ACTION_LIMIT} more on the training matrix →
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          {/* Training under way */}
          <section className="card">
            <div className="flex items-baseline justify-between px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-[15px] font-semibold tracking-tight">Training under way</h2>
              <span className="text-[12px] text-[var(--ink-faint)] tabular">{training.length}</span>
            </div>
            {training.length === 0 ? (
              <Empty>No training in progress.</Empty>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {training.map((t) => (
                  <li key={t.sessionId}>
                    <Link
                      href={routes.competence(t.competenceId)}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-sunk)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">
                          {t.traineeName} <span className="text-[var(--ink-faint)]">on</span>{" "}
                          <span className="font-mono">{t.machineCode}</span>
                        </span>
                        <span className="block text-[12px] text-[var(--ink-soft)] mt-0.5">
                          Started {formatDate(t.startedOn)} · {t.entries} daily sign-off{t.entries === 1 ? "" : "s"}
                          {t.lastEntry ? ` · last ${formatDate(t.lastEntry)}` : ""}
                        </span>
                      </span>
                      <Progress value={t.lastRating ?? 0} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Coverage */}
        <section className="card">
          <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-[15px] font-semibold tracking-tight">Machine coverage</h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--ink-soft)]">
              How many people can run each machine unsupervised, and how many of those can train others.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <Th className="text-left pl-5">Machine</Th>
                  <Th className="text-left">Area</Th>
                  <Th>Competent</Th>
                  <Th>Trainers</Th>
                  <Th>In training</Th>
                  <Th>Needs action</Th>
                  <Th className="pr-5">Risk</Th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.machineId} className="border-b last:border-0 transition-colors hover:bg-[var(--surface-sunk)]" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 pl-5">
                      <Link href={routes.machine(c.machineId)} className="hover:underline">
                        <span className="font-mono font-semibold">{c.code}</span>
                        <span className="text-[var(--ink-soft)]"> {c.name}</span>
                      </Link>
                    </td>
                    <td className="py-2.5 text-[var(--ink-soft)]">{c.areaName}</td>
                    <Td tone={c.competent === 0 ? "bad" : c.competent === 1 ? "warn" : undefined}>{c.competent}</Td>
                    <Td tone={c.trainers === 0 ? "warn" : undefined}>{c.trainers}</Td>
                    <Td>{c.inTraining}</Td>
                    <Td tone={c.needsAction > 0 ? "warn" : undefined}>{c.needsAction}</Td>
                    <td className="py-2.5 pr-5 text-center">
                      {c.competent === 0 ? (
                        <Badge tone="bad">No cover</Badge>
                      ) : c.competent === 1 ? (
                        <Badge tone="bad">Single point</Badge>
                      ) : c.trainers === 0 ? (
                        <Badge tone="warn">No trainer</Badge>
                      ) : (
                        <Badge tone="good">Covered</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

/** Why this record is on the manager's list, in plain words. */
function describeAction(a: Awaited<ReturnType<typeof getActionList>>[number]): string {
  switch (a.reason) {
    case "SUSPENDED":
      return a.suspensionReason ?? "Suspended — not authorised to operate.";
    case "REVALIDATION": {
      const lapsed = daysUntil(a.expiresOn);
      return lapsed !== null && lapsed < 0
        ? `Lapsed ${formatDate(a.expiresOn)} — re-training required before operating unsupervised.`
        : "The procedure changed — re-training required before operating unsupervised.";
    }
    case "EXPIRING": {
      const days = daysUntil(a.expiresOn);
      return days !== null && days >= 0
        ? `Expires ${formatDate(a.expiresOn)} — ${days} day${days === 1 ? "" : "s"} left.`
        : `Expired ${formatDate(a.expiresOn)}.`;
    }
    case "ACKNOWLEDGEMENT":
      return "A revised procedure is waiting to be read and confirmed.";
    case "REVIEW_OVERDUE":
      return `Quarterly review overdue since ${formatDate(a.nextReviewDue)}.`;
  }
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`label py-2.5 font-semibold text-center ${className}`}>{children}</th>;
}

function Td({ children, tone }: { children: React.ReactNode; tone?: "warn" | "bad" }) {
  const color = tone === "bad" ? "var(--st-suspended-fg)" : tone === "warn" ? "var(--st-revalidate-fg)" : "var(--ink)";
  return <td className="py-2.5 text-center tabular font-medium" style={{ color }}>{children}</td>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" | "bad" }) {
  const map = {
    good: { bg: "var(--st-competent-bg)", fg: "var(--st-competent-fg)", br: "var(--st-competent-br)" },
    warn: { bg: "var(--st-revalidate-bg)", fg: "var(--st-revalidate-fg)", br: "var(--st-revalidate-br)" },
    bad:  { bg: "var(--st-suspended-bg)",  fg: "var(--st-suspended-fg)",  br: "var(--st-suspended-br)" },
  }[tone];
  return (
    <span
      className="inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: map.bg, color: map.fg, borderColor: map.br }}
    >
      {children}
    </span>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5 shrink-0" title={`Latest rating ${value} of 5`} aria-label={`Latest rating ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="h-4 w-1 rounded-full"
          style={{ background: n <= value ? "var(--st-training-fg)" : "var(--border-strong)" }}
        />
      ))}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">{children}</p>;
}
