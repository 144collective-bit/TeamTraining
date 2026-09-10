# 06 — Open Questions

Decisions needed from Lean Solutions before Phase 1 build starts. Grouped by how much
they change the work.

## Blocking — these change the architecture

**1. Is this a product, or a consultancy deliverable?**
Three viable models, and they lead to different software:
- **(a) SaaS product** sold to many manufacturers — needs self-serve onboarding, strong
  multi-tenancy, marketing motion
- **(b) Consultancy tool** used by Lean Solutions to deliver engagements, left behind
  with the client — onboarding can be manual, sales is warm, revenue is per-engagement
- **(c) Hybrid** — consultancy-led land, software-led expand

*Recommendation: (c), starting as (b).* The consultancy relationship solves the hardest
problem in this market, which is that nobody has clean data on day one. Build for
multi-tenancy from the start regardless, since retrofitting it is painful.

**2. Which industries, specifically?**
"Manufacturing" spans very different regulatory burdens. If food (BRCGS), aerospace
(AS9100), automotive (IATF 16949) or medical devices (ISO 13485) are in scope, the
evidence requirements tighten considerably and some of it must be in Phase 1 rather than
bolted on. General engineering / fabrication is the lightest starting point.

**3. Do you have a named pilot customer?**
Everything in Phase 0 depends on this. Building this without a real cell to model it on
is the highest-risk path available.

## Important — these change the plan

**4. Regulatory target for Phase 1.** ISO 9001 audit-readiness is the assumed baseline.
Is ISO 45001 in scope too? Any customer already certified, or seeking certification to a
deadline? A deadline is the best possible forcing function for a pilot.

**5. Budget and timeline.** The phasing assumes a small team working continuously.
Phase 1 at 10–12 weeks assumes roughly one to two experienced full-stack developers.
What is actually available?

**6. Build capacity.** Is this being built in-house, by contractors, or primarily by AI-
assisted development in sessions like this one? It changes how much scaffolding,
documentation and test coverage is worth front-loading.

**7. Pricing model.** Per-seat pricing is the category norm at roughly £5–25/user/month,
but it is actively hostile here — it penalises the customer for putting *every* operator
in the system, which is exactly what the product needs to work. Suggest per-site or
per-operation-count pricing instead. Worth deciding before the data model hardens, since
it affects what gets metered.

**8. Do you already have SOP/RA templates and content?** If Lean Solutions has a house
template library from consultancy work, that is a genuine asset — it becomes the
onboarding accelerator and a defensible piece of the offer.

## Confirmations — assumed unless you say otherwise

**9. Stack.** Next.js + TypeScript + Postgres, deployed on Vercel, offline-capable PWA
for the shop floor. Rationale in [02 — Evidence Architecture](02-evidence-architecture.md).
Say if there is an existing stack, hosting constraint, or in-house preference.

**10. Data residency.** Assumed UK/EU region for UK GDPR comfort. Some manufacturers
will ask, particularly defence-adjacent ones.

**11. Language.** Assumed English only for Phase 1. Note that UK manufacturing has
significant non-native-English workforces, and multi-language SOPs are both a real safety
issue and a strong differentiator — worth flagging as a Phase 3 candidate rather than
never.

**12. Branding.** "TeamTraining" is the repository name. Is that the product name, or a
placeholder? It undersells the operations half.

---

## What I'd suggest happens next

1. Answer questions 1–3 — they gate everything else
2. Walk one pilot cell and collect their real documents
3. Build a clickable prototype of the two highest-risk screens — the **30-second daily
   sign-off** and the **evidence pack** — and put them in front of an actual trainer and
   an actual quality manager before writing production code

Step 3 is worth doing before Phase 1 proper. Those two screens carry most of the product
risk: one decides whether the shop floor adopts it, the other decides whether the buyer
believes it.
