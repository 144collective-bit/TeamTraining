import Link from "next/link";
import { requireUser } from "@/lib/session";
import { logout } from "@/lib/actions";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Navigation rail */}
      <aside
        className="no-print flex lg:flex-col lg:h-screen lg:sticky lg:top-0 overflow-x-auto lg:overflow-visible"
        style={{ background: "var(--rail)", color: "var(--rail-ink)" }}
      >
        <div className="flex items-center gap-2.5 px-4 h-14 lg:h-16 shrink-0 lg:border-b" style={{ borderColor: "#ffffff14" }}>
          <div
            className="grid h-7 w-7 place-items-center rounded-md text-[13px] font-bold text-white shrink-0"
            style={{ background: "var(--accent)" }}
            aria-hidden
          >
            P
          </div>
          <span className="text-[14px] font-semibold tracking-tight text-white whitespace-nowrap">
            Protektor
          </span>
        </div>

        <nav className="flex lg:flex-col gap-0.5 p-2 lg:p-2.5 lg:flex-1 lg:overflow-y-auto">
          <p className="hidden lg:block label px-2.5 pt-2 pb-1.5" style={{ color: "var(--rail-ink-soft)" }}>
            Shop floor
          </p>
          <NavLink href="/dashboard" icon="grid">Dashboard</NavLink>
          <NavLink href="/matrix" icon="matrix">Training matrix</NavLink>

          <p className="hidden lg:block label px-2.5 pt-4 pb-1.5" style={{ color: "var(--rail-ink-soft)" }}>
            Records
          </p>
          <NavLink href="/people" icon="people">People</NavLink>
          <NavLink href="/machines" icon="machine">Machines</NavLink>
          <NavLink href="/documents" icon="doc">Documents</NavLink>
        </nav>

        <div className="hidden lg:block p-2.5 border-t" style={{ borderColor: "#ffffff14" }}>
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
              style={{ background: "var(--rail-active)", color: "var(--rail-ink)" }}
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{user.name}</p>
              <p className="truncate text-[11px]" style={{ color: "var(--rail-ink-soft)" }}>
                {user.jobTitle ?? user.role}
              </p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--rail-hover)]"
              style={{ color: "var(--rail-ink-soft)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
