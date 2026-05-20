# System Design — Bank Statement Extraction Agent

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (UI)                         │
│   Next.js · PDF drag-drop · Results table · Spend chart     │
└───────────────────────┬─────────────────────────────────────┘
                        │ POST /analyze  (multipart PDF)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Backend                            │
│                                                             │
│  ┌──────────────┐    ┌──────────────────────────────────┐  │
│  │  PDF Parser  │    │        Agent Orchestrator         │  │
│  │  pdfplumber  │───▶│   Claude claude-sonnet-4-6        │  │
│  └──────────────┘    │   + Tool Use (agentic loop)       │  │
│                      └──────────┬───────────────────────┘  │
│                                 │ calls                      │
│          ┌──────────────────────┼──────────────────────┐   │
│          ▼                      ▼                       ▼   │
│  ┌──────────────┐   ┌──────────────────┐   ┌─────────────┐ │
│  │  extract_    │   │  categorise_     │   │  detect_    │ │
│  │  transactions│   │  transaction     │   │  anomalies  │ │
│  │  (tool)      │   │  (tool + RAG)    │   │  (tool)     │ │
│  └──────────────┘   └────────┬─────────┘   └─────────────┘ │
│                              │                              │
│                    ┌─────────▼──────────┐                  │
│                    │   ChromaDB         │                  │
│                    │   Category KB      │                  │
│                    │   (embeddings)     │                  │
│                    └────────────────────┘                  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Structured output: JSON + plain-English summary     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
   LangSmith      /evaluate       Railway
   (traces)       (eval suite)    (deploy)
```

---

## 2. Component Breakdown

### 2.1 PDF Parser
- Library: `pdfplumber`
- Extracts raw text page-by-page, preserving table structure where possible
- Fallback: `PyMuPDF` for image-heavy PDFs (common in scanned statements)
- Output: raw text blocks with page/position metadata

### 2.2 Agent Orchestrator
- Model: `claude-sonnet-4-6` via Anthropic Python SDK
- Pattern: Tool-use agentic loop — Claude decides which tools to call and in what order
- System prompt defines: agent role, output schema, rules (never hallucinate amounts)
- Tools registered: `extract_transactions`, `categorise_transaction`, `detect_anomalies`, `generate_summary`
- Max iterations: 10 (safety cap)
- Streaming: enabled so UI shows live progress

### 2.3 Tools (Claude tool_use)

```python
# Tool 1 — Extract
extract_transactions(raw_text: str) -> list[Transaction]
# Parses dates, descriptions, debit/credit amounts, running balance
# Returns structured JSON array

# Tool 2 — Categorise (called per transaction or in batch)
categorise_transaction(description: str, amount: float) -> Category
# RAG lookup against category KB, then Claude selects best match
# Categories: Food, Transport, Bills, Salary, Entertainment,
#             Healthcare, Shopping, Transfer, ATM, Other

# Tool 3 — Anomalies
detect_anomalies(transactions: list[Transaction]) -> list[Anomaly]
# Rule-based + LLM: duplicates, round-number fraud, velocity spikes,
# unusual hours, large single debits vs. 90-day average

# Tool 4 — Summary
generate_summary(transactions, categories, anomalies) -> Summary
# Plain-English monthly summary: net cashflow, top 3 categories,
# any anomaly callouts, one-sentence outlook
```

### 2.4 Category Knowledge Base (RAG)
- ~500 merchant → category mappings (seed data from open datasets)
- Embedded with `sentence-transformers/all-MiniLM-L6-v2` (runs locally, free)
- Stored in ChromaDB (in-memory for demo, persistent volume in prod)
- On query: top-3 similar merchants retrieved, Claude picks category with reasoning

### 2.5 Frontend (Next.js)
- Single page: drag-drop upload → loading state with streamed status → results
- Three result panels: Transaction table | Spend donut chart | Summary card
- Anomalies shown as inline row highlights with tooltip reasoning
- Stack: Next.js 14, Tailwind, Recharts (charts), shadcn/ui (components)

---

## 3. Data Flow (Sequence)

```
User            UI              FastAPI          Claude          ChromaDB
 │               │                 │               │               │
 │──upload PDF──▶│                 │               │               │
 │               │──POST /analyze─▶│               │               │
 │               │                 │──parse PDF──▶ │               │
 │               │                 │◀─raw text──── │               │
 │               │                 │──agent start──▶               │
 │               │                 │               │               │
 │               │                 │               │─extract_tx──▶ │
 │               │                 │               │◀─transactions─│
 │               │                 │               │               │
 │               │                 │               │─categorise──▶ │
 │               │                 │               │         ─RAG─▶│
 │               │                 │               │         ◀─────│
 │               │                 │               │◀─categories── │
 │               │                 │               │               │
 │               │                 │               │─detect_anom──▶│
 │               │                 │               │◀─anomalies────│
 │               │                 │               │               │
 │               │                 │               │─gen_summary──▶│
 │               │                 │               │◀─summary──────│
 │               │                 │◀──final JSON──│               │
 │               │◀──SSE stream────│               │               │
 │◀──results─────│                 │               │               │
```

---

## 4. Prompt Design

### System Prompt (agent)
```
You are a bank statement analysis agent. Your job is to accurately extract,
categorise, and analyse financial transactions from raw bank statement text.

Rules:
- Never invent, round, or modify transaction amounts
- If a field is ambiguous, extract what is present and flag confidence: low
- Call tools in order: extract → categorise → detect_anomalies → generate_summary
- Do not skip anomaly detection even if the statement looks clean

Output schema: <defined JSON schema here>
```

### Why this matters
- Explicit ordering prevents Claude from skipping steps
- "Never modify amounts" is a hard constraint — financial accuracy is non-negotiable
- Confidence flags allow the UI to show uncertain extractions differently

---

## 5. Eval Framework

```
tests/
  synthetic_statements/       # 10 fake PDF statements (DBS format)
    statement_001.pdf         # simple, single account
    statement_002.pdf         # multi-currency
    statement_003.pdf         # scanned / low quality
  ground_truth/
    statement_001_expected.json
  test_extraction.py          # accuracy: extracted vs expected transactions
  test_categorisation.py      # accuracy: category labels
  test_anomalies.py           # precision/recall on seeded anomalies
  test_latency.py             # p95 < 30s
```

**Run with:** `pytest tests/ --tb=short` — also exposed at `GET /evaluate` in the API.

This is what separates the project from a weekend hack. You can show a recruiter a
test run with numbers.

---

## 6. Observability

- **Tracing:** LangSmith — every agent run logged with tool call chain, token usage, latency
- **Structured logging:** `structlog` — request ID, PDF size, page count, tool call count
- **Errors:** Tool failures caught, agent retries once, then returns partial result with error flag
- **Rate limiting:** 10 requests/hour per IP (prevents abuse on public demo URL)

---

## 7. Tech Stack Summary

| Layer | Choice | Why |
|---|---|---|
| LLM | Claude claude-sonnet-4-6 (Anthropic SDK) | Best tool-use, native JSON output |
| Backend | FastAPI + Python 3.12 | Async, easy streaming, fast |
| PDF parsing | pdfplumber + PyMuPDF | pdfplumber for tables, PyMuPDF fallback |
| Embeddings | sentence-transformers (local) | Free, no API cost, fast |
| Vector store | ChromaDB | Zero-infra, runs in-process |
| Frontend | Next.js 14 + Tailwind + shadcn | Clean, fast to build, looks professional |
| Tracing | LangSmith | Best-in-class for LLM observability |
| Deploy | Railway (API) + Vercel (UI) | Free tier covers demo traffic |
| Eval | pytest + synthetic PDFs | Reproducible, runnable in CI |

---

## 8. Project Structure

```
bank-statement-agent/
├── api/
│   ├── main.py               # FastAPI app, routes
│   ├── agent.py              # Agent orchestrator, tool registration
│   ├── tools/
│   │   ├── extract.py        # extract_transactions tool
│   │   ├── categorise.py     # categorise_transaction + RAG
│   │   ├── anomalies.py      # detect_anomalies tool
│   │   └── summary.py        # generate_summary tool
│   ├── pdf_parser.py         # pdfplumber / PyMuPDF wrapper
│   ├── vector_store.py       # ChromaDB setup + query
│   └── schemas.py            # Pydantic models (Transaction, Category, etc.)
├── ui/                       # Next.js app
├── tests/
│   ├── synthetic_statements/
│   ├── ground_truth/
│   └── test_*.py
├── data/
│   └── category_seeds.json   # merchant → category seed mappings
├── PRD.md
├── SYSTEM_DESIGN.md
└── README.md
```

---

## 9. Build Order (Sequenced)

1. `pdf_parser.py` — get raw text out of a PDF reliably
2. `extract_transactions` tool + `schemas.py` — structured JSON from raw text
3. `vector_store.py` + `categorise_transaction` tool — RAG categorisation
4. `detect_anomalies` tool — rules first, then LLM layer
5. `agent.py` — wire tools into the agentic loop
6. `main.py` — FastAPI routes, streaming
7. `tests/` — synthetic statements + evals
8. `ui/` — frontend (can be done in parallel after step 6)
9. Deploy — Railway + Vercel
10. Write the 500-word post (name your wrong turns)
