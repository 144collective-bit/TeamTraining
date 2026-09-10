import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getDocument } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { SopDocument } from "@/components/sop-document";
import { RaDocument } from "@/components/ra-document";
import { ReviseButton } from "@/components/revise-button";
import { readSop, readRa } from "@/lib/documents";
import { atLeast } from "@/lib/state-machine";
import { formatDate, DOC_KIND_META, CHANGE_CLASS_META } from "@/lib/competence";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getDocument(user.tenantId, id);
  if (!data) notFound();

  const { doc, revisions } = data;
  const canEdit = atLeast(user.role, "MANAGER");
  const isSop = doc.kind === "SOP";

  const published = revisions.find((r) => r.status === "PUBLISHED");
  const draft = revisions.find((r) => r.status === "DRAFT");
  const shown = published ?? draft ?? revisions[0];

  const meta = {
    title: doc.title,
    reference: doc.reference,
    revision: shown?.revision ?? 0,
    issuedOn: shown?.publishedAt ?? null,
    machineCode: doc.machineCode,
    status: shown?.status,
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <span className="font-mono">{doc.reference}</span>
            {" · "}{DOC_KIND_META[doc.kind]?.label ?? doc.kind}
            {doc.machineId && (
              <> · <Link href={routes.machine(doc.machineId)} className="hover:underline">{doc.machineCode}</Link></>
            )}
          </>
        }
        title={doc.title}
        description={
          published
            ? `Revision ${published.revision} in force · Published ${formatDate(published.publishedAt)} · Owner ${doc.ownerName ?? "—"}`
            : "Not yet published — this document is not in force."
        }
        actions={
          <>
            {canEdit && <ReviseButton documentId={doc.id} hasDraft={Boolean(draft)} draftId={draft?.id ?? null} />}
            <PrintButton />
          </>
        }
      />

      <div className="p-5 sm:p-7 grid gap-6 lg:grid-cols-[1fr_19rem] items-start">
        <div className="min-w-0 space-y-4">
          {draft && published && (
            <div
              className="card px-4 py-3 text-[13px] no-print"
              style={{ borderColor: "var(--st-training-br)", background: "var(--st-training-bg)", color: "var(--st-training-fg)" }}
            >
              <span className="font-semibold">Draft revision {draft.revision} is in progress.</span>{" "}
              Revision {published.revision} below remains in force until it is published.
              {canEdit && (
                <>
                  {" "}
                  <Link href={routes.editRevision(doc.id, draft.id)} className="font-medium underline">
                    Continue editing
                  </Link>
                </>
              )}
            </div>
          )}

          {shown ? (
            isSop
              ? <SopDocument body={readSop(shown.body)} meta={meta} draft={shown.status === "DRAFT"} />
              : <RaDocument body={readRa(shown.body)} meta={meta} draft={shown.status === "DRAFT"} />
          ) : (
            <p className="card card-pad text-center text-[13px] text-[var(--ink-faint)]">
              This document has no revisions yet.
            </p>
          )}
        </div>

        <aside className="space-y-6 no-print">
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
                          : r.status === "DRAFT"
                            ? { background: "var(--st-training-bg)", color: "var(--st-training-fg)" }
                            : { background: "var(--surface-sunk)", color: "var(--ink-faint)" }
                      }
                    >
                      {r.status}
                    </span>
                    {r.status === "DRAFT" && canEdit && (
                      <Link href={routes.editRevision(doc.id, r.id)}
                            className="ml-auto text-[11.5px] font-medium underline">
                        Edit
                      </Link>
                    )}
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
                    <div className="tabular">
                      {r.publishedAt ? `Published ${formatDate(r.publishedAt)}` : "Not published"}
                    </div>
                  </dl>
                  {r.status !== "DRAFT" && (
                    <p className="mt-2 font-mono text-[10px] text-[var(--ink-faint)] break-all"
                       title="SHA-256 of the revision content, photographs included">
                      {r.contentHash.slice(0, 32)}…
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <p className="text-[11.5px] leading-relaxed text-[var(--ink-faint)] px-1">
            Published revisions cannot be edited or deleted — the database rejects the attempt.
            Revising this document creates a new revision, and anyone signed off against the old
            one is flagged according to the change classification.
          </p>
        </aside>
      </div>
    </>
  );
}
