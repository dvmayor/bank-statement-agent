"""validate_extraction — inspect transaction quality without an LLM call.

Returned stats let the ReAct agent decide whether to proceed,
re-extract, or abort with a user-facing message.
"""
from __future__ import annotations


def validate_extraction(transactions: list[dict]) -> dict:
    count = len(transactions)
    has_dates = sum(1 for t in transactions if t.get("date"))
    has_amounts = sum(1 for t in transactions if t.get("debit") or t.get("credit"))

    if count == 0:
        status = "empty"
        hint = "No transactions extracted. PDF may be scanned/image-only or unreadable."
    elif count < 3:
        status = "sparse"
        hint = "Very few transactions — anomaly detection not meaningful, consider skipping."
    elif has_dates < count * 0.8 or has_amounts < count * 0.8:
        status = "poor_quality"
        hint = "Many rows are missing dates or amounts — extraction may have failed partially."
    else:
        status = "ok"
        hint = "Extraction looks healthy."

    return {
        "count": count,
        "has_dates": has_dates,
        "has_amounts": has_amounts,
        "status": status,
        "hint": hint,
    }
