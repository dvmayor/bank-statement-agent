import json
from pathlib import Path
import pytest

GROUND_TRUTH_DIR = Path(__file__).parent / "ground_truth"
STATEMENTS_DIR = Path(__file__).parent / "synthetic_statements"


@pytest.fixture
def synthetic_statement_text():
    return (STATEMENTS_DIR / "statement_001.txt").read_text()


@pytest.fixture
def expected_transactions():
    return json.loads((GROUND_TRUTH_DIR / "statement_001_expected.json").read_text())
