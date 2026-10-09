#!/usr/bin/env python3
"""Convert polecats/ downloads into library-shaped folders + metadata.json."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
_SYNC = _REPO / "sync"
sys.path.insert(0, str(_SYNC))

from lib.http import sha256_bytes  # noqa: E402
from lib.names import (  # noqa: E402
    build_file_name,
    build_folder_name,
    keyword_tokens,
    sanitize_segment,
)

ROOT = Path(__file__).resolve().parent
NOW = datetime.now(timezone.utc).isoformat()

# Current folders created from PDF downloads (pre-library layout).
CURRENT = {
    "my-wild-irish-rose": "My Wild Irish Rose - PoleCats 1 - Floyd Connett",
    "wait-til-the-sun-shines-nellie": "Wait Til the Sun Shines Nellie - PoleCats 1 - Warren Haegar",
    "sweet-and-lovely": "Sweet and Lovely - PoleCats - Mac Huff",
    "down-our-way": "Down Our Way - PoleCats 1 - Floyd Connett",
    "honey-little-lize-medley": "Honey Little Lize Medley - Floyd Connett",
    "let-me-call-you-sweetheart": "Let Me Call You Sweetheart - PoleCats - Leo Friedman",
    "sweet-sweet-roses-of-morn": "Sweet Sweet Roses of Morn",
    "shine-on-me": "Shine On Me - PoleCats - Floyd Connett",
    "heart-of-my-heart": "Heart of My Heart - SPEBSQSA",
    "sweet-adeline": "Sweet Adeline - Polecat",
    "down-by-the-old-mill-stream": "Down By The Old Mill Stream",
    "you-tell-me-your-dream": "You Tell Me Your Dream - PoleCats - Phil Embury",
}

SONGS = [
    {
        "n": 1,
        "id": 90001,
        "title": "My Wild Irish Rose",
        "common_name": "My Wild Irish Rose",
        "arranger": "Floyd Connett",
        "key": "Bb Major",
        "writ_key": "Major:Bb",
        "src": "my-wild-irish-rose",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/my-wild-irish-rose",
            "bass": "https://soundcloud.com/barbershopharmonysociety/my-wild-irish-rose-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/my-wild-irish-rose-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/my-wild-irish-rose-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/my-wild-irish-rose-4",
        },
        "sc_titles": {
            "fullmix": "My Wild Irish Rose",
            "learning": "My Wild Irish Rose",
        },
    },
    {
        "n": 2,
        "id": 90002,
        "title": "Wait 'Til The Sun Shines, Nellie",
        "common_name": "Wait Til the Sun Shines Nellie",
        "arranger": "Warren Haegar",
        "key": "Ab Major",
        "writ_key": "Major:Ab",
        "src": "wait-til-the-sun-shines-nellie",
        "notes": "PDF credit spelling Haegar; library often uses Buzz Haeger.",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/wait-til-the-sun-shines-nellie",
            "bass": "https://soundcloud.com/barbershopharmonysociety/wait-til-the-sun-shines-1",
            "bari": "https://soundcloud.com/barbershopharmonysociety/wait-till-the-sun-shines",
            "lead": "https://soundcloud.com/barbershopharmonysociety/wait-til-the-sun-shines-2",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/wait-til-the-sun-shines-3",
        },
        "sc_titles": {
            "fullmix": "Wait Til the Sun Shines Nellie",
            "learning": "Wait 'Til The Sun Shines, Nellie",
        },
    },
    {
        "n": 3,
        "id": 90003,
        "title": "Sweet And Lovely (That's What You Are To Me)",
        "common_name": "Sweet and Lovely",
        "arranger": "Mac Huff",
        "key": "F Major",
        "writ_key": "Major:F",
        "src": "sweet-and-lovely",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/sweet-and-lovely",
            "bass": "https://soundcloud.com/barbershopharmonysociety/sweet-and-lovely-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/sweet-and-lovely-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/sweet-and-lovely-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/sweet-and-lovely-thats-what",
        },
        "sc_titles": {
            "fullmix": "Sweet and Lovely",
            "learning": "Sweet And Lovely (That's What You Are To Me)",
        },
    },
    {
        "n": 4,
        "id": 90004,
        "title": "Down Our Way",
        "common_name": "Down Our Way",
        "arranger": "Floyd Connett",
        "key": "Bb Major",
        "writ_key": "Major:Bb",
        "src": "down-our-way",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/down-our-way",
            "bass": "https://soundcloud.com/barbershopharmonysociety/down-our-way-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/down-our-way-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/down-our-way-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/down-our-way-4",
        },
        "sc_titles": {
            "fullmix": "Down Our Way",
            "learning": "Down Our Way",
        },
    },
    {
        "n": 5,
        "id": 90005,
        "title": "Honey - Little 'Lize Medley",
        "common_name": "Honey Little Lize Medley",
        "arranger": "Floyd Connett",
        "key": "Bb Major",
        "writ_key": "Major:Bb",
        "src": "honey-little-lize-medley",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/honey-lil-lize-medley",
            "bass": "https://soundcloud.com/barbershopharmonysociety/honey-little-lize-medley-1",
            "bari": "https://soundcloud.com/barbershopharmonysociety/honey-little-lize-medley",
            "lead": "https://soundcloud.com/barbershopharmonysociety/honey-little-lize-medley-2",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/honey-little-lize-medley-3",
        },
        "sc_titles": {
            "fullmix": "Honey / Lil' Lize Medley",
            "learning": "Honey - Little 'Lize Medley",
        },
    },
    {
        "n": 6,
        "id": 90006,
        "title": "Let Me Call You Sweetheart",
        "common_name": "Let Me Call You Sweetheart",
        "arranger": "Leo Friedman",
        "key": "Bb Major",
        "writ_key": "Major:Bb",
        "src": "let-me-call-you-sweetheart",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/let-me-call-you-sweetheart",
            "bass": "https://soundcloud.com/barbershopharmonysociety/let-me-call-you-sweetheart-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/let-me-call-you-sweetheart-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/let-me-call-you-sweetheart-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/let-me-call-you-sweetheart-4",
        },
        "sc_titles": {
            "fullmix": "Let Me Call You Sweetheart",
            "learning": "Let Me Call You Sweetheart",
        },
    },
    {
        "n": 7,
        "id": 90007,
        "title": "Sweet, Sweet Roses Of Morn",
        "common_name": "Sweet Sweet Roses of Morn",
        "arranger": None,
        "key": "Bb Major",
        "writ_key": "Major:Bb",
        "src": "sweet-sweet-roses-of-morn",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/sweet-sweet-roses-of-morn",
            "bass": "https://soundcloud.com/barbershopharmonysociety/sweet-sweet-roses-of-morn-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/sweet-sweet-roses-of-morn-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/sweet-sweet-roses-of-morn-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/sweet-sweet-roses-of-morn-4",
        },
        "sc_titles": {
            "fullmix": "Sweet Sweet Roses of Morn",
            "learning": "Sweet, Sweet Roses Of Morn",
        },
    },
    {
        "n": 8,
        "id": 90008,
        "title": "Shine On Me",
        "common_name": "Shine On Me",
        "arranger": "Floyd Connett",
        "key": "Bb Major",
        "writ_key": "Major:Bb",
        "src": "shine-on-me",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/shine-on-me",
            "bass": "https://soundcloud.com/barbershopharmonysociety/shine-on-me-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/shine-on-me-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/shine-on-me-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/shine-on-me-4",
        },
        "sc_titles": {
            "fullmix": "Shine on Me",
            "learning": "Shine On Me",
        },
    },
    {
        "n": 9,
        "id": 90009,
        "title": "The Story of the Rose",
        "common_name": "Heart of My Heart",
        "arranger": "SPEBSQSA",
        "key": "Ab Major",
        "writ_key": "Major:Ab",
        "src": "heart-of-my-heart",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/story-of-the-rose",
            "bass": "https://soundcloud.com/barbershopharmonysociety/the-story-of-the-rose-heart-1",
            "bari": "https://soundcloud.com/barbershopharmonysociety/the-story-of-the-rose-heart-of",
            "lead": "https://soundcloud.com/barbershopharmonysociety/the-story-of-the-rose-heart-2",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/the-story-of-the-rose-heart-3",
        },
        "sc_titles": {
            "fullmix": "Story of the Rose",
            "learning": "The Story Of The Rose (Heart Of My Heart)",
        },
    },
    {
        "n": 10,
        "id": 90010,
        "title": "You're The Flower Of My Heart, Sweet Adeline",
        "common_name": "Sweet Adeline",
        "arranger": None,
        "key": "Bb Major",
        "writ_key": "Major:Bb",
        "src": "sweet-adeline",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/youre-the-flower-of-my-heart-sweetadelinemix",
            "bass": "https://soundcloud.com/barbershopharmonysociety/youre-the-flower-of-my-heart-1",
            "bari": "https://soundcloud.com/barbershopharmonysociety/youre-the-flower-of-my-heart",
            "lead": "https://soundcloud.com/barbershopharmonysociety/youre-the-flower-of-my-heart-2",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/youre-the-flower-of-my-heart-3",
        },
        "sc_titles": {
            "fullmix": "You're the Flower of My Heart SweetAdelinemix",
            "learning": "You're The Flower Of My Heart, Sweet Adeline",
        },
    },
    {
        "n": 11,
        "id": 90011,
        "title": "Down By The Old Mill Stream",
        "common_name": "Down By The Old Mill Stream",
        "arranger": None,
        "key": "Ab Major",
        "writ_key": "Major:Ab",
        "src": "down-by-the-old-mill-stream",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/down-by-the-old-mill-stream",
            "bass": "https://soundcloud.com/barbershopharmonysociety/down-by-the-old-mill-stream-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/down-by-the-old-mill-stream-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/down-by-the-old-mill-stream-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/down-by-the-old-mill-stream-4",
        },
        "sc_titles": {
            "fullmix": "Down by the Old Mill Stream",
            "learning": "Down By The Old Mill Stream",
        },
    },
    {
        "n": 12,
        "id": 90012,
        "title": "You Tell Me Your Dream",
        "common_name": "You Tell Me Your Dream",
        "arranger": "Phil Embury",
        "key": "Ab Major",
        "writ_key": "Major:Ab",
        "src": "you-tell-me-your-dream",
        "sc": {
            "fullmix": "https://soundcloud.com/barbershopharmonysociety/you-tell-me-your-dream",
            "bass": "https://soundcloud.com/barbershopharmonysociety/you-tell-me-your-dream-2",
            "bari": "https://soundcloud.com/barbershopharmonysociety/you-tell-me-your-dream-1",
            "lead": "https://soundcloud.com/barbershopharmonysociety/you-tell-me-your-dream-3",
            "tenor": "https://soundcloud.com/barbershopharmonysociety/you-tell-me-your-dream-4",
        },
        "sc_titles": {
            "fullmix": "You Tell Me Your Dream",
            "learning": "You Tell Me Your Dream",
        },
    },
]

PART_SRC = {
    "mix": "fullmix.mp3",
    "bass": "bass.mp3",
    "bari": "bari.mp3",
    "lead": "lead.mp3",
    "tenor": "tenor.mp3",
}

SC_PART_KEY = {
    "mix": "fullmix",
    "bass": "bass",
    "bari": "bari",
    "lead": "lead",
    "tenor": "tenor",
}


def _identity(song: dict) -> dict:
    return {
        "title": song["title"].lower(),
        "arranger": (song["arranger"] or "").lower(),
        "key": song["key"].lower(),
        "version": "polecat",
        "alt_title": song["common_name"].lower()
        if song["common_name"].lower() != song["title"].lower()
        else "",
        "posted": "",
    }


def _identity_key(ident: dict) -> str:
    return "|".join(
        [
            ident["title"],
            ident["arranger"],
            ident["key"],
            ident["version"],
            ident["alt_title"],
            ident["posted"],
        ]
    )


def _identity_hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def _audio_part(folder: Path, song: dict, part: str, src_name: str) -> dict:
    src = folder / src_name
    if not src.is_file():
        raise FileNotFoundError(src)
    data = src.read_bytes()
    filename = build_file_name(song["title"], song["key"], song["arranger"], part, ".mp3")
    dest = folder / filename
    if dest.resolve() != src.resolve():
        if dest.exists():
            dest.unlink()
        src.rename(dest)
    return {
        "filename": filename,
        "bytes": dest.stat().st_size,
        "sha256": sha256_bytes(data),
        "mime_guess": "mp3",
        "source": "soundcloud",
        "source_url": song["sc"][SC_PART_KEY[part]],
        "original_filename": src_name,
    }


def convert_one(song: dict, staging: Path) -> Path:
    src_folder = ROOT / CURRENT[song["src"]]
    if not src_folder.is_dir():
        raise FileNotFoundError(f"missing source folder: {src_folder}")

    folder_name = build_folder_name(song["id"], song["title"], song["key"], song["arranger"])
    dest = staging / folder_name
    dest.mkdir(parents=True, exist_ok=False)

    # Move PDF
    pdfs = list(src_folder.glob("*.pdf"))
    if len(pdfs) != 1:
        raise RuntimeError(f"expected 1 PDF in {src_folder}, found {len(pdfs)}")
    sheet_name = build_file_name(song["title"], song["key"], song["arranger"], "sheet", ".pdf")
    sheet_dest = dest / sheet_name
    shutil.copy2(pdfs[0], sheet_dest)
    sheet_bytes = sheet_dest.read_bytes()
    sheet_sha = sha256_bytes(sheet_bytes)

    # Copy audio into dest with temp names, then rename via _audio_part
    for part, src_name in PART_SRC.items():
        src = src_folder / src_name
        if not src.is_file():
            raise FileNotFoundError(src)
        shutil.copy2(src, dest / src_name)

    parts: dict = {
        "sheet": {
            "filename": sheet_name,
            "bytes": len(sheet_bytes),
            "sha256": sheet_sha,
            "source_sha256": sheet_sha,
            "mime_guess": "pdf",
            "cropped": False,
            "original_filename": pdfs[0].name,
        }
    }
    for part, src_name in PART_SRC.items():
        parts[part] = _audio_part(dest, song, part, src_name)

    alt = song["common_name"] if song["common_name"] != song["title"] else None
    ident = _identity(song)
    ikey = _identity_key(ident)

    meta = {
        "tag_id": song["id"],
        "id": song["id"],
        "title": song["title"],
        "alt_title": alt,
        "common_name": song["common_name"],
        "arranger": song["arranger"],
        "key": song["key"],
        "writ_key": song["writ_key"],
        "type": "SATB",
        "parts_count": 4,
        "collection": "polecats",
        "classic": song["n"],
        "program": "Barber Pole Cat Program",
        "program_aliases": ["Polecats", "Barberpole Cats", "Barber Pole Cats"],
        "status": "ok",
        "folder_name": folder_name,
        "identity": ident,
        "identity_key": ikey,
        "identity_hash": _identity_hash(ikey),
        "keywords": keyword_tokens(
            song["title"],
            song["common_name"],
            song["arranger"],
            song["key"],
            "polecats",
            "polecat",
            "barber pole cat",
            "barberpole",
            "SATB",
            str(song["id"]),
            f"p{song['n']}",
        ),
        "metadata_source": "polecats_import",
        "enriched_at": NOW,
        "learning_tracks_by": "Barbershop Harmony Society",
        "learning_tracks_source": "soundcloud",
        "sheet_format": "pdf",
        "sheet_cropped": False,
        "parts": parts,
        "discovered_assets": {
            "sheet": {"kind": "sheet", "type": "pdf", "preferred": True},
            "mix": {
                "kind": "audio",
                "type": "mp3",
                "preferred": True,
                "url": song["sc"]["fullmix"],
            },
            "bass": {"kind": "audio", "type": "mp3", "preferred": True, "url": song["sc"]["bass"]},
            "bari": {"kind": "audio", "type": "mp3", "preferred": True, "url": song["sc"]["bari"]},
            "lead": {"kind": "audio", "type": "mp3", "preferred": True, "url": song["sc"]["lead"]},
            "tenor": {"kind": "audio", "type": "mp3", "preferred": True, "url": song["sc"]["tenor"]},
        },
        "remote": {
            "id": song["id"],
            "Title": song["title"],
            "AltTitle": alt,
            "CommonName": song["common_name"],
            "WritKey": song["writ_key"],
            "Parts": 4,
            "Type": "SATB",
            "Arranger": song["arranger"],
            "Collection": "polecats",
            "Classic": song["n"],
            "Program": "Barber Pole Cat Program",
            "Provider": "Barbershop Harmony Society",
            "SoundCloudTitles": song["sc_titles"],
            "SoundCloudUrls": song["sc"],
        },
        "notes": song.get("notes"),
        "cache_group": "polecats",
    }
    (dest / "metadata.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    return dest


def main() -> int:
    staging = ROOT / "_staging_library"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir()

    built: list[Path] = []
    for song in SONGS:
        dest = convert_one(song, staging)
        built.append(dest)
        print(f"built {dest.name}")

    # Remove old song folders (keep docs / scripts)
    keep = {
        "SOUNDCLOUD_NAMES.md",
        "README.md",
        "to_library.py",
        "_staging_library",
    }
    for child in list(ROOT.iterdir()):
        if child.name in keep or child.name.startswith("."):
            continue
        if child.is_dir():
            shutil.rmtree(child)
        elif child.suffix.lower() in {".pdf", ".mp3"}:
            child.unlink()

    for dest in built:
        final = ROOT / dest.name
        if final.exists():
            shutil.rmtree(final)
        dest.rename(final)
    shutil.rmtree(staging)

    print(f"done: {len(built)} polecats in library format")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
