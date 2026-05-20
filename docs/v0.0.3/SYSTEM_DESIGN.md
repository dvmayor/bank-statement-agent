# System Design — Bank Statement Extraction Agent

**Version:** 0.0.3
**Date:** 2026-05-20

## Changelog

### v0.0.3
- New `_run_react_loop()` in `api/agent.py` — provider-agnostic ReAct strategy.
- Renamed legacy Claude path to `_run_claude_native_agent()`.
- New `mode` parameter on `/analyze` and `run_agent()` ("react" default, "native" opt-in).
- `ModeSelect` React component; UI passes `mode` alongside `provider`.
- All three providers now run the same agentic loop.

### v0.0.2
- Unified LLM client (`api/llm.py`), multi-provider support.
- ChromaDB → numpy similarity store.

### v0.0.1
- Initial Claude-only agent.

---

## 1. High-Level Architecture

```
+------------------------------------------------------------------+
|                       Browser (Next.js UI)                       |
|  PDF drag-drop | Provider dropdown | Mode dropdown | Results     |
+------------------------------+-----------------------------------+
                               | POST /analyze
                               |   multipart: file + provider + mode
                               v
+------------------------------------------------------------------+
|                      FastAPI Backend (Python)                    |
|                                                                  |
|  +-------------+    +---------------------------------------+    |
|  | PDF Parser  |--->|        Agent Orchestrator             |    |
|  | pdfplumber  |    |                                       |    |
|  | PyMuPDF     |    |  mode == "react" (default):           |    |
|  +-------------+    |    ReAct loop — works with any        |    |
|                     |    provider via prompting             |    |
|                     |                                       |    |
|                     |  mode == "native" (Claude only):      |    |
|                     |    Anthropic tool_use API             |    |
|                     +-------+----------+----------+--------+    |
|                             |          |          |             |
|                             v          v          v             |
|                       +---------------------------------+       |
|                       |        api/llm.py               |       |
|                       |  unified complete() interface   |       |
|                       |   - google-genai (Gemini)       |       |
|                       |   - anthropic (Claude)          |       |
|                       |   - groq (Llama 3.3)            |       |
|                       +-------------+-------------------+       |
|                                     |                           |
|                                     v                           |
|                       +-----------------------------+           |
|                       |       api/tools/*           |           |
|                       |   extract    categorise     |           |
|                       |   anomalies  summary        |           |
|                       +------------+----------------+           |
|                                    |                            |
|                                    v                            |
|                     +-----------------------------+             |
|                     | InMemory CategoryStore      |             |
|                     | numpy cosine similarity     |             |
|                     | sentence-transformers       |             |
|                     +-----------------------------+             |
|                                                                 |
|  Output JSON: { transactions, anomalies, summary, metadata }    |
+------------------------------------------------------------------+
```

---

## 2. The ReAct Loop (new in v0.0.3)

ReAct stands for **Reasoning + Acting**. On each turn the LLM produces a small JSON
object containing its `thought` and the next `action` (`call_tool` or `finish`).
Our orchestrator parses that JSON, executes the requested tool, appends the result
as an `OBSERVATION`, then asks the LLM again. Loop until the LLM emits `{"action": "finish"}`
or we hit the iteration cap.

### Why ReAct instead of native tool-use for every provider?
- **Portability:** one loop runs against Gemini, Claude, and Groq with no per-provider code.
- **Transparency:** every step is plain text in the prompt; you can read the agent's reasoning
  trail in logs without provider-specific tracing.
- **Honest agency:** the LLM genuinely decides the next step. Errors feed back; the model
  can retry. This is the same pattern that powers LangChain agents, AutoGen, ReAct papers.
- **Side-by-side comparison:** keeping Claude's native tool-use as a toggle lets reviewers see
  both patterns and the tradeoffs.

### Loop pseudocode
```
state = {transactions: [], anomalies: [], summary: {}, raw_text: ...}
history = []

for iteration in range(MAX_ITERATIONS):
    prompt = build_prompt(raw_text, history)
    response = llm.complete(prompt, system=REACT_SYSTEM, provider=provider)
    action = json.loads(response)

    if action == "finish":
        return state

    if action == "call_tool":
        observation = execute_tool(action.tool, state, provider)
        history.append((action, observation))
```

### Tool inputs are implicit
The ReAct loop maintains shared state (`state` dict). Tools don't receive transaction lists
as arguments — they read from state and write back. The LLM only needs to decide *which*
tool to call next, not how to wire data between them. This keeps prompts compact.

---

## 3. Component Breakdown

### 3.1 LLM Abstraction Layer — `api/llm.py`
Same as v0.0.2. Unified `complete(prompt, system, max_tokens, provider)` returns raw text.
Lazy SDK imports; supports gemini / claude / groq.

### 3.2 Tools
Same four tools as v0.0.2: `extract_transactions`, `categorise_transactions`,
`detect_anomalies`, `generate_summary`. Each accepts a `provider` kwarg and uses
`api/llm.py` internally.

### 3.3 Agent Orchestrator — `api/agent.py`
Now exposes two execution strategies:

| Mode | Function | How it works | Providers |
|---|---|---|---|
| `react` (default) | `_run_react_loop` | LLM emits JSON actions per turn; orchestrator executes tools, feeds back observations | gemini, claude, groq |
| `native` | `_run_claude_native_agent` | Uses Anthropic's `tool_use` content blocks | claude only (others auto-fall-back to `react`) |

Both paths produce identical output: `{transactions, anomalies, summary}`.

### 3.4 Category Knowledge Base
Unchanged from v0.0.2. In-memory numpy + sentence-transformers.

### 3.5 Frontend
- **New:** `ModeSelect` component — dropdown for `react` / `native`. Disables `native`
  unless provider is Claude. When user switches provider away from Claude while `native`
  is selected, the page automatically resets `mode` to `react`.
- Page state tracks both `provider` and `mode`; both sent on upload.
- Footer chip shows `model · mode · elapsed_seconds`.

---

## 4. Sequence Diagrams

### 4.1 ReAct loop (default, any provider)
```
User       UI        FastAPI       Agent loop     llm.py        Tools
 |          |           |              |             |             |
 |--PDF---->|           |              |             |             |
 |          |--/analyze>|              |             |             |
 |          |  +provider+mode          |             |             |
 |          |           |--parse PDF-->|             |             |
 |          |           |<--raw text---|             |             |
 |          |           |--start loop->|             |             |
 |          |           |              |             |             |
 |          |           |              |--complete-->|             |
 |          |           |              |<-{call_tool:extract}-     |
 |          |           |              |--execute--->extract       |
 |          |           |              |<--observation------       |
 |          |           |              |             |             |
 |          |           |              |--complete-->|             |
 |          |           |              |<-{call_tool:categorise}-  |
 |          |           |              |--execute--->categorise    |
 |          |           |              |<--observation------       |
 |          |           |              |             |             |
 |          |           |              |--complete-->|             |
 |          |           |              |<-{call_tool:anomalies}-   |
 |          |           |              |--execute--->anomalies     |
 |          |           |              |<--observation------       |
 |          |           |              |             |             |
 |          |           |              |--complete-->|             |
 |          |           |              |<-{call_tool:summary}-     |
 |          |           |              |--execute--->summary       |
 |          |           |              |<--observation------       |
 |          |           |              |             |             |
 |          |           |              |--complete-->|             |
 |          |           |              |<-{finish}---|             |
 |          |           |<--return state              |             |
 |          |<--JSON----|                                           |
 |<-render--|           |                                           |
```

### 4.2 Native Claude tool-use (opt-in)
```
FastAPI       Anthropic API           Tool handlers
  |                |                       |
  |---system + tools schemas-----------> |
  |---user msg-------------------------> |
  |                                       |
  |<--tool_use(extract_transactions)----- |
  |---call extract()------------------>   |
  |<--rows---------------------------     |
  |---tool_result-------------------->    |
  |                                       |
  |  ...same for all four tools...        |
  |                                       |
  |<--end_turn + final JSON--------------|
```

### 4.3 Provider + mode switching
```
User       UI                FastAPI
 |          |                    |
 |--open page->                  |
 |          |--GET /providers--->|
 |          |<--{providers,modes,defaults}
 |          |  (dropdowns populated)
 |          |
 |--pick Claude--->              |
 |--pick "Native"-->             |
 |          |
 |--upload PDF---->              |
 |          |--POST /analyze
 |          |   file + provider="claude" + mode="native"
 |          |
 |          |  (backend dispatches Claude native path)
 |          |<--JSON + metadata{provider, model, mode}
 |<-render----- footer shows "claude-sonnet-4-6 · native · 18.4s"
```

---

## 5. APIs

### 5.1 HTTP Endpoints
| Endpoint | Method | Purpose | Added in |
|---|---|---|---|
| `/health` | GET | Liveness check | v0.0.1 |
| `/providers` | GET | List providers + modes | v0.0.2 (modes added in v0.0.3) |
| `/analyze` | POST | Upload PDF + provider + mode | v0.0.1 (mode param in v0.0.3) |
| `/evaluate` | GET | Run pytest eval suite | v0.0.1 |

### 5.2 External LLM Providers
| Provider | Auth | Pricing | Tool-use? |
|---|---|---|---|
| Google Gemini | `GOOGLE_API_KEY` | Free tier | ReAct only (our impl) |
| Anthropic Claude | `ANTHROPIC_API_KEY` | Paid | ReAct + Native |
| Groq | `GROQ_API_KEY` | Free tier | ReAct only |

---

## 6. Tech Stack

| Layer | Choice |
|---|---|
| LLM (default) | Google Gemini 2.5 Flash |
| LLM (premium) | Anthropic Claude Sonnet 4.6 |
| LLM (alt) | Groq Llama 3.3 70B |
| Backend | FastAPI + Python 3.12 |
| PDF | pdfplumber + PyMuPDF |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 |
| Similarity | numpy in-memory cosine |
| Frontend | Next.js 14 + Tailwind + Recharts |
| Deploy | Railway + Vercel |
| Eval | pytest + synthetic PDFs |

---

## 7. Project Structure (delta)

```
api/
  agent.py                # _run_react_loop (new)
                          # _run_claude_native_agent (renamed)
                          # run_agent(raw_text, provider, mode)
  main.py                 # mode form field added
ui/
  components/
    ModeSelect.tsx        # NEW
  app/page.tsx            # mode state + handler
docs/
  v0.0.1/, v0.0.2/, v0.0.3/   # snapshots
```

---

## 8. Why this is the right pattern

In v0.0.2 only the Claude path was truly agentic — Gemini and Groq ran a hard-coded
Python pipeline. That weakened the portfolio narrative: "multi-provider" but only one
provider was actually doing agent work.

v0.0.3 fixes this with one loop that works across all three providers. The same JSON-action
protocol drives Gemini, Claude, and Groq. Adding a fourth provider tomorrow (OpenAI, Mistral)
takes ~20 lines in `api/llm.py` and zero changes to the agent.

The native Claude mode is kept as a toggle so reviewers can see both patterns and compare
their tradeoffs (token cost, latency, robustness on malformed output).
