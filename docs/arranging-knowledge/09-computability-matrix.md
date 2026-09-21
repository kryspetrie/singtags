# Computability matrix — what software can own

**Audience:** Product / engineering. **Learners:** start at [`00-index.md`](00-index.md) and the teaching chapters linked below.

This file scores arranging tasks by how deterministic they are. It is **not** a substitute for learning the craft.

| Area | Teaching chapter |
| --- | --- |
| Chord membership / illegal nature | [02](02-chord-vocabulary.md), [12](12-eleven-chords-ji.md) |
| Approach Three root legality | [06](06-approach-three-rules.md) |
| Pillars / HR | [03](03-harmonic-rhythm.md), [05](05-approach-two-workflow.md) |
| Voicing / VL | [07](07-voicing-voice-leading.md) |
| Embellishments / tags / lifts | [08](08-embellishments.md), [11](11-intros-tags-medleys.md) |

Legend: `D` = deterministic, `H` = heuristic + user confirm, `C` = creative / out of scope for v1 engine.

## Style & vocabulary

| Item | Class | Notes |
| --- | --- | --- |
| TTBB roles, tenor-above-lead, bass-lowest | D | lint |
| Minor-second ban | D | reject |
| Chord membership for lead | D | SingTags exists |
| Voicing table apply closed/spread | D | SingTags exists |
| Just intonation lock & ring | C | performance |
| Lyric taste / era language | C | human |
| Song “is it barbershop?” aesthetic | H | soft score |

## Harmonic rhythm & pillars

| Item | Class | Notes |
| --- | --- | --- |
| Primary root isolation from melody alone | H | ear canonical |
| Pillar lint vs Circle-of-Fifths | D/H | flag atypical |
| Strong-beat chord-change preference | D | ranking |

## Approach Two steps

| Step | Class | Notes |
| --- | --- | --- |
| I Primary roots | H | user confirms pillars |
| II Cross-check sheet/symbols | H | optional input |
| III PMN←PCF + voice | D | core auto w/ preview |
| IV SMN←PCF | D | leftovers flagged |
| V SMN←SCF groups | D/H | generate groups; user pick |
| VI Strengthen motion | H | ranked alts |
| VII Variety / swipe seeds | H | suggestions |
| VIII Voicing polish / tempo simplify | D/H | VL cost |
| IX Final creative options | C/H | user-led |

## Approach Three rules

| Rule | Class | Notes |
| --- | --- | --- |
| 1 P5 progression / retrogression | D | filter |
| 2 Chromatic BS7 | D | filter |
| 3 Tritone counterpart | D | filter + tempo warn |
| 4 Dim7 functions | H | root assignment ambiguous |
| 5 BS7 → +M3 | D | filter |
| I/IV springboard axiom | D | relax filter |

## Coverage vs existing software

| Capability | MuseScore plugin | SingTags Tag Studio | Manual full arranging |
| --- | --- | --- | --- |
| Per-note chord+voicing | yes | yes | yes (subset) |
| Primary pillars workflow | no | no | Approach Two I–III |
| Passing / SCF fill | no | no | Approach Two IV–VI |
| Root-motion legality | no | no | Approach Three |
| Embellishments | no | no | ch. Embellishments |

## Score (wizard MVP = Steps I–VI + Rules 1–5 ranking)

| Bucket | Count | Share |
| --- | --- | --- |
| Deterministic building blocks | 18 | ~55% |
| Heuristic + user confirm | 11 | ~33% |
| Creative / defer | 4 | ~12% |

**Interpretation:** Feasible as an **assisted wizard** (`GO_WITH_LIMITS`), not a fully automatic arranger. Human confirms pillars; software proposes and voices stacks.

## Non-goals that must not block MVP

- Full OMR of manual examples
- Scanning user sheet music for melody (prefer piano-roll entry)
- Auto-just intonation MIDI
- Auto lyric rewriting
- Publishing copyright clearance (warn only)
