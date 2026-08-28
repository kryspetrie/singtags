"""Shared configuration for the tags mirror pipeline."""

from pathlib import Path

# sync/ is the pipeline root (parent of lib/). Site repo root is one level up.
SYNC_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SYNC_ROOT  # alias used throughout the pipeline
SITE_ROOT = SYNC_ROOT.parent
MIRROR_DIR = SYNC_ROOT / "mirror"

BASE_URL = "https://barbershoptags.com"
API_URL = f"{BASE_URL}/api.php"
# Origin DB has no indexes — one huge page is far safer than many small queries.
API_BULK_N = 50000
API_CLIENT = "TagsMirror"
# Working library lives at the website repo root (never committed).
ROOT_DOWNLOAD_DIR = SITE_ROOT / "library"
STATE_DIR = ROOT_DOWNLOAD_DIR / "_state"

BASE_DELAY = 0.5  # was 2.0; lowered for bulk PDF restore (backoff still applies on strain)
MAX_DELAY = 3600.0
SLOW_THRESHOLD = 8.0

# Teaching guidelines PDF mistakenly saved as sheet music by the old scraper.
GUIDELINES_PDF_NAME = "Barbershop_Tag_Teaching_Guidelines.pdf"
GUIDELINES_MD5 = "52d817716d9ca4568547cd8b4b139adc"
GUIDELINES_SIZE = 524498

SHEET_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff", ".bmp", ".webp"}
AUDIO_EXTENSIONS = {".mp3"}

PART_FLDNAMES = {
    "SheetMusic": "sheet",
    "Notation": "notation",
    "AllParts": "mix",
    "Bass": "bass",
    "Bari": "bari",
    "Lead": "lead",
    "Tenor": "tenor",
}

PART_DISPLAY = {
    "bass": "Bass",
    "bari": "Bari",
    "lead": "Lead",
    "tenor": "Tenor",
    "mix": "Mix",
    "sheet": "Sheet",
    "sheet_preview": "Sheet Preview",
    "notation": "Notation",
}

# Offline/display sheet preview (2-bit dither WebP, stacked pages)
SHEET_PREVIEW_MAX_WIDTH = 800
SHEET_PREVIEW_GREY_LEVELS = 4
SHEET_PREVIEW_GAMMA = 1.4

# Published audio tiers (Opus) — see docs/AUDIO_STORAGE_AND_CACHE.md
# Online playback default; originals for download + cache upgrade only.
AUDIO_PLAYBACK_KBPS = 64
# Ultra-low offline cache: mono solo channel for part-left reconstruction.
AUDIO_ULTRA_LOW_MONO_KBPS = 16
# Mix-only tags (no voice parts): single stereo mix in ultra-low pack.
AUDIO_STEREO_GOOD_KBPS = 32
# Optional higher stereo tier (not used in v1 client cache plan).
AUDIO_STEREO_PREFERRED_KBPS = 48

# Inter-part timing alignment for mono_solos reconstruction (see lib/audio_align.py).
# Offsets below this threshold are ignored (not baked into Opus tiers).
AUDIO_ALIGN_MIN_OFFSET_MS = 50
AUDIO_ALIGN_MAX_SEARCH_MS = 250
AUDIO_ALIGN_MIN_CORR = 0.5
AUDIO_ALIGN_MIN_CORR_GAIN = 0.03
AUDIO_ALIGN_ANALYZE_SECONDS = 20.0
AUDIO_ALIGN_RATE = 16000

# Mix track vs voice-part correlation (mono downmix xcorr). Below this → mix is
# unrelated to learning tracks; cache the hosted mix instead of reconstructing.
AUDIO_MIX_DISJOINT_CORR = 0.25

# Voice-part recombinability (mono_solos → stereo_fallback demotion).
# See SingTags docs/NON_RECOMBINABLE_TRACKS_PLAN.md.
AUDIO_PARTS_RECOMBINE_MIN_TRUSTED_NONLEAD = 2
AUDIO_PARTS_RECOMBINE_MIN_MEAN_CORR = 0.25
AUDIO_PARTS_STEREO_CORR = 0.55
AUDIO_PARTS_STEREO_MIN_VOICES = 3

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
}

FRONTIER_MISS_LIMIT = 40
MAX_FILENAME_LEN = 180

# User-space tesseract (micromamba) when system package isn't installed
TESSERACT_CANDIDATES = [
    Path.home() / "micromamba/envs/tesseract/bin/tesseract",
    Path("/usr/bin/tesseract"),
    Path("/usr/local/bin/tesseract"),
]