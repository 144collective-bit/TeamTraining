/**
 * The product mark, used only where no organisation is known yet — sign-in and
 * first-run setup. Everywhere inside the app shows the customer's own mark
 * instead; a shop floor should see their company at the top of a controlled
 * document, not their software vendor.
 */
export function Wordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
        <rect width="26" height="26" rx="6" fill="var(--accent)" />
        <path
          d="M7 13.4 11 17.2 19 9"
          stroke="#fff" strokeWidth="2.6"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
      <span
        className="text-[15px] font-semibold tracking-tight"
        style={{ color: onDark ? "#fff" : "var(--ink)" }}
      >
        Training &amp; Competence
      </span>
    </div>
  );
}
