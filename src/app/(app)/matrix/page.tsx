import { requireUser } from "@/lib/session";
import { getMatrix, getCoverage } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { MatrixGrid } from "@/components/matrix-grid";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function MatrixPage() {
  const user = await requireUser();
  const [{ machines, rows }, coverage] = await Promise.all([
    getMatrix(user.tenantId),
    getCoverage(user.tenantId),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Shop floor"
        title="Training matrix"
        description="Who is trained on what, and where the gaps are. Select any cell to open the full training record and evidence trail."
        actions={<PrintButton />}
      />
      <div className="p-5 sm:p-7">
        <MatrixGrid machines={machines} rows={rows} coverage={coverage} />
      </div>
    </>
  );
}
