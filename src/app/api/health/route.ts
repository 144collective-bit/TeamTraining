import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness in one.
 *
 * Deliberately unauthenticated and deliberately uninformative: it says whether
 * the process is up and whether the database answers, and nothing about what is
 * in it. Used by the container healthcheck and by uptime monitoring.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json(
      { status: "ok", database: "ok", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[health] database unreachable", e);
    return Response.json(
      { status: "degraded", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
