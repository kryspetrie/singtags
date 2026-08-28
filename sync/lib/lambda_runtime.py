"""Helpers for weekly Lambda sync: ASR env, deadline, asr_pending, origin retry."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional


DEFAULT_ASR_MODEL_LAMBDA = "small.en"
DEFAULT_ASR_BEAM = 1
DEFAULT_ASR_MIN_REMAINING = 90.0

# Origin outage: fail fast in Lambda; Step Functions waits 1h between attempts (max 24h).
DEFAULT_ORIGIN_RETRY_INTERVAL_SECONDS = 3600
DEFAULT_ORIGIN_RETRY_MAX_ATTEMPTS = 24


@dataclass(frozen=True)
class AsrLambdaConfig:
    enabled: bool = True
    model_name: str = DEFAULT_ASR_MODEL_LAMBDA
    device: str = "cpu"
    compute_type: str = "int8"
    beam_size: int = DEFAULT_ASR_BEAM
    min_remaining_seconds: float = DEFAULT_ASR_MIN_REMAINING


@dataclass(frozen=True)
class OriginRetryConfig:
    """Hourly re-invoke until success, capped at one day (no in-Lambda waiting)."""

    interval_seconds: int = DEFAULT_ORIGIN_RETRY_INTERVAL_SECONDS
    max_attempts: int = DEFAULT_ORIGIN_RETRY_MAX_ATTEMPTS


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def load_asr_config() -> AsrLambdaConfig:
    """Read ASR_* env vars used by lambda_sync.handler."""
    beam = os.environ.get("ASR_BEAM_SIZE", str(DEFAULT_ASR_BEAM))
    min_rem = os.environ.get("ASR_MIN_REMAINING_SECONDS", str(DEFAULT_ASR_MIN_REMAINING))
    try:
        beam_size = max(1, int(beam))
    except ValueError:
        beam_size = DEFAULT_ASR_BEAM
    try:
        min_remaining = max(0.0, float(min_rem))
    except ValueError:
        min_remaining = DEFAULT_ASR_MIN_REMAINING
    return AsrLambdaConfig(
        enabled=_env_bool("ASR_ENABLED", True),
        model_name=(os.environ.get("ASR_MODEL") or DEFAULT_ASR_MODEL_LAMBDA).strip()
        or DEFAULT_ASR_MODEL_LAMBDA,
        device="cpu",
        compute_type="int8",
        beam_size=beam_size,
        min_remaining_seconds=min_remaining,
    )


def load_origin_retry_config() -> OriginRetryConfig:
    interval = os.environ.get(
        "ORIGIN_RETRY_INTERVAL_SECONDS", str(DEFAULT_ORIGIN_RETRY_INTERVAL_SECONDS)
    )
    max_att = os.environ.get(
        "ORIGIN_RETRY_MAX_ATTEMPTS", str(DEFAULT_ORIGIN_RETRY_MAX_ATTEMPTS)
    )
    try:
        interval_seconds = max(60, int(interval))
    except ValueError:
        interval_seconds = DEFAULT_ORIGIN_RETRY_INTERVAL_SECONDS
    try:
        max_attempts = max(1, int(max_att))
    except ValueError:
        max_attempts = DEFAULT_ORIGIN_RETRY_MAX_ATTEMPTS
    return OriginRetryConfig(
        interval_seconds=interval_seconds,
        max_attempts=max_attempts,
    )


class Deadline:
    """Wall-clock deadline from Lambda context or a fixed timeout."""

    def __init__(self, deadline_epoch: Optional[float] = None) -> None:
        self.deadline_epoch = deadline_epoch

    @classmethod
    def from_lambda_context(cls, context: Any, *, fallback_seconds: float = 900.0) -> "Deadline":
        remaining_ms = None
        if context is not None and hasattr(context, "get_remaining_time_in_millis"):
            try:
                remaining_ms = int(context.get_remaining_time_in_millis())
            except Exception:
                remaining_ms = None
        if remaining_ms is None:
            return cls(time.time() + fallback_seconds)
        return cls(time.time() + max(0.0, remaining_ms / 1000.0))

    def remaining_seconds(self) -> float:
        if self.deadline_epoch is None:
            return float("inf")
        return max(0.0, self.deadline_epoch - time.time())

    def enough_for_asr(self, min_remaining: float) -> bool:
        return self.remaining_seconds() >= min_remaining


def normalize_asr_pending(state: dict) -> list[int]:
    raw = state.get("asr_pending") or []
    out: list[int] = []
    seen: set[int] = set()
    for item in raw:
        try:
            tid = int(item)
        except (TypeError, ValueError):
            continue
        if tid not in seen:
            seen.add(tid)
            out.append(tid)
    return out


def set_asr_pending(state: dict, ids: list[int]) -> None:
    state["asr_pending"] = sorted({int(i) for i in ids})


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_origin_attempt(event: Optional[dict], state: dict) -> int:
    """1-based attempt from Step Functions event or persisted origin_retry."""
    if event:
        for key in ("attempt", "origin_attempt"):
            if key in event and event[key] is not None:
                try:
                    return max(1, int(event[key]))
                except (TypeError, ValueError):
                    pass
    retry = state.get("origin_retry") or {}
    try:
        return max(1, int(retry.get("attempt") or 1))
    except (TypeError, ValueError):
        return 1


def mark_origin_retry(state: dict, *, attempt: int, reason: str, cfg: OriginRetryConfig) -> dict:
    """Persist retry metadata; return payload for Step Functions Choice + Wait."""
    payload = {
        "attempt": int(attempt),
        "max_attempts": int(cfg.max_attempts),
        "interval_seconds": int(cfg.interval_seconds),
        "reason": reason,
        "at": utc_now_iso(),
        "retry_origin": True,
        "exhausted": int(attempt) >= int(cfg.max_attempts),
    }
    state["origin_retry"] = {
        "attempt": payload["attempt"],
        "max_attempts": payload["max_attempts"],
        "interval_seconds": payload["interval_seconds"],
        "reason": reason,
        "at": payload["at"],
    }
    return payload


def clear_origin_retry(state: dict) -> None:
    state.pop("origin_retry", None)


def retry_response(
    *,
    attempt: int,
    cfg: OriginRetryConfig,
    reason: str,
    extra: Optional[dict] = None,
) -> dict:
    """Lambda return value when origin is down — Step Functions waits, then re-invokes."""
    next_attempt = int(attempt) + 1
    exhausted = int(attempt) >= int(cfg.max_attempts)
    out = {
        "ok": False,
        "retry_origin": not exhausted,
        "exhausted": exhausted,
        "attempt": int(attempt),
        "next_attempt": next_attempt if not exhausted else None,
        "max_attempts": int(cfg.max_attempts),
        "interval_seconds": int(cfg.interval_seconds),
        "reason": reason,
    }
    if extra:
        out.update(extra)
    return out
