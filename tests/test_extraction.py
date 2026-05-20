"""Accuracy: extracted transactions vs ground truth."""
import os
import pytest
from api.tools.extract import extract_transactions

pytestmark = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set",
)


def test_extraction_accuracy(synthetic_statement_text, expected_transactions):
    extracted = extract_transactions(synthetic_statement_text)
    expected = expected_transactions["transactions"]

    # All expected transactions found by description match
    expected_descs = {t["description"] for t in expected}
    extracted_descs = {t["description"] for t in extracted}
    recall = len(expected_descs & extracted_descs) / len(expected_descs)
    assert recall >= 0.95, f"Recall too low: {recall:.2f}"

    # Amount accuracy on matched transactions
    by_desc = {t["description"]: t for t in extracted}
    correct_amounts = 0
    for exp in expected:
        match = by_desc.get(exp["description"])
        if not match:
            continue
        exp_amount = exp.get("debit") or exp.get("credit")
        got_amount = match.get("debit") or match.get("credit")
        if got_amount and abs(got_amount - exp_amount) < 0.01:
            correct_amounts += 1
    accuracy = correct_amounts / len(expected)
    assert accuracy >= 0.95, f"Amount accuracy too low: {accuracy:.2f}"
