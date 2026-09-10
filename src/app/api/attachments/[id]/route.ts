import { asTenant, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getSessionUser } from "@/lib/session";

/**
 * Serves an uploaded image. Scoped to the caller's tenant - these are
 * photographs of a customer's shop floor, not public assets.
 *
 * Content is immutable (the row is content-addressed and never rewritten), so
 * it can be cached hard once fetched.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorised", { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const [row] = await asTenant(user.tenantId, (tx) => tx
    .select({
      data: schema.attachments.data,
      mimeType: schema.attachments.mimeType,
      sha256: schema.attachments.sha256,
      byteSize: schema.attachments.byteSize,
    })
    .from(schema.attachments)
    .where(and(
      eq(schema.attachments.id, id),
      eq(schema.attachments.tenantId, user.tenantId),
    ))
    .limit(1));

  if (!row) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(row.byteSize),
      "Cache-Control": "private, max-age=31536000, immutable",
      "ETag": `"${row.sha256}"`,
      // These are user uploads; never let a browser sniff them into something
      // executable, and never let one be framed.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}
