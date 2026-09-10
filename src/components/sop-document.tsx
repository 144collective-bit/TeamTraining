import Image from "next/image";
import type { SopBody } from "@/lib/documents";
import { formatDate } from "@/lib/competence";

export type DocMeta = {
  title: string;
  reference: string;
  revision: number;
  issuedOn: string | Date | null;
  machineCode?: string | null;
  status?: string;
};

/**
 * The controlled-document view: a metadata header, numbered step cards each
 * pairing an instruction with a photograph, and the safety strips along the
 * bottom. Laid out to read the same on screen and on an A4 printout.
 */
export function SopDocument({
  body,
  meta,
  draft = false,
}: {
  body: SopBody;
  meta: DocMeta;
  draft?: boolean;
}) {
  return (
    <article className="doc" aria-label={`${meta.reference} ${meta.title}`}>
      <header className="doc-bar">
        <h2>Standard Operating Procedure</h2>
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

      {(body.purpose || body.ppe.length > 0 || body.hazards.length > 0) && (
        <section className="doc-preamble">
          {body.purpose && (
            <div>
              <p className="label">Purpose</p>
              <p className="text-[13px] leading-relaxed">{body.purpose}</p>
            </div>
          )}
          {body.ppe.length > 0 && (
            <div>
              <p className="label">PPE required</p>
              <ul className="doc-tags">
                {body.ppe.map((p) => <li key={p} className="doc-tag">{p}</li>)}
              </ul>
            </div>
          )}
          {body.hazards.length > 0 && (
            <div>
              <p className="label">Hazards</p>
              <ul className="doc-tags">
                {body.hazards.map((h) => <li key={h} className="doc-tag is-hazard">{h}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <ol className="doc-steps">
        {body.steps.map((step, i) => (
          <li key={i} className="doc-step">
            <div className="doc-step-head">
              <span className="doc-step-no">Step {i + 1}</span>
            </div>

            <div className="doc-step-body">
              <div className="doc-step-text">
                <p className="text-[13px] leading-relaxed font-medium">
                  {step.instruction || <span className="text-[var(--ink-faint)]">No instruction yet</span>}
                </p>

                {step.keyPoints.length > 0 && (
                  <div className="mt-2.5">
                    <p className="label !text-[9.5px]">Key points</p>
                    <ul className="mt-1 space-y-0.5">
                      {step.keyPoints.map((k, n) => (
                        <li key={n} className="flex gap-1.5 text-[12px] leading-snug">
                          <span style={{ color: "var(--accent)" }} aria-hidden>▸</span>
                          <span>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {step.reasons.length > 0 && (
                  <div className="mt-2">
                    <p className="label !text-[9.5px]">Reason</p>
                    <ul className="mt-1 space-y-0.5">
                      {step.reasons.map((r, n) => (
                        <li key={n} className="text-[12px] leading-snug text-[var(--ink-soft)]">{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <figure className="doc-step-figure">
                {step.imageId ? (
                  // Uploaded photographs are arbitrary dimensions and served
                  // from our own route, so plain img with object-fit is right.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/attachments/${step.imageId}`}
                    alt={step.imageCaption ?? `Step ${i + 1}: ${step.instruction}`.slice(0, 120)}
                    // Eager, not lazy: a procedure with six steps is a handful of
                    // small images, and lazily-loaded ones can be missing from a
                    // printout - which is exactly how these documents get used.
                    loading="eager"
                  />
                ) : (
                  <div className="doc-step-nophoto" aria-hidden>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <circle cx="8.5" cy="10" r="1.5" />
                      <path d="m21 15-4.5-4.5L9 18" />
                    </svg>
                    <span>No photo</span>
                  </div>
                )}
                {step.imageCaption && <figcaption>{step.imageCaption}</figcaption>}
              </figure>
            </div>
          </li>
        ))}
      </ol>

      {(body.safetyCheck || body.carePoint) && (
        <div className="doc-strips">
          <div className="doc-strip is-safety">
            <span className="doc-strip-label">Safety check</span>
            <span className="doc-strip-text">{body.safetyCheck || "—"}</span>
          </div>
          <div className="doc-strip is-care">
            <span className="doc-strip-label">Care point</span>
            <span className="doc-strip-text">{body.carePoint || "—"}</span>
          </div>
        </div>
      )}

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
