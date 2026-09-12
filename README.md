# Training & Competence

Onboarding, training and competence management for a manufacturing shop floor.

The application ships **empty**. An organisation sets itself up, adds its own
areas, machines and people, and writes its own procedures from templates. There
is no customer's data or branding baked in — the logo, name and colour at the top
of every screen and printed document are the customer's own.

> When the auditor, the HSE inspector or a tribunal asks *"prove this person was
> trained to run that machine"*, the answer is one click.

## What's here

| | |
|---|---|
| **Training matrix** | People down the left, machines across the top. Sticky name column and header, per-machine competent-operator count, single-point-of-failure warnings. Selecting an empty cell starts training. |
| **Daily sign-offs** | The trainer's fast capture screen: pick a trainee, tap a progress rating, confirm the procedure steps covered, save. Pre-ticks what earlier sessions covered so it is confirm-not-enter. |
| **Competence records** | Status, level, expiry, tri-signature evidence bundle and a verified hash-chained audit trail per person per machine. |
| **Controlled documents** | Four kinds: standard operating procedures (numbered steps with photographs), risk assessments (5×5 scoring), process training sign-offs (numbered areas on a 0–5 training key) and induction checklists. Immutable revisions — published ones cannot be edited or deleted, the database rejects it. |
| **Templates** | Every document starts from a structure rather than a blank page. Shipped with the app, editable in full, never authoritative. |
| **Admin** | Areas, machines, people and organisation branding. Nothing deletes: people become leavers and machines are retired, and their records survive. |
| **Induction** | Per-person checklist tied to the site risk assessment, with completion timestamps. |
| **Machines** | Asset detail, authorised operators, linked documents, coverage risk. |

## Running it

Requires Node 22+ and Postgres 16+.

```bash
npm install
cp .env.example .env          # see the note on the two database URLs below
npm run db:setup              # schema, triggers and RLS policies — no data
npm run dev
```

Then open the app. With no organisation in the database you land on a one-time
setup page that creates your organisation and your administrator account, and
nothing else. Everything after that is built through the admin section.

To load a demonstration organisation instead — a fictional fabricator with ten
machines, fourteen people and a populated matrix — run `npm run db:demo`. It
**truncates every table first**, so never point it at real records.

**Two database URLs, deliberately.** `DATABASE_URL` is the role the application
connects as: no superuser, no `BYPASSRLS`, so row-level security actually applies
to it. `DATABASE_ADMIN_URL` is the schema owner, used only by migrations and
seeding. Row-level security is worthless if the app connects as a superuser, so
the split is not optional.

`npm run db:setup` runs the three steps individually available as `db:push`
(schema), `db:sql` (triggers and policies) and `db:demo`.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run check` | Typecheck, unit tests and integrity verification — the gate before pushing |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests for the pure logic (dates, state machine, scoring, hashing) |
| `npm run stress` | Concurrency and scale checks against a seeded database |
| `npm run db:setup` | Schema, triggers and RLS policies. Loads no data |
| `npm run db:demo` | Load the demonstration organisation. Truncates everything first |
| `npm run db:push` | Sync schema to the database |
| `npm run db:sql` | Apply the integrity triggers and RLS policies |
| `npm run test:isolation` | Adversarial cross-tenant test against a real second tenant |
| `npm run verify` | Verify every hash chain and every photograph, and prove the integrity guards hold |
| `npm run e2e` | Walk the whole training write path in a browser (needs a running server) |
| `npm run e2e:authoring` | Walk document authoring and the supersession cascade |
| `npm run e2e:first-run` | Walk first-run setup against an empty database |

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

**Appends to one stream are serialised.** Reading the last sequence number and
inserting the next one is a read-modify-write; without a lock, two people saving at
the same moment collide on the unique index and one write is rejected. A
transaction-scoped advisory lock keyed on the stream serialises that stream only.
`npm run stress` proves 25 concurrent appends all commit.

**Tenant isolation is enforced by the database.** Every table carries a policy
keyed on the tenant set for the current transaction, and the application connects
as a role that cannot bypass it. Requests run inside `asTenant(tenantId, …)`, which
sets that tenant with `set_config(..., is_local => true)` so it lives for exactly
one transaction and cannot leak to the next request that borrows the same pooled
connection. Policies compare with `=` against a NULL-when-unset value, so
forgetting to set the context returns nothing rather than everything — it fails
closed. Authentication necessarily runs before any tenant is known, so sign-in and
session resolution go through four narrow `SECURITY DEFINER` functions that are the
only path past the policies. `npm run test:isolation` stands up a second tenant and
tries to read, update, delete and insert across the boundary, and to turn the
policies off.

**Attachments are immutable and content-addressed.** A revision references a
photograph by id and the revision hash covers that id, so if the bytes behind an id
could change, the revision would still verify while the procedure people signed
against had silently changed. The database refuses to alter an attachment or delete
one a published revision still references, and `npm run verify` re-hashes every
stored image against its recorded address.

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
    demo.ts         The demonstration organisation (a fixture, not shipped data)
  lib/
    templates.ts    Starter documents a team leader edits rather than inventing
    admin-commands.ts  People, plant and organisation settings
    setup.ts        First-run: creates the organisation and its administrator
    commands.ts     Training writes: permission check, state machine, transaction
    document-commands.ts  Authoring, publishing and the supersession cascade
    documents.ts    SOP/RA schemas, risk scoring, upload rules
    attachments.ts  Image upload, de-duplicated and magic-number checked
    state-machine.ts Legal transitions, signature rules, declaration wording
    events.ts       Append-only log: appendEvent, verifyStream
    crypto.ts       scrypt hashing, canonical JSON, SHA-256
    queries.ts      Read models
    competence.ts   Status/level metadata, formatting
drizzle/
  guards.sql        Append-only and immutability triggers
  rls.sql           Tenant policies, the application role, and the auth functions
scripts/
  verify-integrity.ts
e2e/
  write-path.mjs    Browser walk of the whole training lifecycle
  authoring.mjs     Browser walk of authoring and the supersession cascade
docs/               Research and planning (see docs/README below)
```

## Deploying

See [DEPLOY.md](DEPLOY.md). The short version: the app needs Postgres with two
roles, and `npm run db:sql` applied, before it can sign anyone in.

Quickest, with Supabase and any host that runs `npm start`:

```bash
node scripts/setup-supabase.mjs "<your Supabase session-pooler string>"
```

(`npm run setup:supabase -- "…"` does the same, but PowerShell mangles the
`--`, so call the script directly on Windows.)

It sets the database up and prints the two environment variables to paste into
the host. Then deploy.

Two routes are supported in full. **One VPS** (Hostinger, Hetzner, any Ubuntu
box):

```bash
git clone https://github.com/144collective-bit/TeamTraining.git /opt/teamtraining
cd /opt/teamtraining
cp .env.production.example .env.production   # fill in, then chmod 600
docker compose --env-file .env.production up -d --build
```

That brings up Postgres, runs the migrations to completion, starts the app and
puts Caddy in front of it with an automatic certificate. `scripts/deploy.sh`
does subsequent deploys, `scripts/backup.sh` is for cron, and
[RESTORE.md](RESTORE.md) covers getting the data back.

**Managed Postgres** (Vercel plus Neon or Supabase) is the other route — same
two-role setup, the platform does the rest.

```
Caddy :443  ──►  app :3000  ──►  Postgres :5432
                     │                  ▲
                     └── /api/health ───┘   (healthcheck, and Caddy's probe)
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

## The write path

The full training lifecycle can be recorded:

```
start training → daily sign-off (×n) → ready for assessment → assessment
    → trainee signs → trainer signs → manager signs → COMPETENT
```

Legal transitions are declared once in `src/lib/state-machine.ts` and enforced
in `src/lib/commands.ts`; no command can move a record somewhere it should not
go. Every command writes its projection and its event **in the same
transaction**, so the read model and the audit log can never disagree.

Also recordable: voiding a sign-off (with a reason — the original stays visible,
marked void), quarterly reviews, suspension and reinstatement, revalidation, and
induction checklist items.

**Signing.** Each of the three signatures requires that person's own PIN, checked
against their record — not the account holding the tablet. Competence is granted
automatically when the third signature lands, which also closes the training
session and sets the expiry and next review date.

`npm run e2e` walks all of this in a real browser, including PIN rejection.

## Authoring controlled documents

SOPs are written as numbered steps, each with an instruction, its TWI key points
and reasons, and a photograph of what the operator should be looking at. The
document renders identically on screen, in the editor's preview, and on an A4
printout, with the metadata header, the safety-check and care-point strips, and
an "uncontrolled document if printed" footer.

Risk assessments are hazard rows scored on the standard 5×5 matrix — likelihood ×
severity, banded low / medium / high / very high — with existing controls, further
action and a residual score.

**Photographs** are uploaded through the editor and stored in the database, not a
bucket, so a database backup is a complete backup of the evidence. They are
content-addressed and de-duplicated, and the hash of the image forms part of the
revision hash: the photographs are part of what a person provably signed against.
Uploads are sniffed by magic number rather than trusted by declared type, and SVG
is refused because it can carry script.

**Separation of duties.** Whoever writes a revision cannot approve it — including
the first issue, which is the revision nobody has ever checked. The rule steps
aside only when the business genuinely has one manager.

### Publishing, and what it does to everyone already trained

Publishing freezes the revision and supersedes the previous one. The change
classification then decides what happens to every competence record on that
machine:

| Class | Effect on trained staff |
|---|---|
| Editorial | Nothing. Typos and formatting. |
| Minor | Stay competent, but owe a read-and-confirm before it clears. |
| Major | → `REQUIRES_REVALIDATION`. Re-training needed before working unsupervised. |
| Safety critical | → `SUSPENDED` immediately, with the reason on the record. |

What deliberately does **not** change is the competence record's
`sopRevisionId` — it keeps pointing at the revision the person actually trained
against. That is the evidence. What changes is their *status*, which records the
consequence of the procedure having moved on beneath them.

`npm run e2e:authoring` exercises all of this, including the cascade.

## Testing

| Layer | What it covers |
|---|---|
| `npm test` | Pure logic — date arithmetic, the state machine, risk banding, content hashing, document parsing of older shapes |
| `npm run verify` | Every hash chain, every photograph's content address, and that each database guard actually refuses what it must |
| `npm run stress` | Concurrent appends to one stream, matrix cost at 250 people × 60 machines, whole-log verification, concurrent identical uploads |
| `npm run test:isolation` | A real second tenant attempting cross-tenant reads, writes and privilege escalation |
| `npm run e2e` | The training lifecycle in a browser, end to end |
| `npm run e2e:authoring` | Document authoring, separation of duties, and the supersession cascade |
| `npm run e2e:first-run` | Setting up an organisation from nothing, then adding plant, people and a document |

The e2e suites need a running server (`npm run build && npm run start`) and a fresh
`npm run db:demo`.

## Process training sign-offs

Modelled on the paper sign-off sheet: a numbered list of training areas, each
scored on a fixed key and signed by the operator and their team leader.

| | |
|---|---|
| 0 | No training |
| 1 | Task demonstrated |
| 2 | Assisted in task |
| 3 | Can complete with guidance |
| 4 | Can work alone |
| 5 | Fully trained |

One difference from the paper form, deliberately: the paper sheet is per
employee, so a team of twenty means twenty photocopies and twenty places for the
list to drift. Here the **document** defines the areas once and each trainee's
progress hangs off their own training record. Revise the sheet and everyone
picks up the change under the same rules as any other controlled document.

## Not built yet

Deliberately out of scope for this phase — see [the roadmap](docs/05-roadmap.md):

- Per-area progress tracking against a training sign-off. The document defines
  the areas and prints correctly; scoring each trainee area-by-area is the next
  build.
- Offline capture for the shop floor (planned as a PWA with a local event log)
- Evidence pack export as PDF/A (the print view is a stand-in)
- Production target calculator
