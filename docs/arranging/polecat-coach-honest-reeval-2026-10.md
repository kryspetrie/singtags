# Polecat Coach honest reevaluation

Generated: 2026-10-09T03:47:21.339Z

## Verdict

The prior Coach loop **hypertuned a scoreboard**, not barbershop sound:

1. **Gold-pillar cheat** — eval fed Coach the chart’s pillar *roots*, so root choice was not melody-driven.
2. **Highway LCS** — treated I≡I7≡I6, V≡V7, ii≡II7, iii≡III7, ninth≡seventh as equal. CI gated on highway≈1.0 while strict/full stayed weak.
3. **Honest regenerate** (melody + blown-pitch key only) shows how far Basic Path Optimize actually is from chart chords.

## Keys (blown pitch)

| Tag | Title | blown_pc | key | matches metadata |
| ---: | --- | ---: | --- | --- |
| 90001 | My Wild Irish Rose | 10 | Bb Major | Y |
| 90002 | Wait 'Til The Sun Shines, Nellie | 8 | Ab Major | Y |
| 90003 | Sweet And Lovely (That's What You Are To Me) | 5 | F Major | Y |
| 90004 | Down Our Way | 10 | Bb Major | Y |
| 90005 | Honey - Little 'Lize Medley | 10 | Bb Major | Y |
| 90006 | Let Me Call You Sweetheart | 10 | Bb Major | Y |
| 90007 | Sweet, Sweet Roses Of Morn | 10 | Bb Major | Y |
| 90008 | Shine On Me | 10 | Bb Major | Y |
| 90009 | The Story of the Rose | 8 | Ab Major | Y |
| 90010 | You're The Flower Of My Heart, Sweet Adeline | 10 | Bb Major | Y |
| 90011 | Down By The Old Mill Stream | 8 | Ab Major | Y |
| 90012 | You Tell Me Your Dream | 8 | Ab Major | Y |

## Scores

| Mode | roman LCS / ref | strict nature@root | notes |
| --- | ---: | ---: | --- |
| **Honest micro** | **0.23** | **0.218** | melody+key → Coach |
| Cheat micro (hwy pillar) | 0.966 | 0.761 (pillar) | gold pillars + highway collapse |
| Cheat softFull (hwy) | 0.608 | — | still highway-soft |

### Per tag

| Tag | Title | Honest roman | Honest strict | Cheat hwy | Cheat strict pillar |
| ---: | --- | ---: | ---: | ---: | ---: |
| 90001 | My Wild Irish Rose | 0.232 | 0.203 | 1 | 0.8076923076923077 |
| 90002 | Wait 'Til The Sun Shines, Nellie | 0.246 | 0.238 | 0.8909090909090909 | 0.7457627118644068 |
| 90003 | Sweet And Lovely (That's What You Are To Me) | 0.268 | 0.268 | 1 | 0.8181818181818182 |
| 90004 | Down Our Way | 0.22 | 0.2 | 1 | 0.7894736842105263 |
| 90005 | Honey - Little 'Lize Medley | 0.205 | 0.178 | 0.9375 | 0.5833333333333334 |
| 90006 | Let Me Call You Sweetheart | 0.265 | 0.265 | 1 | 0.85 |
| 90007 | Sweet, Sweet Roses Of Morn | 0.221 | 0.211 | 0.8974358974358975 | 0.8205128205128205 |
| 90008 | Shine On Me | 0.213 | 0.213 | 1 | 0.65 |
| 90009 | The Story of the Rose | 0.184 | 0.184 | 1 | 0.8888888888888888 |
| 90010 | You're The Flower Of My Heart, Sweet Adeline | 0.191 | 0.188 | 1 | 0.7222222222222222 |
| 90011 | Down By The Old Mill Stream | 0.205 | 0.192 | 0.9230769230769231 | 0.7142857142857143 |
| 90012 | You Tell Me Your Dream | 0.304 | 0.277 | 0.9444444444444444 | 0.7368421052631579 |

## What to do next (stop digging)

- **Stop** weight/taste sweeps against highway LCS.
- **Gate** on honest melody→Coach strict/roman match (or human listen), not highway.
- **Remove** gold pillar roots from any product-facing eval; pillars must be inferred or user-set.
- Fix candidate vocabulary / ranking for barbershop Mm7 language using **strict** mismatches in `work/polecat-coach-honest/*-alignment.json`.

Artifacts: `/home/kpetrie/dev/krys/barbershop-website/work/polecat-coach-honest/`
