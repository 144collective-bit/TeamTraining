"use server";

import { asTenant, schema } from "@/db";
import { eq, and, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { appendEvent } from "./events";
import { hashSecret } from "./crypto";
import { fail, requireRole, type ActionState } from "./command-support";
import { today } from "./dates";
import type { Role } from "./state-machine";

const ROLES = ["ADMIN", "MANAGER", "TRAINER", "OPERATOR"] as const;

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export async function savePerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    requireRole(user.role, "MANAGER", "add or edit people");

    const id = String(formData.get("id") ?? "") || null;
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const employeeRef = String(formData.get("employeeRef") ?? "").trim() || null;
    const jobTitle = String(formData.get("jobTitle") ?? "").trim() || null;
    const role = String(formData.get("role") ?? "OPERATOR") as Role;
    const startedOn = String(formData.get("startedOn") ?? "").trim() || null;
    const password = String(formData.get("password") ?? "");
    const pin = String(formData.get("pin") ?? "").trim();

    if (!name) return { error: "Enter the person's name." };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
    if (!ROLES.includes(role as never)) return { error: "Choose a role." };
    if (password && password.length < 10) {
      return { error: "A password must be at least 10 characters." };
    }
    if (pin && !/^\d{4,8}$/.test(pin)) return { error: "A PIN must be 4 to 8 digits." };

    // Only an administrator may create another administrator.
    if (role === "ADMIN" && user.role !== "ADMIN") {
      return { error: "Only an administrator can grant administrator access." };
    }

    return await asTenant(user.tenantId, async (tx) => {
      const clash = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(
          eq(schema.users.tenantId, user.tenantId),
          eq(schema.users.email, email),
          id ? ne(schema.users.id, id) : sql`true`,
        ))
        .limit(1);
      if (clash.length > 0) return { error: "Someone already has that email address." };

      const [passwordHash, pinHash] = await Promise.all([
        password ? hashSecret(password) : Promise.resolve(null),
        pin ? hashSecret(pin) : Promise.resolve(null),
      ]);

      if (id) {
        // A person cannot remove their own access, which would lock them out
        // mid-edit and, for the last administrator, lock everyone out.
        if (id === user.id && role !== user.role) {
          return { error: "You cannot change your own role." };
        }

        await tx
          .update(schema.users)
          .set({
            name, email, employeeRef, jobTitle, role, startedOn,
            ...(passwordHash ? { passwordHash } : {}),
            ...(pinHash ? { pinHash } : {}),
          })
          .where(eq(schema.users.id, id));

        await appendEvent(tx, {
          tenantId: user.tenantId, streamId: id, streamType: "person",
          eventType: "PersonUpdated",
          payload: { name, email, role, jobTitle, credentialsChanged: Boolean(passwordHash || pinHash) },
          actorId: user.id,
        });
      } else {
        const [created] = await tx
          .insert(schema.users)
          .values({
            tenantId: user.tenantId, name, email, employeeRef, jobTitle, role,
            startedOn: startedOn ?? today(),
            passwordHash, pinHash,
          })
          .returning({ id: schema.users.id });

        await appendEvent(tx, {
          tenantId: user.tenantId, streamId: created.id, streamType: "person",
          eventType: "PersonAdded",
          payload: { name, email, role, jobTitle },
          actorId: user.id,
        });
      }

      revalidatePath("/admin/people");
      revalidatePath("/people");
      revalidatePath("/matrix");
      return { ok: id ? "Saved." : `${name} added.` };
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * People are never deleted — their training records are evidence. Marking
 * someone a leaver takes them off the matrix and out of the rosters while
 * everything they signed stays exactly where it is.
 */
export async function setEmploymentStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    requireRole(user.role, "MANAGER", "change someone's employment status");

    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "") as "ACTIVE" | "ON_LEAVE" | "LEFT";
    if (!["ACTIVE", "ON_LEAVE", "LEFT"].includes(status)) return { error: "Unknown status." };
    if (id === user.id && status !== "ACTIVE") {
      return { error: "You cannot mark yourself as a leaver." };
    }

    return await asTenant(user.tenantId, async (tx) => {
      // Never leave an organisation with no way back in.
      if (status !== "ACTIVE") {
        const [remaining] = await tx
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(schema.users)
          .where(and(
            eq(schema.users.tenantId, user.tenantId),
            eq(schema.users.role, "ADMIN"),
            eq(schema.users.status, "ACTIVE"),
            ne(schema.users.id, id),
          ));
        const [target] = await tx
          .select({ role: schema.users.role, name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, id))
          .limit(1);
        if (!target) return { error: "That person could not be found." };
        if (target.role === "ADMIN" && remaining.n === 0) {
          return { error: "That is the last active administrator. Promote someone else first." };
        }
      }

      await tx.update(schema.users).set({ status }).where(eq(schema.users.id, id));

      await appendEvent(tx, {
        tenantId: user.tenantId, streamId: id, streamType: "person",
        eventType: status === "LEFT" ? "PersonLeft" : status === "ON_LEAVE" ? "PersonOnLeave" : "PersonReturned",
        payload: { status },
        actorId: user.id,
      });

      revalidatePath("/admin/people");
      revalidatePath("/people");
      revalidatePath("/matrix");
      revalidatePath("/dashboard");
      return {
        ok: status === "LEFT"
          ? "Marked as a leaver. Their training records are kept."
          : status === "ON_LEAVE" ? "Marked as on leave." : "Marked as active.",
      };
    });
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Areas and machines
 * ------------------------------------------------------------------ */

export async function saveArea(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    requireRole(user.role, "MANAGER", "manage areas");

    const id = String(formData.get("id") ?? "") || null;
    const name = String(formData.get("name") ?? "").trim();
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    if (!name) return { error: "Give the area a name." };
    if (!/^[A-Z0-9-]{2,12}$/.test(code)) {
      return { error: "An area code is 2 to 12 characters: letters, numbers or hyphens." };
    }

    return await asTenant(user.tenantId, async (tx) => {
      const clash = await tx
        .select({ id: schema.areas.id })
        .from(schema.areas)
        .where(and(
          eq(schema.areas.tenantId, user.tenantId),
          eq(schema.areas.code, code),
          id ? ne(schema.areas.id, id) : sql`true`,
        ))
        .limit(1);
      if (clash.length > 0) return { error: `Area code ${code} is already in use.` };

      if (id) {
        await tx.update(schema.areas).set({ name, code }).where(eq(schema.areas.id, id));
      } else {
        const [max] = await tx
          .select({ n: sql<number>`coalesce(max(sort_order), 0)`.mapWith(Number) })
          .from(schema.areas)
          .where(eq(schema.areas.tenantId, user.tenantId));
        await tx.insert(schema.areas).values({
          tenantId: user.tenantId, name, code, sortOrder: max.n + 1,
        });
      }

      revalidatePath("/admin/machines");
      revalidatePath("/machines");
      revalidatePath("/matrix");
      return { ok: id ? "Area saved." : `${name} added.` };
    });
  } catch (e) {
    return fail(e);
  }
}

export async function saveMachine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    requireRole(user.role, "MANAGER", "manage machines");

    const id = String(formData.get("id") ?? "") || null;
    const areaId = String(formData.get("areaId") ?? "");
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const manufacturer = String(formData.get("manufacturer") ?? "").trim() || null;
    const model = String(formData.get("model") ?? "").trim() || null;
    const serialNumber = String(formData.get("serialNumber") ?? "").trim() || null;
    const assetRef = String(formData.get("assetRef") ?? "").trim() || null;
    const highRisk = formData.get("highRisk") === "on";
    const revalRaw = String(formData.get("revalidationMonths") ?? "");
    const revalidationMonths = revalRaw === "" ? null : Number(revalRaw);

    if (!areaId) return { error: "Choose an area." };
    if (!name) return { error: "Give the machine a name." };
    if (!/^[A-Z0-9-]{2,12}$/.test(code)) {
      return { error: "A machine code is 2 to 12 characters: letters, numbers or hyphens. It is the matrix column header, so keep it short." };
    }
    if (revalidationMonths !== null && (!Number.isInteger(revalidationMonths) || revalidationMonths < 1 || revalidationMonths > 120)) {
      return { error: "Revalidation must be between 1 and 120 months, or left blank for no expiry." };
    }

    return await asTenant(user.tenantId, async (tx) => {
      const clash = await tx
        .select({ id: schema.machines.id })
        .from(schema.machines)
        .where(and(
          eq(schema.machines.tenantId, user.tenantId),
          eq(schema.machines.code, code),
          id ? ne(schema.machines.id, id) : sql`true`,
        ))
        .limit(1);
      if (clash.length > 0) return { error: `Machine code ${code} is already in use.` };

      const values = {
        areaId, code, name, manufacturer, model, serialNumber, assetRef,
        highRisk, revalidationMonths,
      };

      if (id) {
        await tx.update(schema.machines).set(values).where(eq(schema.machines.id, id));
      } else {
        const [max] = await tx
          .select({ n: sql<number>`coalesce(max(sort_order), 0)`.mapWith(Number) })
          .from(schema.machines)
          .where(eq(schema.machines.tenantId, user.tenantId));
        await tx.insert(schema.machines).values({
          tenantId: user.tenantId, ...values, sortOrder: max.n + 1,
        });
      }

      revalidatePath("/admin/machines");
      revalidatePath("/machines");
      revalidatePath("/matrix");
      revalidatePath("/dashboard");
      return { ok: id ? "Machine saved." : `${code} added.` };
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Machines are retired rather than deleted, for the same reason people are:
 * the competence records against them are evidence that something was done
 * safely, and they have to survive the machine leaving the floor.
 */
export async function setMachineActive(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    requireRole(user.role, "MANAGER", "retire a machine");

    const id = String(formData.get("id") ?? "");
    const active = formData.get("active") === "true";

    return await asTenant(user.tenantId, async (tx) => {
      await tx.update(schema.machines).set({ active }).where(eq(schema.machines.id, id));
      revalidatePath("/admin/machines");
      revalidatePath("/machines");
      revalidatePath("/matrix");
      return {
        ok: active
          ? "Machine returned to service."
          : "Machine retired. It leaves the matrix; its training records are kept.",
      };
    });
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ *
 * Organisation
 * ------------------------------------------------------------------ */

export async function saveOrganisation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    requireRole(user.role, "ADMIN", "change organisation settings");

    const name = String(formData.get("name") ?? "").trim();
    const siteName = String(formData.get("siteName") ?? "").trim() || null;
    const brandColor = String(formData.get("brandColor") ?? "").trim().toLowerCase();
    const logoAttachmentId = String(formData.get("logoAttachmentId") ?? "").trim() || null;

    if (!name) return { error: "Give your organisation a name." };
    if (!/^#[0-9a-f]{6}$/.test(brandColor)) {
      return { error: "Choose a brand colour." };
    }

    return await asTenant(user.tenantId, async (tx) => {
      await tx
        .update(schema.tenants)
        .set({ name, siteName, brandColor, logoAttachmentId })
        .where(eq(schema.tenants.id, user.tenantId));

      revalidatePath("/admin/organisation", "layout");
      revalidatePath("/dashboard");
      return { ok: "Organisation settings saved." };
    });
  } catch (e) {
    return fail(e);
  }
}
