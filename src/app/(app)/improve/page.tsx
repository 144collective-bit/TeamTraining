import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCoverage, getDocumentsDueReview, getActionList } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { formatDate, DOC_KIND_META } from "@/lib/competence";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * The improvement worklist.
 *
 * Nothing here is a new kind of record — it is the same competence and
 * document data the rest of the app holds, asked a different question: not
 * "what is true" but "what would you fix first". Grouped by the kind of fix,
 * because they go to different people.
 */
export default async function ImprovePage() {
  const user = await requireUser();
  const [coverage, documentsDue, actions] = await Promise.all([
    getCoverage(user.tenantId),
    getDocumentsDueReview(user.tenantId),
    getActionList(user.tenantId),
  ]);

  const noCover = coverage.filter((c) => c.competent === 0);
  const singlePoint = coverage.filter((c) => c.competent === 1);
  const noTrainer = coverage.filter((c) => c.competent > 1 && c.trainers === 0);
  const unread = actions.filter((a) => a.reason === "ACKNOWLEDGEMENT");
  const overdueReviews = actions.filter((a) => a.reason === "REVIEW_OVERDUE");

  const total =
    noCover.length + singlePoint.length + noTrainer.length + documentsDue.length +
    unread.length + overdueReviews.length;

  return (
    <>
      <PageHeader
        title="Continuous improvement"
        description="The gaps worth closing, most costly first."
      />

      <div className="p-5 sm:p-7 space-y-5">
        {total === 0 ? (
          <div className="card card-pad text-[13.5px] text-[var(--ink-soft)]">
            Nothing outstanding. Every machine has cover and a trainer, every procedure is
            within its review date, and every change has been read.
          </div>
        ) : (
          <p className="text-[13.5px] text-[var(--ink-soft)]">
            {total} {total === 1 ? "item" : "items"} across coverage, procedures and acknowledgements.
          </p>
        )}

        <Group
          title="Production stops if one person is away"
          blurb="A machine nobody else can run is a rota problem waiting to become a delivery problem."
          count={noCover.length + singlePoint.length}
        >
          {[...noCover, ...singlePoint].map((c) => (
            <Row
              key={c.machineId}
              href={routes.machine(c.machineId)}
              title={`${c.code} ${c.name}`}
              detail={c.competent === 0 ? "Nobody is signed off" : "One competent operator"}
              tone="bad"
              action="Train someone"
            />
          ))}
        </Group>

        <Group
          title="Nobody can train the next person"
          blurb="Competent operators, but none of them can sign anyone else off."
          count={noTrainer.length}
        >
          {noTrainer.map((c) => (
            <Row
              key={c.machineId}
              href={routes.machine(c.machineId)}
              title={`${c.code} ${c.name}`}
              detail={`${c.competent} competent, no trainer`}
              tone="warn"
              action="Raise someone to trainer"
            />
          ))}
        </Group>

        <Group
          title="Procedures past their review date"
          blurb="A procedure nobody has looked at in a year is the first thing an auditor asks about."
          count={documentsDue.length}
        >
          {documentsDue.map((d) => (
            <Row
              key={d.id}
              href={routes.document(d.id)}
              title={`${d.reference} ${d.title}`}
              detail={`${DOC_KIND_META[d.kind]?.abbr ?? d.kind} · rev ${d.revision} · due ${formatDate(d.nextReviewOn)}`}
              tone="warn"
              action="Review"
            />
          ))}
        </Group>

        <Group
          title="Changes nobody has read"
          blurb="A minor revision went out and the people working to it have not acknowledged it."
          count={unread.length}
        >
          {unread.map((a) => (
            <Row
              key={a.competenceId}
              href={routes.competence(a.competenceId)}
              title={`${a.userName} on ${a.machineCode}`}
              detail="Unread procedure change"
              tone="warn"
              action="Chase"
            />
          ))}
        </Group>

        <Group
          title="Reviews overdue"
          blurb="Periodic competence reviews that have gone past their date."
          count={overdueReviews.length}
        >
          {overdueReviews.map((a) => (
            <Row
              key={a.competenceId}
              href={routes.competence(a.competenceId)}
              title={`${a.userName} on ${a.machineCode}`}
              detail={`Review due ${formatDate(a.nextReviewDue)}`}
              tone="warn"
              action="Review"
            />
          ))}
        </Group>
      </div>
    </>
  );
}

function Group({
  title, blurb, count, children,
}: {
  title: string; blurb: string; count: number; children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <span className="text-[12px] text-[var(--ink-faint)] tabular">{count}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-[var(--ink-soft)]">{blurb}</p>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>{children}</ul>
    </section>
  );
}

function Row({
  href, title, detail, tone, action,
}: {
  href: string; title: string; detail: string; tone: "bad" | "warn"; action: string;
}) {
  return (
    <li>
      <Link
        href={href as never}
        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--surface-sunk)]"
      >
        <span
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: tone === "bad" ? "var(--st-suspended-fg)" : "var(--st-revalidate-fg)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium truncate">{title}</span>
          <span className="block text-[12px] text-[var(--ink-faint)]">{detail}</span>
        </span>
        <span className="hidden sm:block shrink-0 text-[12px] text-[var(--ink-soft)]">{action} →</span>
      </Link>
    </li>
  );
}
