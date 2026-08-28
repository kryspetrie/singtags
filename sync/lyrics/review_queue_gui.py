#!/usr/bin/env python3
"""Tk GUI: review flagged lyrics with the sheet music on screen.

Not part of live sync — see lyrics/README.md.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_MIRROR_DIR = _REPO_ROOT / "mirror"
for _p in (_REPO_ROOT, _MIRROR_DIR):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))


import argparse
import tkinter as tk
from tkinter import ttk
from typing import Optional

from PIL import Image, ImageTk

from lib.complete import find_sheet_file
from lib.config import ROOT_DOWNLOAD_DIR
from lib.lyric_choose import (
    flatten_lyrics,
    load_review_queue,
    pick_best,
    save_review_queue,
    sentence_case_lyrics,
    finalize_lyrics,
)
from lib.state import index_folders_by_id, load_metadata, save_metadata

try:
    import pypdfium2 as pdfium
except ImportError:  # pragma: no cover
    pdfium = None

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff", ".bmp", ".webp"}
HINT = "Enter save   Esc skip   Ctrl+Q quit   Page Up/Dn pan sheet   Ctrl+A select lyrics"

def render_sheet(path: Path) -> Optional[Image.Image]:
    suffix = path.suffix.lower()
    if suffix in IMAGE_SUFFIXES:
        try:
            return Image.open(path).convert("RGB")
        except Exception:
            return None
    if suffix != ".pdf" or pdfium is None:
        return None
    try:
        doc = pdfium.PdfDocument(str(path))
        pages: list[Image.Image] = []
        for i in range(len(doc)):
            bitmap = doc[i].render(scale=2.0)
            pages.append(bitmap.to_pil().convert("RGB"))
        if not pages:
            return None
        if len(pages) == 1:
            return pages[0]
        gap = 12
        width = max(p.size[0] for p in pages)
        height = sum(p.size[1] for p in pages) + gap * (len(pages) - 1)
        stacked = Image.new("RGB", (width, height), (240, 240, 240))
        y = 0
        for page in pages:
            stacked.paste(page, ((width - page.size[0]) // 2, y))
            y += page.size[1] + gap
        return stacked
    except Exception:
        return None

class ReviewApp:
    def __init__(self, root_dir: Path, *, dry_run: bool = False, reset: bool = False) -> None:
        self.root_dir = root_dir
        self.dry_run = dry_run
        self.folders = index_folders_by_id(root_dir)
        data = load_review_queue()
        self.items = [it for it in (data.get("items") or []) if it.get("status") != "done"]
        self.cursor = 0 if reset else int(data.get("cursor") or 0)
        if self.cursor < 0 or self.cursor >= len(self.items):
            self.cursor = 0
        self.resolved = 0
        self.skipped = 0
        self._pil: Optional[Image.Image] = None
        self._photo: Optional[ImageTk.PhotoImage] = None
        self._fit_job: Optional[str] = None
        self._current_folder: Optional[Path] = None
        self._current_meta: dict = {}
        self._guess = ""
        self._guess_source = ""

        self.win = tk.Tk()
        self.win.title("Tag lyric review")
        self.win.minsize(900, 700)
        self._maximize()
        self.win.protocol("WM_DELETE_WINDOW", self.quit)

        self.header = ttk.Label(self.win, text="Loading…", font=("TkDefaultFont", 12, "bold"))
        self.header.pack(fill="x", padx=10, pady=(8, 2))
        self.subhead = ttk.Label(self.win, text="", foreground="#555")
        self.subhead.pack(fill="x", padx=10, pady=(0, 4))

        sheet_frame = ttk.Frame(self.win)
        sheet_frame.pack(fill="both", expand=True, padx=8, pady=4)
        self.vscroll = ttk.Scrollbar(sheet_frame, orient="vertical")
        self.hscroll = ttk.Scrollbar(sheet_frame, orient="horizontal")
        self.canvas = tk.Canvas(
            sheet_frame,
            background="#e8e8e8",
            highlightthickness=0,
            yscrollcommand=self.vscroll.set,
            xscrollcommand=self.hscroll.set,
        )
        self.vscroll.config(command=self.canvas.yview)
        self.hscroll.config(command=self.canvas.xview)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        self.vscroll.grid(row=0, column=1, sticky="ns")
        self.hscroll.grid(row=1, column=0, sticky="ew")
        sheet_frame.rowconfigure(0, weight=1)
        sheet_frame.columnconfigure(0, weight=1)

        bottom = ttk.Frame(self.win)
        bottom.pack(fill="x", padx=10, pady=(4, 8))
        ttk.Label(bottom, text="Lyrics").pack(anchor="w")
        self.text = tk.Text(
            bottom,
            height=4,
            wrap="word",
            undo=True,
            font=("TkDefaultFont", 14),
            padx=6,
            pady=6,
        )
        self.text.pack(fill="x")
        self.status = ttk.Label(bottom, text=HINT, foreground="#444")
        self.status.pack(fill="x", pady=(4, 0))

        self.canvas.bind("<Configure>", self._on_canvas_configure)
        self.win.bind_all("<MouseWheel>", self._on_wheel)
        self.win.bind_all("<Button-4>", self._on_wheel)
        self.win.bind_all("<Button-5>", self._on_wheel)
        self.win.bind("<Escape>", lambda e: self.skip())
        self.win.bind("<Control-q>", lambda e: self.quit())
        self.win.bind("<Control-Q>", lambda e: self.quit())
        self.win.bind("<Prior>", lambda e: self._pan(-8))
        self.win.bind("<Next>", lambda e: self._pan(8))
        self.text.bind("<Return>", self._on_return)
        self.text.bind("<KP_Enter>", self._on_return)
        self.text.bind("<Control-a>", self._select_all)
        self.text.bind("<Control-A>", self._select_all)

        if not self.items:
            self.header.config(text="Review queue is empty.")
            self.subhead.config(text="Nothing to review.")
            return
        self.show_current()

    def _maximize(self) -> None:
        try:
            self.win.attributes("-zoomed", True)
            return
        except tk.TclError:
            pass
        self.win.update_idletasks()
        w, h = self.win.winfo_screenwidth(), self.win.winfo_screenheight()
        self.win.geometry(f"{w}x{h}+0+0")

    def run(self) -> int:
        if not self.items:
            self.win.after(1200, self.quit)
        self.win.mainloop()
        return 0

    def _on_return(self, event: tk.Event) -> str | None:
        if event.state & 0x1:  # Shift+Enter → newline
            return None
        self.save_and_next()
        return "break"

    def _select_all(self, event: tk.Event | None = None) -> str:
        self.text.tag_add("sel", "1.0", "end-1c")
        self.text.mark_set("insert", "1.0")
        return "break"

    def _on_wheel(self, event: tk.Event) -> str:
        if getattr(event, "num", None) == 5 or getattr(event, "delta", 0) < 0:
            self.canvas.yview_scroll(3, "units")
        else:
            self.canvas.yview_scroll(-3, "units")
        return "break"

    def _pan(self, units: int) -> str:
        self.canvas.yview_scroll(units, "units")
        return "break"

    def _on_canvas_configure(self, event: tk.Event) -> None:
        if self._fit_job:
            self.win.after_cancel(self._fit_job)
        self._fit_job = self.win.after(80, self._fit_sheet)

    def _fit_sheet(self) -> None:
        self._fit_job = None
        if self._pil is None:
            return
        cw = max(self.canvas.winfo_width() - 4, 200)
        iw, ih = self._pil.size
        scale = min(cw / iw, 2.0)
        nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
        resized = self._pil.resize((nw, nh), Image.Resampling.LANCZOS)
        self._photo = ImageTk.PhotoImage(resized)
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, anchor="nw", image=self._photo)
        self.canvas.config(scrollregion=(0, 0, nw, nh))
        self.canvas.yview_moveto(0)
        self.canvas.xview_moveto(0)

    def _set_sheet_message(self, message: str) -> None:
        self._pil = None
        self._photo = None
        self.canvas.delete("all")
        self.canvas.create_text(
            24,
            24,
            anchor="nw",
            text=message,
            font=("TkDefaultFont", 14),
            fill="#444",
        )
        self.canvas.config(scrollregion=(0, 0, 400, 200))

    def _typed(self) -> str:
        return " ".join(self.text.get("1.0", "end").split()).strip()

    def _persist_queue(self, *, resolved_delta: int = 0) -> None:
        data = load_review_queue()
        by_id = {
            it.get("tag_id"): it
            for it in (data.get("items") or [])
            if isinstance(it.get("tag_id"), int)
        }
        for item in self.items:
            tid = item.get("tag_id")
            if tid in by_id:
                by_id[tid].update(item)
        data["items"] = data.get("items") or self.items
        data["cursor"] = self.cursor
        if resolved_delta:
            data["resolved"] = int(data.get("resolved") or 0) + resolved_delta
        save_review_queue(data)

    def show_current(self) -> None:
        while self.cursor < len(self.items):
            item = self.items[self.cursor]
            if item.get("status") == "done":
                self.cursor += 1
                continue
            tid = item.get("tag_id")
            folder = self.folders.get(tid) if isinstance(tid, int) else None
            if folder is None:
                item["status"] = "done"
                item["resolved_from"] = "missing_folder"
                self.cursor += 1
                continue
            meta = load_metadata(folder)
            if meta.get("lyrics_finalized") or meta.get("lyrics_source") in {"final", "manual"}:
                item["status"] = "done"
                item["resolved_from"] = "already_accepted"
                self.cursor += 1
                continue
            self._load_item(item, folder, meta)
            self._persist_queue()
            return
        self._persist_queue()
        self.header.config(text="Queue finished")
        self.subhead.config(
            text=f"Saved {self.resolved}  skipped {self.skipped}  pending 0"
        )
        self._set_sheet_message("No more flagged tags.")
        self.text.delete("1.0", "end")
        self.status.config(text="Ctrl+Q to close")

    def _load_item(self, item: dict, folder: Path, meta: dict) -> None:
        self._current_folder = folder
        self._current_meta = meta
        pick = pick_best(meta)
        guess = sentence_case_lyrics(
            item.get("suggested_lyrics") or pick.get("text") or meta.get("lyrics") or ""
        )
        self._guess = guess
        self._guess_source = (
            item.get("suggested_source") or pick.get("source") or "manual"
        )
        n = self.cursor + 1
        total = len(self.items)
        title = item.get("title") or meta.get("title") or folder.name
        arranger = item.get("arranger") or meta.get("arranger") or "—"
        reason = item.get("reason") or "review"
        self.win.title(f"#{item.get('tag_id')}  {title}")
        self.header.config(text=f"{n} / {total}    #{item.get('tag_id')}    {title}")
        self.subhead.config(text=f"{arranger}    ·    {reason}")
        self.text.delete("1.0", "end")
        if guess:
            self.text.insert("1.0", guess)
        self.text.focus_set()
        self.text.mark_set("insert", "end")
        sheet = find_sheet_file(folder, meta)
        if sheet is None:
            self._set_sheet_message("No sheet music file in this folder.")
            return
        img = render_sheet(sheet)
        if img is None:
            self._set_sheet_message(f"Could not display {sheet.name}")
            return
        self._pil = img
        self._fit_sheet()

    def save_and_next(self) -> None:
        lyrics = self._typed()
        if not lyrics:
            self.status.config(text="Empty lyrics — type something, or Esc to skip")
            return
        item = self.items[self.cursor]
        folder = self._current_folder
        meta = self._current_meta
        chosen = (
            self._guess_source
            if flatten_lyrics(lyrics) == flatten_lyrics(self._guess)
            else "manual"
        )
        if folder is not None and not self.dry_run:
            finalize_lyrics(meta, lyrics, chosen_from=chosen)
            save_metadata(folder, meta)
        item["status"] = "done"
        item["resolved_from"] = chosen
        self.resolved += 1
        self.cursor += 1
        self._persist_queue(resolved_delta=0 if self.dry_run else 1)
        self.status.config(text=HINT)
        self.show_current()

    def skip(self) -> None:
        if self.cursor >= len(self.items):
            self.quit()
            return
        self.skipped += 1
        self.cursor += 1
        self._persist_queue()
        self.status.config(text=HINT)
        self.show_current()

    def quit(self) -> None:
        self._persist_queue()
        self.win.destroy()

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Review flagged lyrics with the sheet music on screen."
    )
    parser.add_argument("--root", type=Path, default=ROOT_DOWNLOAD_DIR)
    parser.add_argument("--reset-cursor", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    app = ReviewApp(args.root, dry_run=args.dry_run, reset=args.reset_cursor)
    return app.run()

if __name__ == "__main__":
    raise SystemExit(main())
