"""Sniff whether a library audio file can play in Web Audio (browser).

Legacy Learning Center downloads sometimes store MIDI or WMA as ``*.bin``.
Those must not be published as SPA learning tracks.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote

# Extensions we treat as browser-playable without sniffing.
PLAYABLE_EXTENSIONS = {
    ".opus",
    ".ogg",
    ".m4a",
    ".mp3",
    ".mp4",
    ".aac",
    ".wav",
    ".webm",
}

# `.bin` may be MPEG (legacy stems) or non-audio (MIDI / ASF).
BIN_EXTENSIONS = {".bin"}

MIN_AUDIO_BYTES = 256

# ASF / WMA object header GUID.
_ASF_HEADER = bytes.fromhex("3026b2758e66cf11")


def sniff_web_playable_bytes(head: bytes) -> bool:
    """True when *head* looks like a container Web Audio can decode."""
    if not head:
        return False
    if head.startswith(b"OggS") or head.startswith(b"ID3"):
        return True
    if head.startswith(b"RIFF") and len(head) >= 12 and head[8:12] == b"WAVE":
        return True
    if len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:
        return True
    if len(head) >= 8 and head[4:8] == b"ftyp":
        return True
    return False


def is_known_unplayable_bytes(head: bytes) -> bool:
    """True for MIDI / ASF (WMA) payloads that must never be offered to the SPA."""
    if head.startswith(b"MThd"):
        return True
    if head.startswith(_ASF_HEADER):
        return True
    return False


def is_web_playable_audio_file(path: Path) -> bool:
    """True when *path* exists and looks like browser-decodable audio."""
    try:
        if not path.is_file():
            return False
        size = path.stat().st_size
    except OSError:
        return False
    if size < MIN_AUDIO_BYTES:
        return False
    suffix = path.suffix.lower()
    if suffix in PLAYABLE_EXTENSIONS:
        return True
    if suffix not in BIN_EXTENSIONS:
        # Unknown extension — allow only if magic looks playable.
        try:
            head = path.read_bytes()[:16]
        except OSError:
            return False
        return sniff_web_playable_bytes(head) and not is_known_unplayable_bytes(head)
    try:
        head = path.read_bytes()[:16]
    except OSError:
        return False
    if is_known_unplayable_bytes(head):
        return False
    return sniff_web_playable_bytes(head)


def is_web_playable_library_rel(library: Path, rel: str) -> bool:
    """Like :func:`is_web_playable_audio_file` for a percent-encoded library path."""
    if not rel:
        return False
    return is_web_playable_audio_file(library / unquote(rel))
