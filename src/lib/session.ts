import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { db, schema } from "@/db";
import { eq, and, gt } from "drizzle-orm";

const COOKIE = "tt_session";
const TTL_DAYS = 14;

export type SessionUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "TRAINER" | "OPERATOR";
  jobTitle: string | null;
};

export async function createSession(userId: string) {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400_000);
  await db.insert(schema.authSessions).values({ id, userId, expiresAt });

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
  if (id) await db.delete(schema.authSessions).where(eq(schema.authSessions.id, id));
  jar.delete(COOKIE);
}

/** Returns the signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;

  const [row] = await db
    .select({
      id: schema.users.id,
      tenantId: schema.users.tenantId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      jobTitle: schema.users.jobTitle,
    })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.authSessions.userId, schema.users.id))
    .where(and(eq(schema.authSessions.id, id), gt(schema.authSessions.expiresAt, new Date())))
    .limit(1);

  return row ?? null;
}

/** Use in server components that must not render for signed-out visitors. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
