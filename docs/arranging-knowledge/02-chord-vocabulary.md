# Chord vocabulary — natures, PCF, and SCF

Source: BAM definition + Approach Three vocabulary (pp. 11–21, 206).  
Deep contest/JI detail: [12](12-eleven-chords-ji.md). Spellings: [18](18-chord-charts-by-key.md). Circle: [21](21-circle-of-fifths.md).

**Goal:** Know which chord *roots* are legal relatives of a pillar, and which *qualities* the contest set allows.

Every harmonized lead pitch must be a chord-tone role **1, 3, 5, 6, 7, or 9** of a vocabulary chord.

---

## Primary vs secondary families (Approach Two)

Given pillar root **X**:

### Primary chord family (PCF)

All vocabulary chords **built on X**, except dim7 (handled as SCF Group 2).

**X = C examples:** C, Cm, C7, C9, C6, CM7, Cadd9, …

### Secondary chord family (SCF) — Groups 1–6

Listed in approximate usefulness. **Worked for X = C:**

| Group | Construction | Roots when X = C | Typical natures | Melody story |
| --- | --- | --- | --- | --- |
| **1** | P5 above X (V of X) | **G** | 7, 9, m7, Maj… | Classic dominant approach |
| **2** | Dim7 containing X | **C°7** family {C,E♭,G♭,A} | `dim7` only | Transition / anticipate |
| **3** | BS7/9 a ½-step **below** X | **B7** | `seventh` / `ninth` | Chromatic lower neighbor |
| **4** | BS7/9 a ½-step **above** X | **D♭7** | `seventh` / `ninth` | Chromatic upper neighbor |
| **5** | BS7 a **tritone** from X | **G♭7 / F♯7** | `seventh` | Tritone-from-pillar color (not “the V7 counterpart”) |
| **6** | Subdominant function | **F** Maj/7; also **A♭** Maj/7 | Maj, `seventh` | IV / ♭VI color |

**Note:** V7’s *tritone counterpart* (R3) is a different idea — for V=G7 that counterpart is **D♭7**, which here is also SCF Group 4 (½ above C). Group 5 is always **tritone from the pillar root X**.

Transpose: for pillar **F**, Group 1 = **C**, Group 5 = **B**, etc.

### Same SCF map when pillar = B♭ (common men’s key)

| Group | Roots when X = B♭ | Typical natures |
| --- | --- | --- |
| **1** | **F** | F7, F9, … |
| **2** | **B♭°7** pcs {B♭, D♭, E, G} | `dim7` |
| **3** | **A7** | BS7 / Dom9 |
| **4** | **B7** / **C♭7** | BS7 / Dom9 |
| **5** | **E7** (tritone from **B♭**) | BS7 / Dom9 |
| **6** | **E♭** Maj/7; also **G♭** Maj/7 | IV / ♭VI color |

Spellings: F7 = F A C E♭ · A7 = A C♯ E G · E7 = E G♯ B D · E♭ = E♭ G B♭ ([18](18-chord-charts-by-key.md)).

### Worked leftover: melody on F♯, pillar C

F♯ ∉ C major triad. Try:

1. Re-check pillar (maybe D or G).  
2. **Group 5:** F♯7 if lead is 3 or 7 of F♯7 (A♯ or E).  
3. **Group 2:** C°7 if transitional.

### Worked SCF walk into C

```
Melody hangs near B♭ then resolves to C:
D♭7 (G4) → G7 (G1) → C (PCF)
or
B7 (G3) → C
or
F♯7 (G5) ↔ C’s counterpart family with G7 → C
```

---

## Prefer / defer & hard bans

| Prefer | Defer unless melody forces |
| --- | --- |
| `seventh`, `major`, `minor` | `sixth`, `ninth`, `maj7`, `add9` |
| Circle-of-fifths targets | Static non-functional color |

- Reject voicings that create a sounding **minor second** between parts (**S13**), except the maj7 chord-tone pair.
- Prefer complete chords; on plain triads, double the **root**.

---

## Canonical natures (software IDs)

Align with app `BARBERSHOP_CHORDS`. Construction/JI narrative: [12](12-eleven-chords-ji.md).

| id | Notation | Intervals from root (semitones) | Manual stance |
| --- | --- | --- | --- |
| `major` | (none) | 0,4,7 | standard |
| `minor` | m | 0,3,7 | standard |
| `aug` | + | 0,4,8 | occasional |
| `dim` | o | 0,3,6 | special / BHS-extended |
| `seventh` | 7 | 0,4,7,10 | **primary favorite** (barbershop Mm7) |
| `m7` | m7 | 0,3,7,10 | accepted |
| `half-dim` | ø7 | 0,3,6,10 | BHS-extended / accepted in tables |
| `dim7` | o7 | 0,3,6,9 | accepted; dual-root; unstable |
| `maj7` | M7 | 0,4,7,11 | special conditions only |
| `ninth` | 9 | 0,4,7,10,2 | melody-driven Dom9 |
| `sixth` | 6 | 0,4,7,9 | avoid unless melody demands |
| `add9` | add9 | 0,4,7,2 | Major + M9 |
| `madd6` | madd6 | 0,3,7,9 | minor + 6 |

---

## Chord-tone membership test

```
contains(rootPc, nature, leadPc) :=
  ∃ role in nature.offsets:
    (rootPc + offset[role]) mod 12 == leadPc
```

Same idea as SingTags `chordContainsLead`.

---

## Drill

For pillar **G**, list SCF Group 1–6 roots, then pick a Group 4 chord that contains melody A♭.

---

**Path (Part IV):** Prev [03-harmonic-rhythm](03-harmonic-rhythm.md) · [Index](00-index.md) · Next [05-approach-two-workflow](05-approach-two-workflow.md)
