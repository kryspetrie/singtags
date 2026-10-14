# Polecat pitch → Tag Studio (Coach gold set)

Gold-standard basic charts for Coach / weight validation:

| ID | Title |
| --- | --- |
| 90001 | My Wild Irish Rose |
| 90003 | Sweet And Lovely |
| 90006 | Let Me Call You Sweetheart |
| 90008 | Shine On Me |
| 90009 | The Story of the Rose (Heart of My Heart) |
| 90011 | Down By The Old Mill Stream |

```bash
python3 polecats/extract_pitch_stacks.py \
  --id 90001 --id 90003 --id 90006 --id 90008 --id 90009 --id 90011
python3 polecats/stacks_to_tag_studio.py
```

On Tag Studio library load, SingTags imports missing gold seeds and removes other
`seed-polecat-pitch-*` auto-seeds (see `ensurePolecatPitchReviews.ts`).
