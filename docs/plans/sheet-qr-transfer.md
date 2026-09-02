# Sheet QR transfer — peer data mode

> **Status:** demoted for catalog tags — Decimen transport kept for ad-hoc `/tx`/`/rx` and Browse camera receive; future Local Library docs take the product lead ([local-library-transfer.md](local-library-transfer.md)).  
> **Created:** 2026-09-01  
> **Goal (original):** Transfer a singable tag sheet plus metadata between phones via multi-frame QR, without shared offline cache or network.  
> **Related:** [sheets-format.md](../decisions/sheets-format.md), [local-library-transfer.md](local-library-transfer.md), Labs optical flag.

---

## Restore catalog optical buttons

Catalog list/share optical chrome was removed after this restore point. To re-add Browse/Recent/Favorites selection-bar transfer, Favorites share / collections manage transfer, and tag-page optical send:

| | |
| --- | --- |
| **Git tag** | `optical-transfer-catalog-buttons` |
| **Commit** | `56f511551334a7b82e56354e471a7ab67761d051` |

```bash
git show optical-transfer-catalog-buttons
# or inspect paths:
git checkout optical-transfer-catalog-buttons -- \
  web/src/components/TagSelectionBar.vue \
  web/src/components/TagOpticalTransferSheet.vue \
  web/src/components/FavoritesShareSheet.vue \
  web/src/components/CollectionsManageSheet.vue \
  web/src/components/TagShareSheet.vue \
  web/src/views/TagView.vue \
  web/src/views/HomeView.vue \
  web/src/views/RecentView.vue \
  web/src/views/FavoritesView.vue
```

Note: `TagOpticalTransferSheet.vue` existed only on that tag (deleted afterward). Prefer cherry-picking or copying from the tag rather than reverting unrelated Labs/receive-invite work.

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

**Sender (historical, catalog):** Share / tag → optical sheet stream (removed from catalog UI; restore via tag above).

**Receiver (Browse camera):** still supports Decimen sheet receive → persist → open tag.

**Ad-hoc:** More → Optical transfer `/tx` / `/rx` (Labs-gated).

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
| Decimen send/receive UI | `OpticalTransferView.vue`, `TagQrScanner.vue` |
| Catalog optical send UI | Removed — see restore tag |
