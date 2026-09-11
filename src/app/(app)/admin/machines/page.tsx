import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getPlant } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";
import { PageHeader } from "@/components/page-header";
import { PlantAdmin } from "@/components/plant-admin";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function AdminMachinesPage() {
  const user = await requireUser();
  if (!atLeast(user.role, "MANAGER")) redirect(routes.dashboard);

  const { areas, machines } = await getPlant(user.tenantId);

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Areas and machines"
        description="Machines are the columns of the training matrix. Keep the codes short — they are the column headers."
      />
      <div className="p-5 sm:p-7 max-w-5xl">
        <PlantAdmin areas={areas} machines={machines} />
      </div>
    </>
  );
}
