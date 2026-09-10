import Link from "next/link";

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  href?: string;
}) {
  const toneStyle =
    tone === "good" ? { color: "var(--st-competent-fg)" }
    : tone === "warn" ? { color: "var(--st-revalidate-fg)" }
    : tone === "bad"  ? { color: "var(--st-suspended-fg)" }
    : { color: "var(--ink)" };

  const inner = (
    <>
      <p className="label">{label}</p>
      <p className="mt-1.5 text-[28px] font-semibold leading-none tabular" style={toneStyle}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[12px] text-[var(--ink-faint)]">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href as never} className="card card-pad block transition-colors hover:bg-[var(--surface-sunk)]">
        {inner}
      </Link>
    );
  }
  return <div className="card card-pad">{inner}</div>;
}
