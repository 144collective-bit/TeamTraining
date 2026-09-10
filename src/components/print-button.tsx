"use client";

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor"
strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 7V2.5h8V7M5 13.5H3.5A1.5 1.5 0 0 1 2 12V8.5A1.5 1.5 0 0 1 3.5 7h11A1.5 1.5 0 0 1 16 8.5V12a1.5 1.5 0 0 1-1.5 1.5H13M5 11h8v4.5H5V11Z" />
      </svg>
      {label}
    </button>
  );
}
