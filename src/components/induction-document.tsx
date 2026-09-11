import type { InductionBody } from "@/lib/documents";
import { formatDate } from "@/lib/competence";
import type { DocMeta } from "./sop-document";

/** The checklist a new starter is walked through, as a controlled document. */
export function InductionDocument({
  body,
  meta,
  draft = false,
}: {
  body: InductionBody;
  meta: DocMeta;
  draft?: boolean;
}) {
  return (
    <article className="doc" aria-label={`${meta.reference} ${meta.title}`}>
      <header className="doc-bar">
        <h2>Induction Checklist</h2>
        {draft && <span className="doc-flag">Draft — not in force</span>}
        {meta.status === "SUPERSEDED" && <span className="doc-flag">Superseded</span>}
      </header>

      <dl className="doc-meta">
        <Meta label="Title" value={meta.title || "—"} wide />
        <Meta label="Reference" value={meta.reference} mono />
        <Meta label="Issue date" value={meta.issuedOn ? formatDate(meta.issuedOn) : "Not issued"} />
        <Meta label="Revision" value={String(meta.revision)} />
        <Meta label="Items" value={String(body.items.length)} />
      </dl>

      {body.scope && (
        <section className="doc-preamble" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <p className="label">Scope</p>
            <p className="text-[13px] leading-relaxed">{body.scope}</p>
          </div>
        </section>
      )}

      <ol className="tr-list">
        {body.items.map((item, i) => (
          <li key={i} className="tr-item">
            <span className="tr-no tabular">{i + 1}</span>
            <span className="tr-label">
              {item.label || <span className="text-[var(--ink-faint)]">—</span>}
            </span>
            {item.reference && <span className="tr-ref font-mono">{item.reference}</span>}
            <span className="tr-sign" aria-hidden>
              <span className="tr-sign-box">Date</span>
              <span className="tr-sign-box">Completed by</span>
            </span>
          </li>
        ))}
      </ol>

      <footer className="doc-foot">
        <span>{meta.reference} · Revision {meta.revision}</span>
        <span className="doc-foot-warn">Uncontrolled document if printed</span>
        <span>{meta.issuedOn ? formatDate(meta.issuedOn) : "Draft"}</span>
      </footer>
    </article>
  );
}

function Meta({
  label, value, mono, wide,
}: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "doc-meta-cell is-wide" : "doc-meta-cell"}>
      <dt className="label !text-[9.5px]">{label}</dt>
      <dd className={`mt-0.5 text-[13px] font-semibold ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
