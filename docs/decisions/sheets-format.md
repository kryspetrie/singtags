# ADR: Sheet format — WebP display, PDF originals (not DjVu)

**Status:** Accepted  
**Date:** 2026-08-23  
**Context:** Evaluate DjVu (e.g. [djvu.js](https://djvu.js.org/)) as a canonical sheet format for storage, viewing, and client-side conversion to PDF/PNG/WebP on download.

---

## Decision

Keep the current publish model:

1. **Display / offline cache:** Pre-rasterized **2-bit dither WebP** previews at sync/publish time (`build_sheet_preview_webp` → `sheet_preview` / `sheet_pages`).
2. **Download / optional view:** Keep **original PDF** (and other uploaded images) when present.
3. **Viewer:** Native image display in `SheetViewer`; **pdf.js** only when the user chooses PDF mode and originals exist.
4. **Do not** adopt DjVu as the primary format, ship a DjVu viewer in the SPA, or convert DjVu → PDF/PNG/WebP in the browser on download.

Optional later (without DjVu): tune WebP quality, or add **AVIF** as an alternate display format at publish time.

---

## Context

SingTags is a **static** site (S3). There is no runtime “server convert” step — any format conversion happens in the **offline publish pipeline**, same as today’s rasterize.

Measured sample (~250 tags):

| Asset | Approx size |
| --- | --- |
| Audio (MP4) | ~356 MB |
| All sheets (originals + pages) | ~42 MB |
| **WebP pages only** | **~11 MB** |

Full library (~7.1k tags) scales roughly to **~10 GB audio** vs **~300 MB WebP sheets**. Sheet format is not the storage or bandwidth bottleneck.

DjVu can compress **scanned** documents well. Many barbershop sheets are **vector PDFs**; DjVu does not improve those and would still require keeping or rasterizing PDFs.

---

## Consequences

### Positive

- Fast offline paint (blob URLs / `<img>`), already wired into starring and content crop.
- Publish toolchain stays simple: Pillow + `pdftoppm`.
- Downloads ship real files; no heavy client re-encode.
- Browser ecosystem for images/PDF is mature vs niche DjVu WASM.

### Negative / accepted costs

- WebP pages are lossy raster; zoom beyond publish DPI softens. Mitigate with publish DPI/quality knobs if needed.
- Original PDFs remain larger than a hypothetical DjVu archive on disk. Acceptable given audio dominates total size.

### Rejected alternative: DjVu + djvu.js

| Claim | Why rejected |
| --- | --- |
| Smaller on device | Sheets are ~3% of sample size; saving half of sheets barely moves “cache everything.” |
| Works in browser | Demo viability ≠ product fit: decode cost, bundle size, maintenance, download conversion. |
| Convert on download in UI | DjVu → PDF/PNG in-browser is slow and memory-heavy; zip queue should package static bytes. |
| Convert on “server” | Still offline publish only; adds `djvulibre` + viewer without replacing WebP display needs. |

**Cold-storage only (not product path):** DjVu or PDF masters could live on R2 for archival while publish still emits WebP for the app. That is an ops concern, not a viewer change — and not planned unless hosting cost demands it.

---

## Implementation pointers (current)

| Piece | Location |
| --- | --- |
| Rasterize | `scripts/rasterize_sheets.py` (uses tags mirror `lib/sheet_export.py`) |
| Seed originals | `scripts/seed_sample.py` (`SHEET_EXTS`) |
| Viewer | `web/src/components/SheetViewer.vue` |
| Offline sheet blobs | `web/src/offline/starredDb.ts` (WebP pages) |

---

## Revisit when

- Measured sheet storage or transfer becomes a real cost problem **and** audio is already optimized.
- Or a first-class need for lossless vector zoom without shipping PDFs.
