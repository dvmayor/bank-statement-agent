"""detect_anomalies tool — rule-based detection only.

The LLM contextual layer was removed because it consistently produced false positives
(flagging routine subscriptions like Spotify) and hallucinated wrong transaction_index
values, causing tooltips to appear on the wrong rows. The three rule-based checks
(duplicate, large_debit, round_number) catch all real anomalies reliably.
"""
from __future__ import annotations
from collections import defaultdict
from datetime import date as Date
import re
from statistics import mean, stdev
import structlog
from api.llm import Provider, DEFAULT_PROVIDER

# Markers that confirm a transaction is domestic (Australian)
_AU_RE = re.compile(r'\b(AUS|NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b')
# Markers that indicate a foreign transaction
_FOREIGN_RE = re.compile(r'\b(USD|EUR|GBP|SGD|JPY|NZD|CNY|HKD|USA|UK|EU)\b', re.IGNORECASE)

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


def _parse_date(tx: dict) -> Date | None:
    try:
        return Date.fromisoformat(tx["date"])
    except (KeyError, ValueError, TypeError):
        return None


def _weekly_recurring_indices(transactions: list[dict]) -> set[int]:
    """Return transaction indices that belong to a weekly recurring series.

    A series = same description + same debit amount, 3+ occurrences,
    every consecutive pair spaced 5–9 days apart (covers Mon–Sun variance).
    Australian weekly rent (BPAY, direct debit) is the primary case.
    """
    groups: dict[tuple, list[tuple[int, Date]]] = {}
    for i, tx in enumerate(transactions):
        desc = (tx.get("description") or "").strip().lower()
        amount = tx.get("debit")
        d = _parse_date(tx)
        if amount and d:
            groups.setdefault((desc, amount), []).append((i, d))

    recurring: set[int] = set()
    for entries in groups.values():
        if len(entries) < 3:
            continue
        entries.sort(key=lambda x: x[1])
        # Keep only first occurrence per date to check the weekly gap pattern.
        # Extra same-day entries are intentionally excluded so the duplicate
        # rule can still flag them (e.g. accidentally paying rent twice in a week).
        seen_dates: set = set()
        deduped = []
        for entry in entries:
            if entry[1] not in seen_dates:
                seen_dates.add(entry[1])
                deduped.append(entry)
        if len(deduped) < 3:
            continue
        gaps = [(deduped[j + 1][1] - deduped[j][1]).days for j in range(len(deduped) - 1)]
        if all(5 <= g <= 9 for g in gaps):
            # Only mark the FIRST occurrence per day as recurring.
            # The second (duplicate) keeps its non-recurring status → flagged as duplicate.
            for idx, _ in deduped:
                recurring.add(idx)
    return recurring


def _rule_anomalies(transactions: list[dict]) -> list[dict]:
    anomalies: list[dict] = []
    recurring = _weekly_recurring_indices(transactions)

    # Duplicates — only flag when two identical transactions are < 7 days apart.
    # Weekly recurring payments (rent etc.) are excluded via the recurring set.
    groups: dict[tuple, list[tuple[int, Date | None]]] = {}
    for i, tx in enumerate(transactions):
        key = ((tx.get("description") or "").strip().lower(), tx.get("debit"))
        if key[1] is not None:
            groups.setdefault(key, []).append((i, _parse_date(tx)))

    for key, entries in groups.items():
        entries_sorted = sorted(entries, key=lambda x: (x[1] or Date.min))
        for j in range(len(entries_sorted) - 1):
            idx_a, date_a = entries_sorted[j]
            idx_b, date_b = entries_sorted[j + 1]
            # Skip only if the later entry is already a known recurring payment.
            # If idx_a is recurring but idx_b is not, idx_b is a potential duplicate.
            if idx_b in recurring:
                continue
            # Flag only if within same 7-day window
            days_apart = abs((date_b - date_a).days) if date_a and date_b else 0
            if days_apart < 7:
                anomalies.append({
                    "transaction_index": idx_b,
                    "type": "duplicate",
                    "severity": "alert",
                    "reasoning": (
                        f"Same merchant and amount charged again {days_apart} day(s) later — possible double charge. Check your statement."
                    ),
                })

    # Large debits — skip transactions that are part of a known weekly recurring series
    debits = [tx["debit"] for tx in transactions if tx.get("debit")]
    if len(debits) >= 5:
        avg = mean(debits)
        sd = stdev(debits) if len(debits) > 1 else 0
        threshold = avg + 2 * sd
        for i, tx in enumerate(transactions):
            if i in recurring:
                continue
            if tx.get("debit") and tx["debit"] > threshold and tx["debit"] > 500:
                anomalies.append({
                    "transaction_index": i,
                    "type": "large_debit",
                    "severity": "alert",
                    "reasoning": f"${tx['debit']:.2f} is much larger than your typical transaction amount (avg ${avg:.2f}). Worth checking if this is expected.",
                })

    # Round-number high-value debits
    for i, tx in enumerate(transactions):
        d = tx.get("debit")
        if d and d >= 2000 and d == int(d) and int(d) % 100 == 0:
            anomalies.append({
                "transaction_index": i,
                "type": "round_number",
                "severity": "info",
                "reasoning": f"${d:.2f} is a large round-number payment — make sure you recognise this transaction.",
            })

    # Impossible travel — foreign transaction on a day with domestic AU transactions
    by_date: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for i, tx in enumerate(transactions):
        if tx.get("date"):
            by_date[tx["date"]].append((i, tx))

    for day_txs in by_date.values():
        has_au = any(_AU_RE.search(tx.get("description") or "") for _, tx in day_txs)
        if not has_au:
            continue
        for i, tx in day_txs:
            desc = tx.get("description") or ""
            if _FOREIGN_RE.search(desc):
                anomalies.append({
                    "transaction_index": i,
                    "type": "impossible_travel",
                    "severity": "alert",
                    "reasoning": f"Card used in Australia and overseas on the same day — possible fraudulent use.",
                })

    return _dedup_by_index(anomalies)


def detect_anomalies(
    transactions: list[dict],
    provider: Provider = DEFAULT_PROVIDER,  # kept for API compatibility
) -> list[dict]:
    anomalies = _rule_anomalies(transactions)
    log.info("anomalies_detected", count=len(anomalies))
    return anomalies
