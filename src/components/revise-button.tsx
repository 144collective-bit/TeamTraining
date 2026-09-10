"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createDraftRevision } from "@/lib/document-commands";
import type { ActionState } from "@/lib/commands";
import { routes } from "@/lib/routes";

export function ReviseButton({
  documentId,
  hasDraft,
  draftId,
}: {
  documentId: string;
  hasDraft: boolean;
  draftId: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createDraftRevision, {});

  if (hasDraft && draftId) {
    return (
      <Link href={routes.editRevision(documentId, draftId)} className="btn">
        Continue draft
      </Link>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="documentId" value={documentId} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Creating…" : "Revise"}
      </button>
      {state.error && (
        <span role="alert" className="ml-2 text-[12px]" style={{ color: "var(--st-suspended-fg)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
