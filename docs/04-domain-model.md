# 04 — Domain Model

## The training lifecycle as a state machine

The business plan describes a nine-step chain. That chain is a state machine, and
writing it as one makes the rules enforceable rather than aspirational.

```
        ┌──────────────┐
        │ NOT_TRAINED  │
        └──────┬───────┘
               │ assign trainer + start induction        [plan step 1]
               ▼
        ┌──────────────┐
        │  INDUCTION   │  RA acknowledged, emergency procedures shown,
        │              │  PPE issued — trainer present throughout  [step 2]
        └──────┬───────┘
               │ induction signed off
               ▼
        ┌──────────────┐
        │ IN_TRAINING  │  matrix shows "in training"  [step 3]
        │              │  daily sign-off entries against SOP rev  [steps 4–6]
        └──────┬───────┘
               │ trainer marks ready for assessment
               ▼
        ┌──────────────┐
        │  ASSESSMENT  │  practical assessment against SOP revision
        └──────┬───────┘
               │ pass → tri-signature: trainee + trainer + manager  [step 7]
               ▼
        ┌──────────────┐
        │  COMPETENT   │  matrix updated  [step 8]
        │              │  quarterly review cycle  [step 9]
        └──┬────────┬──┘
           │        │
           │        │ SOP major/safety revision · expiry ·
           │        │ long absence · incident · failed review
           │        ▼
           │  ┌───────────────────────┐
           │  │ REQUIRES_REVALIDATION │──┐
           │  └───────────────────────┘  │
           │                              │ re-training
           │  ┌───────────────────────┐   │
           └─▶│      SUSPENDED        │───┘
              │ (safety-critical rev, │
              │  incident, withdrawn) │
              └───────────────────────┘
```

**Two additions to the business plan, both material:**

1. **`REQUIRES_REVALIDATION` and `SUSPENDED` do not exist in the written plan.** Without
   them, competence is permanent once granted, which is not true and will not survive an
   audit. Competence decays, procedures change, and people are away for six months. These
   states are what turn a static matrix into a live one.
2. **The plan's quarterly review (step 9) is currently a welfare check** — "see how they
   are getting on... if they need anything". Keep that, it is genuinely good practice and
   drives retention. But make it also a **competence confirmation event** with a recorded
   outcome (confirmed / needs refresher / revalidation required), so it produces evidence
   rather than just goodwill.

## The training matrix cell

The most consequential small decision in the product. A matrix cell is **never a boolean**.

```
CompetenceRecord
──────────────────────────────────────────────────────────
person_id
operation_id
status                  enum   NOT_TRAINED | INDUCTION | IN_TRAINING |
                               ASSESSMENT | COMPETENT | REQUIRES_REVALIDATION |
                               SUSPENDED
level                   int    0 none · 1 supervised · 2 independent ·
                               3 expert · 4 can train others
sop_revision_id         fk     the EXACT revision trained against
sop_content_hash        bytea  provable content at time of training
proficiency_factor      num    measured output rate ÷ standard rate
cumulative_units        int    position on the learning curve
trained_by              fk     designated trainer
assessed_by             fk     assessor
approved_by             fk     manager
competent_from          date
expires_on              date   null = no expiry
last_review_on          date   quarterly review
next_review_due         date
suspension_reason       text
evidence_stream_id      fk     → full event history
──────────────────────────────────────────────────────────
```

Storing `level` separately from `status` matters: "competent but supervised" and
"competent and can train others" are different facts about the business, and level 4 is
what identifies your designated-trainer pool automatically instead of by memory.

## Core entities

| Entity | Purpose | Key relationships |
|---|---|---|
| `Tenant` | Customer business | Root of all isolation |
| `Site` / `Area` / `Cell` | Physical structure | Where operations live |
| `Person` | Employee | Has role(s), competences, roster |
| `Role` | Job function | Defines *required* competences — drives gap analysis |
| `Operation` | A single standardised task | The atomic unit of both training and production |
| `SOP` | Container | Has many revisions |
| `SopRevision` | **Immutable** versioned content | Content-hashed; what sign-offs point at |
| `RiskAssessment` | H&S assessment | Revisioned like SOPs; linked to operations |
| `Hazard` / `Control` | RA content | Drives induction content and PPE requirements |
| `CompetenceRecord` | Matrix cell | See above |
| `TrainingSession` | A training instance | Trainer + trainee + operation + date range |
| `DailySignOff` | Daily progress entry | The trainer's <30-second capture — plan step 4 |
| `Assessment` | Formal competence check | Criteria, result, assessor |
| `Signature` | Evidence bundle | Attached to sign-offs, assessments, RA acknowledgements |
| `Review` | Quarterly review | Outcome + operator feedback — plan step 9 |
| `StandardTime` | Time study result | **Bound to a `SopRevision`**, invalidated when it changes |
| `TimeStudy` | Raw observation data | Cycles, rating, allowance, who was studied |
| `ProductionRun` | Actual output | Counts, times, crew |
| `DowntimeEvent` | Loss record | Reason code, duration, asset |
| `QualityEvent` | Scrap / rework | Defect code, operation of origin |
| `Shift` / `RosterAssignment` | Who is where | Joins competence to capacity |
| `Event` | Append-only log | The system of record for everything above |

## The two joins that make this one product

Almost everything above exists in some competitor. These two relationships are what
make it a single coherent system rather than two applications sharing a login:

**Join 1 — `Operation` is shared.**
```
Operation ──┬── SopRevision ──── CompetenceRecord   (the training world)
            └── StandardTime ─── ProductionRun      (the operations world)
```
One operation, one SOP revision, one standard time, one set of competent people. Change
the SOP and both the training records and the standard time are invalidated together.
This is the structural expression of "standardise the process".

**Join 2 — `RosterAssignment` × `CompetenceRecord` → capacity.**
```
Who is on shift  ×  what they are competent on  ×  at what proficiency
                              ↓
              Competence-adjusted available capacity
```
This is the query that produces tomorrow's realistic target, and it is the thing no
skills-matrix product and no MES currently answers.

## Notes on modelling decisions

- **`Operation` is the atomic unit, not "course" or "module".** Resist LMS vocabulary.
  Manufacturers think in operations and work centres; matching their language removes a
  translation layer in every sales conversation and every training session.
- **`Role` defines required competences.** This gives gap analysis for free: required
  minus held equals the training plan, per person and per site.
- **Risk assessments are revisioned exactly like SOPs**, with the same supersession
  rules. A changed RA with a new hazard should suspend competence on the affected
  operation until re-briefed. This is the highest-stakes path in the system and deserves
  the strictest handling.
- **`DailySignOff` must be brutally lightweight.** Suggested shape: operation, trainee,
  progress against the SOP's key steps, a rating, an optional note, an optional photo.
  Target under 30 seconds one-thumb on a phone, offline-capable. If it is heavier than
  that, trainers will batch it up at the end of the week, which destroys contemporaneity
  and with it the evidential value of the whole record.
- **Store the SOP's step breakdown as structured data**, not a PDF blob. TWI Job
  Instruction breaks a job into *Important Steps*, *Key Points*, and *Reasons for the
  key points* — the documented method that standardised work depends on. Modelling those
  three fields explicitly lets training sign-off happen per key point, lets the app show
  an operator just the key points at the machine, and makes revision diffs meaningful.
  A PDF gives you none of that.
