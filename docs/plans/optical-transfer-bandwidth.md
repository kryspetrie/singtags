# Optical transfer bandwidth plan

**Status:** In progress — Phase 1 (transparent XZ) + Phase 2 (audio format + background prepare) scaffolding shipped; Phase 3 is **multi-stream QR grid** on Decimen LT fountain (JAB path removed).  
**Goal:** Cut optical airtime for real files (audio, PDF, images, multi-tag packs) via stronger compression, on-send audio remux/reencode, and denser QR / multi-stream settings — staying on today’s Decimen QR path.

Related backlog (still valid): Browse↔`/rx` parity, split `OpticalTransferView`, collection batch UX, persist Save/Open intents, size honesty.

---

## Locked decisions

| Topic | Decision |
| --- | --- |
| **Compression UX** | Invisible to the user. Receive always yields **normal files** in the chosen output (folder / Downloads / in-app Open). No “.xz”, “.7z”, or “decompressing…” in primary copy. |
| **Wire format (v1)** | Inner zip (file tree) + outer **XZ / LZMA2** when it shrinks the blob; skip wrapper when pointless. Solid `.7z` archive deferred unless ratios demand it. |
| **Audio default** | **AAC ~96 kbps**. If source bitrate is already **lower** than 96 kbps (or already AAC at ≤96), **passthrough** — no remux. |
| **Audio dropdown options** | **AAC 96 kbps** (default); **MP3 VBR medium (~128 kbps)**; **Opus 64 kbps**; **Original** (force passthrough). |
| **Audio prepare timing** | **Background mux/reencode** as soon as audio is queued or the format changes — not only when Start is pressed — so stream start is not blocked when possible. Must not jank the UI (worker / idle / low concurrency). |
| **Symbology** | **QR / Decimen only** — no alternate symbology mode in prefs or UI. |

---

## Context (today)

| Layer | Current |
| --- | --- |
| Symbology | Moving **QR** via vendored Decimen fountain (`web/vendor/decimen`) |
| Container | Decimen optical file; multi-file → **fflate zip** (deflate) |
| Local packages | Some deflate on meta (`localDocTransfer.ts`) |
| Audio on send | Format dropdown + background prepare (`opticalAudioFormat.ts`) |
| Density prefs | QR frame bytes / FPS / multi-stream grid / display scale (`sendSettings.ts`) |

Bandwidth is the scarce resource. CPU on both phones is comparatively cheap.

---

## Design principles

1. **Compress after content shrink** — remux/reencode audio *before* LZMA; never LZMA then hope.
2. **Compression is an implementation detail** — send may show a smaller “transfer size” for ETA honesty; receive never exposes archive/encoding formats.
3. **One wire envelope** — fountain/session identity stays app-owned under Decimen QR.
4. **Auto density** — planner picks lowest QR density / FPS / grid that still aims for ~1–3s airtime.
5. **Receive pipeline** — scan QR → reassemble → **silently decompress/unpack** → write **plain files** (or in-app preview bytes) → Save/Open intents.

---

## Phase 1 — LZMA / LZMA2 compression (transparent)

### Goal

Shrink the wire blob with **LZMA2** (XZ wrapper around the existing zip/file payload). Users never manage compressed artifacts.

### Receive behavior (required)

1. Camera completes → bytes in memory.  
2. If XZ (or future 7z) wrapper present → inflate in memory (or temp OPFS).  
3. Expand file tree to the **same outputs as today**:
   - Save/Download after transfer → **plain** `song.pdf`, `clip.m4a`, etc. (not `transfer.xz`)
   - Open after transfer → preview from decompressed bytes  
   - Import paths unchanged (sheet / My Library packages after unwrap)  
4. UI copy stays “Received …”, “Downloaded …”, “Saved to folder” — **no** compression vocabulary in primary status.

Send may show ETA from compressed size (“About 45s”) without saying “compressed.”

### Wire (v1)

- **C:** inner fflate zip (multi-file) or single optical file → optional outer **XZ/LZMA2**.
- Metadata or magic sniff on receive; original uncompressed length for progress math if useful.
- Skip XZ when size would not improve (tiny payloads / already incompressible).

### Work items

- [ ] WASM XZ compress/decompress helper (worker for large blobs)
- [ ] Hook pack path after zip; receive path **always** unwraps before save/open/import
- [ ] Tests: round-trip lands plain filenames; Open preview works; no `.xz` written to Downloads
- [ ] Progress uses wire (compressed) bytes for airtime; completion toast uses final file names/sizes

### Risks

- Phone encode CPU (cap preset ≤6 for WASM)
- Already-compressed Opus/JPEG gain little — still helps PDF+JSON packs

---

## Phase 2 — Audio quality/format dropdown

### Goal

When the send queue includes **audio**, one **Format** control remuxes/reencodes before compression.

### Dropdown (locked)

| Label | Behavior |
| --- | --- |
| **AAC 96 kbps** (default) | Reencode to AAC/M4A @ ~96 kbps **unless** source is already ≤96 kbps (any codec) or already AAC ≤96 → **passthrough** |
| **MP3 VBR (medium ~128 kbps)** | Reencode to MP3 VBR medium |
| **Opus 64 kbps** | Reencode to Opus @ ~64 kbps |
| **Original** | Always passthrough — no remux/reencode |

Bitrate detection: prefer container metadata; if unknown, treat as needing encode for AAC/MP3/Opus targets (never for Original).

### Prepare early (locked) — don’t add wall time to “Start transfer”

Goal: **total transfer duration** (tap Start → receive complete) should rarely include encode time.

1. When audio is **added to the queue** (or Local Library track selection commits), start **background** prepare for the **current** format (default AAC 96).
2. When the user **changes** the format dropdown, cancel the in-flight job for affected items and start a new background prepare.
3. Prefer **Web Worker** (or existing bake off-main-thread path) with **low concurrency** (e.g. one encode at a time) so Browse/Transfer UI stays responsive.
4. Send preview / ETA use the prepared (or estimated) size once ready; show a quiet “Preparing audio…” on the queue row, not a blocking modal.
5. On **Start transfer**:
   - If prepare **done** → pack+compress+stream immediately.
   - If still running → await that job (same row progress); do **not** restart encode from scratch.
   - If user picked **Original** → skip encode entirely (instant).
6. Invalidate cache when the source file bytes change; keep last successful prepare per `(itemId, format)`.

Non-goals for prepare: do not compete with active QR streaming CPU; pause or deprioritize background encode while a stream is running.

### UX

- Dropdown always lists all four options; default **AAC 96 kbps**.
- Visible when any queued item is audio (ad-hoc or Local Library tracks).
- Live transfer-size / ETA update as background prepare finishes.
- Prefer published catalog tiers only when they already satisfy the selected target; otherwise encode from best available source.

### Work items

- [ ] `opticalAudioEncode.ts` — detect bitrate; AAC 96 / MP3 VBR / Opus 64 / Original via bake/mediabunny stack
- [ ] Background prepare queue: enqueue on add + on format change; cancel/replace; await on Start
- [ ] Wire dropdown on Send + Local Entry transfer sheet
- [ ] Cache per `(queueItem, format)`; tests for passthrough ≤96k, Original, and “Start waits for in-flight prepare”
- [ ] Open-after-transfer still previews AAC/MP3/Opus results

### Risks

- Background encode on low-end phones — hard concurrency cap + yield; never block input
- User switches format rapidly — cancel prior jobs aggressively
- Preview on receive must handle AAC/MP3/Opus (existing in-app audio path)

---

## Phase 3 — Multi-stream QR for large transfers

### Goal

When single-code QR still misses the ~1–3s airtime target, raise **multi-stream grid** (1×2 → 2×2, etc.) after density and FPS.

### Architecture

```
prepare (audio encode → pack → LZMA/XZ)
        ↓
   planOpticalTransfer (density → FPS → grid)
        ↓
   Decimen QR fountain (optional multi-stream)
        ↓
   silent decompress → plain files → Save/Open intents
```

### Work items

- [x] Auto density / FPS / grid planner (`opticalTransferPlan.ts`)
- [x] Multi-stream send overlay + receive capture for grid
- [ ] Grid receive ROI — decode each cell region instead of full-frame polls
- [ ] Phone↔phone throughput test vs single Maximum QR

---

## Phase order

| Phase | Outcome | Depends |
| --- | --- | --- |
| **1 Transparent compression** | Smaller transfers; plain files on receive | — |
| **2 Audio dropdown** | AAC 96 default; MP3 VBR; Opus 64 | Encode stack |
| **3 Multi-stream QR** | Large packs practical on QR alone | 1 |

Parallel: extract receive/intents from `OpticalTransferView` while Phase 1 lands.

---

## Success metrics

- Same 1-page PDF + AAC-96 lead: **≥2×** faster vs prior Maximum QR (median of 5 phone pairs).
- Ad-hoc ~30 s clip @ AAC 96 + XZ + QR: comfortable on mid-range Android.
- Large packs use multi-stream when single-code exceeds the airtime target.
- Receive Downloads / folder contain **only** final media/docs names — never `*.xz` / `*.7z`.

---

## Non-goals

- Surfacing compression format to end users  
- Server-side relay / WebRTC  
- Restoring demoted catalog Transfer buttons (`sheet-qr-transfer.md`)  
- Alternate symbologies (JAB / Data Matrix) — dropped  

---

## Remaining open

1. **Grid receive ROI** — decode each grid cell region for better multi-stream capture.
2. Phone↔phone throughput calibration for auto planner targets.
