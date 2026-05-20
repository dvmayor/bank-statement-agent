// Generates DOCUMENTATION.docx — full project write-up with diagrams.
const fs = require("fs");
const path = require("path");

const NODE_MODULES = "C:\\Users\\druvi\\AppData\\Roaming\\npm\\node_modules";
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  TableOfContents, Bookmark, InternalHyperlink,
} = require(path.join(NODE_MODULES, "docx"));

// ---------- helpers ----------
const mono = (text) => new TextRun({ text, font: "Consolas", size: 18 });
const t = (text, opts = {}) => new TextRun({ text, font: "Arial", size: 22, ...opts });
const p = (text, opts = {}) => new Paragraph({ children: [t(text)], ...opts });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: "Arial", size: 32, bold: true })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: "Arial", size: 26, bold: true })] });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, font: "Arial", size: 22, bold: true })] });

const codeBlock = (text) =>
  text.split("\n").map((line) =>
    new Paragraph({
      children: [mono(line || " ")],
      spacing: { before: 0, after: 0 },
      shading: { fill: "F4F4F4", type: ShadingType.CLEAR },
    })
  );

const bullet = (text) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    children: [t(text)],
  });

const border = { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function makeTable(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        borders: cellBorders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: "1F4E79", type: ShadingType.CLEAR },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", font: "Arial", size: 22 })] })],
      })
    ),
  });
  const bodyRows = rows.map((row) =>
    new TableRow({
      children: row.map((cell, i) =>
        new TableCell({
          borders: cellBorders,
          width: { size: widths[i], type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [t(cell)] })],
        })
      ),
    })
  );
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...bodyRows],
  });
}

// ---------- diagrams ----------
const ARCH_DIAGRAM = `
+--------------------------------------------------------------+
|                      Browser (Next.js UI)                    |
|    PDF drag-drop  |  Transaction table  |  Spend chart       |
+----------------------------+---------------------------------+
                             | POST /analyze  (multipart PDF)
                             v
+--------------------------------------------------------------+
|                    FastAPI Backend (Python)                   |
|                                                              |
|  +-------------+    +-------------------------------------+  |
|  | PDF Parser  |--->|       Agent Orchestrator            |  |
|  | pdfplumber  |    |   Claude claude-sonnet-4-6           |  |
|  | PyMuPDF     |    |   + Tool Use (agentic loop)         |  |
|  +-------------+    +------------------+------------------+  |
|                                        | tool calls          |
|        +---------------+----------------+---------------+    |
|        v               v                v               v    |
|  +-----------+ +--------------+ +--------------+ +---------+ |
|  | extract_  | | categorise_  | | detect_      | | gen_    | |
|  | trans     | | trans        | | anomalies    | | summary | |
|  +-----------+ +------+-------+ +--------------+ +---------+ |
|                       |                                      |
|                       v                                      |
|              +------------------+                            |
|              |    ChromaDB      |  embeddings:               |
|              |  Category KB     |  all-MiniLM-L6-v2          |
|              +------------------+                            |
|                                                              |
|  Output: JSON  { transactions, anomalies, summary }          |
+----------------------+----------------------+----------------+
                       |                      |
                       v                      v
                  LangSmith              /evaluate
                  (tracing)              (eval suite)
`;

const SEQ_HAPPY_PATH = `
User       UI         FastAPI     Claude      ChromaDB
 |          |            |          |             |
 |--PDF---->|            |          |             |
 |          |--/analyze->|          |             |
 |          |            |--parse-->|             |
 |          |            |<--text---|             |
 |          |            |---run agent----------->|
 |          |            |          |             |
 |          |            |          |--extract--->|
 |          |            |          |<--rows------|
 |          |            |          |             |
 |          |            |          |--categorise>|
 |          |            |          |   --query-->|
 |          |            |          |   <--top3---|
 |          |            |          |<--labels----|
 |          |            |          |             |
 |          |            |          |--anomalies->|
 |          |            |          |<--flags-----|
 |          |            |          |             |
 |          |            |          |--summary--->|
 |          |            |          |<--narrative-|
 |          |            |<-result--|             |
 |          |<--JSON-----|          |             |
 |<-render--|            |          |             |
`;

const SEQ_TOOL_FAILURE = `
Claude            extract_tool       Agent loop
  |                    |                  |
  |---call extract---->|                  |
  |                    |--JSON parse fail |
  |<--error result-----|                  |
  |                                       |
  |---retry with hint------------------>  |
  |     "your output was not valid JSON"  |
  |                                       |
  |---call extract (retry)---->           |
  |<--success---                          |
  |                                       |
  |---continue with categorise--->        |
`;

const SEQ_EVAL = `
CI / Developer       pytest         Tools         Claude
     |                 |              |              |
     |--run tests----->|              |              |
     |                 |--load PDFs   |              |
     |                 |--load truth--|              |
     |                 |              |              |
     |                 |--extract---->|--LLM call--->|
     |                 |              |<--rows-------|
     |                 |<--rows-------|              |
     |                 |              |              |
     |                 |--compare to truth           |
     |                 |--compute accuracy           |
     |                 |--compare anomaly precision  |
     |                 |              |              |
     |<--PASS/FAIL-----|              |              |
     |  metrics report                                |
`;

// ---------- document ----------
const doc = new Document({
  creator: "Claude",
  title: "Bank Statement Agent — Documentation",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "2E74B5" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({ alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "Bank Statement Agent — Documentation", font: "Arial", size: 18, color: "888888" })] })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Page ", font: "Arial", size: 18, color: "888888" }),
                       new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" })] })],
        }),
      },
      children: [
        // ---------- Title page ----------
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400 },
          children: [new TextRun({ text: "Bank Statement Agent", font: "Arial", size: 56, bold: true, color: "1F4E79" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
          children: [new TextRun({ text: "Agentic AI for FinTech Document Understanding", font: "Arial", size: 28, italics: true, color: "555555" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200 },
          children: [new TextRun({ text: "Technical Documentation", font: "Arial", size: 24 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
          children: [new TextRun({ text: "Version 0.1 — 2026", font: "Arial", size: 22, color: "888888" })] }),
        new Paragraph({ children: [new PageBreak()] }),

        // ---------- TOC ----------
        h1("Table of Contents"),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // ---------- 1. Executive Summary ----------
        h1("1. Executive Summary"),
        p("The Bank Statement Agent is an agentic AI application that ingests PDF bank statements and produces structured transaction data, spend categorisation, anomaly detection, and a plain-English monthly summary in under 30 seconds."),
        p("Unlike a thin LLM wrapper, the system uses Claude's tool-use to orchestrate a multi-step reasoning loop across four specialised tools. Categorisation is grounded in a RAG-backed merchant knowledge base; anomaly detection layers statistical rules with LLM contextual reasoning; an automated evaluation suite measures extraction and classification accuracy on synthetic statements."),
        h2("1.1 Why this project"),
        bullet("Demonstrates agentic reasoning (multi-tool orchestration), not just prompt engineering."),
        bullet("Directly extends FinTech document-verification experience without using real client data."),
        bullet("Ships to a public URL with a 30-second recruiter demo."),
        bullet("Includes an evaluation harness with measurable accuracy targets — the engineering rigour that distinguishes portfolio work."),

        // ---------- 2. Product Requirements ----------
        h1("2. Product Requirements"),
        h2("2.1 Problem Statement"),
        p("Individuals and SME finance teams spend hours manually reviewing bank statements: extracting transactions, categorising spend, spotting anomalies, and writing summaries. The process is error-prone, tedious, and does not scale. This agent automates the full workflow end-to-end."),

        h2("2.2 Target Users"),
        makeTable(
          ["Persona", "Pain Point", "Value Delivered"],
          [
            ["Individual user", "Tracking personal spend, preparing tax records", "Instant categorisation and monthly summary"],
            ["SME finance owner", "Monthly reconciliation, accountant-ready reports", "Structured JSON + plain-English narrative"],
            ["Technical recruiter", "Evaluating candidate's AI engineering skill", "30-second public demo with measurable evals"],
          ],
          [2200, 3580, 3580]
        ),

        h2("2.3 Functional Requirements (MVP)"),
        bullet("Accept PDF bank statement upload (max 10 MB)."),
        bullet("Extract all transactions: date, description, debit/credit, balance."),
        bullet("Categorise each transaction into one of 10 spending categories."),
        bullet("Detect anomalies: duplicates, large debits, round-number patterns, velocity spikes."),
        bullet("Generate plain-English monthly summary with cashflow totals."),
        bullet("Return structured JSON + narrative to the UI."),
        bullet("Expose /evaluate endpoint that runs the eval suite and returns metrics."),

        h2("2.4 Success Metrics"),
        makeTable(
          ["Metric", "Target", "Measurement Method"],
          [
            ["Transaction extraction accuracy", "≥ 95%", "Match against ground-truth JSON for 10 synthetic statements"],
            ["Categorisation accuracy", "≥ 90%", "Match against labelled test set"],
            ["Anomaly precision", "≥ 80%", "Manually labelled anomalies vs. detected"],
            ["End-to-end latency (10-page PDF)", "< 30 seconds", "Wall-clock from upload to response"],
            ["Demo conversion", "Recruiter runs unaided in 60s", "Manual UX test"],
          ],
          [3000, 1800, 4560]
        ),

        h2("2.5 Non-Goals"),
        bullet("No real bank API integration (Plaid, MAS SGFinDex) — out of scope for portfolio."),
        bullet("No user accounts, auth, or persistent storage — stateless per-request."),
        bullet("No fine-tuning — prompt engineering and RAG only."),
        bullet("No multi-bank-format support in MVP — DBS/UOB-style layouts first."),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- 3. System Architecture ----------
        h1("3. System Architecture"),
        h2("3.1 High-Level Architecture Diagram"),
        ...codeBlock(ARCH_DIAGRAM),

        h2("3.2 Component Breakdown"),

        h3("3.2.1 Frontend (Next.js)"),
        p("Single-page Next.js 14 app with Tailwind CSS. Three result panels: transaction table, spend donut chart, summary card. Anomalies rendered as inline row highlights with tooltip reasoning. Communicates with backend via POST /analyze (multipart upload)."),

        h3("3.2.2 FastAPI Backend"),
        p("Python 3.12 FastAPI application. Receives PDF, extracts text, invokes the agent orchestrator, returns structured JSON. Stateless — no persistence beyond the ChromaDB embedded vector store."),

        h3("3.2.3 PDF Parser"),
        p("pdfplumber is the primary parser (best for tabular PDF layouts). PyMuPDF (fitz) is a fallback for image-heavy or scanned PDFs. Output is plain text preserving structural hints."),

        h3("3.2.4 Agent Orchestrator"),
        p("Runs a Claude tool-use loop. The agent is given four tools and a system prompt instructing the canonical call sequence: extract → categorise → detect_anomalies → generate_summary. The loop terminates when Claude issues end_turn, with a safety cap of 10 iterations."),

        h3("3.2.5 Tools"),
        makeTable(
          ["Tool", "Purpose", "Calls Claude?", "Calls RAG?"],
          [
            ["extract_transactions", "Parse raw text into structured rows", "Yes", "No"],
            ["categorise_transactions", "Assign spending categories", "Yes", "Yes"],
            ["detect_anomalies", "Statistical + LLM anomaly detection", "Yes (hybrid)", "No"],
            ["generate_summary", "Aggregate + write narrative", "Yes", "No"],
          ],
          [2800, 3560, 1500, 1500]
        ),

        h3("3.2.6 Category Knowledge Base (RAG)"),
        p("ChromaDB persistent client storing ~500 merchant → category mappings. Embeddings produced locally via sentence-transformers (all-MiniLM-L6-v2) — no API costs. On categorisation, the top-3 nearest merchants are retrieved and passed to Claude as candidate evidence."),

        h3("3.2.7 Observability"),
        p("LangSmith provides end-to-end tracing of agent runs: which tools were called, in what order, token usage, latency per call. Structlog provides JSON-formatted application logs."),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- 4. Use Case Sequence Diagrams ----------
        h1("4. Use Case Sequence Diagrams"),

        h2("4.1 Happy Path — PDF Upload to Summary"),
        p("The dominant flow: user uploads a clean PDF, the agent calls all four tools in order, returns structured results."),
        ...codeBlock(SEQ_HAPPY_PATH),

        h2("4.2 Tool Failure and Retry"),
        p("When a tool call returns malformed output (e.g. invalid JSON from extract_transactions), the agent observes the error in its tool_result message and self-corrects on the next iteration. The loop cap prevents infinite retries."),
        ...codeBlock(SEQ_TOOL_FAILURE),

        h2("4.3 Evaluation Run"),
        p("CI or a developer triggers pytest. Each synthetic statement is run through the extraction and categorisation tools, results are compared against ground-truth JSON, and metrics are reported."),
        ...codeBlock(SEQ_EVAL),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- 5. APIs and External Services ----------
        h1("5. APIs and External Services"),

        h2("5.1 Anthropic Claude API"),
        makeTable(
          ["Property", "Value"],
          [
            ["Provider", "Anthropic"],
            ["Model", "claude-sonnet-4-6"],
            ["SDK", "anthropic (Python, v0.39+)"],
            ["Features used", "Tool use (function calling), system prompts, JSON mode"],
            ["Auth", "ANTHROPIC_API_KEY env var"],
            ["Rate limits", "Tier-dependent; agent uses ~5-8 calls per statement"],
            ["Cost estimate", "~$0.02–0.05 per statement at current Sonnet pricing"],
          ],
          [3000, 6360]
        ),

        h2("5.2 LangSmith"),
        p("Hosted observability platform for LLM applications. Captures every Claude API call, tool invocation, latency, and token usage in a searchable trace UI. Configured via LANGSMITH_API_KEY environment variable; the anthropic SDK auto-emits traces when the variable is present."),

        h2("5.3 Internal HTTP API"),
        p("FastAPI exposes the following endpoints for the frontend and evaluation tooling:"),
        makeTable(
          ["Endpoint", "Method", "Purpose", "Auth"],
          [
            ["/health", "GET", "Liveness check", "None"],
            ["/analyze", "POST", "Upload PDF, return analysis JSON", "None (rate-limited)"],
            ["/evaluate", "GET", "Run pytest eval suite, return metrics", "None (private in prod)"],
          ],
          [1800, 1200, 4860, 1500]
        ),

        h2("5.4 MCP (Model Context Protocol) Servers"),
        p("This project does not currently use MCP servers in production. MCP is reserved for future enhancement scenarios where the agent might need live access to external systems:"),
        bullet("MCP server for a real bank API (Plaid, MAS SGFinDex) — would let the agent fetch live transactions instead of parsing PDFs."),
        bullet("MCP server for an accounting system (Xero, QuickBooks) — would let the agent post categorised entries directly."),
        bullet("MCP server for a fraud-signal database — would let the agent enrich anomaly detection with external risk data."),
        p("During development, Claude Code itself uses MCP servers (Claude Preview, ccd) to render and verify the UI in a browser."),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- 6. Technologies ----------
        h1("6. Technology Stack"),

        h2("6.1 Backend"),
        makeTable(
          ["Layer", "Technology", "Version", "Rationale"],
          [
            ["Language", "Python", "3.12", "Best AI/ML ecosystem"],
            ["Web framework", "FastAPI", "0.115", "Async, OpenAPI-native, fast"],
            ["ASGI server", "Uvicorn", "0.30", "Standard FastAPI runner"],
            ["LLM SDK", "anthropic", "0.39", "Official Claude SDK with tool use"],
            ["PDF (primary)", "pdfplumber", "0.11", "Best table extraction"],
            ["PDF (fallback)", "PyMuPDF", "1.24", "Robust on scanned PDFs"],
            ["Vector store", "ChromaDB", "0.5", "Zero-infra, embedded"],
            ["Embeddings", "sentence-transformers", "3.1", "Local, free, fast"],
            ["Schema/validation", "Pydantic", "2.9", "Type-safe models"],
            ["Logging", "structlog", "24.4", "JSON structured logs"],
            ["Testing", "pytest", "8.3", "Standard Python test runner"],
            ["Tracing", "langsmith", "0.1", "LLM-specific observability"],
          ],
          [2000, 2400, 1200, 3760]
        ),

        h2("6.2 Frontend"),
        makeTable(
          ["Layer", "Technology", "Version", "Rationale"],
          [
            ["Framework", "Next.js", "14.2", "App router, SSR, easy Vercel deploy"],
            ["UI library", "React", "18.3", "Standard"],
            ["Language", "TypeScript", "5.6", "Type safety on API contracts"],
            ["Styling", "Tailwind CSS", "3.4", "Fast UI iteration"],
            ["Charts", "Recharts", "2.12", "Pie chart for spend breakdown"],
            ["Icons", "lucide-react", "0.445", "Clean modern icon set"],
          ],
          [2000, 2400, 1200, 3760]
        ),

        h2("6.3 Infrastructure & Deployment"),
        makeTable(
          ["Concern", "Choice", "Rationale"],
          [
            ["Backend hosting", "Railway / Render", "Free tier, simple Python deploy"],
            ["Frontend hosting", "Vercel", "Native Next.js host, instant deploys"],
            ["CI", "GitHub Actions", "Free for public repos, runs eval suite"],
            ["Secrets", ".env / platform vars", "ANTHROPIC_API_KEY, LANGSMITH_API_KEY"],
            ["Observability", "LangSmith + structlog", "Traces + structured logs"],
          ],
          [2400, 2400, 4560]
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- 7. Project Structure ----------
        h1("7. Project Structure"),
        ...codeBlock(`
bank-statement-agent/
├── api/                          # Python backend
│   ├── __init__.py
│   ├── main.py                   # FastAPI app, routes
│   ├── agent.py                  # Agent orchestrator loop
│   ├── pdf_parser.py             # pdfplumber/PyMuPDF wrapper
│   ├── vector_store.py           # ChromaDB category KB
│   ├── schemas.py                # Pydantic models
│   └── tools/
│       ├── __init__.py           # Tool registry
│       ├── extract.py            # extract_transactions
│       ├── categorise.py         # categorise_transactions (+ RAG)
│       ├── anomalies.py          # detect_anomalies (rules + LLM)
│       └── summary.py            # generate_summary
├── ui/                           # Next.js frontend
│   ├── package.json
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Main upload + results page
│   │   └── globals.css
│   └── components/
│       ├── UploadDropzone.tsx
│       ├── TransactionTable.tsx
│       ├── SpendChart.tsx
│       └── SummaryCard.tsx
├── tests/                        # Eval suite
│   ├── conftest.py
│   ├── test_extraction.py
│   ├── test_categorisation.py
│   ├── test_anomalies.py
│   ├── synthetic_statements/     # 10 fake PDFs
│   └── ground_truth/             # expected JSON
├── data/
│   └── category_seeds.json       # Merchant -> category mappings
├── scripts/
│   └── generate_docs.js          # Generates this Word doc
├── PRD.md
├── SYSTEM_DESIGN.md
├── README.md
├── requirements.txt
├── .env.example
└── .gitignore
`),

        // ---------- 8. Build and Deploy ----------
        h1("8. Build and Deploy"),

        h2("8.1 Local Development"),
        ...codeBlock(`
# Backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env       # then add ANTHROPIC_API_KEY
uvicorn api.main:app --reload

# Frontend (separate terminal)
cd ui
npm install
npm run dev
`),

        h2("8.2 Running Evaluations"),
        ...codeBlock(`
# Run full eval suite
pytest tests/ --tb=short

# Or via the API
curl http://localhost:8000/evaluate
`),

        h2("8.3 Deployment"),
        bullet("Backend: deploy api/ folder to Railway or Render. Set ANTHROPIC_API_KEY and LANGSMITH_API_KEY in platform secrets."),
        bullet("Frontend: deploy ui/ folder to Vercel. Set NEXT_PUBLIC_API_URL to the Railway/Render URL."),
        bullet("CI: GitHub Actions workflow runs pytest on every PR. Eval metrics gate merges to main."),

        new Paragraph({ children: [new PageBreak()] }),

        // ---------- 9. Evaluation Strategy ----------
        h1("9. Evaluation Strategy"),
        p("The evaluation framework is what distinguishes this project from a weekend prototype. Every prompt change can be measured against a fixed test set before merging."),

        h2("9.1 Test Corpus"),
        bullet("10 synthetic PDF statements modelled on DBS and UOB formats."),
        bullet("Hand-labelled ground-truth JSON: transactions, categories, and expected anomalies."),
        bullet("Edge cases: scanned/low-quality PDFs, multi-currency, missing balance column, weekend dates."),

        h2("9.2 Metrics"),
        makeTable(
          ["Metric", "Definition", "Target"],
          [
            ["Extraction recall", "Fraction of ground-truth transactions found", "≥ 95%"],
            ["Amount accuracy", "Fraction of matched transactions with correct amounts", "≥ 95%"],
            ["Categorisation accuracy", "Fraction of correct category labels", "≥ 90%"],
            ["Anomaly precision", "True positives / all flagged", "≥ 80%"],
            ["Anomaly recall", "True positives / all real anomalies", "≥ 70%"],
            ["Latency p95", "End-to-end response time at 95th percentile", "< 30s"],
          ],
          [2800, 4800, 1760]
        ),

        h2("9.3 Continuous Evaluation"),
        p("The /evaluate endpoint runs the eval suite on demand and returns a metric summary. A GitHub Actions workflow runs the same suite on every pull request — prompt changes that regress metrics block the merge."),

        // ---------- 10. Risks and Limitations ----------
        h1("10. Risks and Limitations"),
        h2("10.1 Known Limitations"),
        bullet("MVP supports DBS/UOB-style PDF layouts; exotic formats may extract poorly."),
        bullet("Scanned PDFs depend on OCR quality — PyMuPDF fallback is text-based, not OCR."),
        bullet("Cost scales linearly with statement size (one Claude call per categorisation in v1)."),
        bullet("No PII redaction — demo intended for synthetic statements only."),

        h2("10.2 Future Enhancements"),
        bullet("Batch categorisation: send all transactions in one Claude call to reduce cost ~10x."),
        bullet("Confidence-based human-in-the-loop: only flag low-confidence rows for review."),
        bullet("Multi-month trend comparison across uploaded statements."),
        bullet("Export to CSV/Excel for accountant workflows."),
        bullet("MCP integration for live bank feeds and accounting-system writeback."),

        // ---------- Appendix ----------
        new Paragraph({ children: [new PageBreak()] }),
        h1("Appendix A: Glossary"),
        makeTable(
          ["Term", "Definition"],
          [
            ["Agent", "An LLM-driven system that uses tools to accomplish multi-step tasks"],
            ["Tool use", "Claude API feature allowing the model to call typed functions"],
            ["RAG", "Retrieval-Augmented Generation — grounding LLM output in retrieved context"],
            ["MCP", "Model Context Protocol — standard for exposing tools/data to LLM agents"],
            ["Eval", "Evaluation harness measuring model output against ground truth"],
            ["Embedding", "Numeric vector representation of text used for similarity search"],
            ["DXA", "Document XML unit; 1440 DXA = 1 inch"],
          ],
          [2400, 6960]
        ),

        h1("Appendix B: References"),
        bullet("Anthropic Claude API — https://docs.claude.com"),
        bullet("Anthropic tool use guide — https://docs.claude.com/en/docs/build-with-claude/tool-use"),
        bullet("FastAPI documentation — https://fastapi.tiangolo.com"),
        bullet("ChromaDB documentation — https://docs.trychroma.com"),
        bullet("Next.js documentation — https://nextjs.org/docs"),
        bullet("LangSmith documentation — https://docs.smith.langchain.com"),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  const out = path.join(__dirname, "..", "DOCUMENTATION.docx");
  fs.writeFileSync(out, buffer);
  console.log("Wrote", out, "(" + buffer.length + " bytes)");
});
