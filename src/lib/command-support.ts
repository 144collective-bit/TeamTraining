import { headers } from "next/headers";
import { atLeast, PermissionError, TransitionError, type Role } from "./state-machine";

/** What every server action returns, so forms can render the outcome. */
export type ActionState = { error?: string; ok?: string };

/**
 * Turn a thrown error into something safe to show a user. Domain errors carry
 * their own message; anything else is logged and reported generically, because
 * a database error message is not for the shop floor.
 */
export function fail(e: unknown): ActionState {
  if (e instanceof TransitionError || e instanceof PermissionError) {
    return { error: e.message };
  }
  console.error("[command]", e);
  return { error: "Something went wrong recording that. Nothing was saved." };
}

/** Throws unless the actor holds at least `minimum`. */
export function requireRole(role: Role, minimum: Role, what: string): void {
  if (!atLeast(role, minimum)) {
    throw new PermissionError(`You need ${minimum.toLowerCase()} access to ${what}.`);
  }
}

/**
 * The device clock as asserted by the browser, bounded so it cannot be absurd.
 *
 * Offline capture means the device clock is the only record of when training
 * actually happened, so it is kept — but a clock more than a day out is more
 * likely wrong than genuine, and server time is used instead.
 */
export const MAX_CLOCK_SKEW_MS = 86_400_000;

export function assertedTime(raw: FormDataEntryValue | null): Date {
  const parsed = raw ? Date.parse(String(raw)) : NaN;
  if (Number.isNaN(parsed)) return new Date();
  if (Math.abs(parsed - Date.now()) > MAX_CLOCK_SKEW_MS) return new Date();
  return new Date(parsed);
}

/** Device and network context, recorded alongside signatures. */
export async function requestContext() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    deviceId: h.get("user-agent")?.slice(0, 200) ?? null,
  };
}
