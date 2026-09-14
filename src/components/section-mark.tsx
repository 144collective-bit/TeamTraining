/**
 * The three sections' emblems.
 *
 * Each is a drawing of what the section is for, not a generic glyph: a figure
 * stepping through a doorway, a grid with one cell proven, a loop that climbs.
 * Colour is identity here rather than status, so every mark appears beside the
 * section's name — the colour is never the only thing carrying it.
 */

export type Section = "induction" | "training" | "improve";

export const SECTION_COLOUR: Record<Section, string> = {
  induction: "var(--sec-induction)",
  training: "var(--sec-training)",
  improve: "var(--sec-improve)",
};

const ART: Record<Section, React.ReactNode> = {
  // A doorway, and someone coming through it onto the floor.
  induction: (
    <>
      <path
        d="M9 27V13.5a7 7 0 0 1 14 0V27"
        fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="16" cy="13.4" r="3" fill="currentColor" />
      <path
        d="M11.4 27c0-2.9 2-4.7 4.6-4.7s4.6 1.8 4.6 4.7"
        fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"
      />
    </>
  ),
  // A matrix, with one cell signed off.
  training: (
    <>
      <rect x="5.5" y="5.5" width="21" height="21" rx="3.5" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <path d="M5.5 12.5h21M12.5 5.5v21" stroke="currentColor" strokeWidth="2" opacity="0.45" />
      <path d="M15.6 20.4l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // A loop that comes back round higher than it started.
  improve: (
    <>
      <path
        d="M24.8 12.6A9.6 9.6 0 1 0 25.6 20"
        fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"
        opacity="0.45"
      />
      <path d="M19.4 11.9h5.8V6.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
      <path d="M11.6 19.4l3.3-3.6 2.3 2.1 3.6-4.3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function SectionMark({
  section,
  size = 44,
}: {
  section: Section;
  size?: number;
}) {
  const colour = SECTION_COLOUR[section];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-2xl"
      style={{
        width: size, height: size,
        background: `color-mix(in srgb, ${colour} 12%, transparent)`,
        color: colour,
      }}
      aria-hidden
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 32 32" fill="none">
        {ART[section]}
      </svg>
    </span>
  );
}
