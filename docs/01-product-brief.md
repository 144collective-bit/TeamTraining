# 01 — Product Brief

## The problem, stated precisely

Small manufacturers do not fail their audits because they don't train people.
They fail because they **cannot prove** they trained people, to the right revision
of the right procedure, at the right time.

The typical state of a 20–150 person UK manufacturer:

- SOPs in Word on a shared drive, no revision control, printed copies at the
  machine that are three revisions out of date
- A training matrix in Excel, maintained by one person, last updated when they
  remembered
- Signed training records in a lever-arch file, or lost
- Risk assessments done once at some point, never re-issued when the process changed
- Production targets set by "what we did last month" or by what the customer demanded,
  with no relationship to measured capability

Two independent forces punish this:

**Compliance.** The HSE position is blunt — if you cannot produce the documentation,
an inspector will assume it did not happen. ISO 9001 clause 7.2 requires retained
documented information as evidence of competence, and a very common audit finding is
that records show *attendance* but not *assessment*. Under the Management of Health and
Safety at Work Regulations 1999, employers with 5+ employees must record the significant
findings of risk assessments.

**Economics.** Untracked competence means unplanned capacity. A line staffed with two
trainees does not run at the rate the plan assumes, but nothing in the planning system
knows that, so the target is missed and nobody can say why.

## Who buys it

**Primary buyer:** Operations Director / General Manager at a UK manufacturer,
20–150 employees, who has either just failed an audit, just won a contract that
requires ISO 9001, or just been quoted a consultancy fee to fix it manually.

**Primary users, three very different populations:**

| User | Where they are | What they need | Design implication |
|---|---|---|---|
| Operator / trainee | On the floor, gloves, noise, poor Wi-Fi | Read the SOP for the job in front of them; sign when trained | Kiosk mode, badge/QR login, large touch targets, offline |
| Trainer / team leader | On the floor, moving | Record daily training progress in <30 seconds | Mobile-first, one-thumb, offline |
| Manager / quality | Office, desktop | Matrix overview, gaps, expiry, audit export | Dense desktop views, reporting, bulk actions |

If the trainer's daily sign-off takes longer than about half a minute, the system
will be abandoned inside a month and the business is back to Excel. **Speed of capture
on the floor is a hard product requirement, not a nice-to-have.**

## Positioning against what exists

The skills-matrix category is real and occupied — AG5, Azumuta and Poka all sell
training-matrix software into manufacturing, with Poka and Azumuta being explicitly
shop-floor oriented. The SOP/process-documentation category is separately crowded and
cheap: most tools are seat-based at roughly $5–25/user/month, with Trainual at the
top end around $299/month.

Two honest conclusions:

1. **Do not compete as "SOP software".** It is a commodity at $6/seat and the
   incumbents are well ahead on authoring UX.
2. **Do not compete as a general LMS.** Wrong buyer, wrong sales motion.

**Where the gap actually is.** The incumbents track *whether* someone is trained.
None of them close the loop to *what that means for output this week*. The wedge is:

> The only training system that tells you what your line can actually produce tomorrow,
> given who is on shift and how trained they are.

That is a claim an Operations Director can act on, and it is defensible because it
requires owning both the competence data and the time/OEE data — which is exactly
what the Lean Solutions business plan already describes doing as a consultancy.

**Secondary wedge — the consultancy flywheel.** Lean Solutions delivers this as a
service today. The software is the artefact the consultancy leaves behind, which
means: a warm pilot customer, real SOPs to seed it, and a delivery model where the
consultant does the painful onboarding that kills self-serve SaaS in this market.
That is a genuine advantage over a pure software startup and the plan should lean on it.

## What the product is, in one paragraph

A multi-tenant web application. Managers author SOPs and risk assessments with
enforced revision control. Every operation in the business has an owner, a current
SOP revision, and a required competence level. Trainers run inductions and daily
training sign-offs against the current revision from a phone or tablet, offline if
needed. Competence is a per-person-per-operation record with a status, an expiry, an
evidence trail and a proficiency figure — never a tick-box. When an SOP is revised,
everyone trained on the superseded revision is automatically flagged for re-training.
The same competence data feeds a capacity calculator that produces defensible
production targets from measured standard times, OEE and current crew competence.
Any record can be exported as a tamper-evident evidence pack for an auditor.

## Scope discipline

The business plan describes, in effect, three products: an LMS, a QMS and an MES.
Building all three at once is the single most likely way this fails. The roadmap in
[05 — Roadmap](05-roadmap.md) sequences them deliberately, and Phase 1 is *only* the
evidence core.

## Explicit non-goals (for now)

- Not an HR system — no payroll, recruitment, absence management
- Not a full QMS — no NCR/CAPA workflow, no document control beyond SOPs and RAs
- Not a full MES — no machine data acquisition, no PLC integration, no scheduling engine
- Not a content library — we do not supply generic H&S courses
- No claim to "make you ISO 9001 certified". We claim **audit-readiness**: the
  evidence exists, is current, and is retrievable. Certification is UKAS-accredited
  bodies' business, not ours, and overclaiming it is a legal risk.
