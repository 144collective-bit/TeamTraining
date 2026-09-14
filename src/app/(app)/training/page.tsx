import Link from "next/link";
import type { Route } from "next";
import { requireUser } from "@/lib/session";
import { getHome, getActionList } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { SectionMark } from "@/components/section-mark";
import { Composition } from "@/components/door";
import { STATUS_META, formatDate } from "@/lib/competence";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * The way in to everything training.
 *
 * Training is the biggest of the three sections and the only one that used to
 * drop you straight into the matrix — a wall of a hundred and forty cells
 * before you had chosen anything. This names the four things you might have
 * come to do and gets out of the way.
 */
export default async function TrainingPage() {
  const user = await requireUser();
  const [home, actions] = await Promise.all([
    getHome(user.tenantId),
    getActionList(user.tenantId),
  ]);
  const t = home.training;

  return (
    <>
      <PageHeader
        title="Training"
        description="Who can run what, who is learning it, and the evidence behind every sign-off."
      />

      <div className="p-5 sm:p-7 space-y-6">
        <section className="card card-pad">
          <div className="flex flex-wrap items-center gap-5">
            <SectionMark section="training" size={52} />
            <div>
              <p className="flex items-baseline gap-2">
                <span className="text-[38px] font-semibold leading-none" style={{ color: "var(--sec-training)" }}>
                  {t.competent}
                </span>
                <span className="text-[13.5px] text-[var(--ink-soft)]">competences signed off</span>
              </p>
              <p className="mt-1.5 text-[12.5px] text-[var(--ink-faint)]">
                {t.machinesCovered} of {t.machines} machines have two or more competent operators.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <Composition
              parts={[
                { label: "competent", value: t.competent, colour: "var(--st-competent-fg)" },
                { label: "in training", value: t.inTraining, colour: "var(--st-training-fg)" },
                { label: "need action", value: t.needsAction, colour: "var(--st-suspended-fg)" },
              ]}
            />
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            href={routes.matrix}
            title="Training matrix"
            blurb="Everyone against every machine. Start training from an empty cell."
          />
          <Card
            href={routes.signOffs}
            title="Today's sign-offs"
            blurb="Record a day's supervised work against someone's training."
          />
          <Card
            href={routes.people}
            title="People"
            blurb="One person's full record — what they run, and what they signed."
          />
          <Card
            href={routes.machines}
            title="Machines"
            blurb="Who is competent on each machine, and the procedure it runs to."
          />
          <Card
            href={routes.documents}
            title="Procedures and training documents"
            blurb="SOPs, risk assessments and sign-off sheets, every revision kept."
          />
          <Card
            href={routes.dashboard}
            title="Full overview"
            blurb="The detailed dashboard: action list, training under way, coverage table."
          />
        </div>

        {actions.length > 0 && (
          <section className="card overflow-hidden">
            <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-[15px] font-semibold tracking-tight">Needs your attention</h2>
              <Link href={routes.dashboard} className="text-[12.5px] text-[var(--ink-soft)] hover:underline">
                All {actions.length} →
              </Link>
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {actions.slice(0, 4).map((a) => {
                const meta = STATUS_META[a.status as keyof typeof STATUS_META];
                return (
                  <li key={a.competenceId}>
                    <Link
                      href={routes.competence(a.competenceId)}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-sunk)]"
                    >
                      <span
                        className={`chip st-${a.status} shrink-0`}
                        style={{ width: "1.75rem", height: "1.75rem", fontSize: "0.8125rem" }}
                        aria-hidden
                      >
                        {meta.glyph}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium truncate">
                          {a.userName} <span className="text-[var(--ink-soft)]">on</span>{" "}
                          <span className="font-mono">{a.machineCode}</span>
                        </span>
                        <span className="block text-[12px] text-[var(--ink-faint)]">
                          {meta.label}
                          {a.expiresOn ? ` · expires ${formatDate(a.expiresOn)}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Card({ href, title, blurb }: { href: Route; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="card group card-pad block transition-colors hover:bg-[var(--surface-sunk)]"
    >
      <p className="flex items-center gap-1.5 text-[14.5px] font-semibold tracking-tight">
        {title}
        <span className="text-[var(--ink-faint)] transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-soft)]">{blurb}</p>
    </Link>
  );
}
