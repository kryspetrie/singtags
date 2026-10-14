# Alternate methods to hit honest accuracy — 2026-10

**Parent:** [coach-next-steps-2026-10.md](coach-next-steps-2026-10.md)  
**Context keep:** `orphan-keep` — pmnRootHit **0.488**, timeHit **0.287**, cover-orphan **0.326**.  
**Question:** Should we catalog more cadences / before–after chord windows? What else can move the metrics?

---

## Short answer

| Idea | Verdict |
| --- | --- |
| More **runtime** cadence / before–after hand lists | **Low leverage** — we already have catalog + fitted transitions + Viterbi; adding lists won’t clear 0.55 |
| Cadence / window catalogs in **eval diagnostics** | **Yes** — score and dump by window type; don’t treat them as the model |
| New model class (segment emission, Co5 graph search, Guided confidence) | **Worth trying** — ranked below |

---

## What we already have (don’t rebuild)

- **Cadence catalog** (`cadences/catalog.ts`): auth V7→I, II7→V7→I, plagal, tag penult, half cad, ♭II, backdoor, … (~10 textbook ids) + phrase-role scoring in Path Optimize.
- **Empirical Strong transitions** (`strongRootTransitions.generated.ts`) + hand Co5 bonuses in `strongRootCadence.ts`.
- **Exact Viterbi** over `{I, II, IV, V, vi}` (A2) — phrase decode shipped; always-apply **hurt** micro.
- **Miss mass:** only ~**25%** of Strong misses sit on cadence-like chart pairs (II→V, V→I, I→IV, …). ~**75%** are mid-phrase / ambiguous Lead tones.

Top coach misses on `orphan-keep`: **I↔V7**, **II7↔V7**, **VI7↔I**, **iii↔I**, **II7↔IV** — the same ^5 / ^3 / ^6 / ^2 collisions P1 already failed to separate with hand rules.

---

## Empirics: would bigger window catalogs help?

Leave-one-tag-out oracles on Strong ticks (12 polecats, diatonic home degrees):

| Model | Micro root accuracy | Notes |
| --- | --- | --- |
| Current Coach (`orphan-keep`) | **~0.49** | Runtime Auto |
| A · majority root given Lead scale degree | **0.47** | Almost our ceiling for note-local |
| B · A + gold **previous** chart root (bigram) | **0.42** | Sparse LOO; *worse* than A |
| C · A + gold prev **and next** (trigram oracle) | **0.42** | Still ~0.42 — not 0.6 |
| D · melody window (sd−1, sd, sd+1) | **0.45** | Runtime-legal; no chart |

Lead→chart ambiguity (all 12, Strong ticks):

| Lead sd | Majority chart home | Majority share |
| --- | --- | --- |
| ^1 | I | 0.61 |
| ^2 | V | 0.55 |
| ^4 | vi (vs I / iii) | **0.34** |
| ^5 | IV | **0.40** |
| ^7 | I (vs V) | 0.52 |
| ^9 | II | 0.53 |

**Implication:** Cataloging more before/after **chord** windows only helps if those windows are available at runtime. Gold-neighbor oracles on this tiny corpus do **not** reach 0.55. Melody-neighbor windows are legal but don’t beat note-local majority. Expanding the **hand cadence list** for Detected/Path Optimize is teaching UX value; it is not the accuracy path.

---

## Research directions (ranked)

### 1. Segment-level emission (highest technical leverage)

**Problem:** We label **one Strong note → one root**. MIR literature moved past that: segmental CRF / HSMM / bar pitch-class vectors score a **span** of melody against a chord.

**Do**

- For each candidate home on a Strong (or half-bar grid), score emission from **all Lead PCs overlapping the candidate span** (until next Strong / next half-bar), not only the Strong’s sd.
- Prefer roots whose chord tones cover the span (weighted by duration); demote when span is a scale run through many tones.
- Optional: joint segment+label (semi-CRF style) so chord duration is chosen with the label.

**Why it might work here:** Many I↔V7 misses are ^5 Strongs with neighbors that are tonic chord tones (or vice versa). Span evidence can break ties that single-note + bigram cannot.

**Refs:** Tsushima et al. segmental CRF (TISMIR); HSMM harmonization (AIIDE); bar PC-vector + BLSTM (ISMIR 2017) — we can steal the **feature**, not necessarily the neural net.

**Gate:** pmnRootHit ≥ 0.52 interim on 12; weak tags each ≥ 0.35.

---

### 2. Ambiguity-aware product + Guided locks (highest product leverage)

**Problem:** ~half of Strong ticks are inherently multi-modal given Lead+key. Forcing a single Auto answer will stay ~0.5.

**Do**

- Confidence from emission entropy / top-2 margin on Strong homes.
- Auto fills high-confidence Strongs; **surfaces low-confidence** for one-tap root lock (Guided).
- Split metrics: `pmnRootHit@confident` vs full; CI floor on confident subset + listen on full.

**Gate:** `pmnRootHit` on confident (≥0.6 margin) ≥ **0.65**; full micro advisory until Guided UX ships.

**Follow-on (filed):** User-marked **phrase regions** + link similar phrases to share chords/cadences — listen consistency, not micro root ceiling. Tracked as **M2p** in [polecat-iterative-accuracy-plan-2026-10.md](polecat-iterative-accuracy-plan-2026-10.md).

---

### 3. Circle-of-fifths graph search (Shop It–style decoder)

**Problem:** Local Viterbi with soft transitions still picks preferred emission; when emission is flat, we need **constrained path search** over legal BS progressions.

**Do**

- Build digraph of allowed Classic moves (II7→V7→I, I→IV, I7→IV, VI7→II7, …) — reuse education/highway vocabulary, not a huge new catalog.
- For each Strong, candidate homes = Lead chord-tone fits ∩ graph successors of prev.
- Beam/backtrack over phrase; score voicing later.

**Why different from A2:** Hard legal edges + enumeration vs soft score mix that preferred-emission dominated.

**Risk:** Over-constraining kills polecat chromatic/mediant color (90004 III7, etc.) — keep Classic allowlist + “escape” edges with cost.

**Ref:** [cmslewis/shop-it](https://github.com/cmslewis/shop-it) recursive Co5 harmonizer.

---

### 4. Metrical grid / hierarchical rhythm (medium, larger rewrite)

**Problem:** Strong-note skeleton ≠ chart harmonic rhythm; cover-orphan still ~0.33.

**Do**

- Propose homes on a **half-bar / beat grid**, merge consecutive same roots, then map to Strongs/Passings.
- Or tree/PCFG-style function grammar (Tsung / Tsushima ISMIR) — only if (1)–(3) stall.

**Gate:** timeHit moves first (stack mids), then pmnRootHit.

---

### 5. More labeled data (needed for any statistical jump)

12 polecats cannot train robust trigrams or a BLSTM. Options:

- Honest labels from Classic Tags / more polecat-like extracts (same protocol: Lead+key only at runtime).
- Offline teacher only: chart roots for fit; never in Auto CI.
- **C2 (2026-10):** Classic 125 stacks + polecat LOO 0.573; **additive** prior blend (`c2-add-keep`) → Auto pmn **0.515**. Raw table swap regresses — do not overwrite m2b keys.

Without further corpus or soft-blend variants, neural and fat n-gram catalogs will still overfit winners (already seen with coverage-refit).

---

### 6. Explicitly deprioritize

| Approach | Why |
| --- | --- |
| More CADENCE_CATALOG entries for Auto scoring | Teaching yes; accuracy no (25% of misses; oracles flat) |
| Longer hand before/after chord lists as hard rules | Same overfit as ^5→V; A2 already tried sequence |
| Refit priors on denser Strongs | Measured regress (`orphan-r1d`) |
| Aggressive role coverage | Measured pmn regress (`orphan-r1f`) |
| Highway LCS / gold pillars | Already demoted; lies about Auto quality |

---

## Should windows be part of **evaluation**?

**Yes — as diagnostics, not as the primary gate.**

Add to `polecatHonestScore` (or a companion dump):

1. **Miss histogram by chart window** `(prevRoman → curRoman)` and by Lead sd.  
2. **Cadence-slice metrics:** pmnRootHit restricted to phrase-edge Strongs vs mid.  
3. **Confidence-slice metrics** once (2) exists.  
4. Keep primary gates: cover-orphan, full pmnRootHit, timeHit.

That catalog tells you *which* research bet is working; it does not replace segment emission or Guided locks.

---

## Suggested next experiment order

**Executable loop:** [polecat-iterative-accuracy-plan-2026-10.md](polecat-iterative-accuracy-plan-2026-10.md)

| # | Bet | Effort | Success signal |
| --- | --- | --- | --- |
| **M0** | Eval windows + ambiguity dump (no model change) | 0.5 day | Dashboards for I↔V / ^4 / phrase-edge |
| **M1** | Segment emission on Strong spans | 2–4 days | pmn ≥ 0.52; weak ≥ 0.35 |
| **M2** | Confidence + Guided lock UX | 2–3 days | Confident subset ≥ 0.65; listen better |
| **M3** | Co5 graph beam (if M1 stalls) | 2–4 days | Weak tags ↑ without winner collapse |
| **M4** | Half-bar grid / more corpus | larger | Only after M1–M3 |

---

## Bottom line

Cataloging more cadences and before/after chords is **valuable for teaching and for eval slicing**, but it is **not** a path from 0.49 → 0.55 on honest Auto. The data say Lead scale degree is multi-modal; gold chord windows don’t resolve that on 12 songs. Prefer **span-level melody evidence**, **confidence-aware Guided**, and optionally a **hard Co5 path decoder** — and grow the labeled corpus before heavy statistics or neural nets.

---

## Post-loop status (2026-10-09)

Executable results live in [polecat-iterative-accuracy-plan-2026-10.md](polecat-iterative-accuracy-plan-2026-10.md) (**Do-not-retry registry** + cycle log).

| Bet | Status |
| --- | --- |
| M1 segment emission | **Kept** (safe I/II only); did **not** reach 0.52 |
| M2 confidence + Guided | **Kept** — pmnConf **0.829** @6% cov; amber review UX |
| M3 Co5 beam | **Partial keep** (selective); always-apply / margin-apply **failed** |
| M4a half-bar grid | **Failed** (flat time, −pmn) |
| Hand ^n→home / ii-after-tonic | **Failed** (cascade / winner regress) |

**Larger leaps** (see plan “Next paths”): Guided+phrase-link product, corpus+distill, two-hypothesis UI, joint segment CRF, ensemble/audio teachers — **not** another Co5 apply gate.
