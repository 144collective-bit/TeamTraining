import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCompetence } from "@/lib/queries";
import { streamHistory, verifyStream } from "@/lib/events";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { StatusPill } from "@/components/status-pill";
import { formatDate, formatDateTime, daysUntil, type Status, type Level } from "@/lib/competence";
import { CompetenceActions, VoidSignOff } from "@/components/competence-actions";
import { AcknowledgeBanner } from "@/components/acknowledge-banner";
import { atLeast } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

export default async function CompetencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getCompetence(user.tenantId, id);
  if (!data) notFound();

  const { record, signatures, sessions, signOffs, assessments, openSession, ackRequired } = data;
  const canManage = atLeast(user.role as never, "MANAGER");
  const canTrain =
    atLeast(user.role as never, "TRAINER") || record.trainerId === user.id;
  const [history, integrity] = await Promise.all([streamHistory(id), verifyStream(id)]);

  const expiryDays = daysUntil(record.expiresOn);

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/people/${record.userId}` as never} className="hover:underline">{record.userName}</Link>
            {" · "}
            <Link href={`/machines/${record.machineId}` as never} className="font-mono hover:underline">{record.machineCode}</Link>
          </>
        }
        title="Training record"
        description={`${record.userName} on ${record.machineName}`}
        actions={<PrintButton label="Evidence pack" />}
      />

      <div className="p-5 sm:p-7 space-y-6">
        {ackRequired && (
          <AcknowledgeBanner
            competenceId={record.id}
            documentId={ackRequired.documentId}
            reference={ackRequired.reference}
            revision={ackRequired.revision}
            changeSummary={ackRequired.changeSummary}
            personName={record.userName}
            canConfirm={record.userId === user.id || canManage}
          />
        )}

        {record.suspensionReason && (
          <div
            className="card px-4 py-3"
            style={{ borderColor: "var(--st-suspended-br)", background: "var(--st-suspended-bg)", color: "var(--st-suspended-fg)" }}
          >
            <p className="text-[12px] font-bold uppercase tracking-wide">Not authorised to operate</p>
            <p className="mt-1 text-[13.5px]">{record.suspensionReason}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6 min-w-0">
            {/* Status */}
            <section className="card card-pad">
              <div className="flex flex-wrap items-center gap-4">
                <StatusPill status={record.status as Status} level={record.level as Level} />
                {record.status === "COMPETENT" && record.expiresOn && (
                  <span className="text-[13px] tabular" style={{ color: expiryDays !== null && expiryDays < 60 ? "var(--st-revalidate-fg)" : "var(--ink-soft)" }}>
                    Expires {formatDate(record.expiresOn)}
                    {expiryDays !== null && (expiryDays < 0 ? ` · ${Math.abs(expiryDays)} days overdue` : expiryDays < 60 ? ` · in ${expiryDays} days` : "")}
                  </span>
                )}
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <Field label="Training started">{formatDate(record.trainingStartedOn)}</Field>
                <Field label="Competent from">{formatDate(record.competentFrom)}</Field>
                <Field label="Trainer">{record.trainerName ?? "—"}</Field>
                <Field label="Approved by">{record.approverName ?? "—"}</Field>
                <Field label="Last review">{formatDate(record.lastReviewOn)}</Field>
                <Field label="Next review due">{formatDate(record.nextReviewDue)}</Field>
              </dl>
            </section>

            <CompetenceActions
              competenceId={record.id}
              status={record.status as Status}
              traineeName={record.userName}
              machineCode={record.machineCode}
              openSessionId={openSession?.id ?? null}
              signedRoles={signatures.map((s) => s.role)}
              lastAssessmentPassed={assessments[0]?.passed ?? null}
              canTrain={canTrain}
              canManage={canManage}
            />

            {/* Daily sign-offs */}
            <section className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-[15px] font-semibold tracking-tight">Daily training sign-offs</h2>
                <span className="text-[12px] text-[var(--ink-faint)] tabular">{signOffs.length}</span>
              </div>
              {signOffs.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
                  No daily sign-offs recorded.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {signOffs.map((s) => {
                    const lagHours = Math.round((s.recordedAt.getTime() - s.occurredAt.getTime()) / 3_600_000);
                    return (
                      <li key={s.id} className="px-5 py-3" style={s.voidedAt ? { opacity: 0.55 } : undefined}>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-[13px] font-semibold tabular">{formatDate(s.onDate)}</span>
                          <Rating value={s.rating} />
                          <span className="text-[11.5px] text-[var(--ink-faint)]">
                            {Array.isArray(s.stepsCovered) && s.stepsCovered.length > 0
                              ? `Steps ${(s.stepsCovered as number[]).join(", ")}`
                              : ""}
                          </span>
                          <span className="ml-auto text-[11.5px] text-[var(--ink-faint)]">{s.recorderName}</span>
                        </div>
                        {s.note && <p className="mt-1 text-[12.5px] text-[var(--ink-soft)]">{s.note}</p>}
                        {!s.voidedAt && canTrain && (
                          <div className="mt-1 no-print"><VoidSignOff signOffId={s.id} /></div>
                        )}
                        {s.voidedAt && (
                          <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--st-suspended-fg)" }}>
                            Voided — {s.voidReason}
                          </p>
                        )}
                        {lagHours > 24 && (
                          <p className="mt-1 text-[11px]" style={{ color: "var(--st-revalidate-fg)" }}>
                            Recorded {lagHours} hours after the training took place
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {assessments.length > 0 && (
              <section className="card">
                <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                  <h2 className="text-[15px] font-semibold tracking-tight">Assessments</h2>
                </div>
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {assessments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                        style={
                          a.passed
                            ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)" }
                            : { background: "var(--st-training-bg)", color: "var(--st-training-fg)" }
                        }
                      >
                        {a.passed ? "PASSED" : "NOT YET"}
                      </span>
                      <span className="text-[13px] font-medium">{a.assessorName}</span>
                      <span className="ml-auto text-[11.5px] text-[var(--ink-faint)] tabular">
                        {formatDateTime(a.assessedAt)}
                      </span>
                      {a.note && (
                        <p className="w-full text-[12.5px] text-[var(--ink-soft)]">{a.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Signatures */}
            <section className="card">
              <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-[15px] font-semibold tracking-tight">Signatures</h2>
                <p className="mt-0.5 text-[12.5px] text-[var(--ink-soft)]">
                  Each signature records who signed, what they declared, the exact procedure content they signed
                  against, and both the device and server clocks.
                </p>
              </div>
              {signatures.length === 0 ? (
                <p className="px-5 py-8 text-center text-[13px] text-[var(--ink-faint)]">
                  Not yet signed. A competence needs all three signatures — trainee, trainer and manager.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {signatures.map((s) => (
                    <li key={s.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="label">{s.role}</span>
                        <span className="text-[13.5px] font-semibold">{s.signerName}</span>
                        <span className="ml-auto text-[11.5px] text-[var(--ink-faint)] tabular">
                          {formatDateTime(s.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] italic text-[var(--ink-soft)]">“{s.declaration}”</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--ink-faint)]">
                        {s.reauthenticated && (
                          <span
                            className="rounded-full px-1.5 py-0.5 font-semibold"
                            style={{ background: "var(--st-competent-bg)", color: "var(--st-competent-fg)" }}
                          >
                            Re-authenticated at signing
                          </span>
                        )}
                        <span className="font-mono break-all">content {s.contentHash.slice(0, 24)}…</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Audit trail */}
          <aside className="space-y-6">
            <section className="card">
              <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-[15px] font-semibold tracking-tight">Audit trail</h2>
              </div>

              <div
                className="mx-5 my-3 flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium"
                style={
                  integrity.ok
                    ? { background: "var(--st-competent-bg)", color: "var(--st-competent-fg)", borderColor: "var(--st-competent-br)" }
                    : { background: "var(--st-suspended-bg)", color: "var(--st-suspended-fg)", borderColor: "var(--st-suspended-br)" }
                }
              >
                <span aria-hidden>{integrity.ok ? "✓" : "✕"}</span>
                {integrity.ok
                  ? `Hash chain verified — ${integrity.checked} events, unaltered`
                  : `Integrity check FAILED at event ${integrity.brokenAt?.seq}: ${integrity.brokenAt?.reason}`}
              </div>

              <ol className="divide-y" style={{ borderColor: "var(--border)" }}>
                {history.map((e) => (
                  <li key={e.id} className="px-5 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] text-[var(--ink-faint)] tabular">#{e.seq}</span>
                      <span className="text-[12.5px] font-semibold">{humanise(e.eventType)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-faint)] tabular">
                      {formatDateTime(e.occurredAt)}
                      {e.actorName ? ` · ${e.actorName}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <p className="text-[11.5px] leading-relaxed text-[var(--ink-faint)] px-1">
              Events are append-only and hash-chained. Corrections are recorded as new events —
              nothing in this history can be edited or removed, including by an administrator.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}

function humanise(eventType: string) {
  return eventType.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-medium tabular">{children}</dd>
    </div>
  );
}

function Rating({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" title={`Rating ${value} of 5`} aria-label={`Rating ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="h-3.5 w-1 rounded-full"
              style={{ background: n <= value ? "var(--st-training-fg)" : "var(--border-strong)" }} />
      ))}
    </span>
  );
}
