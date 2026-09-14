import Link from "next/link";
import type { Route } from "next";
import { SectionMark, SECTION_COLOUR, type Section } from "./section-mark";

/**
 * A way in to one of the three sections.
 *
 * One number, one sentence, one bar. Everything else belongs on the far side
 * of the door — the job of this card is to say what is behind it and whether
 * it needs you today, not to report.
 */
export function Gateway({
  href,
  section,
  title,
  purpose,
  value,
  unit,
  bar,
  status,
}: {
  href: Route;
  section: Section;
  title: string;
  purpose: string;
  value: number | string;
  unit: string;
  /** Proportion complete, 0–1. Omitted when the section has nothing to fill. */
  bar?: number;
  status: string;
}) {
  const colour = SECTION_COLOUR[section];
  const pct = bar === undefined ? null : Math.round(Math.min(1, Math.max(0, bar)) * 100);

  return (
    <Link
      href={href}
      className="card group relative flex min-h-[21rem] flex-col overflow-hidden p-7 transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_28px_rgb(0_0_0/0.09)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ outlineColor: colour }}
    >
      {/* A stripe of the section's colour, so the three read as three places. */}
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: colour }} aria-hidden />

      <SectionMark section={section} size={56} />

      <h2 className="mt-6 text-[20px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-soft)]">{purpose}</p>

      <div className="mt-auto pt-7">
        <p className="flex items-baseline gap-2">
          <span className="text-[44px] font-semibold leading-none" style={{ color: colour }}>
            {value}
          </span>
          <span className="text-[13px] text-[var(--ink-soft)]">{unit}</span>
        </p>

        {/*
          The space is kept whether or not there is a bar, so the three cards'
          footers sit on one line. A card that happens to have no proportion to
          show should not ride half a centimetre higher than its neighbours.
        */}
        {pct === null ? (
          <div className="mt-4 h-1.5" aria-hidden />
        ) : (
          <div
            className="mt-4 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }}
            role="img"
            aria-label={`${pct}%`}
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
          </div>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-[var(--ink-faint)]">
          {status}
          <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
        </p>
      </div>
    </Link>
  );
}
