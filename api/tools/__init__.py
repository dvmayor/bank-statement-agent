from .extract import extract_transactions
from .categorise import categorise_transactions
from .anomalies import detect_anomalies
from .summary import generate_summary

# Tool schemas remain only for the Claude tool-use loop (see agent.py).
EXTRACT_TOOL_SCHEMA = {
    "name": "extract_transactions",
    "description": "Parse raw bank statement text into structured transactions.",
    "input_schema": {
        "type": "object",
        "properties": {"raw_text": {"type": "string"}},
        "required": ["raw_text"],
    },
}
CATEGORISE_TOOL_SCHEMA = {
    "name": "categorise_transactions",
    "description": "Assign a spending category to each transaction (uses RAG).",
    "input_schema": {
        "type": "object",
        "properties": {"transactions": {"type": "array", "items": {"type": "object"}}},
        "required": ["transactions"],
    },
}
ANOMALIES_TOOL_SCHEMA = {
    "name": "detect_anomalies",
    "description": "Identify unusual transactions worth a human's attention.",
    "input_schema": {
        "type": "object",
        "properties": {"transactions": {"type": "array", "items": {"type": "object"}}},
        "required": ["transactions"],
    },
}
SUMMARY_TOOL_SCHEMA = {
    "name": "generate_summary",
    "description": "Generate monthly summary with cashflow totals and narrative.",
    "input_schema": {
        "type": "object",
        "properties": {
            "transactions": {"type": "array", "items": {"type": "object"}},
            "anomalies": {"type": "array", "items": {"type": "object"}},
        },
        "required": ["transactions", "anomalies"],
    },
}

ALL_TOOL_SCHEMAS = [EXTRACT_TOOL_SCHEMA, CATEGORISE_TOOL_SCHEMA, ANOMALIES_TOOL_SCHEMA, SUMMARY_TOOL_SCHEMA]
TOOL_HANDLERS = {
    "extract_transactions": extract_transactions,
    "categorise_transactions": categorise_transactions,
    "detect_anomalies": detect_anomalies,
    "generate_summary": generate_summary,
}
