import { redirect } from "next/navigation";
import { hasAnyOrganisation } from "@/lib/queries";
import { getSessionUser } from "@/lib/session";
import { Wordmark } from "@/components/wordmark";
import { SetupForm } from "./setup-form";
import { routes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await getSessionUser()) redirect(routes.dashboard);
  // One-time door: once an organisation exists this page is closed for good.
  if (await hasAnyOrganisation()) redirect(routes.login);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-lg">
        <Wordmark />

        <header className="mt-8 mb-6">
          <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
            Set up your organisation
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">
            This creates your organisation and your administrator account. Nothing
            else is created — you will start with an empty system and build your
            procedures, machines and people from there.
          </p>
        </header>

        <SetupForm />

        <p className="mt-6 text-[12px] leading-relaxed text-[var(--ink-faint)]">
          This page is only available until the first organisation exists. After that
          it closes permanently and new people are added from inside the app.
        </p>
      </div>
    </main>
  );
}
