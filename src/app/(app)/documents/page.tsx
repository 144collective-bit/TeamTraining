import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getDocuments } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { formatDate, daysUntil, DOC_KIND_META } from "@/lib/competence";
import { atLeast } from "@/lib/state-machine";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await requireUser();
  const docs = await getDocuments(user.tenantId);
  const canEdit = atLeast(user.role, "MANAGER");

  const groups = docs.reduce<Record<string, typeof docs>>((acc, d) => {
    (acc[d.kind] ??= []).push(d);
    return acc;
  }, {});

  const order = ["SOP", "RISK_ASSESSMENT", "TRAINING_DOC", "COSHH", "OTHER"];

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Controlled documents"
        description="Standard operating procedures and risk assessments. Every revision is frozen once published, so a training record always points at exactly what was read."
        actions={
          canEdit ? (
            <Link href="/documents/new" className="btn btn-primary">New document</Link>
          ) : null
        }
      />
      <div className="p-5 sm:p-7 space-y-7">
        {order.filter((k) => groups[k]?.length).map((kind) => (
          <section key={kind}>
            <h2 className="label mb-2.5">
              {DOC_KIND_META[kind]?.label ?? kind}
              <span className="ml-2 text-[var(--ink-faint)] tabular">{groups[kind].length}</span>
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="label py-3 pl-5 text-left font-semibold">Reference</th>
                    <th className="label py-3 text-left font-semibold">Title</th>
                    <th className="label py-3 text-left font-semibold">Machine</th>
                    <th className="label py-3 text-center font-semibold">Rev</th>
                    <th className="label py-3 text-left font-semibold">Published</th>
                    <th className="label py-3 pr-5 text-left font-semibold">Next review</th>
                  </tr>
                </thead>
                <tbody>
                  {groups[kind].map((d) => {
                    const due = daysUntil(d.nextReviewOn);
                    return (
                      <tr key={d.id} className="border-b last:border-0 transition-colors hover:bg-[var(--surface-sunk)]" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2.5 pl-5">
                          <Link href={routes.document(d.id)} className="font-mono font-semibold hover:underline">
                            {d.reference}
                          </Link>
                        </td>
                        <td className="py-2.5 text-[var(--ink-soft)]">{d.title}</td>
                        <td className="py-2.5">
                          {d.machineId ? (
                            <Link href={routes.machine(d.machineId)} className="font-mono text-[12px] hover:underline">
                              {d.machineCode}
                            </Link>
                          ) : (
                            <span className="text-[var(--ink-faint)]">Site-wide</span>
                          )}
                        </td>
                        <td className="py-2.5 text-center tabular font-medium">
                          {d.revision ?? <span className="text-[var(--ink-faint)]">Draft</span>}
                        </td>
                        <td className="py-2.5 text-[var(--ink-soft)] tabular">{formatDate(d.publishedAt)}</td>
                        <td className="py-2.5 pr-5 tabular">
                          <span style={{ color: due !== null && due < 60 ? "var(--st-revalidate-fg)" : "var(--ink-soft)" }}>
                            {formatDate(d.nextReviewOn)}
                            {due !== null && due < 0 && <span className="ml-1.5 font-medium">overdue</span>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
