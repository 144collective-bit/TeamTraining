/**
 * Adversarial cross-tenant test.
 *
 * Stands up two throwaway tenants of its own and, connecting as the application
 * role, tries every way it can think of to read or write across the boundary.
 * Every attempt must come back empty or refused. Both tenants are removed
 * afterwards.
 *
 * Needs nothing in the database beforehand, so it is the first thing to run
 * against a new deployment:
 *
 *   npm run test:isolation
 */
import "dotenv/config";
import { db, asTenant, getAdminDb, schema } from "@/db";
import { sql, eq } from "drizzle-orm";

const admin = getAdminDb();
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  // The application role must not be able to sidestep the policies at all.
  const [role] = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
    sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  );
  check("the application role is not a superuser", role.rolsuper === false);
  check("the application role cannot bypass RLS", role.rolbypassrls === false);

  // Two throwaway organisations, both created here so this runs against any
  // database — including a freshly provisioned production one with no data.
  const stamp = Date.now();

  const [victim] = await admin
    .insert(schema.tenants)
    .values({ name: "Isolation Check A", slug: `isolation-a-${stamp}` })
    .returning();

  const [intruder] = await admin
    .insert(schema.tenants)
    .values({ name: "Isolation Check B", slug: `isolation-b-${stamp}` })
    .returning();

  const [victimUser] = await admin
    .insert(schema.users)
    .values({
      tenantId: victim.id,
      email: `isolation-a-${stamp}@example.invalid`,
      name: "Check A Manager",
      role: "ADMIN",
    })
    .returning();

  const [intruderUser] = await admin
    .insert(schema.users)
    .values({
      tenantId: intruder.id,
      email: `isolation-b-${stamp}@example.invalid`,
      name: "Check B Manager",
      role: "ADMIN",
    })
    .returning();

  // Something of the victim's for the intruder to try to reach.
  const [victimArea] = await admin
    .insert(schema.areas)
    .values({ tenantId: victim.id, name: "Check A Area", code: `ICA${stamp % 10000}` })
    .returning();

  const [victimMachine] = await admin
    .insert(schema.machines)
    .values({
      tenantId: victim.id, areaId: victimArea.id,
      code: `IC${stamp % 10000}`, name: "Check A Machine",
    })
    .returning();

  const [target] = await admin
    .insert(schema.competenceRecords)
    .values({
      tenantId: victim.id, userId: victimUser.id, machineId: victimMachine.id,
      status: "IN_TRAINING", level: "SUPERVISED",
    })
    .returning();

  try {
    /* -------------------------------------------------------------- *
     * Reads
     * -------------------------------------------------------------- */
    const seen = await asTenant(intruder.id, async (tx) => ({
      users: await tx.select().from(schema.users),
      machines: await tx.select().from(schema.machines),
      competences: await tx.select().from(schema.competenceRecords),
      documents: await tx.select().from(schema.documents),
      revisions: await tx.select().from(schema.documentRevisions),
      signatures: await tx.select().from(schema.signatures),
      events: await tx.select().from(schema.events),
      attachments: await tx.select().from(schema.attachments),
      tenants: await tx.select().from(schema.tenants),
    }));

    check("sees only its own single user", seen.users.length === 1, `${seen.users.length} users`);
    check("sees no other tenant's machines", seen.machines.length === 0);
    check("sees no other tenant's competence records", seen.competences.length === 0);
    check("sees no other tenant's documents", seen.documents.length === 0);
    check("sees no other tenant's revisions", seen.revisions.length === 0);
    check("sees no other tenant's signatures", seen.signatures.length === 0);
    check("sees no other tenant's audit events", seen.events.length === 0);
    check("sees no other tenant's photographs", seen.attachments.length === 0);
    check("sees only its own tenant row", seen.tenants.length === 1 && seen.tenants[0].id === intruder.id);

    /* -------------------------------------------------------------- *
     * Targeted reads by known primary key
     * -------------------------------------------------------------- */
    const byId = await asTenant(intruder.id, (tx) =>
      tx.select().from(schema.competenceRecords).where(eq(schema.competenceRecords.id, target.id)));
    check("cannot fetch another tenant's record by its id", byId.length === 0);

    const machineById = await asTenant(intruder.id, (tx) =>
      tx.select().from(schema.machines).where(eq(schema.machines.id, victimMachine.id)));
    check("cannot fetch another tenant's machine by its id", machineById.length === 0);

    /* -------------------------------------------------------------- *
     * Reads with no tenant context at all
     * -------------------------------------------------------------- */
    const unscoped = await db.select().from(schema.users);
    check("without a tenant context, sees nothing", unscoped.length === 0,
      `${unscoped.length} rows`);

    /* -------------------------------------------------------------- *
     * Writes
     * -------------------------------------------------------------- */
    let refused = false;
    try {
      await asTenant(intruder.id, (tx) =>
        tx.insert(schema.areas).values({ tenantId: victim.id, name: "Smuggled", code: "SMG" }));
    } catch { refused = true; }
    check("cannot insert a row into another tenant", refused);

    let updateBlocked = false;
    const before = target.status;
    await asTenant(intruder.id, (tx) =>
      tx.update(schema.competenceRecords)
        .set({ status: "COMPETENT" })
        .where(eq(schema.competenceRecords.id, target.id)));
    const [after] = await admin
      .select({ status: schema.competenceRecords.status })
      .from(schema.competenceRecords)
      .where(eq(schema.competenceRecords.id, target.id));
    updateBlocked = after.status === before;
    check("an update against another tenant changes nothing", updateBlocked,
      `status still ${after.status}`);

    await asTenant(intruder.id, (tx) =>
      tx.delete(schema.competenceRecords).where(eq(schema.competenceRecords.id, target.id)));
    const [survives] = await admin
      .select({ id: schema.competenceRecords.id })
      .from(schema.competenceRecords)
      .where(eq(schema.competenceRecords.id, target.id));
    check("a delete against another tenant removes nothing", Boolean(survives));

    /* -------------------------------------------------------------- *
     * Privilege escalation
     * -------------------------------------------------------------- */
    let cannotDisable = false;
    try {
      await db.execute(sql`ALTER TABLE users DISABLE ROW LEVEL SECURITY`);
    } catch { cannotDisable = true; }
    check("the application role cannot disable RLS", cannotDisable);

    let cannotGrant = false;
    try {
      await db.execute(sql`ALTER ROLE ${sql.raw(String(process.env.PGUSER ?? "tt_app"))} BYPASSRLS`);
    } catch { cannotGrant = true; }
    check("the application role cannot grant itself BYPASSRLS", cannotGrant);
  } finally {
    // Cascades remove the users, areas, machines and competence records.
    await admin.delete(schema.tenants).where(eq(schema.tenants.id, intruder.id));
    await admin.delete(schema.tenants).where(eq(schema.tenants.id, victim.id));
  }

  console.log(failures === 0
    ? "\nTenant isolation holds."
    : `\n${failures} isolation check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
