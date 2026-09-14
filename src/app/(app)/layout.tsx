import Link from "next/link";
import { requireUser } from "@/lib/session";
import { logout } from "@/lib/actions";
import { NavLink } from "@/components/nav-link";
import { OrgMark } from "@/components/org-mark";
import { getOrganisation } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const org = await getOrganisation(user.tenantId);
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const canAdminister = atLeast(user.role, "MANAGER");

  const brand = normaliseHex(org?.brandColor);

  return (
    <div
      className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]"
      // Scoped to the signed-in shell, so sign-in and setup keep the product
      // colour and every customer sees their own inside the app.
      style={brand ? ({ "--accent": brand } as React.CSSProperties) : undefined}
    >
      {/* Navigation rail */}
      <aside
        className="no-print flex lg:flex-col lg:h-screen lg:sticky lg:top-0 overflow-x-auto lg:overflow-visible"
        style={{ background: "var(--rail)", color: "var(--rail-ink)" }}
      >
        <div className="flex items-center gap-2.5 px-4 h-14 lg:min-h-16 lg:py-3 shrink-0 lg:border-b" style={{ borderColor: "#ffffff14" }}>
          <OrgMark
            name={org?.name ?? "Organisation"}
            logoAttachmentId={org?.logoAttachmentId}
            brandColor={org?.brandColor}
          />
          <span
            className="text-[13.5px] font-semibold leading-tight tracking-tight text-white"
            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            title={org?.name ?? undefined}
          >
            {org?.name ?? "Organisation"}
          </span>
        </div>

        {/*
          Three destinations, then the detail behind them. The old rail had
          three section headings over seven links — structure for its own sake,
          and the headings were the first thing a new person had to decode.
        */}
        <nav className="flex lg:flex-col gap-0.5 p-2 lg:p-2.5 lg:flex-1 lg:overflow-y-auto">
          <NavLink href="/home" icon="grid">Home</NavLink>
          <NavLink href="/induction" icon="person">Induction</NavLink>
          <NavLink href="/matrix" icon="matrix">Training</NavLink>
          <NavLink href="/improve" icon="improve">Improve</NavLink>

          <span
            className="hidden lg:block my-2.5 border-t"
            style={{ borderColor: "#ffffff14" }}
            aria-hidden
          />

          <NavLink href="/signoff" icon="check">Today's sign-offs</NavLink>
          <NavLink href="/people" icon="people">People</NavLink>
          <NavLink href="/machines" icon="machine">Machines</NavLink>
          <NavLink href="/documents" icon="doc">Documents</NavLink>
          {canAdminister && <NavLink href="/admin" icon="settings">Admin</NavLink>}
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

/** Only a six-digit hex reaches the stylesheet, so a bad value cannot inject. */
function normaliseHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const hex = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}
