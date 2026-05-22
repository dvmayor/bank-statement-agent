# Bank Statement AI Agent

> **Live demo:** [bank-statement-agent.davidreuelvillamayor.com](https://bank-statement-agent.davidreuelvillamayor.com)

An agentic AI app that parses your bank statement, categorises your spending, flags anomalies, and gives a plain-English monthly summary. The ReAct loop analysis streams in real time so you can watch the model's reasoning as it works. Supports multiple LLM providers. Just upload a PDF.

**Outcomes:** Multi-model Support · Real-time Streaming

**Stack:** Agentic AI · RAG · ReAct Loop · Prompt Engineering · Python · FastAPI · Next.js · Tailwind CSS

---

## Quick start

### Backend
```bash
python -m venv .venv
.venv\Scripts\activate            # Windows
source .venv/bin/activate         # macOS/Linux
pip install -r requirements.txt
cp .env.example .env              # add your API keys
uvicorn api.main:app --reload --port 8000
```

API runs on http://localhost:8000

### Frontend
```bash
cd ui
npm install
npm run dev
```

UI runs on http://localhost:3001

### Try it
1. Open http://localhost:3001
2. Drop a PDF bank statement (sample statements available in the UI)
3. Pick a model — Groq (recommended), Gemini, or Cerebras
4. Watch the ReAct agent stream its reasoning in real time
5. View transactions, spend chart, anomaly flags, and a 3-section summary

---

## Features

- **ReAct agent loop** — think → act → observe, with `validate_extraction` quality gate
- **Multi-provider LLM** — Groq (Llama 3.3 70B), Google (Gemma 4 26B/31B), Cerebras (Qwen 3 235B) with API key cycling on rate limits
- **RAG categorisation** — sentence-transformers + cosine similarity matches merchants to spending categories
- **Rule-based anomaly detection** — duplicate charges, large debits, impossible travel (AU + overseas same day), weekly recurring exclusion
- **SSE streaming** — real-time agent log via Server-Sent Events
- **Structured summary** — 3 labelled sections: Cash flow, Anomalies, Advice

---

## Architecture

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for full architecture and [PRD.md](PRD.md) for requirements.

## License

MIT
