"use server";

import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { requireUser } from "./session";
import { sha256Bytes } from "./crypto";
import { atLeast, PermissionError } from "./state-machine";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "./documents";

export type UploadResult =
  | { ok: true; id: string; filename: string | null }
  | { ok: false; error: string };

/**
 * Store an uploaded image, de-duplicating by content hash so the same
 * photograph used on several steps is held once.
 */
export async function uploadAttachment(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireUser();
    if (!atLeast(user.role, "TRAINER")) {
      throw new PermissionError("You need trainer access to add photographs.");
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose an image to upload." };
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as never)) {
      return { ok: false, error: "Images must be JPEG, PNG or WebP." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: `Images must be under ${MAX_IMAGE_BYTES / 1024 / 1024}MB.` };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Trust the bytes, not the declared type: a mislabelled file would
    // otherwise be served back with a Content-Type it does not deserve.
    const sniffed = sniffImageType(buffer);
    if (!sniffed || sniffed !== file.type) {
      return { ok: false, error: "That file does not look like a JPEG, PNG or WebP image." };
    }

    const hash = sha256Bytes(buffer);

    const [existing] = await db
      .select({ id: schema.attachments.id, filename: schema.attachments.filename })
      .from(schema.attachments)
      .where(and(
        eq(schema.attachments.tenantId, user.tenantId),
        eq(schema.attachments.sha256, hash),
      ))
      .limit(1);

    if (existing) return { ok: true, id: existing.id, filename: existing.filename };

    const [created] = await db
      .insert(schema.attachments)
      .values({
        tenantId: user.tenantId,
        sha256: hash,
        mimeType: sniffed,
        byteSize: buffer.byteLength,
        filename: file.name.slice(0, 200),
        data: buffer,
        uploadedBy: user.id,
      })
      .returning({ id: schema.attachments.id, filename: schema.attachments.filename });

    return { ok: true, id: created.id, filename: created.filename };
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    console.error("[uploadAttachment]", e);
    return { ok: false, error: "That upload failed. Nothing was saved." };
  }
}

/** Magic-number check for the three formats we accept. */
function sniffImageType(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "image/png";
  if (
    b.length > 12 &&
    b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}
