"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <div>
        <label htmlFor="email" className="label block mb-1.5">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="username"
          className="input" placeholder="you@protektor.example"
          defaultValue="k.bhatti@protektor.example"
        />
      </div>

      <div>
        <label htmlFor="password" className="label block mb-1.5">Password</label>
        <input
          id="password" name="password" type="password" required
          autoComplete="current-password" className="input" defaultValue="protektor"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-md border px-3 py-2 text-[13px]"
          style={{
            borderColor: "var(--st-suspended-br)",
            background: "var(--st-suspended-bg)",
            color: "var(--st-suspended-fg)",
          }}
        >
          {state.error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
