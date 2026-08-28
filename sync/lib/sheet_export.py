"""Raster / crop pipeline for tag sheet music (sync + export)."""

from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from PIL import Image

from .config import SHEET_EXTENSIONS

try:
    import pypdfium2 as pdfium
except ImportError:
    pdfium = None  # type: ignore[assignment]

# Approved defaults from crop_approval_preview
DEFAULT_CROP_MARGIN = 32
DEFAULT_CROP_THRESHOLD = 250
DEFAULT_PDF_DPI = 150
DEFAULT_MIN_GAP_FRAC = 0.08
DEFAULT_MAX_FOOTER_FRAC = 0.12
DEFAULT_INK_ROW = 0.002

# Some stacked/scanned sheets exceed Pillow's default decompression bomb limit
Image.MAX_IMAGE_PIXELS = max(getattr(Image, "MAX_IMAGE_PIXELS", 0) or 0, 200_000_000)


def bucket_for_folder_name(name: str) -> Optional[str]:
    for ch in name:
        if ch.isdigit():
            return "0-9"
        if ch.isalpha():
            return ch.upper()
    return None


def _row_ink_density(gray: Image.Image, threshold: int) -> list[float]:
    width, height = gray.size
    pixels = gray.load()
    dens: list[float] = []
    for y in range(height):
        dark = sum(1 for x in range(width) if pixels[x, y] < threshold)
        dens.append(dark / width)
    return dens


def _ink_bands(dens: list[float], ink_row: float) -> list[tuple[int, int]]:
    ink_rows = [i for i, d in enumerate(dens) if d >= ink_row]
    if not ink_rows:
        return []
    bands: list[tuple[int, int]] = []
    start = prev = ink_rows[0]
    for y in ink_rows[1:]:
        if y - prev > 3:
            bands.append((start, prev))
            start = y
        prev = y
    bands.append((start, prev))
    return bands


def content_bbox(
    im: Image.Image,
    *,
    threshold: int = DEFAULT_CROP_THRESHOLD,
    margin: int = DEFAULT_CROP_MARGIN,
    min_gap_frac: float = DEFAULT_MIN_GAP_FRAC,
    max_footer_frac: float = DEFAULT_MAX_FOOTER_FRAC,
    ink_row: float = DEFAULT_INK_ROW,
) -> tuple[int, int, int, int]:
    """Return (left, top, right, bottom) content box in image pixels (top-left origin)."""
    rgb = image_to_rgb(im)
    dens = _row_ink_density(rgb.convert("L"), threshold)
    height = len(dens)
    bands = _ink_bands(dens, ink_row)

    def with_margin(bbox: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        left, top, right, bottom = bbox
        return (
            max(0, left - margin),
            max(0, top - margin),
            min(rgb.width, right + margin),
            min(rgb.height, bottom + margin),
        )

    if len(bands) >= 2:
        footer_start, footer_end = bands[-1]
        footer_h = footer_end - footer_start + 1
        gap = footer_start - bands[-2][1] - 1
        if (
            gap >= min_gap_frac * height
            and footer_h <= max_footer_frac * height
            and footer_start >= 0.45 * height
        ):
            content = rgb.crop((0, 0, rgb.width, bands[-2][1] + 1))
            mask = content.convert("L").point(lambda p: 0 if p >= threshold else 255)
            bbox = mask.getbbox()
            if bbox:
                return with_margin(bbox)

    mask = rgb.convert("L").point(lambda p: 0 if p >= threshold else 255)
    bbox = mask.getbbox()
    if not bbox:
        return (0, 0, rgb.width, rgb.height)
    return with_margin(bbox)


def crop_to_content(
    im: Image.Image,
    *,
    threshold: int = DEFAULT_CROP_THRESHOLD,
    margin: int = DEFAULT_CROP_MARGIN,
    min_gap_frac: float = DEFAULT_MIN_GAP_FRAC,
    max_footer_frac: float = DEFAULT_MAX_FOOTER_FRAC,
    ink_row: float = DEFAULT_INK_ROW,
) -> Image.Image:
    """Crop image to music content, dropping isolated bottom copyright footers."""
    rgb = image_to_rgb(im)
    return rgb.crop(
        content_bbox(
            rgb,
            threshold=threshold,
            margin=margin,
            min_gap_frac=min_gap_frac,
            max_footer_frac=max_footer_frac,
            ink_row=ink_row,
        )
    )


def scale_page(im: Image.Image, *, max_width: int = 1200) -> Image.Image:
    if im.width <= max_width:
        return im
    height = int(im.height * max_width / im.width)
    return im.resize((max_width, height), Image.Resampling.LANCZOS)


def _rasterize_pdf(path: Path, *, dpi: int) -> list[Image.Image]:
    if pdfium is None:
        raise RuntimeError("pypdfium2 is required to rasterize PDF sheets")
    scale = dpi / 72.0
    doc = pdfium.PdfDocument(str(path))
    try:
        return [doc[i].render(scale=scale).to_pil().convert("RGB") for i in range(len(doc))]
    finally:
        doc.close()


def _rasterize_pdf_bytes(data: bytes, *, dpi: int) -> list[Image.Image]:
    if pdfium is None:
        raise RuntimeError("pypdfium2 is required to rasterize PDF sheets")
    scale = dpi / 72.0
    doc = pdfium.PdfDocument(data)
    try:
        return [doc[i].render(scale=scale).to_pil().convert("RGB") for i in range(len(doc))]
    finally:
        doc.close()


def image_to_rgb(im: Image.Image, *, background: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """Convert any mode to RGB, compositing alpha onto a solid background.

    Black-ink-on-transparent PNGs (RGB all 0, content in alpha) become solid black
    with Pillow's default ``convert("RGB")``; compositing onto white preserves the music.
    """
    if im.mode == "RGB":
        return im.copy()
    if im.mode in ("RGBA", "LA", "PA") or "A" in im.getbands():
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (*background, 255))
        return Image.alpha_composite(bg, rgba).convert("RGB")
    return im.convert("RGB")


def load_sheet_pages(path: Path, *, dpi: int = DEFAULT_PDF_DPI) -> list[Image.Image]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return _rasterize_pdf(path, dpi=dpi)
    if suffix not in SHEET_EXTENSIONS:
        raise ValueError(f"unsupported sheet extension: {suffix}")
    with Image.open(path) as im:
        return [image_to_rgb(im)]


def prepare_pages(
    path: Path,
    *,
    dpi: int = DEFAULT_PDF_DPI,
    max_width: int = 1200,
    crop_threshold: int = DEFAULT_CROP_THRESHOLD,
    crop_margin: int = DEFAULT_CROP_MARGIN,
) -> list[Image.Image]:
    pages = load_sheet_pages(path, dpi=dpi)
    return [
        scale_page(
            crop_to_content(page, threshold=crop_threshold, margin=crop_margin),
            max_width=max_width,
        )
        for page in pages
    ]


def stack_pages_vertically(pages: list[Image.Image]) -> Image.Image:
    if not pages:
        raise ValueError("no pages to stack")
    if len(pages) == 1:
        return pages[0]
    width = max(p.width for p in pages)
    height = sum(p.height for p in pages)
    canvas = Image.new("RGB", (width, height), "white")
    y = 0
    for page in pages:
        x = (width - page.width) // 2
        canvas.paste(page, (x, y))
        y += page.height
    return canvas


def pages_to_pdf_bytes(pages: list[Image.Image], *, dpi: int = DEFAULT_PDF_DPI) -> bytes:
    """Encode raster pages as a PDF (export-only helper — not used for library sync)."""
    if not pages:
        raise ValueError("no pages to encode")
    buf = io.BytesIO()
    first = pages[0].convert("RGB")
    rest = [p.convert("RGB") for p in pages[1:]]
    if rest:
        first.save(buf, format="PDF", resolution=float(dpi), save_all=True, append_images=rest)
    else:
        first.save(buf, format="PDF", resolution=float(dpi))
    return buf.getvalue()


def crop_pdf_bytes(
    data: bytes,
    *,
    dpi: int = DEFAULT_PDF_DPI,
    margin: int = DEFAULT_CROP_MARGIN,
    threshold: int = DEFAULT_CROP_THRESHOLD,
) -> bytes:
    """Crop PDF pages via CropBox/MediaBox — never re-rasterize page content.

    Rasterization is used only to detect the content bounding box. Vector (and
    already-embedded raster) page streams are preserved unchanged.
    """
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import RectangleObject

    analysis_pages = _rasterize_pdf_bytes(data, dpi=dpi)
    reader = PdfReader(io.BytesIO(data))
    if len(reader.pages) != len(analysis_pages):
        raise RuntimeError(
            f"PDF page count mismatch: pdf={len(reader.pages)} render={len(analysis_pages)}"
        )

    writer = PdfWriter()
    for page, rendered in zip(reader.pages, analysis_pages):
        left, top, right, bottom = content_bbox(
            rendered, threshold=threshold, margin=margin
        )
        mediabox = page.mediabox
        page_w = float(mediabox.width)
        page_h = float(mediabox.height)
        # Rendered image may map to the page; convert top-left image px → PDF points
        sx = page_w / rendered.width
        sy = page_h / rendered.height
        x0 = float(mediabox.left) + left * sx
        x1 = float(mediabox.left) + right * sx
        # Image y=0 at top; PDF y=0 at bottom
        y1 = float(mediabox.bottom) + (rendered.height - top) * sy
        y0 = float(mediabox.bottom) + (rendered.height - bottom) * sy
        # Clamp to page
        x0 = max(float(mediabox.left), min(x0, float(mediabox.right)))
        x1 = max(float(mediabox.left), min(x1, float(mediabox.right)))
        y0 = max(float(mediabox.bottom), min(y0, float(mediabox.top)))
        y1 = max(float(mediabox.bottom), min(y1, float(mediabox.top)))
        if x1 - x0 < 2 or y1 - y0 < 2:
            writer.add_page(page)
            continue
        box = RectangleObject((x0, y0, x1, y1))
        page.cropbox = box
        page.mediabox = box
        page.trimbox = box
        page.bleedbox = box
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def crop_pdf_file(
    src: Path,
    dest: Path | None = None,
    *,
    dpi: int = DEFAULT_PDF_DPI,
    margin: int = DEFAULT_CROP_MARGIN,
    threshold: int = DEFAULT_CROP_THRESHOLD,
) -> Path:
    """Crop a PDF on disk via CropBox. Writes to dest (default: overwrite src)."""
    dest = dest or src
    data = crop_pdf_bytes(src.read_bytes(), dpi=dpi, margin=margin, threshold=threshold)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def save_grey_png(
    im: Image.Image,
    dest: Path,
    *,
    levels: int = 16,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    gray = im.convert("L")
    if levels < 256:
        gray = gray.quantize(colors=levels, method=Image.Quantize.MEDIANCUT)
    gray.save(dest, format="PNG", optimize=True, compress_level=9)


def save_bitonal_webp(
    im: Image.Image,
    dest: Path,
    *,
    max_width: int = 600,
    threshold: int = DEFAULT_CROP_THRESHOLD,
) -> None:
    """Save a 1-bit preview WebP scaled to max_width (lossless)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgb = im.convert("RGB")
    if rgb.width > max_width:
        height = max(1, round(rgb.height * max_width / rgb.width))
        rgb = rgb.resize((max_width, height), Image.Resampling.LANCZOS)
    bit = rgb.convert("L").point(lambda p: 0 if p < threshold else 255, mode="1").convert(
        "L"
    )
    bit.save(dest, format="WEBP", lossless=True, method=6)


def _grey_percentile(gray: Image.Image, pct: float) -> int:
    data = gray.get_flattened_data()
    if not data:
        return 0
    ordered = sorted(data)
    idx = int(round((pct / 100.0) * (len(ordered) - 1)))
    return int(ordered[max(0, min(len(ordered) - 1, idx))])


def _preview_tone_points(
    gray: Image.Image,
    *,
    black_point: int | None,
    white_point: int | None,
) -> tuple[int, int]:
    lo = 0 if black_point is None else black_point
    hi = 255 if white_point is None else white_point
    if black_point is None or white_point is None:
        auto_lo = _grey_percentile(gray, 2.0)
        auto_hi = _grey_percentile(gray, 98.0)
        if black_point is None:
            lo = auto_lo
        if white_point is None:
            hi = auto_hi
    return lo, max(lo + 1, hi)


def _tone_map_value(p: int, lo: int, span: int, gamma: float) -> float:
    x = (p - lo) / span
    g = max(0.01, gamma)
    if x <= 0.0:
        x = 0.0
    elif x >= 1.0:
        x = 1.0
    elif x < 0.5:
        t = 2.0 * x
        x = 0.5 * (t**g)
    else:
        t = 2.0 * (1.0 - x)
        x = 1.0 - 0.5 * (t**g)
    return x * 255.0


def _grey_palette(levels: int) -> list[int]:
    max_idx = levels - 1
    return [(idx * 255) // max_idx for idx in range(levels)]


def _nearest_palette(value: float, palette: list[int]) -> int:
    return min(palette, key=lambda v: abs(v - value))


def _floyd_steinberg_dither(tone: list[float], width: int, height: int, palette: list[int]) -> list[int]:
    buf = tone[:]
    out = [0] * (width * height)
    for y in range(height):
        for x in range(width):
            i = y * width + x
            old = max(0.0, min(255.0, buf[i]))
            new = _nearest_palette(old, palette)
            out[i] = new
            err = old - new
            if x + 1 < width:
                buf[i + 1] += err * (7.0 / 16.0)
            if y + 1 < height:
                if x > 0:
                    buf[i + width - 1] += err * (3.0 / 16.0)
                buf[i + width] += err * (5.0 / 16.0)
                if x + 1 < width:
                    buf[i + width + 1] += err * (1.0 / 16.0)
    return out


def quantize_grey_preview(
    gray: Image.Image,
    levels: int,
    *,
    gamma: float = 1.4,
    black_point: int | None = None,
    white_point: int | None = None,
    dither: bool = True,
) -> Image.Image:
    """Tone-map with gamma toward 0/255, then quantize to exactly `levels` greys."""
    if levels >= 256:
        return gray
    if levels <= 1:
        return gray.point(lambda p: 0 if p < DEFAULT_CROP_THRESHOLD else 255)

    lo, hi = _preview_tone_points(gray, black_point=black_point, white_point=white_point)
    span = max(1, hi - lo)
    palette = _grey_palette(levels)
    src = list(gray.get_flattened_data())
    tone = [_tone_map_value(int(p), lo, span, gamma) for p in src]

    if dither:
        pixels = _floyd_steinberg_dither(tone, gray.width, gray.height, palette)
    else:
        pixels = [_nearest_palette(v, palette) for v in tone]

    out = Image.new("L", gray.size)
    out.putdata(pixels)
    return out


def quantize_grey_uniform(gray: Image.Image, levels: int) -> Image.Image:
    """Map greyscale to exactly `levels` values, preserving 0 and 255."""
    return quantize_grey_preview(gray, levels, gamma=1.0, black_point=0, white_point=255)


def save_greyscale_webp(
    im: Image.Image,
    dest: Path,
    *,
    max_width: int = 600,
    levels: int = 4,
    gamma: float = 1.4,
    dither: bool = True,
    quality: int = 80,
    lossless: bool | None = None,
) -> None:
    """Save a gamma tone-mapped, quantized greyscale preview WebP."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgb = im.convert("RGB")
    if rgb.width > max_width:
        height = max(1, round(rgb.height * max_width / rgb.width))
        rgb = rgb.resize((max_width, height), Image.Resampling.LANCZOS)
    gray = quantize_grey_preview(
        rgb.convert("L"), levels, gamma=gamma, dither=dither
    )
    # Lossy WebP smears low bit depths; default lossless for <=16 levels.
    if lossless is None:
        lossless = levels <= 16
    kwargs: dict = {"format": "WEBP", "method": 6}
    if lossless:
        kwargs["lossless"] = True
    else:
        kwargs["quality"] = quality
    gray.save(dest, **kwargs)


def build_sheet_preview_webp(
    sheet_path: Path,
    dest: Path,
    *,
    max_width: int | None = None,
    grey_levels: int | None = None,
    gamma: float | None = None,
    dither: bool = True,
    pdf_dpi: int = DEFAULT_PDF_DPI,
    crop_margin: int = DEFAULT_CROP_MARGIN,
    crop_threshold: int = DEFAULT_CROP_THRESHOLD,
) -> int:
    """Build stacked 2-bit dither preview WebP from a sheet file. Returns file size in bytes."""
    from .config import (
        SHEET_PREVIEW_GAMMA,
        SHEET_PREVIEW_GREY_LEVELS,
        SHEET_PREVIEW_MAX_WIDTH,
    )

    max_width = SHEET_PREVIEW_MAX_WIDTH if max_width is None else max_width
    grey_levels = SHEET_PREVIEW_GREY_LEVELS if grey_levels is None else grey_levels
    gamma = SHEET_PREVIEW_GAMMA if gamma is None else gamma

    pages = prepare_pages(
        sheet_path,
        dpi=pdf_dpi,
        max_width=max_width,
        crop_threshold=crop_threshold,
        crop_margin=crop_margin,
    )
    stacked = stack_pages_vertically(pages)
    save_greyscale_webp(
        stacked,
        dest,
        max_width=max_width,
        levels=grey_levels,
        gamma=gamma,
        dither=dither,
    )
    size = dest.stat().st_size
    # Solid-color / failed composites compress to tiny WebPs (~50–80 bytes).
    if size < 200:
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        raise RuntimeError(
            f"sheet preview for {sheet_path.name} is only {size} bytes (likely blank)"
        )
    return size


def write_pbm(im: Image.Image, path: Path) -> None:
    """Write a 1-bit Pillow image as binary PBM (P4)."""
    if im.mode != "1":
        raise ValueError("write_pbm requires mode '1'")
    width, height = im.size
    row_bytes = (width + 7) // 8
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        fh.write(f"P4\n{width} {height}\n".encode("ascii"))
        pixels = im.tobytes()
        for y in range(height):
            row = pixels[y * row_bytes : (y + 1) * row_bytes]
            fh.write(row)


def _cjb2_args(dpi: int, loss_level: int) -> list[str]:
    args = ["-dpi", str(dpi)]
    if loss_level <= 0:
        args.append("-lossless")
    elif loss_level == 1:
        args.append("-clean")
    else:
        args.extend(["-losslevel", str(loss_level)])
    return args


def _require_djvu_tools() -> tuple[str, str]:
    cjb2 = shutil.which("cjb2")
    djvumake = shutil.which("djvumake")
    if not cjb2 or not djvumake:
        raise RuntimeError(
            "djvulibre-bin is required for DJVU export. Install with: sudo apt install djvulibre-bin"
        )
    return cjb2, djvumake


def save_bitonal_djvu(
    pages: list[Image.Image],
    dest: Path,
    *,
    dpi: int = 150,
    threshold: int = 250,
    loss_level: int = 1,
) -> None:
    if not pages:
        raise ValueError("no pages for DJVU export")
    cjb2, djvumake = _require_djvu_tools()
    dest.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="tag_djvu_") as tmp:
        tmpdir = Path(tmp)
        page_paths: list[Path] = []
        for idx, page in enumerate(pages):
            bw = page.convert("L").point(lambda p: 0 if p < threshold else 255, mode="1")
            pbm = tmpdir / f"page_{idx:03d}.pbm"
            djvu_page = tmpdir / f"page_{idx:03d}.djvu"
            write_pbm(bw, pbm)
            subprocess.run(
                [cjb2, *_cjb2_args(dpi, loss_level), str(pbm), str(djvu_page)],
                check=True,
                capture_output=True,
            )
            page_paths.append(djvu_page)

        if len(page_paths) == 1:
            shutil.copy2(page_paths[0], dest)
            return

        subprocess.run(
            [djvumake, "-o", str(dest), *[str(p) for p in page_paths]],
            check=True,
            capture_output=True,
        )


def check_djvu_tools() -> bool:
    return bool(shutil.which("cjb2") and shutil.which("djvumake"))
