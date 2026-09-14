import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getHome, getOrganisation, getActionList } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Door, Composition } from "@/components/door";
import { routes } from "@/lib/routes";
import { STATUS_META, formatDate } from "@/lib/competence";

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/**
 * Three doors.
 *
 * The old landing page put nine equal figures, two lists and a ten-row table
 * in front of someone who had just signed in. This asks a simpler question
 * first — which of the three things are you here to do — and answers "is it
 * going well" with one number per door.
 */
export default async function HomePage() {
  const user = await requireUser();
  const [home, org, actions] = await Promise.all([
    getHome(user.tenantId),
    getOrganisation(user.tenantId),
    getActionList(user.tenantId),
  ]);
  const firstName = user.name.split(" ")[0];
  const orgLabel = [org?.name, org?.siteName].filter(Boolean).join(" · ") || "Your organisation";

  const { induction, training, improve } = home;
  // Must agree with what /improve actually lists, or the door lies about the
  // size of the job behind it.
  const improvements =
    improve.singlePoints + improve.noTrainer + improve.documentsDue +
    improve.pendingAck + improve.reviewsDue;

  return (
    <>
      <PageHeader
        eyebrow={orgLabel}
        title={`Good ${greeting()}, ${firstName}`}
        description="Three things happen here. Pick the one you came for."
      />

      <div className="p-5 sm:p-7">
        <div className="grid gap-5 lg:grid-cols-3">
          <Door
            href={routes.induction}
            title="Induction"
            purpose="Bringing someone onto site for the first time — the checklist they sign before they touch anything."
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3.5 17c0-2.9 2.9-4.75 6.5-4.75s6.5 1.85 6.5 4.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            }
            value={induction.inducted}
            unit={`of ${induction.people} people inducted`}
            tone={induction.inducted === induction.people && induction.people > 0 ? "good" : "warn"}
            meter={{
              value: induction.inducted,
              of: induction.people,
              label: `${induction.people - induction.inducted} still to complete`,
            }}
            readouts={[
              { label: "In progress", value: induction.inducting, tone: "warn" },
              { label: "Not started", value: induction.notStarted, tone: "warn" },
              { label: "Complete", value: induction.inducted },
            ]}
          />

          <Door
            href={routes.matrix}
            title="Training"
            purpose="Who can run what, who is learning it, and the evidence behind every sign-off."
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <rect x="3" y="3" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3 8h14M8 8v9" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10.6 12.3l1.4 1.4 2.6-2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            value={training.competent}
            unit="competences signed off"
            visual={
              <Composition
                parts={[
                  { label: "competent", value: training.competent, colour: "var(--st-competent-fg)" },
                  { label: "in training", value: training.inTraining, colour: "var(--st-training-fg)" },
                  { label: "need action", value: training.needsAction, colour: "var(--st-suspended-fg)" },
                  { label: "not trained", value: training.notTrained, colour: "color-mix(in srgb, var(--ink) 22%, transparent)" },
                ]}
              />
            }
            readouts={[
              { label: "Machines covered", value: training.machinesCovered },
              { label: "Machines in service", value: training.machines },
              { label: "Needs action", value: training.needsAction, tone: "bad" },
            ]}
          />

          <Door
            href={routes.improve}
            title="Continuous improvement"
            purpose="Where the gaps are: cover that depends on one person, procedures past review, changes nobody has read."
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M3.5 14.5 8 9.5l3 2.6 4.6-5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12.6 6.5h3.2v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            value={improvements}
            unit={improvements === 1 ? "thing to put right" : "things to put right"}
            tone={improvements > 0 ? "warn" : "good"}
            readouts={[
              { label: "Single points of failure", value: improve.singlePoints, tone: "bad" },
              { label: "Machines with no trainer", value: improve.noTrainer, tone: "warn" },
              { label: "Procedures past review", value: improve.documentsDue, tone: "warn" },
            ]}
          />
        </div>

        {/*
          Three, not eight. The point of this page is the three doors; this is
          the shortest possible answer to "and what should I do first", with
          everything else a click away rather than on the page.
        */}
        {actions.length > 0 && (
          <section className="card mt-5 overflow-hidden">
            <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-[15px] font-semibold tracking-tight">Start here</h2>
              <Link href={routes.dashboard} className="text-[12.5px] text-[var(--ink-soft)] hover:underline">
                All {actions.length} →
              </Link>
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {actions.slice(0, 3).map((a) => {
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

        <p className="mt-6 text-[12.5px] text-[var(--ink-faint)]">
          Prefer the detail?{" "}
          <Link href={routes.dashboard} className="underline hover:text-[var(--ink-soft)]">
            The full overview
          </Link>{" "}
          has the action list, training under way and machine-by-machine coverage.
        </p>
      </div>
    </>
  );
}
