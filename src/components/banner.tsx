/**
 * Inline outcome message for a form. Announced to assistive technology via
 * role="status", so a sign-off confirmation is not silent for a screen reader.
 */
export function Banner({
  tone,
  children,
}: {
  tone: "good" | "bad";
  children: React.ReactNode;
}) {
  const style =
    tone === "good"
      ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)", borderColor: "var(--st-competent-br)" }
      : { background: "var(--st-suspended-bg)", color: "var(--st-suspended-fg)", borderColor: "var(--st-suspended-br)" };

  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-md border px-3 py-2 text-[13px] font-medium"
      style={style}
    >
      {children}
    </p>
  );
}
