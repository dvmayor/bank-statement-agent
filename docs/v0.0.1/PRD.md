# PRD — Bank Statement Extraction Agent

## 1. Problem Statement

Individuals and SME finance teams spend hours manually reviewing bank statements:
extracting transactions, categorising spend, spotting anomalies, and writing summaries
for accountants or leadership. The process is error-prone, tedious, and doesn't scale.

This agent automates the full workflow — upload a PDF statement, receive a structured
transaction ledger, spend breakdown by category, flagged anomalies, and a plain-English
monthly summary — in under 30 seconds.

**Portfolio angle:** Demonstrates multi-step agentic reasoning (not just an LLM wrapper),
document-understanding, FinTech domain depth, and engineering rigour — directly extending
UOB document-verification work without touching real client data.

---

## 2. Target Users

| Persona | Pain point |
|---|---|
| Individual (primary) | Tracking personal spend, preparing tax records |
| SME finance owner | Monthly reconciliation, accountant-ready summaries |
| Technical recruiter / hiring manager | Demo audience — needs to see something working in 30 s |

---

## 3. Goals

### Must-have (MVP)
- Accept a PDF bank statement upload (DBS / UOB / ANZ / NAB format or synthetic)
- Extract all transactions (date, description, debit/credit, balance)
- Categorise each transaction (Food, Transport, Bills, Salary, etc.)
- Detect anomalies (duplicate charges, unusually large debits, late-night transactions)
- Generate a plain-English monthly summary (top spend categories, net cashflow, alerts)
- Return structured JSON + human-readable summary to the UI

### Should-have (post-MVP)
- Multi-month trend comparison
- Export to CSV / Excel
- Confidence scores per transaction extraction
- Support for multi-currency statements

### Won't-have (v1)
- Real bank API integration (Plaid, MAS SGFinDex)
- User accounts / auth / persistent storage
- Mobile app

---

## 4. Success Metrics

| Metric | Target |
|---|---|
| Transaction extraction accuracy | ≥ 95% on synthetic test set |
| Categorisation accuracy | ≥ 90% on labelled test set |
| Anomaly precision | ≥ 80% (low false-positive rate matters more than recall) |
| End-to-end latency (10-page PDF) | < 30 seconds |
| Demo conversion | Recruiter can run demo unaided in < 60 seconds |

---

## 5. User Stories

```
As a user, I can upload a PDF bank statement so the agent can process it.
As a user, I can see all extracted transactions in a sortable table.
As a user, I can see my spend broken down by category with a chart.
As a user, I can see flagged anomalies with the agent's reasoning.
As a user, I can read a plain-English monthly summary I could forward to my accountant.
As a user, I can download the structured data as JSON or CSV.
```

---

## 6. Non-Goals / Constraints

- No real PII — demo uses synthetic statements only
- No persistent storage — stateless per-request processing
- No fine-tuning — prompt engineering + RAG only
- Single-bank-format MVP — DBS Checking Account PDF layout
- No auth — public demo URL, rate-limited

---

## 7. MVP Scope (What ships first)

1. PDF upload → raw text extraction
2. Transaction extraction (structured JSON)
3. Category classification via RAG
4. Anomaly detection rules + LLM reasoning
5. Summary generation
6. Clean UI with results display
7. `/evaluate` endpoint running the test suite against synthetic statements
