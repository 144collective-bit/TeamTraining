import Link from "next/link";
import type { Route } from "next";

/**
 * A section entrance for the home page.
 *
 * One number leads, a meter shows where that number sits against the whole,
 * and two or three smaller figures qualify it. Anything else belongs inside
 * the section, not on the door to it.
 */

/**
 * A whole split into its parts, one bar. Segments are separated by a 2px gap
 * of the surface colour so adjacent fills stay countable, and each carries a
 * label in the key beneath — never colour alone.
 */
export function Composition({
  parts,
}: {
  parts: { label: string; value: number; colour: string }[];
}) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (total === 0) return null;
  const shown = parts.filter((p) => p.value > 0);

  return (
    <div>
      <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full">
        {shown.map((p) => (
          <span
            key={p.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(p.value / total) * 100}%`, background: p.colour }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-faint)]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.colour }} aria-hidden />
            {p.value} {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Progress against a whole. The track is a faint step of the same hue. */
export function Meter({
  value,
  of,
  tone = "accent",
  label,
}: {
  value: number;
  of: number;
  tone?: "accent" | "good" | "warn";
  label: string;
}) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  const fill =
    tone === "good" ? "var(--st-competent-fg)"
    : tone === "warn" ? "var(--st-revalidate-fg)"
    : "var(--accent)";

  return (
    <div>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }}
        role="img"
        aria-label={`${label}: ${pct}%`}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
      </div>
      <p className="mt-1.5 text-[11.5px] text-[var(--ink-faint)]">{label}</p>
    </div>
  );
}

export function Door({
  href,
  icon,
  title,
  purpose,
  value,
  unit,
  tone = "accent",
  meter,
  visual,
  readouts,
}: {
  href: Route;
  icon: React.ReactNode;
  title: string;
  purpose: string;
  value: number | string;
  unit: string;
  tone?: "accent" | "good" | "warn";
  meter?: { value: number; of: number; label: string };
  visual?: React.ReactNode;
  readouts: { label: string; value: number; tone?: "plain" | "warn" | "bad" }[];
}) {
  const valueColour =
    tone === "good" ? "var(--st-competent-fg)"
    : tone === "warn" ? "var(--st-revalidate-fg)"
    : "var(--ink)";

  return (
    <Link
      href={href}
      className="card block p-6 transition-shadow hover:shadow-[0_2px_16px_rgb(0_0_0/0.08)] focus-visible:outline focus-visible:outline-2"
      style={{ outlineColor: "var(--accent)" }}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
          style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)", color: "var(--accent)" }}
          aria-hidden
        >
          {icon}
        </span>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">{purpose}</p>

      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-[40px] font-semibold leading-none" style={{ color: valueColour }}>
          {value}
        </span>
        <span className="text-[13px] text-[var(--ink-soft)]">{unit}</span>
      </p>

      {meter && (
        <div className="mt-4">
          <Meter value={meter.value} of={meter.of} tone={tone} label={meter.label} />
        </div>
      )}
      {visual && <div className="mt-4">{visual}</div>}

      <dl className="mt-5 pt-4 border-t grid grid-cols-3 gap-3" style={{ borderColor: "var(--border)" }}>
        {readouts.map((r) => (
          <div key={r.label}>
            <dd
              className="text-[19px] font-semibold leading-none tabular"
              style={{
                color:
                  r.value === 0 ? "var(--ink-faint)"
                  : r.tone === "bad" ? "var(--st-suspended-fg)"
                  : r.tone === "warn" ? "var(--st-revalidate-fg)"
                  : "var(--ink)",
              }}
            >
              {r.value}
            </dd>
            <dt className="mt-1 text-[11.5px] leading-snug text-[var(--ink-faint)]">{r.label}</dt>
          </div>
        ))}
      </dl>
    </Link>
  );
}
