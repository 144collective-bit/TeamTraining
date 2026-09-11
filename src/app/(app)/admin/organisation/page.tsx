import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getOrganisation } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { OrganisationForm } from "@/components/organisation-form";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function AdminOrganisationPage() {
  const user = await requireUser();
  // Branding and the organisation's identity are an administrator's call.
  if (user.role !== "ADMIN") redirect(routes.admin);

  const org = await getOrganisation(user.tenantId);
  if (!org) redirect(routes.admin);

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Organisation"
        description="Your name, logo and colour. These appear in the app and at the top of every printed document."
      />
      <div className="p-5 sm:p-7 max-w-2xl">
        <OrganisationForm
          name={org.name}
          siteName={org.siteName}
          brandColor={org.brandColor}
          logoAttachmentId={org.logoAttachmentId}
        />
      </div>
    </>
  );
}
