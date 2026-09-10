"use server";

import { verifySecret } from "./crypto";
import { createSession, destroySession, lookupLogin } from "./session";
import { redirect } from "next/navigation";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const user = await lookupLogin(email);

  // Same message either way - don't leak which emails exist.
  if (!user || !(await verifySecret(password, user.passwordHash))) {
    return { error: "Those details don't match an active account." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
