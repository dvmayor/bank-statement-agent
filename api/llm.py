"""Unified LLM client. Wraps Anthropic, Google Gemini, and Groq behind one interface.

Includes retry with exponential backoff for transient errors (503, 429, timeouts).
On 429s the API often includes a suggested retry delay ("retry in Xs"); we honour
whichever is larger — our computed backoff or the API's suggestion.
"""
from __future__ import annotations
import json
import os
import random
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Literal
import structlog

log = structlog.get_logger()

_LLM_LOG_PATH = Path(__file__).parent.parent / "logs" / "llm_calls.jsonl"
_LLM_LOG_PATH.parent.mkdir(exist_ok=True)


def _get_request_id() -> str:
    try:
        from api.main import request_id_ctx
        return request_id_ctx.get("-")
    except Exception:
        return "-"


def _log_llm_call(
    provider: str,
    model: str,
    system: str,
    prompt: str,
    response: str,
    elapsed_s: float,
    attempt: int,
) -> None:
    """Append one JSON line per LLM call to logs/llm_calls.jsonl."""
    record = {
        "ts": datetime.now().isoformat(timespec="milliseconds"),
        "request_id": _get_request_id(),
        "provider": provider,
        "model": model,
        "elapsed_s": round(elapsed_s, 3),
        "attempt": attempt,
        "system_chars": len(system),
        "prompt_chars": len(prompt),
        "response_chars": len(response),
        "system": system,
        "prompt": prompt,
        "response": response,
    }
    try:
        with _LLM_LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        log.warning("llm_log_write_failed", error=str(e))

Provider = Literal["gemini", "claude", "groq"]

DEFAULT_PROVIDER: Provider = "gemini"

PROVIDER_MODELS = {
    # gemini-2.0-flash: 15 RPM on free tier (vs 5 RPM for 2.5-flash preview)
    "gemini": "gemini-2.0-flash",
    "claude": "claude-sonnet-4-6",
    "groq": "llama-3.3-70b-versatile",
}

PROVIDER_LABELS = {
    "gemini": "Google Gemini 2.0 Flash (free tier)",
    "claude": "Anthropic Claude Sonnet 4.6 (paid)",
    "groq": "Groq Llama 3.3 70B (free tier)",
}

# Retry tunables
MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "3"))
BACKOFF_BASE = float(os.getenv("LLM_RETRY_BACKOFF_BASE", "1.0"))


def _strip_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1].lstrip("json").strip()
    return text


# 429 / quota errors — fail immediately, no retry.
_RATE_LIMIT_MARKERS = (
    "429", "RESOURCE_EXHAUSTED", "rate limit", "rate_limit", "too many requests",
)

# Other transient errors worth retrying (service unavailable, network blip).
_TRANSIENT_MARKERS = (
    "503", "UNAVAILABLE",
    "timeout", "Timeout", "overloaded", "Overloaded",
    "connection", "Connection", "ECONNRESET", "ETIMEDOUT",
)


def _is_rate_limit(err: Exception) -> bool:
    msg = str(err)
    return any(marker in msg for marker in _RATE_LIMIT_MARKERS)


def _is_transient(err: Exception) -> bool:
    msg = str(err)
    return any(marker in msg for marker in _TRANSIENT_MARKERS)


_RETRY_AFTER_RE = re.compile(r"retry[_ ]in[: ]+([0-9]+(?:\.[0-9]+)?)\s*s", re.IGNORECASE)


def _suggested_retry_delay(err: Exception) -> float:
    """Extract the API-recommended retry delay from a 429/503 error string, if present.

    Gemini free-tier 429s include text like "Please retry in 39.547s".
    Returns 0.0 if nothing is found.
    """
    m = _RETRY_AFTER_RE.search(str(err))
    return float(m.group(1)) if m else 0.0


def _call_provider(prompt: str, system: str, max_tokens: int, provider: Provider) -> str:
    """Single attempt against the chosen provider. Caller handles retries."""
    # Re-read .env on every call so key changes take effect without restarting uvicorn.
    from dotenv import load_dotenv
    load_dotenv(override=True)

    if provider == "claude":
        from anthropic import Anthropic
        client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        kwargs = {
            "model": PROVIDER_MODELS["claude"],
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        msg = client.messages.create(**kwargs)
        return msg.content[0].text

    if provider == "gemini":
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
        config = types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            system_instruction=system or None,
        )
        resp = client.models.generate_content(
            model=PROVIDER_MODELS["gemini"],
            contents=prompt,
            config=config,
        )
        return resp.text or ""

    if provider == "groq":
        from groq import Groq
        client = Groq(api_key=os.environ["GROQ_API_KEY"])
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = client.chat.completions.create(
            model=PROVIDER_MODELS["groq"],
            messages=messages,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""

    raise ValueError(f"Unknown provider: {provider}")


def complete(
    prompt: str,
    system: str = "",
    max_tokens: int = 4096,
    provider: Provider = DEFAULT_PROVIDER,
) -> str:
    """Synchronous text completion with retry-on-transient-failure.

    429 / quota errors are NOT retried — they fail immediately.
    503 / timeout / connection errors retry up to LLM_MAX_RETRIES times
    with exponential backoff.
    """
    log.info("llm_call", provider=provider, prompt_chars=len(prompt))
    last_err: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            t0 = time.time()
            response = _call_provider(prompt, system, max_tokens, provider)
            _log_llm_call(
                provider=provider,
                model=PROVIDER_MODELS[provider],
                system=system,
                prompt=prompt,
                response=response,
                elapsed_s=time.time() - t0,
                attempt=attempt,
            )
            return response
        except Exception as e:
            last_err = e
            if _is_rate_limit(e):
                # 429 / quota exhausted — don't retry, surface immediately
                log.error("llm_rate_limited", provider=provider, error=str(e)[:200])
                raise
            if attempt >= MAX_RETRIES or not _is_transient(e):
                # Non-transient or out of retries — re-raise
                raise
            computed = BACKOFF_BASE * (2 ** attempt) + random.uniform(0, 0.5)
            # Honour the API's own retry-after hint (e.g. Gemini free-tier says "retry in 39s")
            suggested = _suggested_retry_delay(e)
            delay = max(computed, suggested + 1.0) if suggested else computed
            log.warning(
                "llm_call_transient_failure",
                provider=provider,
                attempt=attempt + 1,
                max_attempts=MAX_RETRIES + 1,
                error=str(e)[:200],
                retry_in_s=round(delay, 2),
                suggested_delay_s=round(suggested, 1) if suggested else None,
            )
            time.sleep(delay)

    # Should be unreachable, but mypy/strict-type tools appreciate the explicit raise
    raise last_err if last_err else RuntimeError("complete() exited retry loop unexpectedly")


def complete_json(
    prompt: str,
    system: str = "",
    max_tokens: int = 4096,
    provider: Provider = DEFAULT_PROVIDER,
) -> str:
    """Same as complete() but strips markdown fences for JSON-expected responses."""
    return _strip_fence(complete(prompt, system, max_tokens, provider))
