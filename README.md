# Lean Solutions UK — TeamTraining

A training, competence and operations platform for small UK manufacturers.

**The one-line pitch:** when the auditor, the HSE inspector or the tribunal asks
*"prove this person was trained to do that job"*, the answer is one click — and the
same competence data drives realistic production targets.

## Status

**Planning phase.** No code yet. This repository currently contains the research
and design work that must be settled before implementation starts.

## Read in this order

| Doc | What it answers |
|---|---|
| [01 — Product Brief](docs/01-product-brief.md) | What we're building, who buys it, what already exists in the market |
| [02 — Evidence Architecture](docs/02-evidence-architecture.md) | **"The best method to build an iron-clad, reliable app"** |
| [03 — Production Target Data](docs/03-production-target-data.md) | **"All the data needed to set production targets"** |
| [04 — Domain Model](docs/04-domain-model.md) | Entities, the training lifecycle state machine, schema sketch |
| [05 — Roadmap](docs/05-roadmap.md) | Phasing, MVP scope, what we deliberately defer |
| [06 — Open Questions](docs/06-open-questions.md) | Decisions needed from Lean Solutions before build |
| [07 — Sources](docs/07-sources.md) | Research references |

## The core insight

The business plan describes two things that are normally sold as separate products:

1. A **training and competence system** (an LMS / skills-matrix product)
2. An **operations and production system** (an MES / lean product)

Almost every competitor does one or the other. The defensible position is the
**join between them**: a trainee does not produce at standard rate, so competence
data is a direct input to capacity planning. That link is the product.

> Realistic Target = Theoretical Capacity × OEE × Competence Factor

No mainstream tool computes the third term. See
[03 — Production Target Data](docs/03-production-target-data.md).
