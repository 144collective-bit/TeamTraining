"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { savePerson, setEmploymentStatus } from "@/lib/admin-commands";
import type { ActionState } from "@/lib/command-support";
import { Banner } from "./banner";
import { Field } from "./editor-bits";
import { formatDate } from "@/lib/competence";

type Person = {
  id: string; name: string; email: string;
  employeeRef: string | null; jobTitle: string | null;
  role: string; status: string; startedOn: string | null;
  hasPassword: boolean; hasPin: boolean; competences: number;
};

const ROLE_HELP: Record<string, string> = {
  OPERATOR: "Runs machines. Signs their own training records.",
  TRAINER: "Trains and assesses others. Records daily sign-offs.",
  MANAGER: "Approves competence, writes procedures, manages people and plant.",
  ADMIN: "Everything a manager can do, plus organisation settings.",
};

export function PeopleAdmin({
  people,
  currentUserId,
  isAdmin,
}: {
  people: Person[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState<Person | "new" | null>(
    people.length <= 1 ? "new" : null,
  );

  const active = people.filter((p) => p.status === "ACTIVE");
  const inactive = people.filter((p) => p.status !== "ACTIVE");

  return (
    <div className="space-y-5">
      {editing ? (
        <PersonForm
          person={editing === "new" ? null : editing}
          isAdmin={isAdmin}
          isSelf={editing !== "new" && editing.id === currentUserId}
          onDone={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add a person
        </button>
      )}

      <Group title="Active" count={active.length}>
        {active.map((p) => (
          <Row key={p.id} person={p} isSelf={p.id === currentUserId} onEdit={() => setEditing(p)} />
        ))}
        {active.length === 0 && <Empty>Nobody yet.</Empty>}
      </Group>

      {inactive.length > 0 && (
        <Group title="Leavers and people on leave" count={inactive.length}>
          {inactive.map((p) => (
            <Row key={p.id} person={p} isSelf={p.id === currentUserId} onEdit={() => setEditing(p)} />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="label mb-2">
        {title} <span className="ml-1.5 tabular text-[var(--ink-faint)]">{count}</span>
      </h2>
      <ul className="card divide-y" style={{ borderColor: "var(--border)" }}>{children}</ul>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">{children}</li>;
}

function Row({ person, isSelf, onEdit }: { person: Person; isSelf: boolean; onEdit: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <span className="min-w-[12rem] flex-1">
        <span className="block text-[13.5px] font-medium">
          {person.name}
          {isSelf && <span className="ml-1.5 text-[11px] text-[var(--ink-faint)]">(you)</span>}
        </span>
        <span className="block text-[11.5px] text-[var(--ink-faint)]">
          {[person.employeeRef, person.jobTitle, person.email].filter(Boolean).join(" · ")}
        </span>
      </span>

      <span
        className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
        style={{ background: "var(--surface-sunk)", borderColor: "var(--border-strong)", color: "var(--ink-soft)" }}
      >
        {person.role}
      </span>

      {person.status !== "ACTIVE" && (
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--st-none-bg)", color: "var(--st-none-fg)" }}
        >
          {person.status === "LEFT" ? "Leaver" : "On leave"}
        </span>
      )}

      {!person.hasPassword && person.status === "ACTIVE" && (
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "var(--st-training-bg)", color: "var(--st-training-fg)" }}
          title="They cannot sign in until a password is set"
        >
          No sign-in
        </span>
      )}

      <span className="text-[11.5px] text-[var(--ink-faint)] tabular min-w-[7rem] text-right">
        {person.startedOn ? `Started ${formatDate(person.startedOn)}` : "—"}
      </span>

      <button type="button" className="btn !h-8 text-[12.5px]" onClick={onEdit}>Edit</button>
    </li>
  );
}

function PersonForm({
  person, isAdmin, isSelf, onDone,
}: {
  person: Person | null; isAdmin: boolean; isSelf: boolean; onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(savePerson, {});
  const [role, setRole] = useState(person?.role ?? "OPERATOR");

  useEffect(() => {
    if (state.ok) { router.refresh(); if (person) onDone(); }
  }, [state.ok, router, person, onDone]);

  return (
    <section className="card card-pad space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {person ? `Edit ${person.name}` : "Add a person"}
        </h2>
        <button type="button" className="text-[12.5px] text-[var(--ink-faint)] hover:underline" onClick={onDone}>
          {person ? "Cancel" : "Close"}
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        {person && <input type="hidden" name="id" value={person.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="p-name">
            <input id="p-name" name="name" required className="input"
                   defaultValue={person?.name ?? ""} placeholder="Full name" />
          </Field>
          <Field label="Email" htmlFor="p-email" hint="Used to sign in. Must be unique.">
            <input id="p-email" name="email" type="email" required className="input"
                   defaultValue={person?.email ?? ""} placeholder="name@yourcompany.co.uk" />
          </Field>
          <Field label="Clock number" htmlFor="p-ref" hint="Optional. Shown on the matrix.">
            <input id="p-ref" name="employeeRef" className="input"
                   defaultValue={person?.employeeRef ?? ""} placeholder="e.g. E-1024" />
          </Field>
          <Field label="Job title" htmlFor="p-job">
            <input id="p-job" name="jobTitle" className="input"
                   defaultValue={person?.jobTitle ?? ""} placeholder="e.g. Press Brake Operator" />
          </Field>
          <Field label="Start date" htmlFor="p-started">
            <input id="p-started" name="startedOn" type="date" className="input"
                   defaultValue={person?.startedOn ?? ""} />
          </Field>
          <Field label="Role" htmlFor="p-role" hint={ROLE_HELP[role]}>
            <select
              id="p-role" name="role" className="input" value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSelf}
            >
              <option value="OPERATOR">Operator</option>
              <option value="TRAINER">Trainer</option>
              <option value="MANAGER">Manager</option>
              {isAdmin && <option value="ADMIN">Administrator</option>}
            </select>
          </Field>
        </div>
        {isSelf && <input type="hidden" name="role" value={person?.role ?? "ADMIN"} />}

        <div className="grid gap-4 sm:grid-cols-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <Field
            label={person ? "Set a new password" : "Password"}
            htmlFor="p-password"
            hint={person
              ? "Leave blank to keep the current one."
              : "At least 10 characters. Leave blank if they only sign records on a shared tablet."}
          >
            <input id="p-password" name="password" type="password" minLength={10}
                   autoComplete="new-password" className="input" />
          </Field>
          <Field
            label={person ? "Set a new PIN" : "Shop-floor PIN"}
            htmlFor="p-pin"
            hint="4 to 8 digits. Required to sign a training record."
          >
            <input id="p-pin" name="pin" inputMode="numeric" pattern="\d{4,8}"
                   autoComplete="off" className="input max-w-[10rem]" placeholder="••••" />
          </Field>
        </div>

        {state.error && <Banner tone="bad">{state.error}</Banner>}
        {state.ok && <Banner tone="good">{state.ok}</Banner>}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : person ? "Save changes" : "Add person"}
          </button>
          {person && !isSelf && <StatusControls person={person} />}
        </div>
      </form>
    </section>
  );
}

function StatusControls({ person }: { person: Person }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setEmploymentStatus, {});
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);

  const next = person.status === "ACTIVE" ? "LEFT" : "ACTIVE";

  return (
    <span className="flex flex-wrap items-center gap-2">
      {/* A separate form: employment status is not part of editing details. */}
      <button
        type="submit" form="status-form" name="status" value={next}
        className="btn" disabled={pending}
        style={next === "LEFT" ? { color: "var(--st-suspended-fg)" } : undefined}
      >
        {pending ? "…" : next === "LEFT" ? "Mark as leaver" : "Mark as active"}
      </button>
      {person.status === "ACTIVE" && (
        <button type="submit" form="status-form" name="status" value="ON_LEAVE" className="btn" disabled={pending}>
          Mark on leave
        </button>
      )}

      <form id="status-form" action={formAction} className="contents">
        <input type="hidden" name="id" value={person.id} />
      </form>

      {state.error && <span className="w-full"><Banner tone="bad">{state.error}</Banner></span>}
      {person.competences > 0 && (
        <span className="text-[11.5px] text-[var(--ink-faint)]">
          {person.competences} training record{person.competences === 1 ? "" : "s"} kept either way
        </span>
      )}
    </span>
  );
}
