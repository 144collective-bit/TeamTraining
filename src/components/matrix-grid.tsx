"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MatrixMachine, MatrixRow, Coverage } from "@/lib/queries";
import {
  STATUS_META, LEVEL_META, formatDate, daysUntil,
  type Status, type Level,
} from "@/lib/competence";

type Filter = "ALL" | "GAPS" | "ACTION" | "TRAINING";

export function MatrixGrid({
  machines,
  rows,
  coverage,
}: {
  machines: MatrixMachine[];
  rows: MatrixRow[];
  coverage: Coverage[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [area, setArea] = useState<string>("ALL");

  const areas = useMemo(() => {
    const seen = new Map<string, string>();
    machines.forEach((m) => seen.set(m.areaId, m.areaName));
    return [...seen.entries()];
  }, [machines]);

  const visibleMachines = useMemo(
    () => (area === "ALL" ? machines : machines.filter((m) => m.areaId === area)),
    [machines, area],
  );

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !(r.employeeRef ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filter === "ALL") return true;
      const cells = visibleMachines.map((m) => r.cells[m.id]);
      if (filter === "GAPS") return cells.some((c) => !c || c.status === "NOT_TRAINED");
      if (filter === "ACTION")
        return cells.some((c) => c && (c.status === "SUSPENDED" || c.status === "REQUIRES_REVALIDATION"));
      if (filter === "TRAINING")
        return cells.some((c) => c && (c.status === "IN_TRAINING" || c.status === "ASSESSMENT" || c.status === "INDUCTION"));
      return true;
    });
  }, [rows, query, filter, visibleMachines]);

  const coverageBy = useMemo(
    () => Object.fromEntries(coverage.map((c) => [c.machineId, c])),
    [coverage],
  );

  const atRisk = coverage.filter((c) => c.competent <= 1);

  return (
    <div className="space-y-4">
      {/* Single-point-of-failure warning: the report a manager acts on first */}
      {atRisk.length > 0 && (
        <div
          className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          style={{ borderColor: "var(--st-revalidate-br)", background: "var(--st-revalidate-bg)" }}
        >
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-bold"
            style={{ background: "var(--st-revalidate-fg)", color: "var(--st-revalidate-bg)" }}
            aria-hidden
          >
            !
          </span>
          <p className="text-[13.5px] font-medium" style={{ color: "var(--st-revalidate-fg)" }}>
            {atRisk.length} machine{atRisk.length === 1 ? " has" : "s have"} one competent operator or fewer —
            production stops on that machine if they are absent.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {atRisk.map((c) => (
              <Link
                key={c.machineId}
                href={`/machines/${c.machineId}` as never}
                className="rounded px-1.5 py-0.5 font-mono text-[11.5px] font-semibold"
                style={{ background: "var(--st-revalidate-fg)", color: "var(--st-revalidate-bg)" }}
              >
                {c.code}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-[16rem]"
          placeholder="Search name or clock number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search people"
        />

        <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
          {([
            ["ALL", "All"],
            ["TRAINING", "In training"],
            ["ACTION", "Needs action"],
            ["GAPS", "Has gaps"],
          ] as [Filter, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className="rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors"
              style={
                filter === value
                  ? { background: "var(--accent)", color: "#fff" }
                  : { color: "var(--ink-soft)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        <select
          className="input w-auto"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          aria-label="Filter by area"
        >
          <option value="ALL">All areas</option>
          {areas.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        <span className="ml-auto text-[13px] text-[var(--ink-faint)] tabular">
          {visibleRows.length} of {rows.length} people · {visibleMachines.length} machines
        </span>
      </div>

      {/* The grid */}
      <div className="matrix-wrap">
        <table className="matrix">
          <caption className="sr-only">
            Training matrix: people down the left, machines across the top.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="name-col col-head text-left align-bottom px-4 pb-3">
                <span className="label">Operator</span>
              </th>
              {visibleMachines.map((m) => (
                <th key={m.id} scope="col" className="col-head">
                  <div className="col-head-inner">
                    <Link href={`/machines/${m.id}` as never} className="hover:underline">
                      <span className="font-mono font-bold">{m.code}</span>
                      <span className="text-[var(--ink-faint)]"> · {m.name}</span>
                    </Link>
                  </div>
                </th>
              ))}
              <th className="col-spacer" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.userId}>
                <th scope="row" className="name-col text-left font-normal px-4 py-2">
                  <Link href={`/people/${row.userId}` as never} className="group block">
                    <span className="block text-[13.5px] font-medium group-hover:underline">
                      {row.name}
                    </span>
                    <span className="block text-[11.5px] text-[var(--ink-faint)] truncate">
                      {row.employeeRef} · {row.jobTitle}
                    </span>
                  </Link>
                </th>
                {visibleMachines.map((m) => (
                  <td key={m.id} className="cell">
                    <Cell cell={row.cells[m.id]} person={row.name} machine={m} />
                  </td>
                ))}
                <td aria-hidden />
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={visibleMachines.length + 2} className="p-10 text-center text-[var(--ink-faint)]">
                  No one matches those filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="name-col text-left px-4 py-2.5 align-middle">
                <span className="label">Competent operators</span>
              </th>
              {visibleMachines.map((m) => {
                const c = coverageBy[m.id];
                const n = c?.competent ?? 0;
                return (
                  <td key={m.id} className="cell align-middle">
                    <span
                      className="tabular text-[15px] font-bold"
                      style={{ color: n === 0 ? "var(--st-suspended-fg)" : n === 1 ? "var(--st-revalidate-fg)" : "var(--ink-soft)" }}
                      title={`${n} competent operator${n === 1 ? "" : "s"}`}
                    >
                      {n}
                    </span>
                  </td>
                );
              })}
              <td aria-hidden />
            </tr>
          </tfoot>
        </table>
      </div>

      <Legend />
    </div>
  );
}

function Cell({
  cell,
  person,
  machine,
}: {
  cell: MatrixRow["cells"][string] | undefined;
  person: string;
  machine: MatrixMachine;
}) {
  const status: Status = cell?.status ?? "NOT_TRAINED";
  const meta = STATUS_META[status];
  const level = (cell?.level ?? "NONE") as Level;
  const isTrainer = status === "COMPETENT" && level === "TRAINER";

  const expiryDays = daysUntil(cell?.expiresOn ?? null);
  const expiringSoon = status === "COMPETENT" && expiryDays !== null && expiryDays < 60;

  const title = [
    `${person} · ${machine.code} ${machine.name}`,
    `${meta.label}${level !== "NONE" ? ` (${LEVEL_META[level].label})` : ""}`,
    cell?.competentFrom ? `Competent from ${formatDate(cell.competentFrom)}` : null,
    cell?.expiresOn ? `Expires ${formatDate(cell.expiresOn)}` : null,
    cell?.suspensionReason,
  ]
    .filter(Boolean)
    .join("\n");

  const content = (
    <>
      <span aria-hidden>{meta.glyph}</span>
      {level !== "NONE" && <span className="sub">{LEVEL_META[level].abbr}</span>}
    </>
  );

  const className = `chip st-${status}${isTrainer ? " is-trainer" : ""}`;

  if (!cell) {
    return (
      <span className={className} title={title} role="img" aria-label={`${person}, ${machine.name}: no training recorded`}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href={`/competence/${cell.competenceId}` as never}
      className={className}
      title={title}
      aria-label={`${person}, ${machine.name}: ${meta.label}`}
      style={
        expiringSoon
          ? { boxShadow: "inset 0 -3px 0 0 var(--st-revalidate-fg)" }
          : undefined
      }
    >
      {content}
    </Link>
  );
}

function Legend() {
  const order: Status[] = [
    "COMPETENT", "IN_TRAINING", "ASSESSMENT", "INDUCTION",
    "REQUIRES_REVALIDATION", "SUSPENDED", "NOT_TRAINED",
  ];
  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div>
          <p className="label mb-2">Status</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {order.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className={`chip st-${s}`} style={{ width: "1.75rem", height: "1.75rem", fontSize: "0.8125rem" }} aria-hidden>
                  {STATUS_META[s].glyph}
                </span>
                <span className="text-[12.5px]">
                  <span className="font-medium">{STATUS_META[s].label}</span>
                  <span className="block text-[11px] text-[var(--ink-faint)]">{STATUS_META[s].description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-l pl-6 hidden xl:block" style={{ borderColor: "var(--border)" }}>
          <p className="label mb-2">Level</p>
          <ul className="space-y-1">
            {(["SUPERVISED", "INDEPENDENT", "EXPERT", "TRAINER"] as Level[]).map((l) => (
              <li key={l} className="flex items-center gap-2 text-[12.5px]">
                <span className="font-mono font-bold text-[11px] text-[var(--ink-faint)] w-5">{LEVEL_META[l].abbr}</span>
                <span>{LEVEL_META[l].label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 pt-3 border-t text-[11.5px] text-[var(--ink-faint)]" style={{ borderColor: "var(--border)" }}>
        A cell with an amber underline expires within 60 days. The bottom row counts competent operators per machine —
        anything at 1 or 0 is a single point of failure.
      </p>
    </div>
  );
}
