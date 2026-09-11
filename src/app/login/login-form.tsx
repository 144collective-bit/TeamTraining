"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions";
import { Banner } from "@/components/banner";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <div>
        <label htmlFor="email" className="label block mb-1.5">Email</label>
        <input
          id="email" name="email" type="email" required autoComplete="username"
          className="input" placeholder="you@yourcompany.co.uk" autoFocus
        />
      </div>

      <div>
        <label htmlFor="password" className="label block mb-1.5">Password</label>
        <input
          id="password" name="password" type="password" required
          autoComplete="current-password" className="input"
        />
      </div>

      {state.error && <Banner tone="bad">{state.error}</Banner>}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
