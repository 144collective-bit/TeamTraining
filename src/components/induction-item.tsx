"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toggleInductionItem, type ActionState } from "@/lib/commands";
import { formatDateTime } from "@/lib/competence";

export function InductionItem({
  id,
  label,
  completedAt,
  canEdit,
}: {
  id: string;
  label: string;
  completedAt: Date | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(toggleInductionItem, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  const done = Boolean(completedAt);

  const mark = (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold"
      style={
        done
          ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)", borderColor: "var(--st-competent-br)" }
          : { background: "var(--surface-sunk)", color: "var(--ink-faint)", borderColor: "var(--border-strong)" }
      }
      aria-hidden
    >
      {done ? "✓" : ""}
    </span>
  );

  const body = (
    <>
      {mark}
      <span className={`flex-1 text-left text-[13.5px] ${done ? "" : "text-[var(--ink-soft)]"}`}>
        {label}
      </span>
      <span className="text-[11.5px] text-[var(--ink-faint)] tabular shrink-0">
        {done ? formatDateTime(completedAt) : "Outstanding"}
      </span>
    </>
  );

  if (!canEdit) {
    return <li className="flex items-center gap-3 px-5 py-2.5">{body}</li>;
  }

  return (
    <li>
      <form action={formAction}>
        <input type="hidden" name="itemId" value={id} />
        <button
          type="submit"
          disabled={pending}
          aria-pressed={done}
          className="flex w-full items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--surface-sunk)] disabled:opacity-60"
        >
          {body}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="px-5 pb-2 text-[12px]" style={{ color: "var(--st-suspended-fg)" }}>
          {state.error}
        </p>
      )}
    </li>
  );
}
