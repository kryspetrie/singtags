# Approach One — melody tones and chord choice

Source: BAM pp. 74–126.  
**Goal:** Decide *what kind of chord* fits a melody note given the surrounding pillar — before voicing.

The 1980 manual’s Approach One is a large set of **chord-tone / non-chord-tone tables** and quizzes. This chapter distills the **decision logic** the app automates. It does not reprint every engraved example page.

---

## Chord tone vs non-chord tone

Relative to the **current pillar root X**:

| Melody is… | Treat as | Typical action |
| --- | --- | --- |
| 1, 3, or 5 of X | **Chord tone** of the pillar triad | Prefer **PCF** on X ([02](02-chord-vocabulary.md)) |
| 6, 7, or 9 that belongs to a legal chord on X | Still **membership-legal** on PCF | Color on X (6, 7, 9, add9, …) |
| P4 / A4 above X, or ½-step above X | Often **cannot** sit on PCF | Need **SCF** (Groups 1–6) or a new root |
| Chromatic neighbor / passing | NCT | Passing BS7, dim7, or counterpart family |

### Worked (pillar X = C)

| Melody note | PC | On C major PCF? | Likely fix |
| --- | --- | --- | --- |
| C, E, G | 0,4,7 | Yes | C / C6 / C7 / C9 as membership allows |
| A | 9 | C6 / related colors | C6 or relative-minor thinking |
| B♭ | 10 | C7 | C7 (I7) |
| B | 11 | CM7 | Only if you *want* maj7 |
| D | 2 | Cadd9 / C9 | add9 or move toward G7/D7 |
| F | 5 | **Not** in C major triad | 4th above C → usually **SCF** or pillar **IV** |
| F♯ | 6 | No | SCF G5 (F♯7) or re-check pillar |
| D♭ | 1 | No | Neighbor BS7 (D♭7 = SCF G4) |

---

## Decision sketch (Approach Two Steps III–V)

```
for each melody onset:
  if note ∈ PCF(X):
      prefer chord on X (complete, strong bass)
  else if note ∈ some SCF group of X:
      try Groups 1→6 in usefulness order
  else:
      re-check pillar (maybe X is wrong)
      or use springboard leap from I/IV ([06](06-approach-three-rules.md))
```

### Example leftover: melody F♯ over pillar C

1. **Wrong pillar?** Ear may want D or G here.  
2. **SCF Group 5 of C:** F♯7 / G♭7 if melody is 3 or 7 of that BS7.  
3. **Dim7 containing C** (Group 2) if transitional.

Always ask: *which chord makes this tone a legal role (1/3/5/6/7/9)?*

---

## Metric weight

| Weight | Prefer |
| --- | --- |
| Strong beat / long note | Chord tone of the **pillar** (or clear V7 into it) |
| Weak beat / short pass | Neighbor BS7, dim7, swipe fragment |

Putting a screaming non-chord tone on a downbeat without an SCF story is a common beginner mistake.

---

## Passing / neighbor recipes (C, pillar C→G→C)

| Melody gesture | Chord idea | Rule family |
| --- | --- | --- |
| E–F–E over C | Keep C; F is weak passing (or brief F chord) | NCT restraint |
| G–A♭–G into G7 | A♭ as ♭9 color / D♭7 neighbor | R2 / SCF G4 |
| B–C into C | B as 3rd of G7 → C | R1 release |
| E–E♭–D into C | E♭° / C°7 color then D7/G7 | R4 → R1 |

---

## Relationship to later approaches

| Approach | Question |
| --- | --- |
| **One** | What chord *contains* this melody tone? |
| **Two** | In what *order* do I fill the chart? |
| **Three** | How do roots *move* legally between pillars? |

---

## Drill

Melody: `C D E F G` over implied pillars C then G then C.

1. Mark which notes are PMN vs SMN.  
2. For F, list two legal SCF solutions that are not “ignore the F.”  
3. Write a G7 that makes B a chord tone on the way home.

---

**Path (Part IV):** Prev [05-approach-two-workflow](05-approach-two-workflow.md) · [Index](00-index.md) · Next [06-approach-three-rules](06-approach-three-rules.md)
