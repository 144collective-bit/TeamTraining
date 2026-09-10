import type { RaBody } from "@/lib/documents";
import { riskScore, riskBand, LIKELIHOOD_LABELS, SEVERITY_LABELS } from "@/lib/documents";
import { formatDate } from "@/lib/competence";
import type { DocMeta } from "./sop-document";

export function RaDocument({
  body,
  meta,
  draft = false,
}: {
  body: RaBody;
  meta: DocMeta;
  draft?: boolean;
}) {
  return (
    <article className="doc" aria-label={`${meta.reference} ${meta.title}`}>
      <header className="doc-bar">
        <h2>Risk Assessment</h2>
        {draft && <span className="doc-flag">Draft — not in force</span>}
        {meta.status === "SUPERSEDED" && <span className="doc-flag">Superseded</span>}
      </header>

      <dl className="doc-meta">
        <MetaCell label="Title" value={meta.title || "—"} wide />
        <MetaCell label="Reference" value={meta.reference} mono />
        <MetaCell label="Issue date" value={meta.issuedOn ? formatDate(meta.issuedOn) : "Not issued"} />
        <MetaCell label="Revision" value={String(meta.revision)} />
        <MetaCell label="Assessed by" value={body.assessedBy || "—"} />
      </dl>

      {body.scope && (
        <section className="doc-preamble" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <p className="label">Scope</p>
            <p className="text-[13px] leading-relaxed">{body.scope}</p>
          </div>
        </section>
      )}

      <div className="overflow-x-auto">
        <table className="ra-table">
          <thead>
            <tr>
              <th style={{ minWidth: "10rem" }}>Hazard</th>
              <th style={{ minWidth: "8rem" }}>Who is at risk</th>
              <th style={{ minWidth: "14rem" }}>Existing controls</th>
              <th style={{ minWidth: "7rem" }}>Risk</th>
              <th style={{ minWidth: "11rem" }}>Further action</th>
              <th style={{ minWidth: "7rem" }}>Residual</th>
            </tr>
          </thead>
          <tbody>
            {body.hazards.map((h, i) => {
              const initial = riskScore(h.likelihood, h.severity);
              const residual =
                h.residualLikelihood && h.residualSeverity
                  ? riskScore(h.residualLikelihood, h.residualSeverity)
                  : null;
              return (
                <tr key={i}>
                  <td className="font-medium">{h.hazard || "—"}</td>
                  <td className="text-[var(--ink-soft)]">{h.whoAtRisk || "—"}</td>
                  <td>
                    {h.existingControls.length > 0 ? (
                      <ul className="space-y-0.5 text-[var(--ink-soft)]">
                        {h.existingControls.map((c, n) => (
                          <li key={n} className="flex gap-1.5">
                            <span aria-hidden>·</span><span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-[var(--ink-faint)]">—</span>}
                  </td>
                  <td><ScorePill likelihood={h.likelihood} severity={h.severity} value={initial} /></td>
                  <td className="text-[var(--ink-soft)]">{h.furtherAction || "—"}</td>
                  <td>
                    {residual !== null ? (
                      <ScorePill
                        likelihood={h.residualLikelihood!}
                        severity={h.residualSeverity!}
                        value={residual}
                      />
                    ) : <span className="text-[var(--ink-faint)]">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="doc-preamble" style={{ borderTop: "1px solid var(--border-strong)", borderBottom: 0 }}>
        <div>
          <p className="label">How risk is scored</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-soft)]">
            Likelihood × severity, each rated 1 to 5. Low 1–4, medium 5–9, high 10–14,
            very high 15–25. Anything scoring high or above needs further action before
            the task proceeds.
          </p>
        </div>
      </div>

      <footer className="doc-foot">
        <span>{meta.reference} · Revision {meta.revision}</span>
        <span className="doc-foot-warn">Uncontrolled document if printed</span>
        <span>{meta.issuedOn ? formatDate(meta.issuedOn) : "Draft"}</span>
      </footer>
    </article>
  );
}

function ScorePill({
  likelihood, severity, value,
}: { likelihood: number; severity: number; value: number }) {
  const band = riskBand(value);
  return (
    <span
      className="ra-score"
      style={{ background: band.bg, color: band.fg, borderColor: band.border }}
      title={`${LIKELIHOOD_LABELS[likelihood]} × ${SEVERITY_LABELS[severity]}`}
    >
      <span className="tabular">{likelihood}×{severity}={value}</span>
      <span>{band.label}</span>
    </span>
  );
}

function MetaCell({
  label, value, mono, wide,
}: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "doc-meta-cell is-wide" : "doc-meta-cell"}>
      <dt className="label !text-[9.5px]">{label}</dt>
      <dd className={`mt-0.5 text-[13px] font-semibold ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
