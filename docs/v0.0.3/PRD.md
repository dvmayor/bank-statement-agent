# PRD — Bank Statement Extraction Agent

**Version:** 0.0.3
**Date:** 2026-05-20
**Status:** Active

## Changelog

### v0.0.3
- Introduced provider-agnostic **ReAct loop** as the default agent strategy.
  The LLM now thinks, acts, observes, and loops via prompting — works with Gemini, Claude, and Groq alike.
- All three providers are now genuinely agentic (previously only Claude was).
- Kept Claude's native tool-use API as an optional **"native" mode** for side-by-side comparison.
- New `mode` form field on `/analyze`; new mode dropdown in the UI ("ReAct loop" vs "Native tool-use").
- `/providers` now also returns the available modes.

### v0.0.2
- Multi-provider LLM support: Google Gemini (default, free tier), Anthropic Claude (paid), Groq Llama (free tier).
- Model selector dropdown in the upload UI; defaults to Gemini.
- Replaced ChromaDB with an in-memory numpy similarity store.
- Added `/providers` endpoint.

### v0.0.1
- Initial scope: single-provider (Anthropic Claude), ChromaDB-backed RAG, sequential pipeline.

---

## 1. Problem Statement

Individuals and SME finance teams spend hours manually reviewing bank statements:
extracting transactions, categorising spending, spotting anomalies, and writing summaries.
The process is error-prone, tedious, and doesn't scale.

This agent automates the full workflow — upload a PDF statement, receive a structured
transaction ledger, spend breakdown by category, flagged anomalies, and a plain-English
monthly summary — in under 30 seconds.

**Portfolio angle:** Demonstrates a provider-agnostic agent loop (ReAct), multi-provider
abstraction, RAG-grounded categorisation, and engineering rigour (eval harness) — directly
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

### Must-have (shipped through v0.0.3)
- PDF bank statement upload
- Extract all transactions
- Categorise each transaction
- Detect anomalies
- Plain-English monthly summary
- Return structured JSON + narrative to the UI
- Allow user to choose LLM provider (Gemini / Claude / Groq)
- Allow user to choose agent mode (ReAct loop / native tool-use)
- Default to free-tier provider so demo runs at zero cost

### Should-have (post-MVP)
- Per-call cost telemetry shown in the UI
- Multi-month trend comparison
- Export to CSV / Excel
- Confidence scores surfaced per transaction
- Support for multi-currency statements

### Won't-have (v1)
- Real bank API integration
- User accounts / auth / persistent storage
- Mobile app
- Fine-tuned models

---

## 4. Success Metrics

| Metric | Target | Notes |
|---|---|---|
| Transaction extraction accuracy | ≥ 95% | Claude / Gemini meet; Groq lower |
| Categorisation accuracy | ≥ 90% | Provider-independent (RAG-grounded) |
| Anomaly precision | ≥ 80% | Low FP rate matters more than recall |
| End-to-end latency (10-page PDF) | < 30 s | ReAct adds turns; Gemini ≈ 12–20 s; Claude ≈ 15–25 s |
| Cost per run (default) | $0.00 | Gemini free tier |
| Demo conversion | Recruiter runs unaided in 60 s | Manual UX test |

---

## 5. User Stories

```
As a user, I can upload a PDF bank statement so the agent can process it.
As a user, I can pick which LLM provider runs my analysis.
As a user, I can pick whether to run the ReAct loop or Claude's native tool-use.
As a user, I can see extracted transactions, categories, anomalies, and a summary.
As a recruiter, I can run the demo at zero cost (Gemini free tier).
As an engineer reviewing the code, I can see one provider-agnostic agent loop
  that works across three LLMs — not a Claude-specific pipeline pretending to be portable.
```

---

## 6. Non-Goals / Constraints

- No real PII — synthetic statements only
- No persistent storage — stateless per-request
- No fine-tuning — prompt engineering + RAG only
- Single-bank-format MVP — DBS / UOB / NAB-style layouts
- No auth — public demo URL, rate-limited

---

## 7. MVP Scope (current, v0.0.3)

1. PDF upload with provider + mode dropdowns
2. Raw text extraction (pdfplumber primary, PyMuPDF fallback)
3. Provider-agnostic ReAct agent loop (default for all providers)
4. Optional Claude native tool-use loop (mode toggle)
5. Tools: extract, categorise (with RAG), anomalies (rules + LLM), summary
6. In-memory numpy similarity store for category RAG
7. Clean UI with results, telemetry footer showing model · mode · elapsed
8. `/evaluate` endpoint running pytest against synthetic statements
