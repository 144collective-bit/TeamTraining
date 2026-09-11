import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getAllPeople } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";
import { PageHeader } from "@/components/page-header";
import { PeopleAdmin } from "@/components/people-admin";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const user = await requireUser();
  if (!atLeast(user.role, "MANAGER")) redirect(routes.dashboard);

  const people = await getAllPeople(user.tenantId);

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="People"
        description="Everyone who operates, trains or approves. Active people become the rows of the training matrix."
      />
      <div className="p-5 sm:p-7 max-w-5xl">
        <PeopleAdmin people={people} currentUserId={user.id} isAdmin={user.role === "ADMIN"} />
      </div>
    </>
  );
}
