import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getTrainingOptions } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";
import { NewDocumentForm } from "@/components/new-document-form";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; machine?: string }>;
}) {
  const user = await requireUser();
  if (!atLeast(user.role, "MANAGER")) redirect("/documents");

  const { kind, machine } = await searchParams;
  const { machines } = await getTrainingOptions(user.tenantId);

  return (
    <div className="p-5 sm:p-7 max-w-xl">
      <Link href="/documents" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--ink-soft)] hover:underline">
        <span aria-hidden>←</span> Documents
      </Link>

      <header className="mt-3 mb-5">
        <h1 className="text-[24px] font-semibold tracking-tight">New controlled document</h1>
        <p className="mt-1 text-[13.5px] text-[var(--ink-soft)]">
          This creates a draft. Nothing is in force until you publish it.
        </p>
      </header>

      <NewDocumentForm
        machines={machines}
        defaultKind={kind === "RISK_ASSESSMENT" ? "RISK_ASSESSMENT" : "SOP"}
        defaultMachineId={machine ?? ""}
      />
    </div>
  );
}
