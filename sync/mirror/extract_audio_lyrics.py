#!/usr/bin/env python3
"""Transcribe learning-track parts (Lead/Bari/Bass/Tenor) into metadata part_lyrics.

Uses the left stereo channel (solo part; right is usually the other three).
Never writes into the main lyrics / lyrics_source fields.

Requires: ffmpeg on PATH, and optional dep faster-whisper
  pip install -r mirror/requirements-asr.txt

Uses CUDA automatically when available (much faster than CPU for large-v3).
"""

from __future__ import annotations

import sys
from pathlib import Path

_MIRROR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _MIRROR_DIR.parent
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import argparse
import ctypes
import os
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Optional

from lib.complete import find_audio_part_file
from lib.config import ROOT_DOWNLOAD_DIR
from lib.state import iter_tag_folders, load_metadata, save_metadata

ASR_PARTS = ("lead", "bari", "bass", "tenor")
DEFAULT_ASR_MODEL = "large-v3"
_WHISPER_MODEL = None
_WHISPER_KEY: tuple | None = None
_ASR_BEAM_SIZE = 5
_CUDA_LIBS_READY = False


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def whisper_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except ImportError:
        return False


def _site_packages() -> Path:
    import site

    for p in site.getsitepackages():
        path = Path(p)
        if (path / "nvidia").is_dir() or (path / "faster_whisper").is_dir():
            return path
    return Path(site.getsitepackages()[0])


def ensure_nvidia_cuda_libs() -> list[str]:
    """Preload pip nvidia-* CUDA libs so CTranslate2 can find libcublas on Linux."""
    global _CUDA_LIBS_READY
    site = _site_packages()
    lib_dirs = [
        site / "nvidia" / "cuda_runtime" / "lib",
        site / "nvidia" / "cublas" / "lib",
        site / "nvidia" / "cudnn" / "lib",
        site / "nvidia" / "cuda_nvrtc" / "lib",
    ]
    added = [str(d) for d in lib_dirs if d.is_dir()]
    if _CUDA_LIBS_READY:
        return added
    if added:
        cur = os.environ.get("LD_LIBRARY_PATH", "")
        parts = [p for p in cur.split(":") if p]
        # Prepend once only — re-joining every call grew LD_LIBRARY_PATH until
        # execve failed with "Argument list too long" on ffmpeg.
        merged = added + [p for p in parts if p not in added]
        os.environ["LD_LIBRARY_PATH"] = ":".join(merged)
    for rel in (
        "nvidia/cuda_runtime/lib/libcudart.so.12",
        "nvidia/cublas/lib/libcublasLt.so.12",
        "nvidia/cublas/lib/libcublas.so.12",
    ):
        path = site / rel
        if path.is_file():
            try:
                ctypes.CDLL(str(path), mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass
    _CUDA_LIBS_READY = True
    return added


def detect_device() -> tuple[str, str]:
    """Return (device, compute_type). Prefer CUDA float16 when usable."""
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() <= 0:
            return "cpu", "int8"
        ensure_nvidia_cuda_libs()
        return "cuda", "float16"
    except Exception:
        return "cpu", "int8"


def get_whisper_model(
    name: str,
    *,
    device: str = "auto",
    compute_type: str | None = None,
    cpu_threads: int = 0,
):
    """Lazy-load and cache a faster-whisper model."""
    global _WHISPER_MODEL, _WHISPER_KEY
    if device == "auto":
        device, auto_compute = detect_device()
        if compute_type is None:
            compute_type = auto_compute
    elif compute_type is None:
        compute_type = "float16" if device == "cuda" else "int8"

    if device == "cuda":
        ensure_nvidia_cuda_libs()

    threads = cpu_threads or (os.cpu_count() or 4)
    key = (name, device, compute_type, threads)
    if _WHISPER_MODEL is not None and _WHISPER_KEY == key:
        return _WHISPER_MODEL
    from faster_whisper import WhisperModel

    print(f"   loading Whisper {name} device={device} compute_type={compute_type} ...")
    t0 = time.time()
    try:
        _WHISPER_MODEL = WhisperModel(
            name,
            device=device,
            compute_type=compute_type,
            cpu_threads=threads if device == "cpu" else 4,
            num_workers=1,
        )
    except Exception as exc:
        if device == "cuda":
            print(f"   CUDA load failed ({exc}); falling back to CPU int8")
            device = "cpu"
            compute_type = "int8"
            key = (name, device, compute_type, threads)
            _WHISPER_MODEL = WhisperModel(
                name,
                device="cpu",
                compute_type="int8",
                cpu_threads=threads,
                num_workers=1,
            )
        else:
            raise
    _WHISPER_KEY = key
    print(f"   model ready in {time.time() - t0:.1f}s ({device}/{compute_type})")
    return _WHISPER_MODEL


def extract_left_wav(mp3: Path, wav_out: Path) -> None:
    """Peel left channel to 16 kHz mono WAV for Whisper."""
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(mp3),
        "-af",
        "pan=mono|c0=c0",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        str(wav_out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed for {mp3.name}: {proc.stderr[-400:] if proc.stderr else 'unknown'}"
        )


def transcribe_wav(
    wav: Path,
    *,
    model_name: str,
    title: str | None = None,
    hint_lyrics: str | None = None,
    device: str = "auto",
    compute_type: str | None = None,
    beam_size: int | None = None,
) -> str:
    model = get_whisper_model(model_name, device=device, compute_type=compute_type)
    prompt_bits = ["Barbershop tag lyrics, English."]
    if title:
        prompt_bits.append(f"Song title: {title}.")
    if hint_lyrics and len(hint_lyrics.strip()) >= 8:
        hint = " ".join(hint_lyrics.strip().split())[:120]
        prompt_bits.append(f"Possible lyrics: {hint}")
    initial_prompt = " ".join(prompt_bits)
    beam = beam_size if beam_size is not None else _ASR_BEAM_SIZE
    segments, _info = model.transcribe(
        str(wav),
        language="en",
        vad_filter=False,
        beam_size=beam,
        condition_on_previous_text=False,
        initial_prompt=initial_prompt,
        without_timestamps=True,
    )
    parts = [seg.text.strip() for seg in segments if seg.text and seg.text.strip()]
    return " ".join(parts).strip()


def cleanup_transcript(raw: str, *, title: str | None = None, arranger: str | None = None) -> str:
    if not raw:
        return ""
    from lib import lyric_postprocess as lyric_pp

    s = lyric_pp.normalize_asr_lyrics(raw)
    try:
        from extract_text import normalize_sheet_lyrics

        return normalize_sheet_lyrics(s, title=title, arranger=arranger)
    except Exception:
        return " ".join(s.split())


def part_entry_complete(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    text = (entry.get("text") or entry.get("raw") or "").strip()
    return len(text) >= 2


def renorm_folder(folder: Path) -> dict:
    """Re-apply ASR+OCR normalize to existing part_lyrics raw fields (no Whisper)."""
    meta = load_metadata(folder)
    if not meta:
        return {"skipped": True}
    part_lyrics = dict(meta.get("part_lyrics") or {})
    if not part_lyrics:
        return {"skipped": True, "renormed": 0}
    title = meta.get("title")
    arranger = meta.get("arranger")
    changed = 0
    for part, entry in list(part_lyrics.items()):
        if not isinstance(entry, dict):
            continue
        raw = entry.get("raw")
        if not raw:
            continue
        text = cleanup_transcript(str(raw), title=title, arranger=arranger)
        if text != entry.get("text"):
            entry = dict(entry)
            entry["text"] = text
            entry["renormed_at"] = datetime.now(timezone.utc).isoformat()
            part_lyrics[part] = entry
            changed += 1
            print(f"   {part}: {text}")
    if changed:
        meta["part_lyrics"] = part_lyrics
        save_metadata(folder, meta)
    return {"renormed": changed}


def process_folder(
    folder: Path,
    *,
    model_name: str = DEFAULT_ASR_MODEL,
    force: bool = False,
    parts: tuple[str, ...] = ASR_PARTS,
    device: str = "auto",
    compute_type: str | None = None,
    beam_size: int | None = None,
) -> dict:
    """Transcribe missing parts; return summary counts for this folder."""
    # Empty/missing metadata is OK — many audio folders lack enriched metadata.json
    meta = load_metadata(folder) or {}
    part_lyrics = dict(meta.get("part_lyrics") or {})
    changed = False
    stats = {"transcribed": 0, "skipped_existing": 0, "missing_file": 0, "failed": 0}

    title = meta.get("title")
    arranger = meta.get("arranger")
    hint = (
        meta.get("lyrics")
        if meta.get("lyrics_source") in {"manual", "final", "html", "ocr", "pdf_text", "api"}
        else None
    )

    jobs: list[tuple[str, Path]] = []
    for part in parts:
        existing = part_lyrics.get(part)
        if not force and part_entry_complete(existing):
            stats["skipped_existing"] += 1
            continue
        audio = find_audio_part_file(folder, part, meta)
        if audio is None:
            stats["missing_file"] += 1
            continue
        jobs.append((part, audio))

    if not jobs:
        return stats

    with tempfile.TemporaryDirectory(prefix="tag_asr_") as tmp:
        tmp_path = Path(tmp)
        wav_paths: dict[str, Path] = {}

        def _prep(item: tuple[str, Path]) -> tuple[str, Path | None, str | None]:
            part, audio = item
            wav = tmp_path / f"{part}_left.wav"
            try:
                extract_left_wav(audio, wav)
                return part, wav, None
            except Exception as exc:
                return part, None, str(exc)

        with ThreadPoolExecutor(max_workers=min(4, len(jobs))) as pool:
            for part, wav, err in pool.map(_prep, jobs):
                if err or wav is None:
                    stats["failed"] += 1
                    print(f"   {part}: FAILED ({err})")
                else:
                    wav_paths[part] = wav

        for part, audio in jobs:
            if part not in wav_paths:
                continue
            try:
                t0 = time.time()
                raw = transcribe_wav(
                    wav_paths[part],
                    model_name=model_name,
                    title=title if isinstance(title, str) else None,
                    hint_lyrics=hint if isinstance(hint, str) else None,
                    device=device,
                    compute_type=compute_type,
                    beam_size=beam_size,
                )
                elapsed = time.time() - t0
                text = cleanup_transcript(raw, title=title, arranger=arranger)
                part_lyrics[part] = {
                    "text": text or raw,
                    "raw": raw,
                    "model": model_name,
                    "channel": "left",
                    "source_file": audio.name,
                    "at": datetime.now(timezone.utc).isoformat(),
                }
                changed = True
                stats["transcribed"] += 1
                print(f"   {part}: ({elapsed:.1f}s) {text or raw or ''}")
            except Exception as exc:
                stats["failed"] += 1
                print(f"   {part}: FAILED ({exc})")

    if changed:
        # Preserve any existing fields; create metadata.json if it was missing
        from lib.state import extract_id_from_folder_name

        if meta.get("tag_id") is None:
            tid = extract_id_from_folder_name(folder.name)
            if tid is not None:
                meta["tag_id"] = tid
        meta["part_lyrics"] = part_lyrics
        save_metadata(folder, meta)
    return stats


# Alias used by lambda_sync / cloud docs
process_folder_asr = process_folder


def folders_with_any_asr_part(root: Path) -> list[Path]:
    out: list[Path] = []
    for folder in iter_tag_folders(root):
        meta = load_metadata(folder)
        if any(find_audio_part_file(folder, p, meta) for p in ASR_PARTS):
            out.append(folder)
    return out


def run_asr_backfill(
    root: Path,
    *,
    model_name: str = DEFAULT_ASR_MODEL,
    force: bool = False,
    limit: int = 0,
    tag_id: Optional[int] = None,
    renorm_only: bool = False,
    device: str = "auto",
    compute_type: str | None = None,
    beam_size: int | None = None,
) -> None:
    if renorm_only:
        folders = []
        for folder in iter_tag_folders(root):
            meta = load_metadata(folder)
            if meta.get("part_lyrics"):
                folders.append(folder)
        if tag_id is not None:
            folders = [f for f in folders if load_metadata(f).get("tag_id") == tag_id]
        folders.sort(key=lambda f: load_metadata(f).get("tag_id") or 0)
        print(f"ASR renorm-only: {len(folders)} tag folder(s) with part_lyrics")
        done = renormed = 0
        for folder in folders:
            meta = load_metadata(folder)
            print(f"#{meta.get('tag_id')} {folder.name}")
            stats = renorm_folder(folder)
            renormed += int(stats.get("renormed") or 0)
            done += 1
            if limit and done >= limit:
                break
        print(f"ASR renorm done tags={done} parts_updated={renormed}")
        return

    if not ffmpeg_available():
        print("ffmpeg not found on PATH — required for left-channel extract")
        return
    if not whisper_available():
        print("faster-whisper not installed. Run: pip install -r mirror/requirements-asr.txt")
        return

    get_whisper_model(model_name, device=device, compute_type=compute_type)

    folders = folders_with_any_asr_part(root)
    if tag_id is not None:
        folders = [f for f in folders if (load_metadata(f).get("tag_id") == tag_id)]
    folders.sort(key=lambda f: load_metadata(f).get("tag_id") or 0)

    print(f"ASR backfill: {len(folders)} tag folder(s) with non-Mix audio; model={model_name}")
    done = 0
    totals = {"transcribed": 0, "skipped_existing": 0, "missing_file": 0, "failed": 0}
    t_run = time.time()
    for folder in folders:
        meta = load_metadata(folder)
        tid = meta.get("tag_id")
        print(f"#{tid} {folder.name}")
        stats = process_folder(
            folder,
            model_name=model_name,
            force=force,
            device=device,
            compute_type=compute_type,
            beam_size=beam_size,
        )
        for k in totals:
            totals[k] += int(stats.get(k) or 0)
        done += 1
        if limit and done >= limit:
            break
    elapsed = time.time() - t_run
    rate = totals["transcribed"] / elapsed if elapsed > 0 and totals["transcribed"] else 0
    print(
        f"ASR done tags={done} transcribed_parts={totals['transcribed']} "
        f"skipped_existing={totals['skipped_existing']} "
        f"missing_file={totals['missing_file']} failed={totals['failed']} "
        f"in {elapsed / 60:.1f} min ({rate:.2f} parts/s)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ASR part lyrics (left channel) into metadata part_lyrics; never touches lyrics."
    )
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument(
        "--model",
        default=DEFAULT_ASR_MODEL,
        help=f"faster-whisper model name (default: {DEFAULT_ASR_MODEL})",
    )
    parser.add_argument(
        "--device",
        default="auto",
        choices=("auto", "cuda", "cpu"),
        help="Inference device (default: auto → CUDA if available)",
    )
    parser.add_argument(
        "--compute-type",
        default=None,
        help="CTranslate2 compute type (default: float16 on CUDA, int8 on CPU)",
    )
    parser.add_argument(
        "--beam-size",
        type=int,
        default=5,
        help="Whisper beam size (default: 5; try 3 for more speed)",
    )
    parser.add_argument(
        "--force-asr",
        action="store_true",
        help="Re-transcribe parts even when part_lyrics already has text",
    )
    parser.add_argument(
        "--renorm-only",
        action="store_true",
        help="Re-normalize existing part_lyrics from raw (no Whisper / ffmpeg)",
    )
    parser.add_argument("--limit", type=int, default=0, help="Max tag folders to process")
    parser.add_argument("--id", type=int, default=None, help="Only process this tag_id")
    args = parser.parse_args()
    run_asr_backfill(
        args.root,
        model_name=args.model,
        force=args.force_asr,
        limit=args.limit,
        tag_id=args.id,
        renorm_only=args.renorm_only,
        device=args.device,
        compute_type=args.compute_type,
        beam_size=args.beam_size,
    )


if __name__ == "__main__":
    main()
