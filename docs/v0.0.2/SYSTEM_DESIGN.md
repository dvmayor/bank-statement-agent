# System Design — Bank Statement Extraction Agent

**Version:** 0.0.2
**Date:** 2026-05-20

## Changelog

### v0.0.2
- Introduced `api/llm.py` — unified `complete()` interface across three providers.
- Refactored all four tools to accept a `provider` kwarg.
- Agent orchestrator dispatches: Claude → tool-use loop; Gemini/Groq → sequential pipeline.
- Vector store replaced: ChromaDB → in-memory numpy cosine-similarity (no C++ build deps).
- New `/providers` API and `ProviderSelect` React component.

### v0.0.1
- Initial Claude-only agent with ChromaDB RAG and tool-use loop.

---

## 1. High-Level Architecture

```
+------------------------------------------------------------------+
|                       Browser (Next.js UI)                       |
|   PDF drag-drop | Provider dropdown | Results table | Spend chart|
+------------------------------+-----------------------------------+
                               | POST /analyze
                               |   multipart: file + provider
                               v
+------------------------------------------------------------------+
|                      FastAPI Backend (Python)                    |
|                                                                  |
|  +-------------+    +---------------------------------------+    |
|  | PDF Parser  |--->|        Agent Orchestrator             |    |
|  | pdfplumber  |    |                                       |    |
|  | PyMuPDF     |    |  provider == "claude":                |    |
|  +-------------+    |    tool-use loop (agentic)            |    |
|                     |  provider in (gemini, groq):          |    |
|                     |    sequential pipeline                |    |
|                     +-------+---------------+---------------+    |
|                             |               |                    |
|                             v               v                    |
|                  +---------------------+ +--------------------+  |
|                  | api/llm.py          | | api/tools/*         | |
|                  | unified complete()  |<-+ extract            | |
|                  |  - Gemini           |  | categorise (RAG)   | |
|                  |  - Claude           |  | anomalies          | |
|                  |  - Groq             |  | summary            | |
|                  +---------------------+  +--------------------+ |
|                                                  |               |
|                                                  v               |
|                                       +-----------------------+  |
|                                       | InMemory CategoryStore|  |
|                                       | numpy cosine sim      |  |
|                                       | sentence-transformers |  |
|                                       +-----------------------+  |
|                                                                  |
|  Output: JSON  { transactions, anomalies, summary, metadata }    |
+--------------------------+-----------------------+---------------+
                           |                       |
                           v                       v
                      LangSmith               /evaluate
                      (Claude only)          (pytest suite)
```

---

## 2. Component Breakdown

### 2.1 LLM Abstraction Layer — `api/llm.py`
- Unified `complete(prompt, system, max_tokens, provider)` returns raw text.
- Lazy SDK imports — missing optional deps don't crash the app.
- Providers:
  - `gemini` (default): `gemini-2.5-flash` via `google-genai`
  - `claude`: `claude-sonnet-4-6` via `anthropic`
  - `groq`: `llama-3.3-70b-versatile` via `groq`
- `complete_json()` strips markdown fences for JSON-expected responses.

### 2.2 Tools
Each tool now takes a `provider` kwarg passed through from the request.

| Tool | Function | Uses LLM? | Uses RAG? |
|---|---|---|---|
| `extract_transactions` | Parse raw text into structured rows | Yes | No |
| `categorise_transactions` | Assign category | Yes | Yes (in-memory) |
| `detect_anomalies` | Statistical rules + LLM contextual flags | Yes (hybrid) | No |
| `generate_summary` | Aggregate + write narrative | Yes | No |

### 2.3 Agent Orchestrator — `api/agent.py`
Two execution strategies dispatched by provider:

**Claude path (`_run_claude_agent`)**
- Runs Claude tool-use loop with all four tools registered.
- Claude decides call order; can self-correct on tool failures.
- Max 10 iterations; loop terminates on `end_turn`.
- Showcase path — demonstrates "real" agentic reasoning.

**Sequential path (`_run_sequential_pipeline`)**
- Direct Python calls in canonical order: extract → categorise → anomalies → summary.
- Used for Gemini and Groq (no tool-use abstraction needed since order is enforced).
- Faster, cheaper, deterministic. Same output schema as Claude path.

Both paths return identical structure: `{transactions, anomalies, summary}`.

### 2.4 Category Knowledge Base
- `api/vector_store.py` — `CategoryStore` class
- Loads ~50 merchant→category seeds from `data/category_seeds.json` at startup
- `sentence-transformers/all-MiniLM-L6-v2` embeds merchants locally (no API cost)
- Numpy dot product over normalised vectors for cosine similarity
- Top-3 nearest neighbours returned to the categoriser tool as RAG context

### 2.5 Frontend
- Next.js 14 single-page app
- New: `ProviderSelect.tsx` — fetches `/providers` on mount, falls back to hardcoded list
- Page state tracks selected provider; sent as form field on upload
- Footer chip shows `model · elapsed_seconds` after a run

---

## 3. Data Flow (Sequence)

### 3.1 Default path — Gemini (sequential pipeline)
```
User       UI         FastAPI         llm.py        Tools
 |          |            |               |             |
 |--PDF---->|            |               |             |
 |        (dropdown      |               |             |
 |          provider)    |               |             |
 |          |--/analyze->|               |             |
 |          |  +provider |               |             |
 |          |            |--parse PDF--> |             |
 |          |            |<--raw text--- |             |
 |          |            |               |             |
 |          |            |---pipeline-->extract        |
 |          |            |               |--LLM call-->|
 |          |            |               |<--rows------|
 |          |            |<--rows--------|             |
 |          |            |               |             |
 |          |            |---pipeline-->categorise     |
 |          |            |               |--RAG lookup |
 |          |            |               |--LLM call-->|
 |          |            |<--enriched----|             |
 |          |            |               |             |
 |          |            |---pipeline-->anomalies      |
 |          |            |<--flags-------|             |
 |          |            |               |             |
 |          |            |---pipeline-->summary        |
 |          |            |<--narrative---|             |
 |          |<--JSON-----|               |             |
 |<-render--|            |               |             |
```

### 3.2 Claude path — agentic loop
```
Agent loop          Claude API           Tools
    |                   |                  |
    |--user msg-------->|                  |
    |   + tool schemas  |                  |
    |<--tool_use(extract)|                 |
    |---call------------>------- extract->|
    |<--rows----------------------|        |
    |--tool_result---->|                   |
    |<--tool_use(categorise)|              |
    |  ...repeats for all 4 tools...       |
    |<--end_turn + final JSON|             |
```

---

## 4. APIs

### 4.1 HTTP Endpoints
| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness check |
| `/providers` | GET | List available LLM providers for the dropdown |
| `/analyze` | POST | Upload PDF + provider; returns analysis JSON |
| `/evaluate` | GET | Run pytest eval suite, return metrics |

### 4.2 External APIs
| Service | Purpose | Auth |
|---|---|---|
| Google Gemini API | Default LLM provider | `GOOGLE_API_KEY` |
| Anthropic Claude API | Premium LLM provider with tool-use loop | `ANTHROPIC_API_KEY` |
| Groq API | Fast free-tier alternative | `GROQ_API_KEY` |
| LangSmith (optional) | Tracing — Claude path only | `LANGSMITH_API_KEY` |

---

## 5. Tech Stack

| Layer | Choice |
|---|---|
| LLM (default) | Google Gemini 2.5 Flash |
| LLM (premium) | Anthropic Claude Sonnet 4.6 |
| LLM (alt free) | Groq Llama 3.3 70B |
| Backend | FastAPI + Python 3.12 |
| PDF parsing | pdfplumber + PyMuPDF |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 (local) |
| Similarity | numpy (in-memory cosine) |
| Frontend | Next.js 14 + Tailwind + Recharts |
| Tracing | LangSmith (Claude only) |
| Deploy | Railway (API) + Vercel (UI) |
| Eval | pytest + synthetic PDFs |

---

## 6. Project Structure

```
bank-statement-agent/
├── api/
│   ├── main.py               # FastAPI routes
│   ├── agent.py              # Dispatches Claude tool-use vs sequential pipeline
│   ├── llm.py                # NEW: unified provider interface
│   ├── pdf_parser.py
│   ├── vector_store.py       # CHANGED: numpy-based in-memory store
│   ├── schemas.py
│   └── tools/
│       ├── extract.py        # provider kwarg
│       ├── categorise.py     # provider kwarg
│       ├── anomalies.py      # provider kwarg
│       └── summary.py        # provider kwarg
├── ui/
│   ├── app/page.tsx          # CHANGED: provider state
│   └── components/
│       ├── ProviderSelect.tsx   # NEW
│       ├── UploadDropzone.tsx
│       ├── TransactionTable.tsx
│       ├── SpendChart.tsx
│       └── SummaryCard.tsx
├── tests/
├── data/
│   └── category_seeds.json
├── docs/
│   ├── v0.0.1/                # archived snapshot
│   └── v0.0.2/                # current
├── PRD.md                    # symlink/copy of latest
├── SYSTEM_DESIGN.md          # symlink/copy of latest
├── DOCUMENTATION.docx        # latest generated
├── README.md
├── requirements.txt
└── .env.example
```

---

## 7. Why two execution paths?

Tool-use is the canonical way to show "agentic" behaviour: the model picks tools, observes results, and self-corrects. It's the demo-worthy path.

But Gemini and Groq tool-use APIs differ from Claude's. Abstracting all three behind a single tool-use loop would add ~300 lines for marginal benefit, because the canonical call order is already enforced. Honest engineering: use tool-use where it adds value (Claude showcase), use a sequential pipeline where it doesn't.

The README and demo should call out the Claude path explicitly as the "real agentic loop" — that's the portfolio signal.
