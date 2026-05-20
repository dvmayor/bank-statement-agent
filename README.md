# Bank Statement Agent

Upload a PDF bank statement → get structured transactions, spend categorisation, anomaly detection, and a plain-English monthly summary in under 30 seconds.

An agentic Claude application demonstrating multi-step tool use, RAG-based categorisation, rule + LLM hybrid anomaly detection, and an eval framework on synthetic statements.

## Quick start

### Backend
```bash
cd bank-statement-agent
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # then add your ANTHROPIC_API_KEY
uvicorn api.main:app --reload
```

API runs on http://localhost:8000. Health check: `GET /health`.

### Frontend
```bash
cd ui
npm install
npm run dev
```

UI runs on http://localhost:3000.

### Try it
1. Open http://localhost:3000
2. Drop a PDF bank statement
3. Wait 20-30s while the agent runs (extract → categorise → detect anomalies → summarise)
4. View transactions, spend chart, anomalies, summary

### Run evals
```bash
pytest tests/ --tb=short
# or via the API
curl http://localhost:8000/evaluate
```

## Architecture

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for full architecture, [PRD.md](PRD.md) for requirements, and [DOCUMENTATION.docx](DOCUMENTATION.docx) for the diagrams and full write-up.

## License

MIT
