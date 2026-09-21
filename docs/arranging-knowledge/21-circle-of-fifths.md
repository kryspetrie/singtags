# Circle of fifths — the barbershop harmonic highway

**Goal:** Understand the circle as a **map of keys** *and* as a **map of root motion**, then use it the way barbershop arrangers do: leap from I/IV, fall by fifths on **barbershop sevenths**, land on pillars.

**Spellings:** [18](18-chord-charts-by-key.md). **Legal rules:** [06](06-approach-three-rules.md) R1. **Romans:** [13](13-szabo-theory.md).

This is the style gate **S11** (“progressions resolve mainly on the Circle of Fifths”) made concrete.

---

## 1. What the circle is (general theory)

Write the twelve pitch classes so that **adjacent** letters are a **perfect fifth** apart. Clock form (sharps **clockwise**, flats **counterclockwise** from C):

```
                    C
             F             G
         B♭                   D
       E♭                       A
         A♭                   E
             D♭           B
                  G♭ / F♯
```

**Reading rules:**

| Direction | Interval between neighbors | Sound / function |
| --- | --- | --- |
| **Clockwise** (C→G→D→A…) | Up a P5 / down a P4 | “Sharpward”; often *leaving* home |
| **Counterclockwise** (C→F→B♭→E♭…) | Down a P5 / up a P4 | “Flatward”; **progressive** barbershop motion |

Barbershop’s favorite sentence: **roots move counterclockwise** — each chord is the **dominant** of the next.

```
… → A7 → D7 → G7 → C
     ↑    ↑    ↑    ↑
   V7/D  V7/G  V7/C  I
```

Every arrow is “down a fifth.” That chain is the **highway**.

---

## 2. Two jobs of the same circle

Do not confuse them:

| Job | Question it answers | Example |
| --- | --- | --- |
| **Key map** | How many sharps/flats? What’s the relative minor? | B♭ major = 2 flats; relative = Gm |
| **Root-motion map** | Where can this chord go next? | From D7, strongest next is G7 (then C) |

Arranging uses **both**: you pick a song key from the key map, then you drive **chord roots** around the motion map inside that key (and with chromatic secondary dominants).

---

## 3. Why barbershop is married to the circle

Classical harmony often lives inside **I–IV–V**. Barbershop still uses those pillars, but its **fuel** is the **Mm7 (barbershop seventh)** on *many* roots — not only V.

A Mm7 wants to resolve **down a fifth** because:

1. Its **3rd** is a leading tone into the **next root** (each link: 3rd of this BS7 → root of the following chord).  
2. Its **♭7** wants to fall a step.  
3. Tuned just, the chord rings; the resolution releases tension into a resting triad or the next BS7.

So the style preference is:

> Put tension on a BS7 → release by falling a fifth → land on a pillar (often major) on a strong beat.

That is **S9 + S11** in one sentence.

Density target (practice rule of thumb): roughly **⅓ or more** of the chart’s harmonic events are sevenths/ninths so the circle has something to pull.

---

## 4. Distance from home (Stevens / Prietto teaching)

Fix tonic = **home**. **Distance** = how many **descending fifths** (counterclockwise *steps along the highway*) it takes to get **back** to I.

Example: from **G**, one step G→C → distance **1**. From **D**, two steps D→G→C → distance **2**.  
(Do **not** count flatside neighbors of tonic: F is *not* “distance 1” — F is IV / springboard territory.)

### In C major

| Distance | Root | Typical chord | Feel |
| --- | --- | --- | --- |
| 0 | C | C / C6 / CM7 | Home |
| 1 | G | **G7** | Cadential — closest tension |
| 2 | D | **D7** (II7 / V7/V) | “One away from the cadence” |
| 3 | A | **A7** (VI7) | Deeper; common mid-phrase |
| 4 | E | **E7** (III7) | Classic “Five Foot Two” leap |
| 5 | B | **B7** | Far; often into minor or chromatic |
| … | F♯, C♯, … | … | Keep short unless it’s a tag stunt |

**Homecoming recipe:** leap out from I (or IV) to a distant BS7, then **walk home** by fifths:

```
C  →  E7 → A7 → D7 → G7 → C
I     III7  VI7  II7  V7   I
dist: 0     4    3    2    1    0
```

Each step **reduces distance by 1**. That is what “forward motion” feels like.

App helper: `distanceFromHome(rootPc, tonicPc)` in `approachThree.ts` (same descending-fifth count).

### Same map in B♭ (men’s common key)

| Dist | Root | Chord | Spelling |
| --- | --- | --- | --- |
| 0 | B♭ | B♭ | B♭ D F |
| 1 | F | F7 | F A C E♭ |
| 2 | C | C7 | C E G B♭ |
| 3 | G | G7 | G B D F |
| 4 | D | D7 | D F♯ A C |
| 5 | A | A7 | A C♯ E G |

Highway:

```
B♭ → D7 → G7 → C7 → F7 → B♭
I    III7  VI7  II7  V7   I
```

### Same map in F

```
F → A7 → D7 → G7 → C7 → F
```

Spellings: [18](18-chord-charts-by-key.md).

---

## 5. Springboards: where you *leave* the circle freely

**I and IV** (minor: **i and iv**) are **free chords**. From them you may leap to *any* vocabulary root. After the leap, you are back on the highway — usually walking home by fifths.

| From | Legal leap examples | Then |
| --- | --- | --- |
| **I** (C) | → E7, → A7, → D7, → A♭7, → F♯7… | Prefer chain toward next pillar |
| **IV** (F) | → D7, → G7, → B♭7… | Same |
| **IV → I** | F → C | Cadential **up**-fifth — progressive, not “wrong backup” |

**Mental model:**

1. Stand on I or IV (pillar).  
2. Jump onto the circle wherever the melody needs.  
3. Ride counterclockwise until the next pillar.  
4. Rest. Repeat.

Without springboards, you’d be stuck always approaching I only from G — real songs need longer arcs.

---

## 6. Forward vs retrogression

### Forward (preferred)

Root moves **down a P5** (or up a P4) — counterclockwise:

```
A7 → D7 → G7 → C
```

### Retrogression (backup)

Root moves **up a P5** (clockwise) — *against* the highway — except the special case **IV → I**.

```
… G7 → D7 → G7 → C …
      ↑ backup  ↑ forward again
```

**Use sparingly:** one notch of backup to catch an awkward melody tone, then resume forward. Long clockwise chains feel like reverse gear.

### Cadential up-fifth (not “bad backup”)

```
F → C     or    F7 → C
IV → I          IV7 → I
```

Treat this as a **landing**, not a retrogression.

---

## 7. Secondary dominants = circle stations with Roman names

Any Mm7 a fifth above a target is **V7 of that target**. Barbershop often labels them by **scale degree of the root**:

| Chord in C | Degree label | Classical | Next on highway |
| --- | --- | --- | --- |
| G7 | V7 | V7 | C |
| D7 | **II7** | V7/V | G7 |
| A7 | VI7 | V7/ii | D7 |
| E7 | III7 | V7/vi | A7 |
| C7 | **I7** | V7/IV | F |
| F7 | IV7 | *(not V7 of a diatonic triad)* | often C or color |

**IV7 is still a BS7** and still loves falling a fifth (F7→B♭), but it is **not** “V7 of something diatonic in C.” Don’t force a fake secondary-dominant name.

---

## 8. Circle inside Approach Two (how you actually arrange)

> **Return after Part IV** ([05](05-approach-two-workflow.md)) if this is your first pass — §§1–7 are enough for the highway mental model.

Given pillars from the ear:

```
Pillars:  I …… IV …… I …… V …… I
```

**Between** pillars, prefer roots that are **on the circle path into the next pillar**.

### Example — next pillar is C (I)

Best immediate approach: **G7** (dist 1).  
Stronger setup: **D7 → G7 → C**.  
Deeper drama: **A7 → D7 → G7 → C** or the full **E7→A7→D7→G7→C**.

### Example — next pillar is E♭ (IV in B♭)

Best approach: **B♭7** (I7 → IV).  
Or circle into it: **F7 → B♭7 → E♭** (then later home via F7→B♭).

### Melody gate

Every lead pitch must still be a chord tone of the BS7 you pick ([04](04-approach-one.md), [18](18-chord-charts-by-key.md)). The circle tells you **which roots**; membership tells you **whether that root works under this melody**.

### Worked phrase (B♭) — from [19](19-melody-to-arrangement.md)

```
| B♭ | B♭ | E♭ | B♭ | B♭ | B♭ G7 | C7 F7 | B♭ |
| I  | I  | IV | I  | I  | I  VI7| II7 V7| I  |
```

Bars 6–8 are pure highway: **VI7 → II7 → V7 → I** (G→C→F→B♭), distance 3→2→1→0.

---

## 9. Circle and Approach Three Rule 1

> **Return after** [06](06-approach-three-rules.md) for full R1–R5 legality. This section is a **bridge**, not a second rulebook — **SoT for rules = 06**.

**R1** is the circle formalized:

| R1 move | Circle reading | Strength |
| --- | --- | --- |
| Root a **P5 above** the target | Target is next counterclockwise | Strongest approach |
| Root a **P5 below** the target | Coming from the flat side | Also R1; often IV→I territory |
| Long P5↓ chain | Riding the highway home | Idiomatic |

Rules **R2–R5** are **detours** that still aim at the same targets:

| Rule | Relation to the circle |
| --- | --- | --- |
| **R2** chromatic BS7 | Neighbor root; often a **counterpart substitute** for a true fifths chord |
| **R3** tritone counterpart | Same *family* as a circle station (shares 3↔7); swap holds, then resolve as R1/R2 |
| **R4** dim7 | Escape hatch into several possible BS7 circle stations |
| **R5** M3 up from BS7 | Shortcut (e.g. ♭VI7→I) when fifths path is skipped |

**Teaching insight (BAM):** a chromatic string like  
`A♭7–G7–G♭7–F7–E7–E♭7`  
can be heard as a **fifths chain with counterparts inserted** — the ear still tracks the highway.

---

## 10. Tritone counterparts on the circle

Each BS7 has a **tritone twin** that resolves to the **same** places.

| Chord | Counterpart (tritone away) | Shared jobs |
| --- | --- | --- |
| G7 (V7 in C) | D♭7 | Both want to release toward C (and related targets) |
| D7 | A♭7 | Both aim at G territory |
| C7 | G♭7 / F♯7 | Both aim at F |

**Holding pattern (not progression):** `G7 ↔ D♭7` while melody allows (lead on 3 or ♭7 of the sounding chord).  
**Progression:** leave the family toward the pillar (`… → C`).

Counterparts let you keep **circle function** when the melody won’t sit on the “literal” V7 tones.

---

## 11. Minor keys — same circle, raised V

In minor, pillars are **i, iv, V(7)** with a **major** V7 (raised leading tone).

### A minor

**Pure fifths** (preferred teaching model):

```
Am → F♯7 → B7 → E7 → Am
i         II7  V7   i
```

F♯7 = F♯ A♯ C♯ E; B7 = B D♯ F♯ A; E7 = E G♯ B D (G♯ = leading tone).

**Color path — mark the tritone:** `Am → C7 → F7 ↔ B7 → E7 → Am`.  
`F7→B7` is **R3 counterpart holding**, not circle-of-fifths motion. Then `B7→E7→Am` resumes real descending fifths.

### G minor (relative of B♭)

**Pure fifths:**

```
Gm → E7 → A7 → D7 → Gm
```

**Color with R3:** `Gm → B♭7 → E♭7 ↔ A7 → D7 → Gm` — **E♭7↔A7** is the tritone insert.

---

## 12. Tags, swipes, and the circle

Classic tag / swipe energy often **restarts the highway** instead of sitting on I:

```
Song ends on I … swipe: I → VI7 → II7 → V7 → (tag on II or V)
```

Or the short cadential loop:

```
I → IV → V7 → I
```

Keep meter honest ([08](08-embellishments.md), [11](11-intros-tags-medleys.md)) — the circle supplies roots; rhythm supplies legality.

---

## 13. Arranger’s pocket checklist

When a bar feels stuck:

1. **Name the next pillar** (letter + RN).  
2. Find it on the circle — what is **one fifth above** it? That BS7 is your best friend.  
3. If the melody won’t fit, try **two fifths above**, or a **counterpart**, or springboard from the previous I/IV.  
4. Spell the chord ([18](18-chord-charts-by-key.md)); confirm lead is 1/3/5/♭7/9.  
5. Prefer **shortening distance** on successive strong beats (4→3→2→1→0).  
6. Avoid long **clockwise** (retro) runs unless you immediately turn around.

---

## 14. Common mistakes

| Mistake | Why it fails | Fix |
| --- | --- | --- |
| Only I–IV–V triads, no sevenths | No tension to release | Insert II7/V7 etc. toward pillars |
| Random chromatic major chords | Not on the highway | Prefer Mm7s that fall by fifth |
| Calling every Mm7 “V7” | Wrong Roman story | Use II7 / I7 / IV7 honestly ([13](13-szabo-theory.md)) |
| Treating I→V as illegal retro | Misread springboard | I→V is free from I; then resume |
| Circle roots with illegal lead tones | Membership break | Change root or nature |
| Endless BS7s, never land | No release | Pillar major/minor on strong beats |
| Clockwise “progressions” for bars | Feels reverse | One backup max, then counterclockwise |

---

## 15. Drills (do these at a whiteboard)

1. Draw the circle; mark **home** for C, then for B♭ and F.  
2. Write distance 0–4 chords with spellings in **E♭**.  
3. From pillar **F**, write three approaches: one-fifth (C7), two-fifths (G7→C7), and a springboard leap from **B♭** into D7 then home.  
4. Convert `E7–A7–D7–G7–C` into B♭ by keeping Romans and remapping roots.  
5. Take one leftover melody note under a B♭ pillar and find a circle (or counterpart) BS7 that contains it ([19](19-melody-to-arrangement.md) method).

---

## 16. Where this lives in the corpus

| Need | File |
| --- | --- |
| Style gate S11 | [01](01-style-definition.md) |
| R1–R5 legality | [06](06-approach-three-rules.md) |
| Romans / secondary dominants | [13](13-szabo-theory.md) |
| Multi-key spellings + printed circles | [18](18-chord-charts-by-key.md) |
| Full song application | [19](19-melody-to-arrangement.md) |
| “Jump feels random” repairs | [20](20-troubleshooting.md) |

---

**Path (Part II):** Prev [12-eleven-chords-ji](12-eleven-chords-ji.md) · [Index](00-index.md) · Next [18-chord-charts-by-key](18-chord-charts-by-key.md)
