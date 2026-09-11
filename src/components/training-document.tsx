import type { TrainingBody } from "@/lib/documents";
import { TRAINING_KEY } from "@/lib/documents";
import { formatDate } from "@/lib/competence";
import type { DocMeta } from "./sop-document";

/**
 * A process training sign-off.
 *
 * The paper version carries the trainee's name, the dates and a pair of
 * signature boxes beside every numbered line. Here the document defines only
 * the areas — who has been signed off on what lives on each trainee's training
 * record, so one sheet serves the whole team instead of being photocopied per
 * person. The layout otherwise follows the paper form, so it is recognisable
 * to anyone who has used one.
 */
export function TrainingDocument({
  body,
  meta,
  draft = false,
}: {
  body: TrainingBody;
  meta: DocMeta;
  draft?: boolean;
}) {
  const equipment = [
    ["Type of equipment", body.equipment.type],
    ["Manufacturer", body.equipment.manufacturer],
    ["Model", body.equipment.model],
    ["Location", body.equipment.location],
    ["Target average", body.equipment.targetAverage],
  ].filter(([, v]) => v);

  return (
    <article className="doc" aria-label={`${meta.reference} ${meta.title}`}>
      <header className="doc-bar">
        <h2>Process Training Sign-Off</h2>
        {draft && <span className="doc-flag">Draft — not in force</span>}
        {meta.status === "SUPERSEDED" && <span className="doc-flag">Superseded</span>}
      </header>

      <dl className="doc-meta">
        <Meta label="Title" value={meta.title || "—"} wide />
        <Meta label="Reference" value={meta.reference} mono />
        <Meta label="Issue date" value={meta.issuedOn ? formatDate(meta.issuedOn) : "Not issued"} />
        <Meta label="Revision" value={String(meta.revision)} />
        <Meta label="Machine" value={meta.machineCode ?? "Site-wide"} mono />
      </dl>

      <section className="doc-preamble">
        <div>
          <p className="label">Process</p>
          <p className="text-[13px] font-medium">{body.process || "—"}</p>
          {body.sopReference && (
            <>
              <p className="label mt-2.5">Procedure reference</p>
              <p className="font-mono text-[13px] font-medium">{body.sopReference}</p>
            </>
          )}
        </div>

        {equipment.length > 0 && (
          <div className="sm:col-span-2">
            <p className="label">Equipment</p>
            <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {equipment.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-[12.5px]">
                  <dt className="text-[var(--ink-faint)]">{k}</dt>
                  <dd className="font-medium text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      <section className="tr-areas">
        <div className="tr-areas-head">
          <h3>Required training sign-off areas</h3>
          <span className="tabular">{body.areas.length}</span>
        </div>
        <ol className="tr-list">
          {body.areas.map((area, i) => (
            <li key={i} className="tr-item">
              <span className="tr-no tabular">{i + 1}</span>
              <span className="tr-label">
                {area.label || <span className="text-[var(--ink-faint)]">—</span>}
              </span>
              {area.reference && <span className="tr-ref font-mono">{area.reference}</span>}
              {/* The paper form's signature boxes. On screen these are filled
                  per trainee on their training record; on a printout they are
                  somewhere to write. */}
              <span className="tr-sign" aria-hidden>
                <span className="tr-sign-box">Date</span>
                <span className="tr-sign-box">Operator</span>
                <span className="tr-sign-box">Team leader</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="tr-key">
        <p className="label mb-2">Training key</p>
        <ol className="tr-key-list">
          {TRAINING_KEY.map((k) => (
            <li key={k.level}>
              <span className="tr-key-level tabular">{k.level}</span>
              <span>{k.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {body.notes && (
        <section className="doc-preamble" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <p className="label">Notes</p>
            <p className="text-[13px] leading-relaxed">{body.notes}</p>
          </div>
        </section>
      )}

      <div className="tr-approval">
        <div><span className="label">Trainee</span><span className="tr-rule" /></div>
        <div><span className="label">Designated trainer</span><span className="tr-rule" /></div>
        <div><span className="label">Manager approval</span><span className="tr-rule" /></div>
        <div><span className="label">Date completed</span><span className="tr-rule" /></div>
      </div>

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
