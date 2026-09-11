import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getAdminSummary, getOrganisation } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";
import { PageHeader } from "@/components/page-header";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (!atLeast(user.role, "MANAGER")) redirect(routes.dashboard);

  const [summary, org] = await Promise.all([
    getAdminSummary(user.tenantId),
    getOrganisation(user.tenantId),
  ]);

  const steps = [
    {
      done: summary.areas > 0 && summary.machines > 0,
      title: "Add your areas and machines",
      body: "Machines are the columns of the training matrix. Group them into areas — press shop, welding bay, and so on.",
      href: routes.adminMachines,
      action: summary.machines > 0 ? "Manage plant" : "Add machines",
      count: summary.machines > 0 ? `${summary.machines} machine${summary.machines === 1 ? "" : "s"} in ${summary.areas} area${summary.areas === 1 ? "" : "s"}` : null,
    },
    {
      done: summary.people > 1,
      title: "Add your people",
      body: "Everyone who operates, trains or approves. They become the rows of the matrix.",
      href: routes.adminPeople,
      action: summary.people > 1 ? "Manage people" : "Add people",
      count: `${summary.people} active`,
    },
    {
      done: summary.sops > 0,
      title: "Write your procedures",
      body: "Start from a template rather than a blank page. Each machine wants a standard operating procedure and a risk assessment.",
      href: routes.documents,
      action: summary.sops > 0 ? "Manage documents" : "Start a procedure",
      count: summary.sops + summary.risks > 0
        ? `${summary.sops} procedure${summary.sops === 1 ? "" : "s"}, ${summary.risks} risk assessment${summary.risks === 1 ? "" : "s"}`
        : null,
    },
    {
      done: summary.training > 0,
      title: "Build your training sign-offs",
      body: "The numbered areas a trainee is signed off on, one process at a time — the app's version of the paper sign-off sheet.",
      href: routes.newDocumentOfKind("TRAINING_DOC"),
      action: summary.training > 0 ? "Add another" : "Create a sign-off sheet",
      count: summary.training > 0 ? `${summary.training} in use` : null,
    },
    {
      done: summary.inductions > 0,
      title: "Set up your induction",
      body: "The checklist a new starter is walked through before they reach the shop floor.",
      href: routes.newDocumentOfKind("INDUCTION"),
      action: summary.inductions > 0 ? "Add another" : "Create an induction checklist",
      count: summary.inductions > 0 ? `${summary.inductions} in use` : null,
    },
  ];

  const remaining = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Admin"
        description={
          remaining === 0
            ? "Everything is set up. Use these to keep it current."
            : `${remaining} thing${remaining === 1 ? "" : "s"} left to set up before the matrix is useful.`
        }
        actions={
          <Link href={routes.adminOrganisation} className="btn">
            {org?.name ?? "Organisation"} settings
          </Link>
        }
      />

      <div className="p-5 sm:p-7 max-w-4xl">
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={step.title}>
              <div className="card card-pad flex flex-wrap items-start gap-4">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular"
                  style={
                    step.done
                      ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)" }
                      : { background: "var(--surface-sunk)", color: "var(--ink-faint)", border: "1px solid var(--border-strong)" }
                  }
                  aria-hidden
                >
                  {step.done ? "✓" : i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold tracking-tight">{step.title}</h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-soft)]">{step.body}</p>
                  {step.count && (
                    <p className="mt-1.5 text-[12px] text-[var(--ink-faint)] tabular">{step.count}</p>
                  )}
                </div>

                <Link href={step.href} className={step.done ? "btn" : "btn btn-primary"}>
                  {step.action}
                </Link>
              </div>
            </li>
          ))}
        </ol>

        <section className="card card-pad mt-6">
          <h2 className="text-[15px] font-semibold tracking-tight">A note on deleting</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-soft)]">
            Nothing here deletes. People become leavers and machines are retired — both
            drop off the matrix while everything they signed stays exactly where it is.
            A training record whose subject could be erased is not evidence, and the
            whole point of this system is that the records hold up when someone asks.
          </p>
        </section>
      </div>
    </>
  );
}
