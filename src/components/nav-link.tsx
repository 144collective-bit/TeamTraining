"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  grid: (
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="10.5" y="2.5" width="5" height="5" rx="1" />
      <rect x="2.5" y="10.5" width="5" height="5" rx="1" />
      <rect x="10.5" y="10.5" width="5" height="5" rx="1" />
    </>
  ),
  matrix: (
    <>
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.5" />
      <path d="M2.5 7h13M2.5 11.5h13M7 2.5v13" />
    </>
  ),
  people: (
    <>
      <circle cx="7" cy="6" r="2.75" />
      <path d="M2.5 15.5c0-2.5 2-4.25 4.5-4.25s4.5 1.75 4.5 4.25" />
      <path d="M12 3.75a2.75 2.75 0 0 1 0 4.5M13.5 15.5c0-1.6-.5-2.9-1.4-3.8" />
    </>
  ),
  machine: (
    <>
      <rect x="2.5" y="7.5" width="13" height="8" rx="1.5" />
      <path d="M5.5 7.5v-3h7v3M8 11h2" />
    </>
  ),
  check: (
    <>
      <path d="M6 3.5h6a1.5 1.5 0 0 1 1.5 1.5v9.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V5A1.5 1.5 0 0 1 6 3.5Z" />
      <path d="M6.5 9.5 8 11l3.5-3.5M6.5 2.5h5v2h-5z" />
    </>
  ),
  doc: (
    <>
      <path d="M4.5 2.5h6l3 3v10a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-12a.5.5 0 0 1 .5-.5Z" />
      <path d="M10.5 2.5v3.5h3M6.5 9.5h5M6.5 12h5" />
    </>
  ),
};

export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: keyof typeof ICONS | string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href as never}
      aria-current={active ? "page" : undefined}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors"
      style={{
        background: active ? "var(--rail-active)" : "transparent",
        color: active ? "#fff" : "var(--rail-ink)",
      }}
    >
      <svg
        width="17" height="17" viewBox="0 0 18 18" fill="none"
        stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round"
        className="shrink-0"
        style={{ opacity: active ? 1 : 0.75 }}
        aria-hidden
      >
        {ICONS[icon]}
      </svg>
      <span>{children}</span>
    </Link>
  );
}
