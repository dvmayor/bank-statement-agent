"""generate_summary tool — structured aggregates + plain-English narrative."""
from __future__ import annotations
import json
from collections import defaultdict
import structlog
from api.llm import complete, Provider, DEFAULT_PROVIDER

log = structlog.get_logger()


def _aggregate(transactions: list[dict]) -> dict:
    total_credits = sum(tx.get("credit") or 0 for tx in transactions)
    total_debits = sum(tx.get("debit") or 0 for tx in transactions)
    by_cat: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0})
    for tx in transactions:
        cat = tx.get("category", "Other")
        amt = tx.get("debit") or 0
        if amt:
            by_cat[cat]["total"] += amt
            by_cat[cat]["count"] += 1

    breakdown = sorted(
        [
            {
                "category": c,
                "total": round(v["total"], 2),
                "count": v["count"],
                "percentage": round(100 * v["total"] / total_debits, 1) if total_debits else 0,
            }
            for c, v in by_cat.items()
        ],
        key=lambda x: x["total"],
        reverse=True,
    )

    dates = sorted([tx["date"] for tx in transactions if tx.get("date")])
    return {
        "period_start": dates[0] if dates else None,
        "period_end": dates[-1] if dates else None,
        "total_credits": round(total_credits, 2),
        "total_debits": round(total_debits, 2),
        "net_cashflow": round(total_credits - total_debits, 2),
        "top_categories": breakdown[:5],
    }


def generate_summary(
    transactions: list[dict],
    anomalies: list[dict],
    provider: Provider = DEFAULT_PROVIDER,
) -> dict:
    agg = _aggregate(transactions)
    prompt = (
        "Write a concise plain-English monthly summary (3-5 sentences) for the user based on this data. "
        "Mention net cashflow, top 2 spend categories, and any anomalies worth attention. "
        "Friendly but professional tone. No markdown.\n\n"
        f"Aggregates: {json.dumps(agg, default=str)}\n"
        f"Anomaly count: {len(anomalies)}\n"
        f"Anomaly types: {[a.get('type') for a in anomalies]}"
    )
    narrative = complete(prompt=prompt, max_tokens=400, provider=provider).strip()
    result = {**agg, "anomaly_count": len(anomalies), "narrative": narrative}
    log.info("summary_generated", net=agg["net_cashflow"], provider=provider)
    return result
