# PRD — Bank Statement Extraction Agent

**Version:** 0.0.2
**Date:** 2026-05-20
**Status:** Active

## Changelog

### v0.0.2
- Multi-provider LLM support: Google Gemini (default, free tier), Anthropic Claude (paid), Groq Llama (free tier).
- Model selector dropdown in the upload UI; defaults to Gemini.
- Replaced ChromaDB with an in-memory numpy similarity store — removes the C++ build-tools dependency on Windows.
- Added `/providers` endpoint exposing available models for the UI.
- Two agent execution paths: Claude tool-use loop (showcase) vs deterministic sequential pipeline (Gemini/Groq).

### v0.0.1
- Initial scope: single-provider (Anthropic Claude), ChromaDB-backed RAG, sequential extract → categorise → anomalies → summary.

---

## 1. Problem Statement

Individuals and SME finance teams spend hours manually reviewing bank statements:
extracting transactions, categorising spending, spotting anomalies, and writing summaries
for accountants or leadership. The process is error-prone, tedious, and doesn't scale.

This agent automates the full workflow — upload a PDF statement, receive a structured
transaction ledger, spend breakdown by category, flagged anomalies, and a plain-English
monthly summary — in under 30 seconds.

**Portfolio angle:** Demonstrates multi-step agentic reasoning, document understanding,
RAG, and engineering rigour (multi-provider abstraction, eval harness) — directly
extending FinTech document-verification experience without touching real client data.

---

## 2. Target Users

| Persona | Pain point |
|---|---|
| Individual (primary) | Tracking personal spend, preparing tax records |
| SME finance owner | Monthly reconciliation, accountant-ready summaries |
| Technical recruiter / hiring manager | Demo audience — needs to see something working in 30 s |

---

## 3. Goals

### Must-have (MVP — shipped in v0.0.1)
- Accept a PDF bank statement upload
- Extract all transactions (date, description, debit/credit, balance)
- Categorise each transaction
- Detect anomalies (duplicates, large debits, round numbers, velocity spikes)
- Generate a plain-English monthly summary
- Return structured JSON + narrative to the UI

### Must-have (v0.0.2)
- Allow user to choose which LLM provider runs the analysis
- Default to a free-tier provider so the demo runs at zero cost for recruiters
- Remove platform-specific build-tool requirements (Windows C++ build chain)

### Should-have (post-MVP)
- Per-call cost telemetry shown in the UI
- Multi-month trend comparison
- Export to CSV / Excel
- Confidence scores surfaced per transaction
- Support for multi-currency statements

### Won't-have (v1)
- Real bank API integration (Plaid, MAS SGFinDex)
- User accounts / auth / persistent storage
- Mobile app
- Fine-tuned models

---

## 4. Success Metrics

| Metric | Target | Notes |
|---|---|---|
| Transaction extraction accuracy | ≥ 95% on synthetic test set | Claude / Gemini; Groq lower |
| Categorisation accuracy | ≥ 90% on labelled test set | Provider-independent (RAG-grounded) |
| Anomaly precision | ≥ 80% | Low false-positive rate matters more than recall |
| End-to-end latency (10-page PDF) | < 30 seconds | Gemini ≈ 8–12 s; Claude ≈ 15–25 s; Groq ≈ 5–10 s |
| Cost per run (default provider) | $0.00 | Gemini free tier; ≤ $0.05 if switched to Claude |
| Demo conversion | Recruiter can run demo unaided in < 60 seconds | Manual UX test |

---

## 5. User Stories

```
As a user, I can upload a PDF bank statement so the agent can process it.
As a user, I can select which model runs my analysis (Gemini, Claude, Groq).
As a user, I can see all extracted transactions in a sortable table.
As a user, I can see my spend broken down by category with a chart.
As a user, I can see flagged anomalies with the agent's reasoning.
As a user, I can read a plain-English monthly summary I could forward to my accountant.
As a recruiter, I can run the demo without paying for API access (free tier default).
```

---

## 6. Non-Goals / Constraints

- No real PII — demo uses synthetic statements only
- No persistent storage — stateless per-request processing
- No fine-tuning — prompt engineering + RAG only
- Single-bank-format MVP — DBS/UOB-style PDF layouts
- No auth — public demo URL, rate-limited

---

## 7. MVP Scope (current, v0.0.2)

1. PDF upload with provider dropdown (defaulted to Gemini)
2. Raw text extraction (pdfplumber primary, PyMuPDF fallback)
3. Transaction extraction (structured JSON) via the chosen LLM
4. Category classification via in-memory similarity RAG + LLM
5. Anomaly detection (rules + LLM)
6. Summary generation
7. Clean UI with results display + provider/timing telemetry
8. `/evaluate` endpoint running the test suite against synthetic statements
