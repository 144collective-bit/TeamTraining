import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getInductionOverview } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { SectionMark } from "@/components/section-mark";
import { formatDate } from "@/lib/competence";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

const STATE = {
  NOT_STARTED: { label: "Not started", tone: "var(--st-revalidate-fg)", bg: "var(--st-revalidate-bg)" },
  IN_PROGRESS: { label: "In progress", tone: "var(--st-training-fg)", bg: "var(--st-training-bg)" },
  COMPLETE: { label: "Complete", tone: "var(--st-competent-fg)", bg: "var(--st-competent-bg)" },
} as const;

/**
 * One question: who has been through site induction and who has not. Ordered
 * so the people still owed one are at the top, because that is the only part
 * anyone needs to act on.
 */
export default async function InductionPage() {
  const user = await requireUser();
  const people = await getInductionOverview(user.tenantId);

  const outstanding = people.filter((p) => p.state !== "COMPLETE").length;

  return (
    <>
      <PageHeader
        title="Induction"
        description="The site checklist every new starter signs before they go on the floor."
      />

      <div className="p-5 sm:p-7 space-y-5">
        <section className="card card-pad flex flex-wrap items-center gap-5">
          <SectionMark section="induction" size={52} />
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-[38px] font-semibold leading-none" style={{ color: "var(--sec-induction)" }}>
                {people.length - outstanding}
              </span>
              <span className="text-[13.5px] text-[var(--ink-soft)]">of {people.length} inducted</span>
            </p>
            <p className="mt-1.5 text-[12.5px] text-[var(--ink-faint)]">
              {outstanding === 0
                ? "Everyone on site has completed their induction."
                : `${outstanding} still to complete.`}
            </p>
          </div>
        </section>

        <div className="card overflow-hidden">
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {people.map((p) => {
              const s = STATE[p.state];
              return (
                <li key={p.userId}>
                  <Link
                    href={routes.person(p.userId)}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--surface-sunk)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">{p.name}</span>
                      <span className="block text-[12px] text-[var(--ink-faint)] truncate">
                        {[p.employeeRef, p.jobTitle].filter(Boolean).join(" · ")}
                      </span>
                    </span>

                    {p.state === "IN_PROGRESS" && p.items > 0 && (
                      <span className="hidden sm:block w-28 shrink-0">
                        <span
                          className="block h-1.5 w-full rounded-full overflow-hidden"
                          style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }}
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.round((p.itemsDone / p.items) * 100)}%`,
                              background: "var(--st-training-fg)",
                            }}
                          />
                        </span>
                        <span className="mt-1 block text-[11px] text-[var(--ink-faint)]">
                          {p.itemsDone} of {p.items} items
                        </span>
                      </span>
                    )}

                    {p.state === "COMPLETE" && (
                      <span className="hidden sm:block text-[12px] text-[var(--ink-faint)] tabular">
                        {formatDate(p.completedAt)}
                      </span>
                    )}

                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                      style={{ background: s.bg, color: s.tone }}
                    >
                      {s.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-[12.5px] text-[var(--ink-faint)]">
          The checklist itself is a controlled document —{" "}
          <Link href={routes.documents} className="underline hover:text-[var(--ink-soft)]">
            edit it under Documents
          </Link>
          , and every induction records the exact revision it was run against.
        </p>
      </div>
    </>
  );
}
