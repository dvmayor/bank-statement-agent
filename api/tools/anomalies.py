"""detect_anomalies tool — rule-based detection only.

The LLM contextual layer was removed because it consistently produced false positives
(flagging routine subscriptions like Spotify) and hallucinated wrong transaction_index
values, causing tooltips to appear on the wrong rows. The three rule-based checks
(duplicate, large_debit, round_number) catch all real anomalies reliably.
"""
from __future__ import annotations
from statistics import mean, stdev
import structlog
from api.llm import Provider, DEFAULT_PROVIDER

log = structlog.get_logger()

_SEVERITY_RANK = {"alert": 3, "warning": 2, "info": 1}


def _dedup_by_index(anomalies: list[dict]) -> list[dict]:
    """Collapse multiple entries for the same transaction_index into one.

    When a transaction is caught by more than one rule (e.g. both large_debit
    and round_number), keep only the highest-severity entry so we don't
    over-count anomalies on the results page.
    """
    best: dict[int, dict] = {}
    for a in anomalies:
        idx = a["transaction_index"]
        if idx not in best or _SEVERITY_RANK.get(a["severity"], 0) > _SEVERITY_RANK.get(best[idx]["severity"], 0):
            best[idx] = a
    return list(best.values())


def _rule_anomalies(transactions: list[dict]) -> list[dict]:
    anomalies: list[dict] = []

    # Duplicates
    seen: dict[tuple, list[int]] = {}
    for i, tx in enumerate(transactions):
        key = (tx.get("description", "").strip().lower(), tx.get("debit"))
        if key[1] is not None:
            seen.setdefault(key, []).append(i)
    for key, indices in seen.items():
        if len(indices) > 1:
            for idx in indices[1:]:
                anomalies.append({
                    "transaction_index": idx,
                    "type": "duplicate",
                    "severity": "warning",
                    "reasoning": f"Duplicate of transaction {indices[0]} (same merchant and amount).",
                })

    # Large debits
    debits = [tx["debit"] for tx in transactions if tx.get("debit")]
    if len(debits) >= 5:
        avg = mean(debits)
        sd = stdev(debits) if len(debits) > 1 else 0
        threshold = avg + 2 * sd
        for i, tx in enumerate(transactions):
            if tx.get("debit") and tx["debit"] > threshold and tx["debit"] > 500:
                anomalies.append({
                    "transaction_index": i,
                    "type": "large_debit",
                    "severity": "alert",
                    "reasoning": f"Debit of {tx['debit']:.2f} exceeds 2σ above mean ({avg:.2f}).",
                })

    # Round-number high-value debits
    for i, tx in enumerate(transactions):
        d = tx.get("debit")
        if d and d >= 2000 and d == int(d) and int(d) % 100 == 0:
            anomalies.append({
                "transaction_index": i,
                "type": "round_number",
                "severity": "info",
                "reasoning": f"Round-number debit ({d:.2f}) — worth a glance.",
            })

    return _dedup_by_index(anomalies)


def detect_anomalies(
    transactions: list[dict],
    provider: Provider = DEFAULT_PROVIDER,  # kept for API compatibility
) -> list[dict]:
    anomalies = _rule_anomalies(transactions)
    log.info("anomalies_detected", count=len(anomalies))
    return anomalies
