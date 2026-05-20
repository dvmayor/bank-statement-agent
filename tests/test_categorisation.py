"""Categorisation accuracy via the vector store + Claude."""
import os
import pytest
from api.tools.categorise import categorise_transactions

pytestmark = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set",
)


def test_categorisation_accuracy(expected_transactions):
    expected = expected_transactions["transactions"]
    txs = [{"description": t["description"], "debit": t.get("debit"), "credit": t.get("credit")}
           for t in expected]

    categorised = categorise_transactions(txs)
    correct = sum(
        1 for got, exp in zip(categorised, expected)
        if got["category"] == exp["category"]
    )
    accuracy = correct / len(expected)
    assert accuracy >= 0.90, f"Categorisation accuracy too low: {accuracy:.2f}"
