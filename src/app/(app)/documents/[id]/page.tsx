import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getDocument } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { formatDate, formatDateTime, DOC_KIND_META, CHANGE_CLASS_META } from "@/lib/competence";

export const dynamic = "force-dynamic";

type SopBody = {
  purpose?: string;
  ppe?: string[];
  hazards?: string[];
  steps?: { step: string; keyPoints: string[]; reasons: string[] }[];
};

type RaBody = {
  scope?: string;
  assessedBy?: string;
  hazards?: {
    hazard: string; whoAtRisk: string; existingControls: string[];
    riskRating: string; furtherAction: string;
  }[];
};

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getDocument(user.tenantId, id);
  if (!data) notFound();

  const { doc, revisions } = data;
  const current = revisions.find((r) => r.status === "PUBLISHED") ?? revisions[0];
  const body = current?.body as SopBody & RaBody;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <span className="font-mono">{doc.reference}</span>
            {" · "}{DOC_KIND_META[doc.kind]?.label ?? doc.kind}
            {doc.machineId && (
              <> · <Link href={`/machines/${doc.machineId}` as never} className="hover:underline">{doc.machineCode}</Link></>
            )}
          </>
        }
        title={doc.title}
        description={current ? `Revision ${current.revision} · Published ${formatDate(current.publishedAt)} · Owner ${doc.ownerName ?? "—"}` : undefined}
        actions={<PrintButton />}
      />

      <div className="p-5 sm:p-7 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <article className="space-y-6 min-w-0">
          {body?.purpose && (
            <Section title="Purpose"><p className="text-[13.5px] leading-relaxed">{body.purpose}</p></Section>
          )}
          {body?.scope && (
            <Section title="Scope"><p className="text-[13.5px] leading-relaxed">{body.scope}</p></Section>
          )}

          {body?.ppe && body.ppe.length > 0 && (
            <Section title="PPE required">
              <ul className="flex flex-wrap gap-1.5">
                {body.ppe.map((p) => (
                  <li key={p} className="rounded-full border px-2.5 py-1 text-[12px] font-medium"
                      style={{ borderColor: "var(--border-strong)", background: "var(--surface-sunk)" }}>
                    {p}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* SOP: TWI Job Instruction breakdown */}
          {body?.steps && body.steps.length > 0 && (
            <Section
              title="Job instruction breakdown"
              hint="Important steps, the key points that make each one work, and why they matter — the structure a trainer teaches from."
            >
              <ol className="space-y-3">
                {body.steps.map((s, i) => (
                  <li key={i} className="rounded-lg border p-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-sunk)" }}>
                    <div className="flex items-baseline gap-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular"
                            style={{ background: "var(--accent)", color: "#fff" }}>
                        {i + 1}
                      </span>
                      <h4 className="text-[14px] font-semibold">{s.step}</h4>
                    </div>
                    <div className="mt-2.5 grid gap-3 sm:grid-cols-2 pl-7.5">
                      <div>
                        <p className="label mb-1">Key points</p>
                        <ul className="space-y-0.5 text-[12.5px]">
                          {s.keyPoints.map((k, n) => (
                            <li key={n} className="flex gap-1.5">
                              <span style={{ color: "var(--accent)" }} aria-hidden>▸</span>{k}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="label mb-1">Reasons</p>
                        <ul className="space-y-0.5 text-[12.5px] text-[var(--ink-soft)]">
                          {s.reasons.map((r, n) => <li key={n}>{r}</li>)}
                        </ul>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* Risk assessment hazard table */}
          {body?.hazards && typeof body.hazards[0] === "object" && (
            <Section title="Hazards and controls">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <th className="label py-2 text-left font-semibold">Hazard</th>
                      <th className="label py-2 text-left font-semibold">Who is at risk</th>
                      <th className="label py-2 text-left font-semibold">Existing controls</th>
                      <th className="label py-2 text-left font-semibold">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(body.hazards as RaBody["hazards"])!.map((h, i) => (
                      <tr key={i} className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2.5 pr-3 font-medium">{h.hazard}</td>
                        <td className="py-2.5 pr-3 text-[var(--ink-soft)]">{h.whoAtRisk}</td>
                        <td className="py-2.5 pr-3">
                          <ul className="space-y-0.5 text-[var(--ink-soft)]">
                            {h.existingControls.map((c, n) => <li key={n}>· {c}</li>)}
                          </ul>
                        </td>
                        <td className="py-2.5">
                          <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: "var(--st-training-bg)", color: "var(--st-training-fg)", borderColor: "var(--st-training-br)" }}>
                            {h.riskRating}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Plain hazard list on SOPs */}
          {body?.hazards && typeof body.hazards[0] === "string" && (
            <Section title="Hazards">
              <ul className="flex flex-wrap gap-1.5">
                {(body.hazards as string[]).map((h) => (
                  <li key={h} className="rounded-full border px-2.5 py-1 text-[12px]"
                      style={{ background: "var(--st-suspended-bg)", color: "var(--st-suspended-fg)", borderColor: "var(--st-suspended-br)" }}>
                    {h}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </article>

        {/* Revision history */}
        <aside className="space-y-6">
          <section className="card">
            <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-[15px] font-semibold tracking-tight">Revision history</h2>
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {revisions.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-bold">Rev {r.revision}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={
                        r.status === "PUBLISHED"
                          ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)" }
                          : { background: "var(--surface-sunk)", color: "var(--ink-faint)" }
                      }
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.changeSummary && (
                    <p className="mt-1.5 text-[12.5px] text-[var(--ink-soft)]">{r.changeSummary}</p>
                  )}
                  <p className="mt-1.5 text-[11.5px] text-[var(--ink-faint)]">
                    {CHANGE_CLASS_META[r.changeClass]?.label} — {CHANGE_CLASS_META[r.changeClass]?.effect}
                  </p>
                  <dl className="mt-2 space-y-0.5 text-[11.5px] text-[var(--ink-faint)]">
                    <div>Written by {r.authorName ?? "—"}</div>
                    <div>Approved by {r.approverName ?? "—"}</div>
                    <div className="tabular">Published {formatDate(r.publishedAt)}</div>
                  </dl>
                  <p className="mt-2 font-mono text-[10px] text-[var(--ink-faint)] break-all" title="SHA-256 of the revision content">
                    {r.contentHash.slice(0, 32)}…
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-[11.5px] leading-relaxed text-[var(--ink-faint)] px-1">
            Published revisions cannot be edited or deleted — the database rejects the attempt.
            Changing this document creates a new revision, and anyone signed off against the old
            one is flagged according to the change classification.
          </p>
        </aside>
      </div>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card card-pad">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      {hint && <p className="mt-0.5 mb-3 text-[12.5px] text-[var(--ink-soft)]">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
