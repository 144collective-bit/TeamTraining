import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { hasAnyOrganisation } from "@/lib/queries";
import { LoginForm } from "./login-form";
import { routes } from "@/lib/routes";
import { Wordmark } from "@/components/wordmark";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");
  // Nothing set up yet: send the first visitor to create the organisation.
  if (!(await hasAnyOrganisation())) redirect(routes.setup);

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <div
        className="hidden lg:flex flex-col justify-between p-12 text-[var(--rail-ink)]"
        style={{ background: "var(--rail)" }}
      >
        <Wordmark onDark />

        <div className="max-w-md">
          <h1 className="text-4xl font-semibold tracking-tight text-white leading-[1.1]">
            Every operator.<br />Every machine.<br />
            <span style={{ color: "var(--accent)" }}>Proven.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--rail-ink-soft)]">
            Induction, training and competence records for the shop floor — held to
            an audit standard, so that when someone asks you to prove it, you can.
          </p>
        </div>

        <p className="text-xs text-[var(--rail-ink-soft)]">
          Training &amp; Competence Management
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10"><Wordmark /></div>

          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-[var(--ink-soft)]">
            Access the training matrix and machine records.
          </p>

          <LoginForm />
        </div>
      </div>
    </main>
  );
}

