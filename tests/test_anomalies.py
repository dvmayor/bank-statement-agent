"""Anomaly detection: precision/recall on seeded anomalies."""
from api.tools.anomalies import _rule_anomalies


def test_duplicate_detection():
    txs = [
        {"description": "GRAB FOOD SG", "debit": 24.50},
        {"description": "OTHER", "debit": 10.00},
        {"description": "GRAB FOOD SG", "debit": 24.50},
    ]
    anomalies = _rule_anomalies(txs)
    types = {a["type"] for a in anomalies}
    assert "duplicate" in types


def test_large_debit_detection():
    txs = [{"description": f"TX{i}", "debit": 50.0} for i in range(10)]
    txs.append({"description": "BIG", "debit": 5000.0})
    anomalies = _rule_anomalies(txs)
    types = {a["type"] for a in anomalies}
    assert "large_debit" in types


def test_round_number_detection():
    txs = [{"description": "SUSPICIOUS", "debit": 2000.00}]
    anomalies = _rule_anomalies(txs)
    types = {a["type"] for a in anomalies}
    assert "round_number" in types


def test_clean_statement_no_false_positives():
    txs = [
        {"description": f"TX{i}", "debit": 50.0 + i}
        for i in range(10)
    ]
    anomalies = _rule_anomalies(txs)
    assert len(anomalies) == 0
