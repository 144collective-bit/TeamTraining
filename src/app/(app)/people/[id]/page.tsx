import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getPerson } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { StatusPill } from "@/components/status-pill";
import { formatDate, formatDateTime, daysUntil, type Status, type Level } from "@/lib/competence";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getPerson(user.tenantId, id);
  if (!data) notFound();

  const { person, competences, induction, inductionItems } = data;
  const competent = competences.filter((c) => c.status === "COMPETENT");
  const inductionDone = inductionItems.filter((i) => i.completedAt).length;

  return (
    <>
      <PageHeader
        eyebrow={<span className="font-mono">{person.employeeRef}</span>}
        title={person.name}
        description={`${person.jobTitle ?? person.role} · Started ${formatDate(person.startedOn)}`}
        actions={<PrintButton label="Training record" />}
      />

      <div className="p-5 sm:p-7 space-y-6">
        {/* Induction */}
        {induction && (
          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-[15px] font-semibold tracking-tight">Induction</h2>
              <p className="text-[12.5px] text-[var(--ink-soft)]">
                {induction.completedAt
                  ? `Completed ${formatDateTime(induction.completedAt)}`
                  : `In progress · ${inductionDone} of ${inductionItems.length} complete`}
                {" · Trainer "}<span className="font-medium">{induction.trainerName}</span>
              </p>
            </div>
            <ol className="divide-y" style={{ borderColor: "var(--border)" }}>
              {inductionItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold"
                    style={
                      item.completedAt
                        ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)", borderColor: "var(--st-competent-br)" }
                        : { background: "var(--surface-sunk)", color: "var(--ink-faint)", borderColor: "var(--border-strong)" }
                    }
                    aria-hidden
                  >
                    {item.completedAt ? "✓" : ""}
                  </span>
                  <span className={`flex-1 text-[13.5px] ${item.completedAt ? "" : "text-[var(--ink-soft)]"}`}>
                    {item.label}
                  </span>
                  <span className="text-[11.5px] text-[var(--ink-faint)] tabular">
                    {item.completedAt ? formatDateTime(item.completedAt) : "Outstanding"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Competences */}
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-[15px] font-semibold tracking-tight">Machine competences</h2>
            <p className="text-[12.5px] text-[var(--ink-soft)] tabular">
              {competent.length} competent · {competences.length} records
            </p>
          </div>
          {competences.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
              No competence records yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {competences.map((c) => {
                const days = daysUntil(c.expiresOn);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/competence/${c.id}` as never}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-[var(--surface-sunk)]"
                    >
                      <span className="min-w-[12rem] flex-1">
                        <span className="block text-[13.5px] font-medium">
                          <span className="font-mono">{c.machineCode}</span> {c.machineName}
                        </span>
                        <span className="block text-[11.5px] text-[var(--ink-faint)]">
                          {c.areaName}{c.trainerName ? ` · Trained by ${c.trainerName}` : ""}
                        </span>
                      </span>
                      <StatusPill status={c.status as Status} level={c.level as Level} />
                      <span className="text-[12px] text-[var(--ink-soft)] tabular min-w-[10rem] text-right">
                        {c.status === "COMPETENT" && c.expiresOn ? (
                          <>
                            Expires {formatDate(c.expiresOn)}
                            {days !== null && days < 60 && (
                              <span className="block text-[11px] font-medium" style={{ color: "var(--st-revalidate-fg)" }}>
                                {days < 0 ? `${Math.abs(days)} days overdue` : `in ${days} days`}
                              </span>
                            )}
                          </>
                        ) : c.status === "COMPETENT" ? (
                          <>Competent {formatDate(c.competentFrom)}</>
                        ) : (
                          <span className="text-[var(--ink-faint)]">{c.suspensionReason ? "See record" : "—"}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
