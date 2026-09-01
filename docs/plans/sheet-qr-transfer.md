# Sheet QR transfer — peer data mode

> **Status:** in progress  
> **Created:** 2026-09-01  
> **Goal:** Transfer a singable tag sheet (≈800px-wide display image) plus enough metadata to populate a tag page between phones via multi-frame QR codes, without shared offline cache or network.  
> **Related:** [sheets-format.md](../decisions/sheets-format.md), existing tag share/QR (`tagShare.ts`, `TagQrScanner.vue`).

---

## Product requirements

1. **Sender** has the sheet cached; **receiver** may not.
2. Transfer **one display sheet image** (prefer current viewer page / `sheet_preview` / first page) plus **tag metadata** sufficient for a tag page (title, arranger, key, type, year, parts, ids).
3. Show **how many QR frames** the package needs before/while sending.
4. **Warn when frame count > 4** (still allow more frames — warn, don’t hard-block).
5. Receiver scans frames in any order, sees progress, then opens the tag with the transferred sheet.

## Non-goals (v1)

- Audio / learning tracks.
- Multi-page books in one transfer (v1 = one image; later: page index).
- Editing received metadata.
- Replacing catalog favorites sync.

## Capacity budget

| ECC | Max byte-mode payload (qrcode lib) |
| --- | --- |
| L | 2953 |
| M | 2331 (chosen for camera reliability) |
| Q/H | ≤1663–1800 |

Per-frame layout uses a 12-byte header → **~2200 bytes** payload/frame.  
**4 frames ≈ 8.8 KB** compressed package. Sender JPEG-encodes (≤800px wide) and quality-ramps down to try to fit ≤4; if it cannot, show the warning and emit however many frames are needed.

## Protocol `STX1`

Binary QR (byte mode), not URL text.

```
offset  size  field
0       4     magic "STX1"
4       4     transferId uint32 BE (random per send)
8       1     frameIndex 0..count-1
9       1     frameCount
10      2     reserved 0
12      …     payload chunk
```

**Package** (deflate with `fflate`, then split into chunks):

```
uint32 BE metaLen
meta UTF-8 JSON (SheetTransferMeta v1)
raw image bytes (image/jpeg)
```

## UX sketch

**Sender (from Share / tag):** “Transfer sheet” → estimate → “Needs N QR codes” (+ warning if N>4) → fullscreen QR carousel (Prev/Next, optional auto-advance) → Done.

**Receiver (Browse camera):** detect `STX1` → progress “Frame 2/5” → assemble → persist → `/tag/:id`.

## Persistence

IndexedDB `singtags-offline` store `transferredTags`: summary/detail + sheet blob.  
`useTagDetail` falls back here when catalog/network/favorites miss.

## Implementation map

| Piece | Location |
| --- | --- |
| Encode/chunk/assemble | `web/src/lib/sheetQrTransfer.ts` |
| Binary QR render | `web/src/lib/qr.ts` |
| Binary scan | `web/src/lib/qrDecode.ts` |
| IDB | `web/src/offline/transferredDb.ts` |
| Sender UI | `web/src/components/SheetTransferSheet.vue` |
| Receiver | `TagQrScanner` + HomeView / assembler |
