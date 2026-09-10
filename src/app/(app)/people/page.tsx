import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db, schema } from "@/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { formatDate } from "@/lib/competence";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const user = await requireUser();

  const people = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      employeeRef: schema.users.employeeRef,
      jobTitle: schema.users.jobTitle,
      role: schema.users.role,
      startedOn: schema.users.startedOn,
      competent: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status = 'COMPETENT')`.mapWith(Number),
      training: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status in ('IN_TRAINING','ASSESSMENT','INDUCTION'))`.mapWith(Number),
      action: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status in ('REQUIRES_REVALIDATION','SUSPENDED'))`.mapWith(Number),
      canTrain: sql<number>`(select count(*) from ${schema.competenceRecords} c where c.user_id = ${schema.users.id} and c.status = 'COMPETENT' and c.level = 'TRAINER')`.mapWith(Number),
    })
    .from(schema.users)
    .where(and(eq(schema.users.tenantId, user.tenantId), eq(schema.users.status, "ACTIVE")))
    .orderBy(asc(schema.users.name));

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="People"
        description="Everyone on site, with their competence position at a glance."
      />
      <div className="p-5 sm:p-7">
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="label py-3 pl-5 text-left font-semibold">Name</th>
                <th className="label py-3 text-left font-semibold">Role</th>
                <th className="label py-3 text-left font-semibold">Started</th>
                <th className="label py-3 text-center font-semibold">Competent</th>
                <th className="label py-3 text-center font-semibold">Can train</th>
                <th className="label py-3 text-center font-semibold">In training</th>
                <th className="label py-3 pr-5 text-center font-semibold">Needs action</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b last:border-0 transition-colors hover:bg-[var(--surface-sunk)]" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pl-5">
                    <Link href={`/people/${p.id}` as never} className="group">
                      <span className="block font-medium group-hover:underline">{p.name}</span>
                      <span className="block text-[11.5px] text-[var(--ink-faint)] font-mono">{p.employeeRef}</span>
                    </Link>
                  </td>
                  <td className="py-2.5 text-[var(--ink-soft)]">{p.jobTitle}</td>
                  <td className="py-2.5 text-[var(--ink-soft)] tabular">{formatDate(p.startedOn)}</td>
                  <td className="py-2.5 text-center tabular font-medium" style={{ color: "var(--st-competent-fg)" }}>{p.competent || "—"}</td>
                  <td className="py-2.5 text-center tabular font-medium text-[var(--ink-soft)]">{p.canTrain || "—"}</td>
                  <td className="py-2.5 text-center tabular font-medium" style={{ color: p.training ? "var(--st-training-fg)" : "var(--ink-faint)" }}>{p.training || "—"}</td>
                  <td className="py-2.5 pr-5 text-center tabular font-medium" style={{ color: p.action ? "var(--st-suspended-fg)" : "var(--ink-faint)" }}>{p.action || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
