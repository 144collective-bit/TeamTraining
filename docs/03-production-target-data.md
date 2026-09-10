# 03 — Production Target Data

> **Answering: "give them all the data needed to set production targets"**

## The problem with how targets are usually set

Most small manufacturers set targets one of three ways: what the customer demanded,
what we managed last month, or what the MD thinks the line should do. All three are
opinions. When the target is missed, nobody can decompose the miss into causes, so the
same argument repeats every month.

A defensible target is **built up from measured components**, and when it is missed the
same build-up tells you exactly which component failed. That is the whole game.

## The master equation

```
                    Planned Production Time
Theoretical Output = ───────────────────────
                        Standard Time

Realistic Target   = Theoretical Output  ×  OEE  ×  Competence Factor
                     └────────┬────────┘    └┬─┘   └───────┬────────┘
                          capability       reality      who's on shift
```

And the constraint that governs whether you can meet demand at all:

```
              Planned Production Time
Takt Time  =  ───────────────────────        (the customer's drumbeat)
                 Customer Demand
```

If **Standard Time > Takt Time**, the line cannot meet demand at 100% efficiency with
a perfect crew. No amount of target-setting fixes that; it is a capacity problem and
must be solved with method, capacity or hours.

The third term — **Competence Factor** — is the one no mainstream tool computes, and
it is the reason the training system and the production system belong in one product.

---

## The six data sets required

### A. Calendar and time — produces *Planned Production Time*

The single most-abused number in manufacturing. "We work 8 hours" is never true.

| Data item | Granularity | Notes |
|---|---|---|
| Shift patterns | Per line / cell | Start, end, shifts per day, days per week |
| Paid breaks | Per shift | Deducted only if the line stops |
| Unpaid breaks | Per shift | Always deducted |
| Shift handover / briefing | Per shift | Usually 5–10 min, almost always forgotten |
| Cleaning / 5S time | Per shift | Ditto |
| Planned maintenance windows | Per asset | Scheduled PM is *not* an availability loss |
| Trials, NPI, training blocks | Scheduled | Time deliberately not spent on saleable output |
| Works calendar | Annual | Bank holidays, shutdown weeks, stocktake |

**Definition to enforce, because it drives everything downstream:**

```
Planned Production Time = Calendar Time
                        − Not-scheduled time (unmanned shifts, shutdowns)
                        − Planned stops (breaks, briefing, cleaning, planned PM)
```

Losses *inside* Planned Production Time are OEE losses. Time outside it is not a loss
at all. Getting this boundary wrong is the most common cause of OEE numbers that
nobody believes.

---

### B. Demand — produces *Takt Time*

| Data item | Granularity | Notes |
|---|---|---|
| Firm customer orders | Per part, per date | |
| Forecast | Per part, per period | Flag confidence — forecast is not demand |
| Required delivery dates | Per order | Drives sequencing, not just volume |
| Demand variability | Per part | Std deviation or min/max; a stable 400/day and a 200–600 swing need different plans |
| Safety stock / buffer policy | Per part | |
| Minimum order / batch quantity | Per part | |

---

### C. Process and product — produces *Standard Time*

This is the industrial-engineering core, and it is where the real work is.

**Per part, per operation:**

| Data item | Notes |
|---|---|
| Routing | Ordered list of operations to make the part |
| Work centre / cell / machine | Where each operation happens |
| **Observed time** | From time study, ≥10–20 cycles, same method, competent operator |
| **Performance rating** | Analyst's judgement of pace vs normal. 1.0 = normal, <1.0 slower, >1.0 faster |
| **Allowance %** | PF&D — personal, fatigue, unavoidable delay. Typically **10–20%** industrially |
| **Standard time** | *Derived* — see formula below |
| Ideal cycle time | Machine-limited best-case cycle; distinct from labour standard time |
| Setup / changeover time | Per changeover, ideally per from-part→to-part pair |
| Number of operators required | Per operation |
| Number of parallel stations | Per operation |
| Batch size | Per part |
| First pass yield / scrap rate | Per operation, not just per part |
| Rework rate and rework time | Rework consumes capacity and is invisible in most systems |
| Tooling / fixture requirement | Constrains how many stations can run at once |
| Current SOP revision | **Links to the training system** — see below |

**The standard time calculation:**

```
Normal Time   = Observed Time × Performance Rating
Standard Time = Normal Time × (1 + Allowance Factor)

or in one step:  ST = OT × R × (1 + PF&D)
```

**Critical rule the app must enforce:** a standard time is only valid for a *specific
SOP revision*. Change the method, and the standard time is void until re-studied.
Because the app already holds immutable SOP revisions
(see [02 — Evidence Architecture](02-evidence-architecture.md)), it can enforce this
automatically — publishing a major revision marks the associated standard time as
`REQUIRES_RESTUDY` and flags every plan built on it. Almost nobody does this, and it is
why standard times in most small manufacturers are quietly years out of date.

---

### D. Loss data — produces *OEE*

```
OEE = Availability × Performance × Quality

Availability = Run Time ÷ Planned Production Time
Performance  = (Ideal Cycle Time × Total Count) ÷ Run Time
Quality      = Good Count ÷ Total Count
```

Capture against the **six big losses**, because an OEE number without a loss breakdown
is a scoreboard, not a diagnosis:

| Loss | Category | Data to capture |
|---|---|---|
| 1. Breakdowns | Availability | Start, end, asset, reason code, who fixed it |
| 2. Setup and adjustment | Availability | Changeover start/end, from-part, to-part |
| 3. Idling and minor stops | Performance | Duration, reason — hardest to capture manually |
| 4. Reduced speed | Performance | Usually inferred from actual vs ideal cycle |
| 5. Startup rejects | Quality | Count, disposition |
| 6. Production rejects | Quality | Count, defect code, operation where created |

Supporting data: MTBF and MTTR per asset, a **standardised downtime reason-code list**
(get this right early — free-text downtime reasons are worthless for analysis), and
defect codes tied to the operation that *created* the defect rather than the one that
found it.

**Benchmarks for sanity-checking:** 85% OEE is the accepted world-class figure for
discrete manufacturing; typical plants run **55–65%**. If a customer's first OEE
calculation comes out at 90%, the measurement is wrong — usually Planned Production
Time has been understated.

---

### E. People and competence — produces the *Competence Factor*

**This is the data set the training half of the product already collects, and it is
what makes this product different.**

| Data item | Source | Notes |
|---|---|---|
| Competence status per person per operation | Training matrix | Not a boolean — see levels below |
| Competence level | Sign-off record | 0 Not trained · 1 In training (supervised) · 2 Competent (independent) · 3 Expert · 4 Can train others |
| Proficiency factor | Measured | Actual output rate ÷ standard rate, per person per operation |
| Cumulative repetitions | Derived from output | Position on the learning curve |
| Training start date / completion date | Sign-off record | Gives time-to-competence |
| Revalidation due date | Competence record | Expiry, or triggered by SOP revision |
| Shift roster | Planning | Who is actually on which line, which shift |
| Planned absence | Holiday/HR | Holidays, planned leave |
| Absence-driven decay | Derived | Skills decay; long absence should trigger refresher |
| Coverage depth per operation | Derived | How many competent people exist — **single points of failure** |
| Designated trainer capacity | Training matrix | A trainer training someone is not producing at full rate |

**Calculating the Competence Factor — and the modelling trap**

How individual proficiencies combine depends on the line type, and getting this wrong
produces wildly optimistic plans:

| Line type | Rule | Why |
|---|---|---|
| **Paced / balanced line** (each operator does a different operation in sequence) | `Competence Factor = MIN(proficiency across the crew)` | The slowest station sets the pace for everyone. One trainee throttles the whole line. |
| **Parallel independent stations** (each operator makes complete units) | `Competence Factor = MEAN(proficiency)` | Outputs simply add up |
| **Mixed / partially buffered** | Weighted, bottleneck-aware | Buffers absorb some variation; model per cell |

The difference is not academic. A crew where three people are at 100% and one trainee
is at 60% gives a factor of **0.86 on parallel stations** but **0.60 on a paced line** —
a 30% difference in the target. This alone explains a large share of "we don't know why
we missed" weeks.

**Additional load to account for:** a designated trainer working alongside a trainee
typically runs at 60–80% of their own normal rate. The business plan mandates dedicated
trainers, which is correct — but the capacity cost must appear in the plan rather than
being discovered as a shortfall.

**Forecasting how fast a trainee ramps — the learning curve**

Use the DeJong model, which is Wright's law with a realistic floor:

```
T_n = T_1 × ( M + (1 − M) × n^b )        where  b = log₂(Learning Rate)
```

- `T_1` — time for the first unit
- `n` — cumulative units produced
- `LR` — learning rate; manual assembly typically **80–90%** (each doubling of cumulative
  output cuts the improvable portion by 10–20%)
- `M` — incompressibility factor: the machine-paced fraction that practice cannot improve

Worked example — standard time 63.4 s, new operator's first unit 150 s, LR 85%
(b = −0.234), M = 0.25:

| Cumulative units | Cycle time | Proficiency |
|---:|---:|---:|
| 25 | 90.4 s | 70% |
| 100 | 75.7 s | 84% |
| 250 | 68.3 s | 93% |
| 525 | 63.4 s | **100%** |
| 1,000 | 59.8 s | 106% |

Two things fall out of this that are directly useful to the customer:

1. **You can now forecast a ramp.** "This operator reaches standard rate in about
   525 units — roughly 5 working days at current volumes" is a planning input, and it
   makes the quarterly review in the business plan evidence-based rather than a chat.
2. **The plateau is set by method, not effort.** The `M` term is a floor that repetition
   cannot break through. If an operator plateaus below standard, more practice will not
   help — the SOP, the jig, the layout or the tooling must change. This is precisely the
   argument for standardised work, and the app can make it with data instead of assertion.

---

### F. Material and supply

Capacity you cannot feed is not capacity.

| Data item | Notes |
|---|---|
| Bill of materials | Per part |
| Material availability / on-hand stock | Per component |
| Supplier lead time and reliability | Drives buffer sizing |
| Line-side stock levels and replenishment trigger | Starved-line minor stops are a top-three loss and are usually mis-coded as "machine issue" |
| Consumables and tooling life | Tool changes are a recurring planned stop |

---

## Worked example — end to end

**Setup:** single cell, one shift, four operators, making one part.

**Step 1 — Planned Production Time**
```
Shift length                480 min
  − breaks                   30
  − cleaning / 5S            10
  − shift briefing            5
Planned Production Time     435 min  (26,100 s)
```

**Step 2 — Takt time** (demand 400 units/day)
```
Takt = 26,100 s ÷ 400 = 65.3 s/unit
```

**Step 3 — Standard time** (time study: observed 58 s, rating 0.95, allowance 15%)
```
Normal time   = 58 × 0.95        = 55.1 s
Standard time = 55.1 × 1.15      = 63.4 s
```

**Step 4 — Feasibility check**
```
Standard time 63.4 s  <  Takt 65.3 s     ✓ feasible, but only 3% margin
```
Already a finding: this line has almost no headroom. Any variation causes a miss.

**Step 5 — Theoretical output**
```
26,100 s ÷ 63.4 s = 411 units
```

**Step 6 — Apply OEE** (measured at 65%, typical)
```
411 × 0.65 = 267 units
```

**Step 7 — Apply Competence Factor.** Crew: two operators at 100%, one at 85%,
one trainee at 60%.
```
Parallel stations:  factor 0.86  →  267 × 0.86 = 230 units
Paced line:         factor 0.60  →  267 × 0.60 = 160 units
```

**The conclusion the tool should state plainly:**

> Demand is 400/day. On a paced line with the current crew, realistic output is
> **160/day**. The 400 target was never achievable — it required 97% OEE with a fully
> competent crew, against a world-class benchmark of 85%.
>
> The single largest lever is not OEE. It is the trainee at 60% proficiency, who is
> currently costing this line 107 units/day. Forecast time to competence: 5 working days.

That output — a target, its decomposition, and a ranked list of what to fix — is the
product. It is also, not coincidentally, exactly the "increase production, reduce waste"
promise in the Lean Solutions business plan, made arithmetic.

---

## Bootstrapping a customer with no data

Every prospect will have none of the above. The onboarding sequence must therefore be
part of the product, not a prerequisite for it:

| Week | Activity | Output |
|---|---|---|
| 0 | Map the value stream; list operations and routings | Operation register |
| 0 | Capture shift calendar and planned stops | Planned Production Time |
| 1–2 | Baseline capture: run production, log downtime by reason code, count good/scrap | First honest OEE — expect it to be lower than they believe |
| 1–2 | Time studies on the top operations by volume × time | Standard times |
| 2 | Seed the training matrix from what people actually do today | Competence baseline, coverage gaps |
| 3 | Set provisional targets at measured capability, **not** aspiration | Credible first targets |
| 4+ | Improve; re-baseline quarterly, and after every major SOP revision | Ratchet |

**Sequencing rule: never set a target before the baseline exists.** The fastest way to
destroy trust in the system on the shop floor is to launch it alongside a target
everyone knows is fictional. Publish the baseline first, agree it is real, then improve it.

**Time-study minimums:** 10–20 cycles for a stable short-cycle operation; more if cycle
time varies by more than ~10%. Record who was studied and their competence level — a
"standard" time taken from a trainee is not a standard. The app should refuse to accept
a time study from an operator whose competence level is below 2.

---

## The KPI set to expose

**Output and efficiency**
- OEE, with Availability / Performance / Quality shown separately, never just the product
- Labour efficiency = standard hours earned ÷ actual hours worked
- Schedule adherence — did we make what we planned, in the planned sequence
- Throughput vs takt, per cell
- Bottleneck identification — the operation with the longest effective cycle

**Quality**
- First pass yield per operation
- Scrap rate and scrap cost
- Rework hours as a share of total hours
- Defects by operation of origin, not operation of detection

**People — the ones only this product can produce**
- Training coverage per operation (% of the crew competent)
- **Single-point-of-failure operations** — only one competent person. This is a
  business-continuity risk and typically the most immediately alarming report for an
  Operations Director
- Competence-adjusted available capacity, by shift roster
- Time-to-competence, trending — the direct measure of whether the training system works
- Revalidations overdue, and competences suspended by SOP revision
- Trainer load and trainer capacity

**Leading indicators**
- Standard times overdue for re-study
- SOP revisions pending acknowledgement
- Risk assessments due for review
- Forecast competence coverage for the next 4 weeks against the roster
