"""HTTP client with adaptive backoff, retries, and junk-PDF guards."""

from __future__ import annotations

import hashlib
import random
import time
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests

from .config import (
    BASE_DELAY,
    BASE_URL,
    GUIDELINES_MD5,
    GUIDELINES_PDF_NAME,
    GUIDELINES_SIZE,
    HEADERS,
    MAX_DELAY,
    SLOW_THRESHOLD,
)

_current_delay = BASE_DELAY
_session: Optional[requests.Session] = None
# Set when the most recent fetch_with_retry exhausted retries on timeout/connection.
_last_was_transport_error = False


def get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(HEADERS)
    return _session


def current_delay() -> float:
    return _current_delay


def last_was_transport_error() -> bool:
    """True if the latest fetch_with_retry failed on timeout/connection (not HTTP status)."""
    return _last_was_transport_error


def reset_delay() -> None:
    """Reset adaptive inter-request delay to the baseline (e.g. after an outage)."""
    global _current_delay
    if _current_delay != BASE_DELAY:
        print(f"   [Recovering] Delay reset to {BASE_DELAY:.1f}s")
    _current_delay = BASE_DELAY


def _bump_delay(reason: str) -> None:
    global _current_delay
    previous = _current_delay
    _current_delay = min(MAX_DELAY, max(BASE_DELAY, _current_delay * 2))
    if _current_delay != previous:
        print(f"   [Backoff] {reason}; delay now {_current_delay:.1f}s")


def _ease_delay() -> None:
    global _current_delay
    if _current_delay <= BASE_DELAY:
        _current_delay = BASE_DELAY
        return
    previous = _current_delay
    _current_delay = max(BASE_DELAY, _current_delay / 4)
    if _current_delay != previous:
        print(f"   [Recovering] Server responsive; delay eased to {_current_delay:.1f}s")


def pause_between_requests(jitter: bool = True) -> None:
    delay = _current_delay
    if jitter:
        delay += random.uniform(0, min(1.0, delay * 0.1))
    time.sleep(delay)


def absolute_url(href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href
    return urljoin(BASE_URL + "/", href.lstrip("/"))


def is_guidelines_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return GUIDELINES_PDF_NAME.lower() in path


def md5_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_guidelines_content(data: bytes) -> bool:
    if len(data) == GUIDELINES_SIZE and md5_bytes(data) == GUIDELINES_MD5:
        return True
    return md5_bytes(data) == GUIDELINES_MD5


def fetch_with_retry(
    url: str,
    max_retries: int = 3,
    backoff_base: float = 2.0,
    timeout: float = 25.0,
    stream: bool = False,
) -> Optional[requests.Response]:
    """GET with exponential backoff on timeouts/connection errors."""
    global _last_was_transport_error
    session = get_session()
    for attempt in range(max_retries):
        try:
            started = time.monotonic()
            response = session.get(url, timeout=timeout, stream=stream)
            elapsed = time.monotonic() - started
            _last_was_transport_error = False
            if elapsed >= SLOW_THRESHOLD:
                _bump_delay(f"slow response ({elapsed:.1f}s)")
            else:
                _ease_delay()
            return response
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
            _bump_delay("timeout/connection error")
            if attempt == max_retries - 1:
                _last_was_transport_error = True
                print(f"   [HTTP fail] {url}: {exc}")
                return None
            wait_time = backoff_base * (2 ** attempt)
            print(f"   [Retry] in {wait_time:.0f}s... (attempt {attempt + 1}/{max_retries})")
            time.sleep(wait_time)
    _last_was_transport_error = True
    return None


def origin_reachable(*, timeout: float = 20.0) -> bool:
    """True when barbershoptags.com answers with a non-5xx status."""
    try:
        response = get_session().get(BASE_URL, timeout=timeout)
        return 200 <= int(response.status_code) < 500
    except (requests.exceptions.Timeout, requests.exceptions.ConnectionError, OSError):
        return False


def wait_for_origin(*, poll_minutes: float) -> None:
    """Block until the origin site is reachable, sleeping ``poll_minutes`` between probes.

    Always sleeps at least one interval first so a flaky homepage (up while
    DownloadFile times out) cannot busy-loop retries.
    """
    if poll_minutes <= 0:
        return
    minutes = max(0.1, float(poll_minutes))
    # Stop compounding request backoff while we wait on the outage.
    reset_delay()
    while True:
        print(
            f"   [Poll] Waiting {minutes:g} minute(s) before next origin check "
            f"({datetime_stamp()})"
        )
        time.sleep(minutes * 60.0)
        if origin_reachable():
            print("   [Poll] Origin is up — resuming")
            reset_delay()
            return
        print(f"   [Poll] Origin still down ({datetime_stamp()})")


def datetime_stamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def download_bytes(url: str, max_retries: int = 2) -> Optional[bytes]:
    """Download URL body; return None for failures or guidelines PDF."""
    if is_guidelines_url(url):
        print(f"   [Skip] guidelines PDF URL: {url}")
        return None
    response = fetch_with_retry(url, max_retries=max_retries)
    if response is None or response.status_code != 200:
        return None
    data = response.content
    if not data:
        return None
    if is_guidelines_content(data):
        print(f"   [Skip] guidelines PDF content from {url}")
        return None
    return data


def sniff_extension(data: bytes, fallback: str = ".bin") -> str:
    """Guess file extension from magic bytes."""
    if data.startswith(b"%PDF"):
        return ".pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    if data.startswith(b"ID3") or data[:2] == b"\xff\xfb" or data[:2] == b"\xff\xf3":
        return ".mp3"
    if data.startswith(b"PK\x03\x04"):
        return ".zip"
    return fallback
