"use server";

import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { hashSecret } from "./crypto";
import { createSession } from "./session";
import { hasAnyOrganisation } from "./queries";
import { routes } from "./routes";
import type { ActionState } from "./command-support";

/**
 * Creates the first organisation and its administrator.
 *
 * Backed by a SECURITY DEFINER function that refuses once any organisation
 * exists, so this is a one-time door rather than a standing way to create
 * tenants.
 */
export async function bootstrapOrganisation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let created = false;
  try {
    if (await hasAnyOrganisation()) {
      return { error: "An organisation has already been set up. Sign in instead." };
    }

    const orgName = String(formData.get("orgName") ?? "").trim();
    const siteName = String(formData.get("siteName") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const pin = String(formData.get("pin") ?? "").trim();

    if (!orgName) return { error: "Give your organisation a name." };
    if (!name) return { error: "Enter your own name." };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
    if (password.length < 10) return { error: "Use a password of at least 10 characters." };
    if (password !== confirm) return { error: "The two passwords do not match." };
    if (!/^\d{4,8}$/.test(pin)) return { error: "The shop-floor PIN must be 4 to 8 digits." };

    const slug =
      orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) ||
      `org-${Date.now()}`;

    const [passwordHash, pinHash] = await Promise.all([hashSecret(password), hashSecret(pin)]);

    const rows = await db.execute<{ tenant_id: string; user_id: string }>(
      sql`SELECT * FROM tt_bootstrap_organisation(
            ${orgName}, ${slug}, ${siteName}, ${name}, ${email}, ${passwordHash}, ${pinHash})`,
    );

    const row = rows[0];
    if (!row) return { error: "Setup did not complete. Nothing was saved." };

    await createSession(row.user_id);
    created = true;
  } catch (e) {
    console.error("[bootstrapOrganisation]", e);
    return { error: "Setup failed. Nothing was saved." };
  }
  if (created) redirect(routes.admin);
  return {};
}
