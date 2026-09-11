import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { atLeast } from "@/lib/state-machine";
import { DocumentEditor } from "@/components/document-editor";
import { getDraftRevision } from "@/lib/queries";
import { DOC_KIND_META } from "@/lib/competence";
import { readSop, readRa, readTraining, readInduction, type DocumentKind } from "@/lib/documents";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function EditRevisionPage({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const { id, revisionId } = await params;
  const user = await requireUser();
  if (!atLeast(user.role, "MANAGER")) redirect(routes.document(id));

  const row = await getDraftRevision(user.tenantId, id, revisionId);

  if (!row) notFound();
  // A published revision is frozen; there is nothing to edit.
  if (row.status !== "DRAFT") redirect(routes.document(id));

  const kind = row.kind as DocumentKind;

  return (
    <div className="p-5 sm:p-7 max-w-5xl">
      <Link
        href={routes.document(id)}
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-soft)] hover:underline"
      >
        <span aria-hidden>←</span> {row.reference}
      </Link>

      <header className="mt-3 mb-5">
        <p className="label">
          {DOC_KIND_META[kind]?.label} · Draft revision {row.revision}
        </p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight leading-tight">
          {row.title || "Untitled document"}
        </h1>
      </header>

      <DocumentEditor
        meta={{
          documentId: row.documentId,
          revisionId: row.revisionId,
          reference: row.reference,
          revision: row.revision,
          kind,
          machineCode: row.machineCode,
          isFirstIssue: row.revision === 1,
        }}
        initialTitle={row.title}
        initialBody={
          kind === "SOP" ? readSop(row.body)
          : kind === "RISK_ASSESSMENT" ? readRa(row.body)
          : kind === "TRAINING_DOC" ? readTraining(row.body)
          : readInduction(row.body)
        }
        initialSummary={row.changeSummary ?? ""}
      />
    </div>
  );
}
