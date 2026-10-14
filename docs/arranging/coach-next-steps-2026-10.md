# Coach next steps — 2026-10

**Context:** [polecat-coach-honest-reeval-2026-10.md](polecat-coach-honest-reeval-2026-10.md) · [polecat-honest-loop-plan-2026-10.md](polecat-honest-loop-plan-2026-10.md)  
**Honest baseline → loop best:** timeHit ~0.154 → ~0.284 (melody + blown-pitch key; no gold roots).  
**Goal:** On polecats, auto Coach from Lead + key + strong/passing should produce **chart-recognizable** highways — not ~0.28 timeHit.

---

## 0. Product pivot: strong / passing instead of manual pillars

Manual pillar assignment was meant for Coach but adds a second structure that competed with melody roles. **Auto Coach should not require user-confirmed pillars.** Harmonic homes come from **strong vs passing** melody notes (`pmn` / `smn` in Tag Studio).

### Definitions (lock these)

| Label | Code | Meaning |
| --- | --- | --- |
| **Strong** | `pmn` | Melody tone that carries a **structural harmony**. Harmonic arrival or hold: longer, metrically strong, phrase start/end, or lyric stress. Gets its own chord decision (root + nature): I / IV / V7 / II7 / VI7…. Neighbor passings resolve toward it or leave from it. |
| **Passing** | `smn` | Melody tone that **connects** strong tones. Shorter / weaker beat / stepwise filler. Does **not** invent a new home; chord is approach/passing relative to prev/next strong (or holds the previous strong’s chord). Nature leans approach color, not a new I/IV home. |

**Rule of thumb (polecats):** if you’d write a chord-symbol change above that note in a chart → **strong**; if it’s a connecting lead tone under the same (or approaching) harmony → **passing**.

**Auto default when unlabeled:** duration + beat strength + phrase edges → strong; the rest → passing. User can override in Tag Studio / Coach.

**Pillars afterward:** optional derived view (merge consecutive strong notes that share a root) for sketch/UI, or “lock this root” on a note — **not** a mandatory Coach step.

### How roles drive quality

- **Strong** → choose home root + nature (Lead-gated I7 / V7 / IV7 / Dom9-only-on-9, etc.).
- **Passing** → approach / hold / passing relative to neighboring strongs (II7→V7, etc.).
- Eval stays **honest**: melody + key (+ roles); never feed chart roots as Coach input.

### Why this is step 0

Today Path Optimize **returns no candidates** without a covering pillar (`candidatesForMoment` → `pillarAtTick`). The honest loop compensated by inventing denser fake pillars from melody. That duplicated what strong-note homes should be, while ignoring PMN/SMN. Step 0 is the contract; steps 1–5 implement it.

---

## Plan (1–5)

### 1. Fix homes before voicing (highest leverage)

**Problem:** Honest misses are mostly **wrong roots** on structural moments, not “right root, wrong Mm7 vs triad.” Voicing/ranker tweaks cannot fix a V where the chart has I.

**Do**

1. **Role-aware harmonic moments**  
   - Build an ordered list of Lead notes with roles (default-assign if `unknown`).  
   - **Strong notes** = decision points for `rootPc` (+ later nature).  
   - **Passing notes** = no independent root propose; inherit previous strong’s home or approach the next strong.

2. **Root model on strong notes only**  
   - Inputs: scale degree, duration, metric position, phrase role (open/mid/cadence/tag), prev/next strong root, Lead contour.  
   - Priors (major tags): ^1/^3/^5 → I; ^4/^6 → IV; ^2/^7 → V; cadence windows → V7→I / II7→V7; circle when approaching a strong V.  
   - Retire (for auto) the eighth-note “fake pillar” density hack as the primary home source once this works.

3. **Natures second**  
   - Only after root sequence on strongs is stable: Lead-gated I7/IV7/V7/VI7/Dom9; passing notes get approach natures.

4. **Supervised fitting (offline only)**  
   - Use polecat chart stack **roots** (and optionally romans) as labels to tune priors / catch systematic steals (e.g. V stealing I).  
   - Never inject those roots into runtime Coach or CI “cheat” eval.

**Acceptance**

- Metric **PMN rootHit**: fraction of chart stacks (or chart chords under strong-note ticks) whose root matches Coach at that time, restricted to moments aligned with strong notes (define alignment in harness).  
- Target before heavy ranker work: **PMN rootHit ≥ 0.6** micro on 12 polecats.  
- Side-by-side dump per tag: strong-note ticks → chart roman vs Coach roman.

**Likely touchpoints:** `proposePillarAt.ts` / new `proposeStrongRoots.ts`; `melodyNoteRoles.ts`; `InferPillars.ts` (demote or derive-only); `pathOptimize/candidates.ts` (home source).

---

### 2. Split the product path

**Problem:** One pipeline mixed “user confirmed pillars,” “inferred pillars,” and “gold pillars for eval,” so scores and UX lied about what Auto Coach can do.

**Auto path (default Coach / Path Optimize Classic)**

| Input | Required? |
| --- | --- |
| Lead melody | yes |
| Key (tonality / blown pitch) | yes |
| Strong/passing on Lead | yes (auto-default if unlabeled) |
| Pillars | **no** |
| Chart / gold roots | **no** |

Flow: default roles → propose roots on strongs → natures + voicing on strongs and passings → write stacks / sketch.

**Guided path (optional, later or thin)**

- User toggles PMN/SMN and/or **locks a root** on a strong note.  
- Algorithm fills unlocked strongs + all passings.  
- No mandatory “Step II confirm all pillars” for auto users.

**Eval path**

- Only Auto path inputs.  
- Delete or quarantine `projectFromGold` pillar injection from any gate that claims to measure product quality ([sequenceEval.ts](../../web/src/domain/arranging/polecatGold/sequenceEval.ts)).

**UX implications**

- Coach landing / wizard: lead with strong/passing, not pillar confirm.  
- Pillar rail: hide, collapse to “derived homes,” or advanced-only.  
- Tag Studio: keep role editing; show short definition tooltips (strong vs passing).

**Acceptance**

- Auto Path Optimize runs with `pillars: []` (or derived-only, unused as gate).  
- Docs + Coach copy match Auto vs Guided.  
- No CI test that feeds chart roots into Auto and calls that the product score.

---

### 3. Change the gate

**Problem:** Highway LCS + gold pillars reported ~0.97 while honest timeHit was ~0.15. Tuning against that made Coach worse to listen to.

**Primary gates (CI)**

| Metric | Meaning |
| --- | --- |
| **timeHit** | Coach roman @ chart-stack midpoint (all stacks or strong-aligned — pick one and document). |
| **PMN rootHit** | Root match on strong-aligned moments. |
| **timeStrict** | natureId@rootPc (secondary). |

- Corpus: all 12 polecats every run; gold four can stay slightly tighter floors; holdout advisory until promoted.  
- Harness: extend `scripts/arranging/polecatHonestScore.mjs` (and/or a vitest wrapper) — roles defaulted, no gold pillars.

**Demote**

- `polecatSequenceLoop` highway `pillarNorm` → advisory log only, or delete as hard `expect` once honest floors exist.  
- Do not raise highway floors as a substitute for honest gains.

**Human gate**

- Short listen checklist after each meaningful bump: Irish Rose, Sweetheart, Sweet Roses (and one holdout).  
- Pass = “recognizable highway / would not embarrass a polecat read,” not perfect extract match.

**Acceptance**

- CI fails on honest micro regress (eps TBD, e.g. 0.03) for timeHit and/or PMN rootHit.  
- Highway-only green is insufficient to merge.

---

### 4. Vocabulary discipline (after strong-note roots improve)

**Problem:** Even with better rhythm of changes, Coach invents III7 / Dom9 / V7 thrash where charts stay on I / IV7 / II7.

**Do — only after step 1 is moving PMN rootHit**

1. **Classic strong-note allowlist (default taste)**  
   Prefer: I, I7 (Lead 3/♭7), IV, IV7 (Lead 3/♭7), V7, II7, VI7 (Lead color), vi when Lead-on-root.  
   Dom9 only if Lead is the 9th.  
   Demote III7 / chromatic on strongs unless Lead/phrase clearly forces.

2. **Passing-note vocabulary**  
   Approach into next strong (e.g. II7 or V7-of-next); or hold previous strong’s chord.  
   Suppress mid-phrase sec-dom floods that re-root under a single strong.

3. **Harmonic rhythm**  
   Consecutive strongs with same root → one sustained harmony (merge).  
   Avoid note-by-note V7 flipping under one lyric hold.

4. **Keep Lead gates already earned**  
   Dom9 Lead=9; V7 prefer on V; IV7/VI7 Lead-color; I/IV triad when Lead 1/5 — re-validate under the new home source (not fake pillars).

**Acceptance**

- timeHit rises with rootHit (not rootHit up, timeHit flat from wrong natures).  
- Nature histogram on polecats: fewer `ninth` / stray mediant Mm7 on Classic.  
- Adversarial corpus (Flinn Dom9 when Lead is 9, etc.) stays green.

**Likely touchpoints:** `pathOptimize/candidates.ts`, `harmonize/candidateRanker.ts`, `harmonize/candidateGenerator.ts`, Classic taste in `taste.ts`.

---

### 5. Near-term execution order

Ordered so each slice is shippable and measurable. Do not start 5.5 until 5.4 clears targets (or consciously revises them).

| # | Work | Deliverable | Done when |
| --- | --- | --- | --- |
| **5.1** | **Definitions in product** | UI/help strings = §0 definitions; Coach/Tag Studio tooltips for Strong/Passing | Copy shipped; unlabeled Lead can still run Auto |
| **5.2** | **Default role assigner** | `assignMelodyRoles(melody, meter)` → pmn/smn from duration, beat, phrase edges | Unit tests on a few polecat Lead contours; unknown → assigned before optimize |
| **5.3** | **Honest harness v2** | PMN rootHit + timeHit + per-tag strong-note roman dump; Auto inputs only | `polecatHonestScore` (or vitest) prints both micros; no gold pillars |
| **5.4** | **Rewire Auto homes** | Path Optimize homes from strong-note roots; passing relative to neighbors; pillar not required for candidates | Auto runs with empty user pillars; PMN rootHit measurable |
| **5.5** | **Hit interim targets** | Iterate root model (§1) against harness | Micro **PMN rootHit ≥ 0.6**, **timeHit ≥ 0.5** on 12 (revise only with written reason) |
| **5.6** | **Vocabulary pass (§4)** | Classic allowlist / passing discipline under new homes | timeHit moves with rootHit; adversarial green |
| **5.7** | **Demote pillar UX + old gate** | Auto wizard without pillar confirm; highway LCS advisory | Docs + CI match Auto story |
| **5.8** | **Listen sign-off** | Checklist on Irish Rose, Sweetheart, Sweet Roses (+1 holdout) | Human “recognizable polecat” note in pass log |

**Explicit non-goals until 5.5**

- More Classic/Circle/Busy taste sweeps against highway LCS.  
- Weight training that feeds gold pillar roots.  
- Expanding corpus beyond polecats for the Auto quality gate (Classic Tags later, same honest protocol).

---

## Success bar

| Stage | Bar |
| --- | --- |
| Interim (5.5) | PMN rootHit ≥ 0.6 · timeHit ≥ 0.5 on 12 polecats |
| Product | Listen checklist pass on named tags; Auto needs no pillar confirm |
| Stretch | timeHit / roman match “chart-recognizable” on most polecats; holdouts not embarrassing |

If roots on **strong** notes are right, natures and voicing can follow. If we keep tuning voicing while strong-note roots are wrong, we will hypertune for badness again.

---

## Progress log (2026-10)

| Slice | Status | Notes |
| --- | --- | --- |
| **5.1** | done | `ROLES_HOWTO`, glossary, Coach Roles/Landing, AssignRolesHud tooltips |
| **5.2** | done | `assignMelodyRoles(melody, meter)` + tests; Auto Path Optimize force-defaults (seed extracts mark every Lead Strong) |
| **5.3** | done | `polecatHonestScore.mjs` prints timeHit + **pmnRootHit** + strong-note chart/coach dump; no gold pillars |
| **5.4** | done | `proposeStrongRoots` / `ensureHomesFromStrongNotes`; `prepareAutoPathOptimize`; candidates fall back to Strong-derived homes |
| **5.5** | M3g + M2b/c | Prior keep **`m2b-keep`**: pmn **0.498** · time **0.296** · **pmnConf 0.829**@0.063. Selective Co5 + auth-V + I→vi; Guided amber. |
| **5.6–5.7** | R4 floor | `honestAutoFloor` **0.48/0.28**; stretch 0.55/0.5 not CI. Guided Next review + listen checklist — [polecat-next-and-leaps-2026-10.md](polecat-next-and-leaps-2026-10.md). |
| **5.8** | listen | Conditional pass 2026-10-09 (`c2-add-keep`): kinda bad / maybe okay; Detected alts > Auto; revoice stuck after Full — see next-and-leaps Path A done when |
| **5.9** | C2 distill | Classic 125 stacks + polecat LOO 0.573; **`c2-add-keep`** additive blend pmn **0.515** / time **0.307** (raw swap do-not-ship). |
| **Leaps** | parallel | C1 top-2 / C6 underLocks; C2 kept — same next-and-leaps doc |

Harness: `node scripts/arranging/polecatHonestScore.mjs --label NAME --save` → `work/polecat-honest-loop/` · Refit: `node scripts/arranging/fitStrongRootPriors.mjs --corpus both --blend-keep work/polecat-honest-loop/strongRootPriors.m2b-keep.ts --keep-transitions`.
