# Voicing and voice leading — making chords singable

Source: BAM pp. 245–279 (OCR ~p258–p292); Prietto strong-voicing practice.  
**Goal:** Turn abstract chord symbols into TTBB stacks that lock.

---

## Default stack

| Part | Usual job |
| --- | --- |
| Tenor | Highest tone; stay **above** lead |
| Lead | Melody (fixed) |
| Bari | Completes the chord; may cross above lead |
| Bass | Prefer **root or 5th** |

---

## Spacing types

| Type | Outer span | When to use |
| --- | --- | --- |
| **Close** | ≤ octave | Default blend |
| **Open** | ~10th–12th | Classic ring; “Chinese 7th” usually reads as open (some hear divorced bass) |
| **Spread** | ~2 octaves+ | Climaxes, tags, contrast |
| **Homogeneous** | Adjacent intervals similar | Easiest to tune (all close voicings are homogeneous) |
| **Divorced bass** | Upper 3 close; bass far below | Occasional — preferable to divorced tenor |
| **Divorced tenor** | Lower 3 close; tenor exposed | Tags / special effects with spread |

**Preference (BAM):** homogeneous close or open → open with a divorced part → **divorced bass** over divorced tenor → spread / divorced tenor for effects → divorced pairs (rare).

### TTBB examples in C (MIDI: C4 = 60)

**Close C major** (root doubled):

```
Tenor  C5 (72)
Lead   G4 (67)
Bari   E4 (64)
Bass   C4 (60)
```

**Open C7:**

```
Tenor  E5 (76)
Lead   B♭4 (70)
Bari   G4 (67)
Bass   C3 (48)
```

**Divorced-bass C7** (upper trio close):

```
Tenor  B♭4 (70)
Lead   G4  (67)
Bari   E4  (64)
Bass   C2  (36)   ← extreme; pedagogical
```

---

## Doubling rules (triads)

| Situation | Prefer |
| --- | --- |
| Root-position major/minor | **Double the root** |
| First inversion (3rd in bass) | Double root or 5th (minor: 3rd also OK) |
| Second inversion (5th in bass) | Usually **double the 5th** |
| Major triad | **Avoid doubled 3rd** |

### Bad vs good (C major)

```
Bad:  T E5  L E4  B G4  Bs C3   ← E doubled, missing balance
Good: T G5  L E4  B C5  Bs C3   ← root doubled (C)
```

---

## Seventh / ninth bass logic (Prietto)

| Lead has… | Bass often takes… |
| --- | --- |
| Root | **5th** |
| 5th | **Root** |
| 3rd or ♭7 | Freer (root or 5th still preferred) |

**Dom9** (5 unique tones → 4 parts): omit **root** (bass on 5th; Prietto/BAM preference) or omit **5th** (bass on root; Rylander preference). Always keep **3, ♭7, 9**.

### G9 → C (omit root)

```
G9 tones: G B D F A
Sounding:   B D F A   (bass on D)
Then resolve tendencies into C major.
```

---

## Voice-leading principles

1. **Small motion** in tenor/bari; bass may leap root↔5th.  
2. Prefer **common tones** held in the same voice.  
3. **Contrary** bass vs upper unit when both leap.  
4. Parallel P5/P8: **soft warn** in barbershop — not an automatic ban (watch outer **tenor–bass** 5ths most).  
5. Outgoing BS7: 3 tends **up**, ♭7 tends **down** (or hold correctly).  
6. **Tempo:** uptempo → smoother VL wins; ballad → richer voicing can win.

### G7 → C resolution sketch

```
       G7                C
Tenor  F4  →  E4         (♭7 down)
Lead   B4  →  C5         (3 up)  ← if lead is on B
Bari   D4  →  C4/E4
Bass   G3  →  C3         (root down a 5th)
```

Barbershop sometimes **blocks** textbook resolution to avoid a doubled 3rd or incomplete chord — vertical strength can outrank classical 7th-down.

---

## Internal-stack checks (app lints)

| Check | Severity |
| --- | --- |
| Tenor below lead | Error / strong penalty |
| Incomplete triad (&lt;3 PCs) | Warn |
| Thin Dom9 (&lt;4 PCs) | Info |
| Muddy low 3rd / tenor–lead hole | Spacing warn |
| Doubled major 3rd | Soft warn |

---

## Mini exercise

Harmonize lead on **E4** over pillar **C**, then move to lead **C5** over **G7→C**:

1. First chord: C major with lead on E (3rd) — double C in bass/tenor.  
2. Second: G7 with lead approaching B or D — bass on G or D.  
3. Release to C with lead on C — bass on C, complete triad.

---

**Path (Part V):** Prev [06-approach-three-rules](06-approach-three-rules.md) · [Index](00-index.md) · Next [19-melody-to-arrangement](19-melody-to-arrangement.md)
