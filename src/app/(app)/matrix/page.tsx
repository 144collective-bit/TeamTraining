import { requireUser } from "@/lib/session";
import { getMatrix, getCoverage, getEligibleTrainers } from "@/lib/queries";
import { atLeast } from "@/lib/state-machine";
import { PageHeader } from "@/components/page-header";
import { MatrixGrid } from "@/components/matrix-grid";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function MatrixPage() {
  const user = await requireUser();
  const [{ machines, rows }, coverage, trainers] = await Promise.all([
    getMatrix(user.tenantId),
    getCoverage(user.tenantId),
    getEligibleTrainers(user.tenantId),
  ]);
  const canTrain = atLeast(user.role, "TRAINER");

  return (
    <>
      <PageHeader
        eyebrow="Shop floor"
        title="Training matrix"
        description={
          canTrain
            ? "Who is trained on what, and where the gaps are. Select a cell for the full record, or an empty one to start training."
            : "Who is trained on what, and where the gaps are. Select any cell to open the full training record and evidence trail."
        }
        actions={<PrintButton />}
      />
      <div className="p-5 sm:p-7">
        <MatrixGrid
          machines={machines}
          rows={rows}
          coverage={coverage}
          trainers={trainers}
          canTrain={canTrain}
        />
      </div>
    </>
  );
}
