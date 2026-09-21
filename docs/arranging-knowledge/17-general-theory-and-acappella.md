# General harmony theory + a cappella learnings (for barbershop tools)

**Status:** Reference synthesis (not a contest rulebook)  
**Sources (paraphrase):** Western common-practice / chorale norms as restated in Sharon & Bell *A Cappella Arranging* (2012); cross-checked against our corpus in `06`, `07`, `12`–`14`, `16`.  
**Product rule:** Prefer **barbershop / contest** sources when they conflict with contemporary a cappella or jazz practice. Use this file for *teaching*, *ranking rationales*, and *soft validations*.

---

## 1. What we take / what we refuse

| Take (teach + soft-score) | Refuse as contest defaults |
| --- | --- |
| Tension → release (esp. V7 → I) | Jazz “static” maj7/9/11/13 stacks as primary vocabulary |
| Prefer small voice motion; hold common tones | Dropping the **root** to fit colors (jazz chorale trick) |
| Contrary motion between outer voices | Parallel-fourth “shimmer” as a featured color |
| Harmonic-series spacing (wide bottom, tight top) | Groove / VP / syllable texture as harmonic substitutes |
| Omit **5th** first when chord > voices | Parallel power-chord 5ths as pad writing |
| Relative / substitute-6th and tritone-sub *as explanations* of moves we already have | Reharmonizing every bar with ii–V chains |

---

## 2. Acoustic foundation — harmonic series spacing

Every sung pitch implies overtones. The low end of the series sketches a **major triad** above the fundamental (e.g. C–G–C–E–G…). Practical arranging consequence:

1. **Space wider between bass and the next part** than between upper neighbors.  
2. **Close the upper three** when possible (classic TTBB “lock”).  
3. A **third** sung too low under a sparse upper gap sounds muddy and hard to tune.  
4. Separating the top two voices by more than about an octave creates a “hole.”

**Barbershop mapping:** closed vs spread voicing (`placeVoicing` spread flag); divorced-bass warnings in `07`; Dom9 omit-5 (bass on root) preserves series reinforcement of the fifth.

```
spacingScore(stack):
  + reward if bass↔next ≥ ~P5 and upper spans compact
  − penalty if bari/tenor put chordal 3rd in mud zone under high lead
  − penalty if tenor−lead > 12 semis (hole)
```

---

## 3. Tension and release (functional motion)

Western harmony narrates **dissonance resolving to consonance** (“motion and rest”).

### 3.1 Classic V7 → I story (teach constantly)

In G7 → C:

| Tone in V7 | Tendency | Resolves to |
| --- | --- | --- |
| 3rd (B) | Leading tone | ↑ to C (1 of I) |
| ♭7 (F) | Active 7th | ↓ to E (3 of I) |
| Tritone F–B | Unstable | → consonant 6th E–C |

**Barbershop mapping:** BS7 is the style’s primary *tension* chord; major (or stable pillar chord) is *release*. Secondary dominants (V7/X) aim the same story at a non-tonic target. Counterpart BS7s share the same 3↔7 pair — same tension, different bass/root label.

### 3.1b Worked phrase (tension budget)

```
C     Am7    D7     G7     C
I     (color) II7    V7     I
rest  mild    more   peak   release
```

If the whole phrase stays on C major triads, there is almost **no story**. If every beat is a BS7 with no release, singers never land — also a problem. Aim for waves.

### 3.2 Cadence vocabulary (RN teaching)

| Cadence | RN | Role in coach |
| --- | --- | --- |
| Perfect / authentic | V–I (or V7–I) | Strongest release |
| Plagal | IV–I | Softer “amen” release; springboard-adjacent |
| Half | …–V | Open-ended; expect continuation |
| Jazz extension (contrast only) | ii–V–I, iii–vi–ii–V–I | Explain *longer* circle walks; don’t require for contest |

### 3.3 Product hook — “next chord” suggestions

When proposing the **next** stack under a fixed lead:

1. Prefer roots that **continue Approach Three** toward the next pillar.  
2. Prefer natures that **increase then release** tension appropriately (BS7 into pillar major/I family).  
3. Prefer voicings where active tones (3/7 of a dominant) move by **step** into the resolution chord.  
4. Attach a one-sentence **Why?** citing tension/release + root-motion rule.

---

## 4. Voice leading (chorale norms, barbershop-tolerant)

### 4.1 Principles

1. **Small intervals** between consecutive notes in a part (historically: avoid leaps > P5 unless the line turns back).  
2. **Common-tone hold:** if a pitch class remains in the next chord, keep it in the same voice when possible.  
3. **Nearest-tone completion:** remaining voices take closest remaining chord tones.  
4. **Contrary motion** between bass and the upper unit reduces empty parallel texture.  
5. **Parallel P5 / P8** between the same two parts: flag (info/warn). Barbershop may bend; classical a cappella pads should not live on them.  
6. **Double root** on triads by default; **double third** is weaker (already linted).  
7. Octave leaps are easier to sing than 7ths/9ths; leaps across the **break** (~D4–G4 for many tenors) need care.

### 4.2 TTBB-specific overlays (from barbershop corpus)

- Tenor above lead (hard preference).  
- Bari above lead is normal.  
- Lead is often *second from top* so the tenor can ring above — same acoustic idea as Sharon/Bell’s “don’t squash three men under a mid-range melody.”

### 4.3 Cost model (extends `07`)

```
vlCost(prev, next) =
  Σ |Δmidi| for bass, bari, tenor   # lead fixed by melody
  + w_parallel * parallel_P5_or_P8_count
  + w_all_same_dir * (all moving parts same direction)
  + w_leap * sum(max(0, |Δ| − 7))
  − w_common * common_tone_holds
  − w_contrary * (bass vs upper unit opposite signs)
  + w_resolve_miss * unresolved_active_tones   # 3/7 of outgoing BS7 not stepping correctly
```

Use in **candidate ranking** and in **next-chord autocomplete**.

---

## 5. Chord completeness and omit priority

| Situation | Prefer | Avoid (contest) |
| --- | --- | --- |
| Triad + 4 voices | Double **root** | Double **third** without reason |
| 5+ pitch-class chord, 4 voices | Omit **5th** first | Omit root or 3rd of a BS7 |
| Dom9 | Omit-5 (bass on 1) or omit-root (bass on 5) with ≥4 PCs | Thin 3-PC “ninths” |
| Jazz color stacks | — | As primary contest pads |

**Incomplete-stack helper** (user asked explicitly): given 1–3 sounding pitches + optional lead role, propose completions that:

1. Match contest allowlist natures.  
2. Prefer BS7 / major when style density is low.  
3. Keep lead on a legal chord tone.  
4. Fill missing **3** then **7** (for dominants) before ornamental 9/6.  
5. Explain with RN + “completes the tritone / triad.”

**Mistake recovery:** remove 1–2 parts → re-infer possible natures from remaining PCs → suggest replacement pitches for the removed parts (same ranking).

---

## 6. Substitutions (shared language)

| Move | Theory name | Barbershop / our module |
| --- | --- | --- |
| Chord a P5 above target as Mm7 | Secondary dominant / V7/X | `secondaryDominant`, rank bias, few-sevenths fix |
| BS7 a tritone away sharing 3↔7 | Tritone substitution (jazz) / **counterpart** (barbershop) | `counterpart` Rule 3 |
| I ↔ vi, IV ↔ ii via bass | Relative / substitute-6th | `substitutions` ladder |
| Longer ii–V chains | Jazz cadence extension | Teach only; optional learning-profile gen |

**Roman dual-labels (display):** tonic Mm7 is primarily **I7** (Szabo), with classical alt **V7/IV** when it drives IV; degree-2 Mm7 into V is primarily **V7/V** with alt **II7**. Never emit `V7/degN` — use chromatic names (`♭VII`, etc.). `m7` is never labeled as `V7`.

---

## 7. Texture vocabulary (teaching labels, not contest requirements)

Sharon/Bell BG textures useful as **coach language** when analyzing a passage:

| Texture | Meaning | Contest stance |
| --- | --- | --- |
| Block chords | Homophonic pads under lead | **Default barbershop** |
| Duet/trio lock | Inner parts share lead rhythm/words | Common; swipe-adjacent |
| Arpeggiation | Chord tones in time | Embellishment / afterglow territory |
| Counterpoint / independent lines | Polyphonic BGs | Out of current product scope (user) |
| Instrumental idiom / VP | Non-harmonic layers | Out of scope |

---

## 8. Workflow parallels (pedagogy)

Contemporary a cappella “Ten Steps” vs Approach Two:

| A cappella step | Barbershop analogue |
| --- | --- |
| Choose song / listen | Song eligibility (`01`, `10`) |
| Form | Harmonic rhythm / pillars |
| Melody | Lead entry |
| Bass line | Bass role in voicing + pillar roots |
| Background voices | PCF → SCF fill |
| Final touches / Rule of Three | QA + revoice + coach |
| Record/rehearse | Playback ET/JI + compare-hear |

**Rule of Three (UX):** if the arranger (or singer) stumbles on a passage three times, prompt rewrite — coach tip, not a music rule.

---

## 9. Teachable glossary seeds (add to `16` / education catalog)

| id | Term | One-liner |
| --- | --- | --- |
| `tension_release` | Tension & release | Unstable tones (esp. in BS7) move by step into a resting chord. |
| `harmonic_series_spacing` | Series spacing | Nature’s chord: wide at the bottom, tighter on top. |
| `common_tone` | Common tone | A pitch shared by two chords — often held in one voice. |
| `contrary_motion` | Contrary motion | Outer parts move opposite directions — fuller succession. |
| `parallel_5_8` | Parallel 5ths/8ves | Same perfect interval sliding — can thin the texture. |
| `omit_5` | Omit the fifth | When crowded, drop 5 first; bass on root still implies it. |
| `leading_tone` | Leading tone | Chordal 3rd of V (scale degree 7) wants ↑ to tonic. |
| `active_seventh` | Active seventh | ♭7 of a dominant wants ↓ to the next chord’s 3rd. |
| `tritone_resolve` | Tritone resolution | The BS7’s 3–7 pair resolves outward/inward to a 6th (or similar). |
| `incomplete_chord` | Incomplete chord | Missing structural tones (1/3/7) — suggest completions. |

---

## 10. Conflict resolution table (engine policy)

| Conflict | Winner |
| --- | --- |
| Jazz drop-root vs contest complete chord | Contest: keep root/3/7 |
| Classical ban on parallels vs barbershop practice | Soft lint (info/warn), never hard-block alone |
| Pop “melody on top” vs TTBB lead-second | TTBB / barbershop |
| Dense jazz reharm vs Approach Three highway | Approach Three + pillars |
| A cappella texture novelty vs lock & ring | Lock & ring |

---

## 12. Arrangement progression analysis

Headless API: `analyzeArrangementHarmony(project)` / `analyzeProjectProgression(project)`.

Labels every stack with Roman numerals in the project key (I–vii°, V7/V, ♭II7, etc.), classifies function (tonic / dominant / secondary / tritone-sub / passing / …), and links consecutive stacks (authentic 5–1, plagal, secondary resolution, circle-of-fifths, counterpart, chromatic pass). Detects multi-chord patterns such as **V7/V → V → I**.

See `domain/arranging/progressionAnalyze.ts`.

---

## 12b. End-to-end mini arrangement (C major)

Use this as a study score for the whole corpus:

**Melody (lead), 8 bars simplified:**

```
| E D C E | G E D C | A G F A | G F E D |
| C D E G | A G E C | D E F# A | G F E C |
```

**Pillars (ear):**

```
| C     | C     | F     | C     |
| C     | C     | D7 G7 | C     |
```

**Fill with Approach Three:**

```
| C    | C  E7 | A7  F | C     |
| C A7 | D7    | G7    | C     |
```

(Second line: VI7→II7→V7→I into the final cadence.)

**Voicing check (last two bars):** G7 with lead on B or D; bass on G or D; resolve 3↑/♭7↓ into C with root doubled.

**Optional swipe** on the final C: hold lead C, walk bari/tenor C7→B♭7→C ([08](08-embellishments.md)).

**Optional lift** for a repeat: C→D♭ via A♭7 ([11](11-intros-tags-medleys.md)).

---

## 13. Related files

| File | Role |
| --- | --- |
| [`06-approach-three-rules.md`](06-approach-three-rules.md) | Root-motion legality / ranking |
| [`07-voicing-voice-leading.md`](07-voicing-voice-leading.md) | TTBB voicing + VL cost sketch |
| [`13-szabo-theory.md`](13-szabo-theory.md) | Harmonic grammar / free chords |
| [`14-prietto-practice.md`](14-prietto-practice.md) | Practice checklist / strong voicing |
| [`16-teachable-curriculum.md`](16-teachable-curriculum.md) | In-app lessons |
| [`../docs/theory-teaching-integration-plan.md`](../docs/theory-teaching-integration-plan.md) | Implementation plan for these ideas |

---

**Path (Part VII):** Prev [11-intros-tags-medleys](11-intros-tags-medleys.md) · [Index](00-index.md) · End of core path — optional [16](16-teachable-curriculum.md) · [09](09-computability-matrix.md)
