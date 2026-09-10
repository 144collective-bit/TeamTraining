# 05 — Roadmap

## Build status

Phase 1 is largely built. What follows is the original plan; this table is the
honest position against it, kept here so the roadmap and the code do not drift.

| Phase 1 item | Status |
|---|---|
| Tenant, area, person, role structure | Built |
| Machine register (the matrix axis) | Built |
| SOP authoring — immutable revisions, content hashing, approver ≠ author | Built |
| Risk assessment authoring — same revision model, 5×5 scoring | Built |
| Training matrix — state machine, levels, expiry, revalidation | Built |
| Induction workflow with RA acknowledgement | Built |
| Daily training sign-off, mobile, <30 seconds | Built (online only) |
| Assessment and tri-signature competence approval | Built |
| Signature evidence bundles with re-authentication | Built |
| Append-only event log with hash chain and `verify` | Built |
| SOP revision → automatic re-training trigger, four change classes | Built |
| Quarterly review with recorded outcome | Built |
| Manager dashboard — coverage, gaps, expiries, single points | Built |
| Offline capture (PWA with a local event log) | **Not built** |
| One-click evidence pack (PDF/A + JSON sidecar) | **Not built** — print view is a stand-in |
| Row-level security policies | Built — enforced by the database, with an adversarial cross-tenant test |
| Adding people and machines through the UI | **Not built** — seeded only |

Phases 2–4 below are untouched.

---

## Sequencing principle

The business plan describes three products' worth of scope. Building them in parallel
is the most likely failure mode. The sequence below is chosen so that **each phase is
independently sellable** and each one produces the data the next phase consumes.

Phase 1 is deliberately narrow. It is the compliance evidence core — the part a customer
will pay for on its own, because it addresses a problem they already have a deadline on.

---

## Phase 0 — Foundation and pilot design *(2–3 weeks)*

Not code. This is the work that prevents building the wrong thing.

- Recruit **one pilot customer** — ideally an existing Lean Solutions consultancy client,
  20–150 employees, with a live audit or certification driver
- Pick **one production cell** in that customer. Not the whole site.
- Walk the floor. Observe an actual induction and an actual training session end to end
- Collect their real artefacts: current SOPs, the Excel matrix, sign-off sheets, RAs
- Resolve the open questions in [06 — Open Questions](06-open-questions.md)
- Confirm the stack and set up the repo, CI, environments

**Exit criteria:** a signed pilot agreement, one cell scoped, real documents in hand.

---

## Phase 1 — The Evidence Core *(≈10–12 weeks)* — **the MVP**

Everything in [02 — Evidence Architecture](02-evidence-architecture.md), and nothing else.

**In scope**
- Tenant, site, area, cell, person, role structure
- Operation register
- SOP authoring with **immutable revisions**, content hashing, approver-distinct-from-author
- Risk assessment authoring, same revision model, hazards and controls
- Training matrix — full state machine, levels, expiry, revalidation
- Induction workflow with RA acknowledgement (plan steps 1–2)
- Daily training sign-off, mobile, offline, <30 seconds (plan steps 3–6)
- Assessment and **tri-signature** competence approval (plan step 7)
- Signature evidence bundles with re-authentication
- Append-only event log with hash chain and `verify` function
- **SOP revision → automatic re-training trigger**, four change classes
- Quarterly review workflow with recorded outcome (plan step 9)
- **One-click evidence pack** (PDF/A + JSON sidecar)
- Manager dashboard: coverage, gaps, expiries, single points of failure

**Explicitly out of scope in Phase 1:** any production, time-study or OEE feature.

**Why this is the right MVP:** it is complete against the training and onboarding half
of the business plan, it is demonstrable in a single sales meeting via the evidence pack,
and it collects the competence data that Phase 2 needs in order to be useful at all.

---

## Phase 2 — Operations and Targets *(≈8–10 weeks)*

Everything in [03 — Production Target Data](03-production-target-data.md).

- Shift calendar and Planned Production Time model
- Time study capture tool (cycles, rating, allowance) → standard times
- **Standard time bound to SOP revision**, invalidated on major revision
- Production run recording: counts, good/scrap
- Downtime capture with a standardised reason-code list
- OEE calculation with A / P / Q shown separately and six-loss breakdown
- Takt time and feasibility check
- **Target calculator**: capacity × OEE × competence factor, with the decomposition shown
- Bottleneck identification

**Exit criteria:** the pilot customer sets next month's targets using the tool and agrees
they are more credible than the previous method.

---

## Phase 3 — The Competence–Capacity Join *(≈6–8 weeks)* — the differentiator

This is where the product becomes something no competitor sells.

- Roster / shift assignment
- Competence-adjusted capacity by shift, with paced vs parallel line models
- Proficiency measurement from actual output, per person per operation
- Learning-curve forecasting: time-to-competence, ramp projection
- Coverage risk and single-point-of-failure alerting
- Trainer load and trainer capacity planning
- "What can we run tomorrow with this crew?" planning view
- Skills-gap-driven training plan generation

---

## Phase 4 — Scale *(ongoing)*

- Multi-site rollout, cross-site matrix and benchmarking
- SSO for larger customers
- Integrations: ERP for demand and BOM, HR for people and absence
- Machine data acquisition for automated OEE (a significant undertaking — evaluate
  build-vs-partner before committing)
- Customer-facing audit portal
- Analytics: time-to-competence trends, cost of poor quality

---

## Deliberate deferrals

Keep these off the roadmap until a paying customer asks twice:

| Deferred | Why |
|---|---|
| Native mobile apps | A well-built PWA covers the floor use case; two app stores is a tax |
| AI-generated SOPs | Tempting demo, but wrong-content risk in a safety-critical system is severe. Consider AI for *summarising revision diffs* first — lower stakes, real value |
| Video training content | Storage and authoring cost, and the incumbents are strong here |
| Full NCR/CAPA workflow | This is a QMS product; it will pull scope indefinitely |
| Scheduling / APS engine | Genuinely hard, and MES vendors own it |
| Generic H&S course library | Content business, not software business |

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Scope sprawl across LMS + QMS + MES | **High** | The phasing above; Phase 1 ships nothing operational |
| Shop-floor adoption fails | **High** | <30s capture as a hard requirement; kiosk mode; pilot observation before build |
| Customers have no baseline data | **High** | Bootstrapping sequence is part of the product; never set a target before baseline |
| Compliance overclaim ("we make you ISO certified") | **High** | Claim audit-readiness only; legal review of all marketing copy |
| Incumbents (AG5, Azumuta, Poka) move into target-setting | Medium | Move fast on Phase 3; the consultancy relationship is the moat, not the code |
| Offline sync corrupts records | Medium | Event sourcing; adversarial sync testing; clock-skew detection |
| Cross-tenant data leak | **Critical** | DB-level RLS, adversarial tests in CI |
| Long-horizon retention (up to 40 years for some records) | Medium | Export-first design; customer owns an offline-readable copy from day one |
