# Troubleshooting technical arranging problems

**Goal:** When something “sounds wrong” or the app lints fire, find the **musical cause** and a fix.  
For chord spellings see [18](18-chord-charts-by-key.md). For the happy-path method see [19](19-melody-to-arrangement.md).

---

## How to use this playbook

1. Name the symptom (row).  
2. Check the likely cause.  
3. Apply the fix in order — don’t voice-lead a wrong chord.

---

## A. Harmony / chord choice

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Chart feels static / “church hymn” | Too few BS7s; only major triads | Add V7 / II7 into pillars; aim ~⅓+ seventh density ([01](01-style-definition.md), [13](13-szabo-theory.md)) |
| Chart feels frantic / never lands | BS7s with no release | Land major/minor **pillars** on strong beats; clear V7→I |
| Melody note “doesn’t fit” | Lead not a chord tone of chosen nature | Spell chord ([18](18-chord-charts-by-key.md)); change nature or root so lead is 1/3/5/6/7/9 ([04](04-approach-one.md)) |
| Wrong chord on a downbeat | Pillar in the wrong place | Re-do ear bass; move pillar ([03](03-harmonic-rhythm.md)) |
| II7 labeled weird / `degN` | Bad Roman target | Use II7 / V7/V dual labels; chromatic names for ♭VII etc. ([13](13-szabo-theory.md)) |
| IV7 treated as “V7 of something” | Misread secondary dominant | **IV7 is not** V7 of a diatonic triad ([13](13-szabo-theory.md)) |
| m7 showing as V7 | Quality mix-up | m7 ≠ Mm7; don’t call it V7 |
| Counterpart swap sounds wrong | Lead on 1 or 5 of the BS7 | Only free-swap when lead is **3, 7, raised root (♯1), or ♭5** ([06](06-approach-three-rules.md)) |
| Dim7 hangs forever | Used as a pillar color | Keep short; resolve by dropping a tone to BS7 ([12](12-eleven-chords-ji.md)) |
| Dom9 muddy / incomplete | Five tones in four mouths without a plan | Omit **root** (bass on 5) or omit **5** (bass on 1); keep 3/♭7/9 ([18](18-chord-charts-by-key.md) §5) |
| Maj7 everywhere | Melody lives on degree 7 | Rewrite melody or accept rare CM7; don’t force ([12](12-eleven-chords-ji.md)) |

### Quick membership test

```
Chosen chord tones = { … }
Lead pitch ∈ chord tones?  if no → illegal stack
```

---

## B. Root motion / Approach Three

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Jump from Dm to E♭maj feels random | Illegal / weak root leap | Prefer R1–R5 or springboard from I/IV ([06](06-approach-three-rules.md), [21](21-circle-of-fifths.md)) |
| I→V ranked poorly in old tools | Misclassified as retro | I→V is **springboard** (free), not retro |
| Retrogression won’t go away | Backing up the circle too long | One backup, then forward; or leap only from I/IV |
| Chromatic BS7→BS7 fails | From chord wasn’t a seventh | R2 expects BS7/9 |
| R5 (♭VI7→I) ranked weakly | Target had a 7th / wrong interval | Classic R5 prefers **non-seventh** target — engine soft-penalizes M3-up into 7/9; land on major/minor when you can |

### Legal “is this OK?” checklist between pillars

1. Is prev root I or IV? → leap OK (springboard).  
2. Else P5 down toward goal? → best.  
3. Else chromatic BS7 / tritone counterpart / dim7 / M3-up BS7? → OK with gates.  
4. Else rethink.

---

## C. Voicing / TTBB

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Thin / no ring | Doubled 3rd; missing 3 or 7 | Complete chord; double **root** on major ([07](07-voicing-voice-leading.md)) |
| Muddy low end | 3rd just above bass in close spacing | Widen bass↔next; put 3rd higher |
| Hole on top | Tenor–lead > octave | Close upper voices |
| Tenor under lead | Stack order wrong | Raise tenor or lower lead octave |
| Bass always on 3rd | Weak foundation | Prefer bass root/5th |
| Lead on root of BS7, bass also root | Collision | Bass takes **5th** (Prietto) |
| Parallel 5ths flagged | Soft VL issue | Revoice if easy; not always illegal in BS |
| Active tones don’t resolve | 3/♭7 leaped away awkwardly | Step 3↑ / ♭7↓ when possible |

### Cadence repair recipe (any key)

1. Spell V7 and I from [18](18-chord-charts-by-key.md).  
2. Put lead on a strong tone (often 3 of V7 → 1 of I, or 1 of I).  
3. Bass: root/5th opposite lead’s root/5th.  
4. Fill bari/tenor with remaining chord tones; tenor above lead.

---

## D. Form / embellishment / key change

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Swipe makes singers rush | Extra beats / too many chords | Fit the meter; fewer changes ([08](08-embellishments.md)) |
| Tag feels glued on | Starts on I; no swipe bridge | Start tag on II/IV; swipe from song I ([11](11-intros-tags-medleys.md)) |
| Key lift wrecks phrase | Mid-phrase hitch / cut bars | Lift between sections; preserve measure count |
| Medley incoherent | No shared lyric/theme | One-sentence theme test |

---

## E. App / lint oriented

| Lint / coach | Musical meaning | Typical fix |
| --- | --- | --- |
| `illegal-nature` | Outside contest profile | Swap to SAI-11 / BHS-extended allowlist |
| `incomplete-triad` / thin ninth | Missing PCs | Add 3 then 7 (dominants); Dom9 omit correctly |
| `few-sevenths` / `bs7-density` | Low tension fuel | Insert sec-dom toward next pillar |
| `dim-sustain` / `dim7-chain` | Dim7 overused | Shorten; resolve to BS7 |
| `counterpart-flicker` | Fast R3 swaps | Sustain one BS7 at high tempo |
| `theory-spacing` | Series spacing | Widen bass gap; tighten upper |
| `theory-tension` | Weak 3↑/♭7↓ | Revoice resolution |
| Tenor/lead order | Stack illegal | Fix octaves |

---

## F. “Start over” triage (5 minutes)

When lost:

1. **Mute all but lead + bass** — are pillars right?  
2. **Cadence only** — is there a real V7→I spelling?  
3. **One leftover note** — which SCF group contains it?  
4. **One stack** — complete tones + tenor above lead?  
5. **Re-enable motion** — circle into the next pillar.

---

## G. Worked repair (B♭ chart)

**Broken:** Bar 7 melody E♮ harmonized as E♭ major (E♭ G B♭) — E♮ is not in the chord.

**Repair:** Use **C7** (C E♮ G B♭) so E♮ = 3rd, then **F7 → B♭**.

**Broken:** Final B♭ voiced with doubled D and missing F.

**Repair:** Bass B♭, bari F, lead B♭, tenor D (or swap bari/tenor) — root doubled, 3rd once.

---

**Path (Part V):** Prev [19-melody-to-arrangement](19-melody-to-arrangement.md) · [Index](00-index.md) · Next [14-prietto-practice](14-prietto-practice.md)
