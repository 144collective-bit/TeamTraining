"use client";

import { useActionState } from "react";
import { bootstrapOrganisation } from "@/lib/setup";
import type { ActionState } from "@/lib/command-support";
import { Banner } from "@/components/banner";
import { Field } from "@/components/editor-bits";

export function SetupForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    bootstrapOrganisation,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <section className="card card-pad space-y-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Your organisation</h2>
        <Field label="Company name" htmlFor="orgName">
          <input id="orgName" name="orgName" required className="input"
                 placeholder="e.g. Midland Fabrications Ltd" autoFocus />
        </Field>
        <Field label="Site" htmlFor="siteName" hint="Optional. Shown alongside the company name.">
          <input id="siteName" name="siteName" className="input" placeholder="e.g. Kidderminster" />
        </Field>
      </section>

      <section className="card card-pad space-y-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Your account</h2>
        <p className="text-[12.5px] text-[var(--ink-soft)] -mt-2">
          You will be an administrator: able to add people and machines, write
          procedures and approve competence.
        </p>

        <Field label="Your name" htmlFor="name">
          <input id="name" name="name" required className="input" placeholder="Full name" />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" required autoComplete="username"
                 className="input" placeholder="you@yourcompany.co.uk" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" hint="At least 10 characters.">
            <input id="password" name="password" type="password" required minLength={10}
                   autoComplete="new-password" className="input" />
          </Field>
          <Field label="Confirm password" htmlFor="confirm">
            <input id="confirm" name="confirm" type="password" required minLength={10}
                   autoComplete="new-password" className="input" />
          </Field>
        </div>

        <Field
          label="Shop-floor PIN" htmlFor="pin"
          hint="4 to 8 digits. Used to sign training records on a shared tablet, where typing a password is impractical."
        >
          <input id="pin" name="pin" inputMode="numeric" pattern="\d{4,8}" required
                 autoComplete="off" className="input max-w-[10rem]" placeholder="••••" />
        </Field>
      </section>

      {state.error && <Banner tone="bad">{state.error}</Banner>}

      <button type="submit" className="btn btn-primary w-full !h-11" disabled={pending}>
        {pending ? "Setting up…" : "Create organisation"}
      </button>
    </form>
  );
}
