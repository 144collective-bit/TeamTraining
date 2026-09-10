import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getMachine } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { formatDate, DOC_KIND_META, type Status, type Level } from "@/lib/competence";

export const dynamic = "force-dynamic";

export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getMachine(user.tenantId, id);
  if (!data) notFound();

  const { machine, people, documents } = data;
  const competent = people.filter((p) => p.status === "COMPETENT");
  const trainers = competent.filter((p) => p.level === "TRAINER");

  return (
    <>
      <PageHeader
        eyebrow={<><span className="font-mono">{machine.code}</span> · {machine.areaName}</>}
        title={machine.name}
        description={[machine.manufacturer, machine.model].filter(Boolean).join(" ") || undefined}
      />

      <div className="p-5 sm:p-7 space-y-6">
        {competent.length <= 1 && (
          <div
            className="card px-4 py-3 text-[13.5px] font-medium"
            style={{ borderColor: "var(--st-suspended-br)", background: "var(--st-suspended-bg)", color: "var(--st-suspended-fg)" }}
          >
            {competent.length === 0
              ? "No one is currently signed off to operate this machine."
              : `Only ${competent[0].userName} is signed off on this machine. If they are absent, it stops.`}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          {/* Authorised operators */}
          <section className="card order-2 lg:order-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-[15px] font-semibold tracking-tight">Operators</h2>
              <p className="text-[12.5px] text-[var(--ink-soft)] tabular">
                {competent.length} competent · {trainers.length} can train
              </p>
            </div>
            {people.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
                No training records for this machine yet.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {people.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/competence/${p.id}` as never}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-[var(--surface-sunk)]"
                    >
                      <span className="min-w-[10rem] flex-1">
                        <span className="block text-[13.5px] font-medium">{p.userName}</span>
                        <span className="block text-[11.5px] text-[var(--ink-faint)]">{p.jobTitle}</span>
                      </span>
                      <StatusPill status={p.status as Status} level={p.level as Level} />
                      <span className="text-[12px] text-[var(--ink-soft)] tabular min-w-[8rem] text-right">
                        {p.expiresOn ? `Expires ${formatDate(p.expiresOn)}` : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sidebar */}
          <div className="order-1 lg:order-2 space-y-6">
            <section className="card">
              <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-[15px] font-semibold tracking-tight">Controlled documents</h2>
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documents/${d.id}` as never} className="block px-5 py-3 transition-colors hover:bg-[var(--surface-sunk)]">
                      <span className="flex items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                          style={{ background: "var(--surface-sunk)", color: "var(--ink-soft)" }}
                        >
                          {DOC_KIND_META[d.kind]?.abbr ?? d.kind}
                        </span>
                        <span className="font-mono text-[12.5px] font-semibold">{d.reference}</span>
                        {d.revision != null && (
                          <span className="ml-auto text-[11.5px] text-[var(--ink-faint)] tabular">Rev {d.revision}</span>
                        )}
                      </span>
                      <span className="mt-1 block text-[12.5px] text-[var(--ink-soft)]">{d.title}</span>
                    </Link>
                  </li>
                ))}
                {documents.length === 0 && (
                  <li className="px-5 py-6 text-center text-[12.5px] text-[var(--ink-faint)]">
                    No documents linked yet.
                  </li>
                )}
              </ul>
            </section>

            <section className="card card-pad">
              <h2 className="label mb-3">Asset details</h2>
              <dl className="space-y-2 text-[13px]">
                <Row label="Code">{machine.code}</Row>
                <Row label="Area">{machine.areaName}</Row>
                <Row label="Manufacturer">{machine.manufacturer ?? "—"}</Row>
                <Row label="Model">{machine.model ?? "—"}</Row>
                <Row label="Asset ref">{machine.assetRef ?? "—"}</Row>
                <Row label="Risk">{machine.highRisk ? "High risk" : "Standard"}</Row>
                <Row label="Revalidation">
                  {machine.revalidationMonths ? `Every ${machine.revalidationMonths} months` : "No expiry"}
                </Row>
              </dl>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--ink-faint)]">{label}</dt>
      <dd className="font-medium text-right">{children}</dd>
    </div>
  );
}
