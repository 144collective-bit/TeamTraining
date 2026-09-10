import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCoverage } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function MachinesPage() {
  const user = await requireUser();
  const coverage = await getCoverage(user.tenantId);

  const byArea = coverage.reduce<Record<string, typeof coverage>>((acc, m) => {
    (acc[m.areaName] ??= []).push(m);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Machines"
        description="Every machine on the shop floor, its controlled documents and who can run it."
      />
      <div className="p-5 sm:p-7 space-y-7">
        {Object.entries(byArea).map(([areaName, machines]) => (
          <section key={areaName}>
            <h2 className="label mb-2.5">{areaName}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {machines.map((m) => {
                const risk = m.competent === 0 ? "bad" : m.competent === 1 ? "warn" : m.trainers === 0 ? "warn" : "good";
                return (
                  <Link
                    key={m.machineId}
                    href={`/machines/${m.machineId}` as never}
                    className="card card-pad transition-colors hover:bg-[var(--surface-sunk)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[15px] font-bold">{m.code}</p>
                        <p className="text-[13px] text-[var(--ink-soft)] truncate">{m.name}</p>
                      </div>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full mt-1.5"
                        style={{
                          background:
                            risk === "bad" ? "var(--st-suspended-fg)"
                            : risk === "warn" ? "var(--st-revalidate-fg)"
                            : "var(--st-competent-fg)",
                        }}
                        title={risk === "bad" ? "No competent operators" : risk === "warn" ? "Thin cover" : "Covered"}
                      />
                    </div>
                    <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                      <Metric label="Competent" value={m.competent} tone={m.competent <= 1 ? "warn" : undefined} />
                      <Metric label="Trainers" value={m.trainers} tone={m.trainers === 0 ? "warn" : undefined} />
                      <Metric label="Training" value={m.inTraining} />
                    </dl>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div>
      <dt className="label text-[10px]">{label}</dt>
      <dd
        className="mt-0.5 text-[17px] font-semibold tabular"
        style={{ color: tone === "warn" ? "var(--st-revalidate-fg)" : "var(--ink)" }}
      >
        {value}
      </dd>
    </div>
  );
}
