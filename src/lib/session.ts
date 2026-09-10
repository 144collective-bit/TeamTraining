import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Role } from "./state-machine";

const COOKIE = "tt_session";
const TTL_DAYS = 14;

export type SessionUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
};

/**
 * Authentication happens before any tenant is known, so it cannot go through
 * the row-level security policies — which is why these three calls use the
 * narrow SECURITY DEFINER functions defined in drizzle/rls.sql rather than
 * querying the tables directly. They are the only path past the policies, and
 * each returns only what authentication needs.
 */

export async function createSession(userId: string) {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400_000);

  await db.execute(sql`SELECT tt_create_session(${id}, ${userId}::uuid, ${expiresAt.toISOString()}::timestamptz)`);

  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await db.execute(sql`SELECT tt_destroy_session(${id})`);
  jar.delete(COOKIE);
}

/** The credentials for one email, or null. Used only by sign-in. */
export async function lookupLogin(email: string) {
  const rows = await db.execute<{ id: string; tenant_id: string; password_hash: string | null }>(
    sql`SELECT * FROM tt_lookup_login(${email})`,
  );
  const row = rows[0];
  return row ? { id: row.id, tenantId: row.tenant_id, passwordHash: row.password_hash } : null;
}

/** Returns the signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;

  const rows = await db.execute<{
    id: string; tenant_id: string; name: string; email: string;
    role: Role; job_title: string | null;
  }>(sql`SELECT * FROM tt_resolve_session(${id})`);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    email: row.email,
    role: row.role,
    jobTitle: row.job_title,
  };
}

/** Use in server components that must not render for signed-out visitors. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
