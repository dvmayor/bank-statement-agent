"""categorise_transactions tool — batched RAG + LLM classification.

Sends transactions to the LLM in chunks of CATEGORISE_CHUNK_SIZE (default 100).
One LLM call per chunk, regardless of how many transactions are in the chunk.
Override via env var if you want to tune for a different model.
"""
from __future__ import annotations
import json
import os
import structlog
from api.vector_store import CategoryStore
from api.llm import complete_json, Provider, DEFAULT_PROVIDER

log = structlog.get_logger()

CHUNK_SIZE = int(os.getenv("CATEGORISE_CHUNK_SIZE", "100"))

_CATEGORIES = [
    "Dining", "Groceries", "Transport", "Bills", "Salary", "Entertainment",
    "Healthcare", "Shopping", "Transfer", "ATM", "Travel", "Insurance", "Education", "Other",
]

# Case-insensitive lookup so LLMs that return "food" still map to "Food"
_CAT_LOOKUP: dict[str, str] = {c.lower(): c for c in _CATEGORIES}

_store: CategoryStore | None = None


def _get_store() -> CategoryStore:
    global _store
    if _store is None:
        _store = CategoryStore()
    return _store


def _build_chunk_prompt(chunk: list[dict], store: CategoryStore) -> str:
    """Build a single prompt that asks the LLM to categorise the whole chunk at once."""
    rows = []
    for i, tx in enumerate(chunk):
        desc = tx.get("description", "")
        candidates = store.find_similar(desc, k=3)
        cand_str = "; ".join(f"{c['merchant']}→{c['category']}" for c in candidates)
        rows.append(
            f'  {{"index": {i}, "description": "{desc}", '
            f'"debit": {tx.get("debit")}, "credit": {tx.get("credit")}, '
            f'"candidates": "{cand_str}"}}'
        )
    rows_block = ",\n".join(rows)
    return (
        f"Categorise each transaction below. Use the candidate matches as evidence "
        f"but choose freely from the allowed categories.\n\n"
        f"Allowed categories: {', '.join(_CATEGORIES)}\n\n"
        f"Transactions:\n[\n{rows_block}\n]\n\n"
        f"Reply with a JSON array only. Each item must be:\n"
        f'  {{"index": <int matching input>, "category": <allowed value>}}\n'
        f"Return exactly {len(chunk)} items in the same order. No prose, no markdown fences."
    )


def _extract_json_array(text: str) -> list:
    """Extract the first JSON array from text, even if surrounded by prose or fences.

    LLMs sometimes respond with "Here is the JSON: [...]" or add trailing remarks.
    We locate the outermost [ ... ] and parse only that slice.
    """
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"No JSON array found in response: {text[:200]}")
    return json.loads(text[start:end + 1])


def _categorise_chunk(chunk: list[dict], provider: Provider) -> list[dict]:
    """One LLM call to categorise an entire chunk."""
    store = _get_store()
    prompt = _build_chunk_prompt(chunk, store)
    # ~15 tokens per item (index + category only) + overhead
    max_tokens = max(512, len(chunk) * 20 + 200)
    text = complete_json(prompt=prompt, max_tokens=max_tokens, provider=provider)
    results = _extract_json_array(text)

    # Build a dict by index for safe lookup (LLM might return out of order)
    by_index: dict[int, dict] = {}
    for r in results:
        if isinstance(r, dict) and "index" in r:
            by_index[int(r["index"])] = r

    enriched: list[dict] = []
    for i, tx in enumerate(chunk):
        r = by_index.get(i)
        raw_cat = (r.get("category") or "").strip() if r else ""
        canonical = _CAT_LOOKUP.get(raw_cat.lower())  # case-insensitive match
        if r and canonical:
            enriched.append({
                **tx,
                "category": canonical,
            })
        else:
            log.warning("categorise_missing_or_invalid", index=i, got=r, raw_cat=raw_cat)
            enriched.append({**tx, "category": "Other"})
    return enriched


def categorise_transactions(
    transactions: list[dict],
    provider: Provider = DEFAULT_PROVIDER,
) -> list[dict]:
    """Public entry point. Chunks the transactions and dispatches one LLM call per chunk."""
    if not transactions:
        return []

    chunks = [transactions[i:i + CHUNK_SIZE] for i in range(0, len(transactions), CHUNK_SIZE)]
    log.info("categorise_start", total=len(transactions), chunks=len(chunks), chunk_size=CHUNK_SIZE, provider=provider)

    enriched: list[dict] = []
    for idx, chunk in enumerate(chunks):
        try:
            enriched.extend(_categorise_chunk(chunk, provider))
            log.info("categorise_chunk_ok", chunk=idx, size=len(chunk))
        except Exception as e:
            # Chunk failed — fall back to "Other" for this chunk only; subsequent chunks still attempt
            log.error("categorise_chunk_failed", chunk=idx, size=len(chunk), error=str(e))
            for tx in chunk:
                enriched.append({**tx, "category": "Other"})

    log.info("categorise_done", count=len(enriched), provider=provider)
    return enriched
