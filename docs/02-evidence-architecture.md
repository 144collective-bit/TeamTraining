# 02 — Evidence Architecture

> **Answering: "the best method to create an iron-clad, reliable app for manufacturing businesses"**

## Reframe the question first

"Iron clad" for this product does not primarily mean uptime, and it does not mean
bug-free. A CRM that loses a record is an inconvenience. **This product's entire value
is that its records survive hostile scrutiny** — an ISO surveillance audit, an HSE
inspection after an injury, an employment tribunal, a customer quality audit, a
prosecution.

So the reliability target is **evidential integrity**: every record must be provably
attributable, provably contemporaneous, provably unaltered, and retrievable years later.

Everything below follows from that. The good news is that this is a solved problem —
the pharmaceutical industry has been forced to solve it, and their framework is directly
transferable.

---

## Principle 1 — Design to ALCOA+, explicitly

ALCOA+ is the FDA-origin data integrity standard used across regulated manufacturing.
Adopt it as the literal specification for the record layer. Each principle becomes a
concrete engineering requirement:

| Principle | Requirement in this system |
|---|---|
| **Attributable** | Every event carries an authenticated `actor_id`. No shared logins, no "Team Leader" accounts, no unattributed system writes. Badge/PIN auth for shop floor, but always resolving to a real person. |
| **Legible** | Records render human-readably forever, independent of the app. Evidence packs export as PDF/A. No storing meaning only in an app-specific binary blob. |
| **Contemporaneous** | Records are captured at the moment of the activity. Capture *both* `occurred_at` (device clock, what the user asserts) and `recorded_at` (server clock, authoritative). Flag and surface any record where the gap is material. Never let a user backdate silently. |
| **Original** | The event log is the original record. Everything else — the matrix view, dashboards, reports — is a derived projection that can be rebuilt from it. |
| **Accurate** | Validation at write time, and the record captures the exact object signed (by content hash), not a reference to "current". |
| **Complete** | Corrections are *new events*, never overwrites. A voided sign-off remains visible, marked void, with a reason and an author. |
| **Consistent** | One canonical clock (UTC, server-issued), one event ordering, enforced state machine transitions. |
| **Enduring** | Retention policy per record class. Note: COSHH health/exposure-related records can require retention up to **40 years**. Design storage and export for decades, not for the life of the subscription. |
| **Available** | Any record retrievable on demand for audit, and exportable in a format that outlives us. |

If a feature cannot satisfy these, it does not ship into the evidence core.

---

## Principle 2 — Append-only event log as the system of record

**The single most important architectural decision.** The core tables are never
`UPDATE`d and never `DELETE`d.

Every meaningful change is an immutable, timestamped, attributed row appended to an
event log. Current state — "is Sarah competent on Op 40?" — is a *projection* derived
from replaying those events, materialised into read tables for query speed.

Why this is the right call here, when it would be over-engineering elsewhere:

- **The audit trail stops being a feature you have to remember to write.** It is a
  structural property of the design. There is no code path that changes a record
  without leaving a trace, because there is no code path that changes a record.
- **Point-in-time reconstruction becomes trivial.** "What did the matrix show on
  14 March, the day of the incident?" is a query, not an archaeology project.
- **Offline sync becomes natural.** Each device holds its own local append-only log
  and ships events when connectivity returns. Events are immutable facts, so merging
  is far simpler than reconciling mutable state.

Implementation is unremarkable and does not need Kafka or a specialist database —
a Postgres table with a `BEFORE UPDATE OR DELETE` trigger that raises an exception is
enough, plus projections maintained in the same transaction.

```
events
--------------------------------------------------
event_id        uuid            pk
tenant_id       uuid            not null
stream_id       uuid            not null   -- e.g. the competence record
stream_seq      int             not null   -- optimistic concurrency
event_type      text            not null
payload         jsonb           not null
actor_id        uuid            not null   -- ALCOA: Attributable
occurred_at     timestamptz     not null   -- asserted (device)
recorded_at     timestamptz     not null   -- authoritative (server default now())
device_id       text
prev_hash       bytea                      -- hash chain
hash            bytea           not null
--------------------------------------------------
unique (stream_id, stream_seq)
```

**Corrections policy.** Users make mistakes; the system must allow fixing them without
allowing rewriting history. A wrong sign-off is corrected by appending a
`SignOffVoided` event with a mandatory reason and author, then a fresh sign-off. The
original stays visible in the trail, struck through. This is exactly how a paper
record should be corrected — a single line through, initialled and dated — and
auditors recognise it.

---

## Principle 3 — Immutable document revisions, and the re-training trigger

**This is the feature that sells the product, and the one homemade systems always get
wrong.**

An SOP is not a document. It is a **sequence of immutable revisions**. Revision 3 is a
frozen, content-hashed object that can never change. Editing produces revision 4;
revision 3 remains forever, because people signed against it.

Rules:

- A training sign-off references `sop_revision_id`, **never** `sop_id`. If it referenced
  the SOP, then the moment the SOP was edited, every historical training record would
  silently start claiming people were trained on content they never saw. That is an
  audit failure and, after an accident, potentially a legal one.
- Each revision stores a **content hash**. The sign-off record stores that hash too.
  You can therefore prove, years later, exactly what bytes the person was trained on.
- Publishing a revision requires an approver distinct from the author.
- Superseded revisions are watermarked "SUPERSEDED" on render and on print, with the
  superseding revision named. Uncontrolled printed copies at the machine are the number
  one real-world failure mode; QR codes on printouts that resolve to the live current
  revision are a cheap, high-value mitigation.

**The automatic consequence:** publishing revision 4 evaluates every person whose
competence record points at revision 3. Depending on the change classification set by
the author —

| Change class | Effect on competent staff |
|---|---|
| Editorial (typo, formatting) | No action; revision link updated |
| Minor (clarification, no method change) | Acknowledgement required — read and confirm |
| Major (method, sequence, tooling change) | Competence → `REQUIRES_REVALIDATION`, re-training required |
| Safety-critical (RA change, new hazard, PPE change) | Competence suspended immediately; person is not authorised on that operation until re-trained |

Nothing else in this product creates as much value for as little code. It is the
difference between a document store and a competence system.

---

## Principle 4 — Signatures that are evidence, not decoration

A drawn squiggle on a tablet is close to worthless evidentially. Under UK law
(Electronic Communications Act 2000 and the retained UK eIDAS regulation) electronic
signatures are legally valid and admissible, and courts treat electronically signed
documents as presumptively authentic. But evidential weight scales with the
sophistication of the signature **and its surrounding records** — a bare mark is far
weaker than one wrapped in a strong audit trail.

So capture an **evidence bundle**, not an image:

1. **Identity** — authenticated session, resolved to a named individual. Re-authenticate
   at the point of signing (PIN or password re-entry), so signing is a deliberate act
   and not something a logged-in tablet left on a bench can do.
2. **Intent** — an explicit, recorded declaration. Not "OK" but *"I confirm I have been
   trained on SOP-0042 rev 3 and am competent to perform this operation unsupervised."*
   Store the exact wording shown, because the wording may itself change over time.
3. **What was signed** — the content hash of the specific revision and the specific
   sign-off record.
4. **When** — server-authoritative timestamp, plus device timestamp, plus the offline
   gap if any.
5. **Context** — device id, IP where available, geolocation only if the customer opts
   in (be careful: employee-monitoring and UK GDPR implications).

The business plan's three-way sign-off (trainee, trainer, manager) becomes three
separate signature events on the same record, each with its own bundle, each
independently verifiable. Do not collapse them into one.

**Tamper evidence.** Hash-chain each event to its predecessor within a stream, publish
a periodic root hash, and provide a `verify` function that walks the chain and reports
integrity. This is cheap to implement and converts "trust our database" into
"here is a mathematical demonstration nothing was altered" — which is a strong line in
a sales conversation with a quality manager.

---

## Principle 5 — Offline-first, because factories eat Wi-Fi

Steel-framed buildings, machine RF noise, and dead zones at the far end of the shop are
universal. A system that requires connectivity to record a sign-off will not be used at
the point of work — and a record made an hour later at a desk is no longer
contemporaneous, which breaks ALCOA+ at the first principle that matters.

Approach: build the floor-facing surface as an installable PWA with a local store, and
treat the device's local log as authoritative-until-synced.

The subtlety that must be handled correctly: **offline capture and contemporaneous
recording are in tension.** Resolve it explicitly rather than pretending it doesn't exist:

- Record `occurred_at` from the device and `recorded_at` from the server; never conflate.
- Show the sync gap on the record itself in the audit view.
- Set a policy threshold (suggest: 24 hours) beyond which a late-synced record is
  flagged for manager attention rather than silently accepted.
- Defend against device clock tampering — compare device clock to server clock on every
  sync and record the observed skew.

Because events are immutable facts rather than mutable state, conflict resolution is
mostly avoidable. The genuine conflict cases are narrow (two managers signing off the
same record simultaneously) and can be handled with stream sequence numbers and a
managed-conflict event rather than a general CRDT.

---

## Principle 6 — Multi-tenant isolation you can demonstrate

Customers are competitors with each other. A cross-tenant leak is an extinction event
for a compliance product.

- `tenant_id` on every row, no exceptions.
- Postgres **row-level security** enforced at the database, so a missing `WHERE` clause
  in application code cannot leak data. Application-layer filtering alone is one
  forgotten clause away from disaster.
- Automated tests that attempt cross-tenant reads and assert they fail. Run them in CI
  on every commit.
- Under UK GDPR, be clear in contracts that the customer is controller and we are
  processor, and get the DPA and retention schedule right before the first paying
  customer, not after.

---

## Principle 7 — Boring, typed, and heavily tested where it counts

**Recommended stack** (to confirm — see [06 — Open Questions](06-open-questions.md)):

| Layer | Choice | Reasoning |
|---|---|---|
| App | **Next.js + TypeScript** | One language across web and API; strong PWA/offline story; large hiring pool |
| Database | **Postgres** | RLS, JSONB for event payloads, transactional projections, decades-long support horizon |
| Hosting | **Vercel** + managed Postgres (Neon/Supabase) | Already available in this workspace; near-zero ops burden for a small team |
| Auth | Managed provider with SSO path | Do not hand-roll auth for a compliance product |
| Files | S3-compatible with object-lock / versioning | SOP attachments, photos, evidence packs |

Nothing exotic. For a system whose value is that it still works and still holds records
in ten years, boring technology is a feature. Avoid anything where the vendor's
survival is a bet.

**Where to spend testing effort** — not evenly. Concentrate it:

- The event log: append-only enforcement, hash chain integrity, replay determinism
- The state machine: every legal and illegal transition
- Revision supersession → re-training trigger logic, including the four change classes
- Signature capture and verification
- Tenant isolation
- Offline sync: clock skew, duplicate delivery, out-of-order arrival, partial sync

Everything else — dashboard layout, list filters — can be tested lightly. A visual bug
is embarrassing; a competence record that silently changed its meaning is the end of
the company.

---

## Principle 8 — The evidence pack

The moment the product proves itself is an audit. Build for that moment directly:
one action produces a single self-contained file for an operation, a person, or a date
range, containing —

- the competence records with full status history
- every SOP revision referenced, at the exact revision signed, watermarked and hashed
- the risk assessments in force at the relevant time
- all three signatures with their evidence bundles
- the complete event trail with actor, occurred/recorded timestamps
- a hash-chain verification statement

Export as PDF/A for longevity plus a machine-readable JSON sidecar. An auditor who is
handed this stops asking questions. Demo this on the first sales call — it is far more
persuasive than a feature list.

---

## Summary — the eight decisions

1. Specify the record layer against **ALCOA+**, explicitly, as acceptance criteria
2. **Append-only event log** as the system of record; everything else is a projection
3. **Immutable SOP revisions** with content hashes, driving automatic re-training triggers
4. **Signatures as evidence bundles** — identity, intent, content hash, dual timestamps, context
5. **Offline-first PWA** with honest handling of the contemporaneity tension
6. **Database-enforced tenant isolation** (RLS), tested adversarially in CI
7. **Boring typed stack**, with test effort concentrated on the evidence core
8. **One-click evidence pack** as the flagship demo and the product's proof
