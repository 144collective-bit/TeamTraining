# Protektor — Training & Competence

Onboarding, training and competence management for a steel fabrication shop floor.

Built as a working example for **Protektor UK** (Kidderminster): 6 press brakes,
2 punches, 1 fibre laser cutter and a welding bay.

> When the auditor, the HSE inspector or a tribunal asks *"prove this person was
> trained to run that machine"*, the answer is one click.

## What's here

| | |
|---|---|
| **Training matrix** | People down the left, machines across the top. Sticky name column and header, per-machine competent-operator count, single-point-of-failure warnings. |
| **Competence records** | Status, level, expiry, tri-signature evidence bundle and a verified hash-chained audit trail per person per machine. |
| **Controlled documents** | SOPs and risk assessments with immutable revisions. Published revisions cannot be edited or deleted — the database rejects it. |
| **Induction** | Per-person checklist tied to the site risk assessment, with completion timestamps. |
| **Machines** | Asset detail, authorised operators, linked documents, coverage risk. |

## Running it

Requires Node 22+ and Postgres 16+.

```bash
npm install
cp .env.example .env          # set DATABASE_URL and SESSION_SECRET
npm run db:push               # create the schema
psql "$DATABASE_URL" -f drizzle/guards.sql   # append-only + immutability triggers
npm run db:seed               # load the Protektor working example
npm run dev
```

Then sign in at http://localhost:3000 with:

| Account | Role |
|---|---|
| `d.whitfield@protektor.example` | Admin |
| `k.bhatti@protektor.example` | Manager |
| `i.prosser@protektor.example` | Trainer |

Password `protektor`, shop-floor PIN `1234`. **Demo credentials — replace before any real use.**

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:push` | Sync schema to the database |
| `npm run db:seed` | Reset and reload the example data |
| `npm run verify` | Verify every hash chain and prove the integrity guards hold |

## How it's built

- **Next.js 15** (App Router, server components) + **TypeScript**
- **Postgres** via **Drizzle ORM**
- **Tailwind v4** with a token-based design system in `src/app/globals.css`
- Session auth with scrypt-hashed credentials — no third-party auth dependency

### The parts that matter

**`events` is append-only.** Every meaningful change is an immutable, hash-chained
row. `UPDATE` and `DELETE` are rejected by a database trigger, not by convention.
`npm run verify` walks every chain and proves it.

**SOP revisions are frozen once published.** A competence record points at
`sop_revision_id` and stores that revision's content hash — never at the document —
so you can prove years later exactly what someone was trained on. Publishing a new
revision classifies the change (editorial / minor / major / safety-critical), which
determines whether trained staff need to acknowledge, revalidate, or are suspended
immediately.

**Signatures are evidence bundles, not squiggles.** Each one records the signer, the
exact declaration wording shown, the content hash signed against, whether they
re-authenticated at the point of signing, and both device and server clocks.

**The matrix cell is never a boolean.** It carries status, level, the revision trained
against, expiry, review dates and a link to the full evidence trail.

### Layout

```
src/
  app/
    (app)/          Authenticated shell: dashboard, matrix, people, machines,
                    documents, competence records
    login/          Sign-in
    globals.css     Design tokens and the matrix styling
  components/       Shared UI
  db/
    schema.ts       Drizzle schema
    seed.ts         The Protektor working example
  lib/
    events.ts       Append-only log: appendEvent, verifyStream
    crypto.ts       scrypt hashing, canonical JSON, SHA-256
    queries.ts      Read models
    competence.ts   Status/level metadata, formatting
drizzle/
  guards.sql        Append-only and immutability triggers
scripts/
  verify-integrity.ts
docs/               Research and planning (see docs/README below)
```

## Planning and research

The design decisions behind this are documented in [`docs/`](docs/):

| Doc | |
|---|---|
| [01 — Product Brief](docs/01-product-brief.md) | Problem, users, competitive positioning |
| [02 — Evidence Architecture](docs/02-evidence-architecture.md) | Why the record layer is built this way |
| [03 — Production Target Data](docs/03-production-target-data.md) | Data needed to set production targets (not yet built) |
| [04 — Domain Model](docs/04-domain-model.md) | Entities and the training lifecycle state machine |
| [05 — Roadmap](docs/05-roadmap.md) | Phasing and deferrals |
| [06 — Open Questions](docs/06-open-questions.md) | Decisions still needed |
| [07 — Sources](docs/07-sources.md) | Research references |

## Not built yet

Deliberately out of scope for this phase — see [the roadmap](docs/05-roadmap.md):

- Editing — the app is currently read-only over seeded data. Authoring SOPs,
  recording sign-offs and granting competence are the next build.
- Offline capture for the shop floor (planned as a PWA with a local event log)
- Row-level security policies for true multi-tenant isolation
- Evidence pack export as PDF/A (the print view is a stand-in)
- Production target calculator
