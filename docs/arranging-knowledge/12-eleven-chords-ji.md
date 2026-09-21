# The eleven chords and just intonation

Source: Simon Rylander, *The 11 Chords of Barbershop* (2008); Dom9 omit practice also in Prietto/Szabo.  
**Goal:** Know every contest sonority, when to use it, and why lock & ring cares about cents.

---

## Why these chords

> **First read:** construction table → contest-eleven “when to use.” Return here for lock & ring / cents when polishing playback.

A barbershop chord aims for frequencies in **simple integer ratios** to the root → **lock and ring**. Equal-tempered piano cannot do that for all chords at once; singers retune vertically.

Canonical ringing tetrad: **barbershop seventh** \(4:5:6:7\) = root, just major 3rd, perfect 5th, **harmonic seventh** (\(7/4\)).

---

## How to build any contest chord (any key)

From a **root**, stack these intervals. Semitones in parentheses; “♭3” means minor 3rd, not necessarily a flat accidental.

| Nature | Formula | Roles |
| --- | --- | --- |
| Major | 1 – M3 – P5 (0–4–7) | 1 3 5 |
| Minor | 1 – m3 – P5 (0–3–7) | 1 ♭3 5 |
| Aug | 1 – M3 – A5 (0–4–8) | 1 3 ♯5 |
| BS7 | Major + m7 (0–4–7–10) | 1 3 5 ♭7 |
| m7 | Minor + m7 (0–3–7–10) | 1 ♭3 5 ♭7 |
| Dim7 | Stack of m3s (0–3–6–9) | 1 ♭3 ♭5 𝄫7 |
| Maj7 | Major + M7 (0–4–7–11) | 1 3 5 7 |
| Add9 | Major + M9 (0–4–7–2) | 1 3 5 9 |
| Sixth | Major + M6 (0–4–7–9) | 1 3 5 6 |
| Min+6 | Minor + M6 (0–3–7–9) | 1 ♭3 5 6 |
| Dom9 | BS7 + M9 (0–4–7–10–2) | 1 3 5 ♭7 9 |

**Three-step BS7:** (1) name root → (2) major triad → (3) add the tone a **minor 7th** above the root.

```
F7:  F → F A C → + E♭  →  F A C E♭
B♭7: B♭ → B♭ D F → + A♭ →  B♭ D F A♭
D7:  D → D F♯ A → + C  →  D F♯ A C
```

**Full multi-key spellings:** [18-chord-charts-by-key.md](18-chord-charts-by-key.md).

---

## The contest eleven (SAI core)

Table below is in **C** for reading speed. Same formulas apply in every key — use [18](18-chord-charts-by-key.md) for B♭, F, E♭, G, D, A, E, Am, Em, Dm.

| # | Nature (app id) | Tones in C | Same chord in B♭ | JI highlight | When to use |
| --- | --- | --- | --- | --- | --- |
| 1 | `major` | C E G (+double) | B♭ D F | 1, 5/4, 3/2 | Pillars; endings; double **root**; don’t double 3rd |
| 2 | `seventh` | C E G B♭ | B♭ D F A♭ | + 7/4 | **Primary fuel**; Co5 chains; density ~⅓+ |
| 3 | `maj7` | C E G B | B♭ D F A | + 15/8 | Melody-forced; **only** contest chord with chord-tone m2 |
| 4 | `add9` | C E G D | B♭ D F C | + 9/8 | Beautiful ring; melody/suspension-like |
| 5 | `sixth` | C E G A | B♭ D F G | + 5/3 | Transition / color; often omit 5 |
| 6 | `ninth` | C E G B♭ D | B♭ D F A♭ C | BS7 + 9 | **Five** tones → omit one (below) |
| 7 | `minor` | C E♭ G | B♭ D♭ F | m3 6/5 | Color / relative; rarely long pillars |
| 8 | `madd6` | C E♭ G A | B♭ D♭ F G | ringing tetrad | High lock |
| 9 | `m7` | C E♭ G B♭ | B♭ D♭ F A♭ | 7/6 + 7/4 | Transition; PC-twin of a maj6 elsewhere |
| 10 | `dim7` | C E♭ G♭ A | B♭ D♭ E G | weak lock | Transition only; escape hatch below |
| 11 | `aug` | C E G♯ | B♭ D F♯ | #5 25/16 | Last resort when melody forces #5 |

**BHS extended** (optional profile): also `dim` triad, `half-dim`, and org-specific rarer chords — not SAI-11 defaults.

### Same eleven on other common roots (quick)

| Root | Major | BS7 | Dom9 (full) | Dim7 |
| --- | --- | --- | --- | --- |
| **F** | F A C | F A C E♭ | F A C E♭ G | F A♭ B D |
| **G** | G B D | G B D F | G B D F A | G B♭ D♭ E |
| **E♭** | E♭ G B♭ | E♭ G B♭ D♭ | E♭ G B♭ D♭ F | E♭ G♭ A C |
| **D** | D F♯ A | D F♯ A C | D F♯ A C E | D F A♭ B |

Cadential V7→I pairs (memorize these):

| Key | V7 | I |
| --- | --- | --- |
| C | G B D F | C E G |
| G | D F♯ A C | G B D |
| F | C E G B♭ | F A C |
| B♭ | F A C E♭ | B♭ D F |
| E♭ | B♭ D F A♭ | E♭ G B♭ |
| D | A C♯ E G | D F♯ A |

---

## Just intonation (cents vs equal temperament)

Return here when coaching lock & ring or reading app playback bends (`justIntonation.ts`). ET MIDI remains the notation grid.

| Interval | Just ratio | ≈ cents vs 12-TET |
| --- | --- | --- |
| M3 | 5/4 | ≈ −14¢ |
| P5 | 3/2 | ≈ +2¢ |
| Harmonic ♭7 | 7/4 | ≈ **−31¢** |
| M6 | 5/3 | ≈ −16¢ |
| M7 | 15/8 | ≈ −12¢ |
| M9 | 9/8 | ≈ +4¢ |

---

## Dom9 omit rules

Dom9 has **five** pitch classes; four singers → omit one:

| Omit | Keep | Bass prefers | Note |
| --- | --- | --- | --- |
| **Root** | 3, 5, ♭7, 9 | **5th** | Prietto/BAM: most common omit; same PCs as some m6 / ø7 — context decides label |
| **5th** | 1, 3, ♭7, 9 | **Root** | Rylander: “normally” omit 5th; also fully legal |

Both omits are contest-legal. **Must keep:** 3rd, ♭7, 9th. Never omit those to “fit.”

### Worked: G9 (V9 in C)

```
Full:  G  B  D  F  A
Omit G:   B  D  F  A   (bass on D)  → sounds G9
Omit D: G  B  F  A   (bass on G)
```

Often the 9th then steps toward a plain G7 before resolving to C.

---

## Maj7 and the m2 exception

BAM’s style def bans chords with minor seconds; Rylander (and contest practice) allow **maj7**, which necessarily places M7 next to root (B–C in CM7). That is the **S13** carve-out — still don’t write melodies that live on maj7 forever.

---

## Dim7 utility

Symmetric stack of minor thirds. Poor lock → use for **motion**.

**Escape rules** (Rylander): move any dim7 tone a half step —

- **Down** → that tone becomes the root of a **BS7**
- **Up** → that tone becomes the **5th** of a **minor sixth**

### C°7 → BS7 roots (down)

```
C°7 pcs:  C  E♭  G♭  A
Lower C→B  → B7-type
Lower E♭→D → D7-type
Lower G♭→F → F7-type
Lower A→A♭ → A♭7-type
```

App helper: `bs7RootsFromDim7` (down→BS7 path).

---

## Ring ranking (LCD heuristic)

Lower least-common-denominator of ratios → more common / more ring:

**major & BS7 → minor & m6 → sixths / add9 / Dom9 → maj7 / m7 → dim7 / half-dim → aug last.**

(App `RING_TIER` matches this order — Dom9 ranks with other mid-ring colors, ahead of melody-forced maj7/m7.)

---

## Microtuning trap: m7 vs maj6

`Cm7` (C E♭ G B♭) and `E♭6` (E♭ G B♭ C) share pitch classes but tune differently as **different chords**. Label by function and approach/resolution, not PC set alone.

---

## Mini drills

1. Spell II7, V7, I7 in **C** and in **B♭**; name each as V7/X where honest ([13](13-szabo-theory.md)).  
2. Voice **F9** omit-root (V9 in B♭) with bass on C.  
3. From C°7 and from B♭°7, list four BS7 roots after dropping each tone.  
4. Open [18](18-chord-charts-by-key.md) and spell the full circle into I for F and for E♭ without looking at piano.

**Charts:** [18-chord-charts-by-key.md](18-chord-charts-by-key.md). **Next:** [13-szabo-theory.md](13-szabo-theory.md) for Roman / secondary-dominant grammar.

---

**Path (Part II):** Prev [10-song-selection-form](10-song-selection-form.md) · [Index](00-index.md) · Next [21-circle-of-fifths](21-circle-of-fifths.md)
