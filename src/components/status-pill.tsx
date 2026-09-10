import { STATUS_META, LEVEL_META, type Status, type Level } from "@/lib/competence";

export function StatusPill({ status, level }: { status: Status; level?: Level }) {
  const meta = STATUS_META[status];
  const isTrainer = status === "COMPETENT" && level === "TRAINER";
  return (
    <span
      className={`chip st-${status}${isTrainer ? " is-trainer" : ""} inline-flex !w-auto !h-auto !flex-row !gap-1.5 rounded-full px-2.5 py-1 text-[12px] !cursor-default hover:!transform-none hover:!shadow-none`}
    >
      <span aria-hidden>{meta.glyph}</span>
      <span className="font-semibold">{meta.label}</span>
      {level && level !== "NONE" && (
        <span className="opacity-70 font-medium">· {LEVEL_META[level].label}</span>
      )}
    </span>
  );
}
