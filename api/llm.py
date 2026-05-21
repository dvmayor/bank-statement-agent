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

Provider = Literal["gemini", "gemini2", "groq", "groq2", "cerebras"]

PROVIDER_MODELS = {
    "gemini":   "gemma-4-26b-a4b-it",
    "gemini2":  "gemma-4-31b-it",
    "groq":     "llama-3.3-70b-versatile",
    "groq2":    "llama-3.1-8b-instant",
    "cerebras": "qwen-3-235b-a22b-instruct-2507",
}

PROVIDER_LABELS = {
    "groq":     "Groq (Llama 3.3 70B) - fast (recommended)",
    "groq2":    "Groq (Llama 3.1 8B) - very fast but can be inaccurate",
    "cerebras": "Cerebras (Qwen 3 235B) - moderate",
    "gemini":   "Google (Gemma 4 26B) - slow",
    "gemini2":  "Google (Gemma 4 31B) - slow",
}

DEFAULT_PROVIDER: Provider = "groq"

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
    "500", "INTERNAL",
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


_PROVIDER_KEYS_ENV = {
    "gemini":   ("GOOGLE_API_KEYS",     "GOOGLE_API_KEY"),
    "gemini2":  ("GOOGLE_API_KEYS",     "GOOGLE_API_KEY"),
    "groq":     ("GROQ_API_KEYS",       "GROQ_API_KEY"),
    "groq2":    ("GROQ_API_KEYS",       "GROQ_API_KEY"),
    "cerebras": ("CEREBRAS_API_KEYS",   "CEREBRAS_API_KEY"),
}


def _get_keys(provider: Provider) -> list[str]:
    """Return all configured API keys for a provider.

    Checks <PROVIDER>_API_KEYS (comma-separated) first, then <PROVIDER>_API_KEY.
    Also handles comma-separated values in the singular var for convenience.
    """
    env_multi, env_single = _PROVIDER_KEYS_ENV[provider]
    multi = os.environ.get(env_multi, "")
    if multi:
        return [k.strip() for k in multi.split(",") if k.strip()]
    single = os.environ.get(env_single, "")
    if "," in single:
        return [k.strip() for k in single.split(",") if k.strip()]
    return [single] if single else []


def _call_provider(prompt: str, system: str, max_tokens: int, provider: Provider,
                   api_key: str | None = None) -> str:
    """Single attempt against the chosen provider. Caller handles retries."""
    # Re-read .env on every call so key changes take effect without restarting uvicorn.
    from dotenv import load_dotenv
    load_dotenv(override=True)

    if provider in ("gemini", "gemini2"):
        from google import genai
        from google.genai import types
        key = api_key or os.environ["GOOGLE_API_KEY"]
        client = genai.Client(api_key=key)
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

    if provider in ("groq", "groq2"):
        from groq import Groq
        key = api_key or os.environ["GROQ_API_KEY"]
        client = Groq(api_key=key)
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

    if provider == "cerebras":
        from cerebras.cloud.sdk import Cerebras
        key = api_key or os.environ["CEREBRAS_API_KEY"]
        client = Cerebras(api_key=key)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = client.chat.completions.create(
            model=PROVIDER_MODELS["cerebras"],
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

    # Build key list once; cycle on 429 before giving up.
    keys = _get_keys(provider)
    key_idx = 0

    for attempt in range(MAX_RETRIES + 1):
        api_key = keys[key_idx] if keys else None
        try:
            t0 = time.time()
            response = _call_provider(prompt, system, max_tokens, provider, api_key=api_key)
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
                if key_idx < len(keys) - 1:
                    key_idx += 1
                    log.warning(
                        "api_key_rate_limited_cycling",
                        provider=provider,
                        key_index=key_idx - 1,
                        next_key_index=key_idx,
                        keys_remaining=len(keys) - key_idx,
                    )
                    continue
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
