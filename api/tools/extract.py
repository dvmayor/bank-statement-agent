"""extract_transactions tool — converts raw PDF text into structured rows via the chosen LLM."""
from __future__ import annotations
import json
import re
import structlog
from api.llm import complete_json, Provider, DEFAULT_PROVIDER

log = structlog.get_logger()

_EXTRACTION_SYSTEM = """You convert raw bank-statement text into JSON.
Rules:
- Output a JSON array of transactions only. No prose, no markdown fences.
- Each item: {"date": "YYYY-MM-DD", "description": str, "debit": float|null, "credit": float|null, "balance": float|null, "confidence": "high"|"medium"|"low"}
- A row has either debit OR credit, not both.
- Preserve amounts exactly as printed. Never round.
- Dates MUST be in YYYY-MM-DD format. Month is always the middle component (MM), day is last (DD).
  Example: 15 Jan 2024 → "2024-01-15", 03/04 (DD/MM) with year 2024 → "2024-04-03".
- If a field is ambiguous, set confidence to "low".
- EXCLUDE any row that is purely a balance marker: "Opening Balance", "Closing Balance",
  "Brought Forward", "Balance B/F", "Balance C/F". These are not transactions."""

# Descriptions that are balance markers, not real transactions — filtered post-LLM as a safety net
_BALANCE_KEYWORDS = (
    "opening balance", "closing balance", "brought forward",
    "balance b/f", "balance c/f", "balance carried forward",
)


def _fix_date(tx: dict) -> dict:
    """Detect and correct YYYY-DD-MM dates (month > 12 in the MM slot is impossible).

    Some LLMs misread DD/MM source dates and produce YYYY-DD-MM instead of YYYY-MM-DD.
    We detect this when the 'month' component is > 12 and swap day ↔ month.
    """
    raw = (tx.get("date") or "").strip()
    if not raw:
        return tx
    parts = raw.split("-")
    if len(parts) != 3:
        return tx
    year, mid, last = parts
    try:
        mid_i, last_i = int(mid), int(last)
    except ValueError:
        return tx
    # If mid > 12 it can't be a month — swap
    if mid_i > 12 and last_i <= 12:
        fixed = f"{year}-{last.zfill(2)}-{mid.zfill(2)}"
        log.debug("date_swapped", original=raw, fixed=fixed)
        return {**tx, "date": fixed}
    return tx


def _is_balance_row(tx: dict) -> bool:
    desc = (tx.get("description") or "").strip().lower()
    return any(kw in desc for kw in _BALANCE_KEYWORDS)


def _coerce_amounts(tx: dict) -> dict:
    """Ensure debit/credit/balance are float or None — never strings.

    LLMs occasionally return amounts as strings ("84.30" instead of 84.30),
    or with thousands separators ("8,500.00"). Both are normalised to float.
    """
    result = dict(tx)
    for field in ("debit", "credit", "balance"):
        val = result.get(field)
        if val is None:
            continue
        try:
            # Strip currency symbols, commas, spaces — keep digits, dot, leading minus
            cleaned = re.sub(r"[^\d.\-]", "", str(val).strip())
            result[field] = float(cleaned)
        except (TypeError, ValueError):
            log.warning("amount_coercion_failed", field=field, value=val)
            result[field] = None
    return result


def extract_transactions(raw_text: str, provider: Provider = DEFAULT_PROVIDER) -> list[dict]:
    text = complete_json(
        prompt=f"Statement text:\n\n{raw_text}",
        system=_EXTRACTION_SYSTEM,
        max_tokens=4096,
        provider=provider,
    )
    transactions = json.loads(text)
    before = len(transactions)
    transactions = [tx for tx in transactions if not _is_balance_row(tx)]
    filtered = before - len(transactions)
    if filtered:
        log.info("balance_rows_filtered", count=filtered)
    # Fix YYYY-DD-MM dates where LLM misread DD/MM source format
    transactions = [_fix_date(tx) for tx in transactions]
    # Coerce all numeric fields to float — LLMs sometimes return amounts as strings
    transactions = [_coerce_amounts(tx) for tx in transactions]
    log.info("transactions_extracted", count=len(transactions), provider=provider)
    return transactions
