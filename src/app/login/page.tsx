import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 text-[var(--rail-ink)]"
        style={{ background: "var(--rail)" }}
      >
        <div className="flex items-center gap-3">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight text-white">Protektor</span>
        </div>

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
          Training &amp; Competence Management · Kidderminster
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <Mark dark />
            <span className="text-[15px] font-semibold tracking-tight">Protektor</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-[var(--ink-soft)]">
            Access the training matrix and machine records.
          </p>

          <LoginForm />

          <div
            className="mt-8 rounded-lg border p-3.5 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface-sunk)" }}
          >
            <p className="label mb-2">Demo accounts</p>
            <dl className="space-y-1 text-[var(--ink-soft)]">
              <div className="flex justify-between gap-3">
                <dt className="font-mono text-[12px]">d.whitfield@protektor.example</dt>
                <dd className="shrink-0">Admin</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-mono text-[12px]">k.bhatti@protektor.example</dt>
                <dd className="shrink-0">Manager</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-mono text-[12px]">i.prosser@protektor.example</dt>
                <dd className="shrink-0">Trainer</dd>
              </div>
            </dl>
            <p className="mt-2.5 pt-2.5 border-t text-[var(--ink-faint)]" style={{ borderColor: "var(--border)" }}>
              Password <code className="font-mono text-[var(--ink)]">protektor</code>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function Mark({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className="grid h-8 w-8 place-items-center rounded-md text-[15px] font-bold text-white"
      style={{ background: "var(--accent)" }}
      aria-hidden
    >
      P
    </div>
  );
}
