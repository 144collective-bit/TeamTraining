"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { acknowledgeRevision } from "@/lib/document-commands";
import type { ActionState } from "@/lib/commands";
import { Banner } from "./sign-off-form";

export function AcknowledgeBanner({
  competenceId,
  documentId,
  reference,
  revision,
  changeSummary,
  personName,
  canConfirm,
}: {
  competenceId: string;
  documentId: string;
  reference: string;
  revision: number;
  changeSummary: string | null;
  personName: string;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(acknowledgeRevision, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  return (
    <div
      className="card px-4 py-3.5"
      style={{
        borderColor: "var(--st-training-br)",
        background: "var(--st-training-bg)",
        color: "var(--st-training-fg)",
      }}
    >
      <p className="text-[12px] font-bold uppercase tracking-wide">Change to read</p>
      <p className="mt-1 text-[13.5px]">
        <Link href={`/documents/${documentId}` as never} className="font-semibold underline">
          {reference} revision {revision}
        </Link>{" "}
        supersedes the version {personName} was trained on.
        {changeSummary && <> {changeSummary}</>}
      </p>
      <p className="mt-1 text-[12.5px] opacity-85">
        This is a minor change, so competence continues — but it has to be read and confirmed.
      </p>

      {state.error && <div className="mt-2"><Banner tone="bad">{state.error}</Banner></div>}

      {canConfirm ? (
        <form action={formAction} className="mt-2.5">
          <input type="hidden" name="competenceId" value={competenceId} />
          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Recording…" : "Confirm the change has been read"}
          </button>
        </form>
      ) : (
        <p className="mt-2 text-[12px] font-medium">
          {personName} needs to confirm this themselves.
        </p>
      )}
    </div>
  );
}
