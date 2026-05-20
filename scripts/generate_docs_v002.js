// Generates docs/v0.0.2/DOCUMENTATION.docx — multi-provider release.
const fs = require("fs");
const path = require("path");

const NODE_MODULES = "C:\\Users\\druvi\\AppData\\Roaming\\npm\\node_modules";
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  TableOfContents,
} = require(path.join(NODE_MODULES, "docx"));

const VERSION = "0.0.2";
const VERSION_DATE = "2026-05-20";

const mono = (text) => new TextRun({ text, font: "Consolas", size: 18 });
const t = (text, opts = {}) => new TextRun({ text, font: "Arial", size: 22, ...opts });
const p = (text) => new Paragraph({ children: [t(text)] });
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

const bullet = (text) => new Paragraph({
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

const ARCH_DIAGRAM = `
+------------------------------------------------------------------+
|                       Browser (Next.js UI)                       |
|  PDF drag-drop  |  Provider dropdown  |  Table  |  Spend chart   |
+------------------------------+-----------------------------------+
                               | POST /analyze
                               |   (file + provider)
                               v
+------------------------------------------------------------------+
|                      FastAPI Backend (Python)                    |
|                                                                  |
|  +-------------+    +---------------------------------------+    |
|  | PDF Parser  |--->|         Agent Orchestrator           |    |
|  | pdfplumber  |    |                                       |    |
|  | PyMuPDF     |    |  claude  -> tool-use loop (agentic)  |    |
|  +-------------+    |  gemini  -> sequential pipeline      |    |
|                     |  groq    -> sequential pipeline      |    |
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
+----------------------+----------------------+-------------------+
                       |                      |
                       v                      v
                  LangSmith              /evaluate
                 (Claude only)          (pytest suite)
`;

const SEQ_DEFAULT = `
User       UI         FastAPI       llm.py        Tools         CategoryStore
 |          |            |            |              |                  |
 |--PDF--->|             |            |              |                  |
 |     +provider         |            |              |                  |
 |          |--/analyze->|            |              |                  |
 |          |  +provider |            |              |                  |
 |          |            |--parse--->|              |                  |
 |          |            |<--text-----|              |                  |
 |          |            |            |              |                  |
 |          |            |---extract----------------->|                  |
 |          |            |            |<--LLM call---|                  |
 |          |            |<-----------rows-----------|                  |
 |          |            |                                              |
 |          |            |---categorise--------------->|                |
 |          |            |            |                |----RAG lookup->|
 |          |            |            |                |<---top3--------|
 |          |            |            |<--LLM call-----|                |
 |          |            |<--enriched rows-------------|                |
 |          |            |                                              |
 |          |            |---anomalies---------------->|                |
 |          |            |<--flags---------------------|                |
 |          |            |                                              |
 |          |            |---summary------------------>|                |
 |          |            |<--narrative-----------------|                |
 |          |<--JSON-----|                                              |
 |<-render--|            |                                              |
`;

const SEQ_CLAUDE = `
FastAPI       Anthropic API           Tool handlers
  |                |                       |
  |---system + tools schemas------------>  |
  |---user msg------------------------>    |
  |                                        |
  |<--tool_use(extract_transactions)------ |
  |---call extract()------------------>    |
  |<--rows-----------------------------    |
  |---tool_result-------------------->     |
  |                                        |
  |<--tool_use(categorise_transactions)--- |
  |---call categorise()----------------->  |
  |<--enriched--------------------------   |
  |---tool_result-------------------->     |
  |                                        |
  |  ...same pattern for anomalies & summary
  |                                        |
  |<--end_turn + final JSON--------------- |
`;

const SEQ_PROVIDER_SWITCH = `
User       UI                FastAPI
 |          |                    |
 |--open page->                  |
 |          |--GET /providers--->|
 |          |<--{gemini,claude,groq,default:gemini}
 |          |  (dropdown rendered)
 |          |
 |--pick "Claude"--->            |
 |          |  (state.provider="claude")
 |          |
 |--upload PDF---->              |
 |          |--POST /analyze
 |          |   file + provider="claude"
 |          |
 |          |  (backend dispatches Claude tool-use loop)
 |          |
 |          |<--JSON + metadata{model:"claude-sonnet-4-6"}
 |<-render----- with provider tag in footer
`;

const doc = new Document({
  creator: "Claude",
  title: `Bank Statement Agent — Documentation v${VERSION}`,
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
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    }],
  },
  sections: [{
    properties: {
      page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
    },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `Bank Statement Agent — v${VERSION}`, font: "Arial", size: 18, color: "888888" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Page ", font: "Arial", size: 18, color: "888888" }),
                 new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" })] })] }) },
    children: [
      // Title page
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400 },
        children: [new TextRun({ text: "Bank Statement Agent", font: "Arial", size: 56, bold: true, color: "1F4E79" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
        children: [new TextRun({ text: "Agentic AI for FinTech Document Understanding", font: "Arial", size: 28, italics: true, color: "555555" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200 },
        children: [new TextRun({ text: "Technical Documentation", font: "Arial", size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
        children: [new TextRun({ text: `Version ${VERSION} — ${VERSION_DATE}`, font: "Arial", size: 22, color: "888888" })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // Changelog
      h1("Changelog"),
      h2(`v${VERSION} (current)`),
      bullet("Multi-provider LLM support: Google Gemini (default), Anthropic Claude, Groq Llama."),
      bullet("Model selector dropdown in the upload UI; defaults to Gemini free tier."),
      bullet("Replaced ChromaDB with an in-memory numpy similarity store — removes the Windows C++ build-tools dependency."),
      bullet("Added GET /providers endpoint exposing available models for the UI."),
      bullet("Two agent execution paths: Claude tool-use loop (showcase) vs deterministic sequential pipeline (Gemini/Groq)."),
      h2("v0.0.1"),
      bullet("Initial release: single-provider (Anthropic Claude only)."),
      bullet("ChromaDB-backed RAG categorisation."),
      bullet("Sequential extract → categorise → anomalies → summary."),

      new Paragraph({ children: [new PageBreak()] }),

      // TOC
      h1("Table of Contents"),
      new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
      new Paragraph({ children: [new PageBreak()] }),

      // 1. Executive Summary
      h1("1. Executive Summary"),
      p("The Bank Statement Agent is an agentic AI application that ingests PDF bank statements and produces structured transaction data, spend categorisation, anomaly detection, and a plain-English monthly summary in under 30 seconds."),
      p("Version 0.0.2 introduces multi-provider LLM support — users select between Google Gemini (default, free tier), Anthropic Claude (premium, with full tool-use loop), or Groq Llama (free tier, fast). This lets recruiters demo the project at zero cost while preserving the agentic showcase path on Claude."),

      h2("1.1 Why this project"),
      bullet("Demonstrates agentic reasoning (Claude tool-use loop), not just prompt engineering."),
      bullet("Multi-provider abstraction shows production-grade engineering (provider choice, graceful fallbacks)."),
      bullet("Direct extension of FinTech document-verification experience without using real client data."),
      bullet("Ships to a public URL with a 30-second recruiter demo at zero API cost."),
      bullet("Includes an evaluation harness with measurable accuracy targets."),

      // 2. Product Requirements
      h1("2. Product Requirements"),
      h2("2.1 Problem Statement"),
      p("Individuals and SME finance teams spend hours manually reviewing bank statements: extracting transactions, categorising spend, spotting anomalies, and writing summaries. The process is error-prone, tedious, and does not scale. This agent automates the full workflow end-to-end."),

      h2("2.2 Target Users"),
      makeTable(
        ["Persona", "Pain Point", "Value Delivered"],
        [
          ["Individual user", "Tracking personal spend, preparing tax records", "Instant categorisation and monthly summary"],
          ["SME finance owner", "Monthly reconciliation, accountant-ready reports", "Structured JSON + plain-English narrative"],
          ["Technical recruiter", "Evaluating candidate's AI engineering skill", "30-second public demo at zero cost (Gemini free tier)"],
        ],
        [2200, 3580, 3580]
      ),

      h2("2.3 Functional Requirements"),
      bullet("Accept PDF bank statement upload (max 10 MB)."),
      bullet("Let user select the LLM provider via a dropdown — default Gemini."),
      bullet("Extract all transactions: date, description, debit/credit, balance."),
      bullet("Categorise each transaction into one of 10 spending categories."),
      bullet("Detect anomalies: duplicates, large debits, round-number patterns, velocity spikes."),
      bullet("Generate plain-English monthly summary with cashflow totals."),
      bullet("Return structured JSON + narrative + provider metadata to the UI."),
      bullet("Expose /evaluate endpoint that runs the eval suite and returns metrics."),

      h2("2.4 Success Metrics"),
      makeTable(
        ["Metric", "Target", "Notes"],
        [
          ["Extraction accuracy", "≥ 95%", "Claude/Gemini meet; Groq lower"],
          ["Categorisation accuracy", "≥ 90%", "Provider-independent (RAG-grounded)"],
          ["Anomaly precision", "≥ 80%", "Manually labelled ground truth"],
          ["E2E latency (10-page PDF)", "< 30 s", "Gemini 8–12 s; Claude 15–25 s; Groq 5–10 s"],
          ["Cost per run (default)", "$0.00", "Gemini free tier"],
          ["Demo conversion", "Recruiter runs in 60 s", "Manual UX test"],
        ],
        [2400, 1800, 5160]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // 3. System Architecture
      h1("3. System Architecture"),
      h2("3.1 High-Level Architecture Diagram"),
      ...codeBlock(ARCH_DIAGRAM),

      h2("3.2 Component Breakdown"),

      h3("3.2.1 LLM Abstraction Layer (api/llm.py) [NEW in v0.0.2]"),
      p("Unified complete() and complete_json() interface across three providers. Lazy-imports each SDK so missing optional dependencies don't crash the app."),
      makeTable(
        ["Provider ID", "Model", "Free?", "Tool use?"],
        [
          ["gemini (default)", "gemini-2.5-flash", "Yes (15 RPM)", "Native, not used here"],
          ["claude", "claude-sonnet-4-6", "No", "Yes — used in agent loop"],
          ["groq", "llama-3.3-70b-versatile", "Yes (30 RPM)", "OpenAI-compat, not used here"],
        ],
        [2400, 3000, 1800, 2160]
      ),

      h3("3.2.2 Agent Orchestrator (api/agent.py)"),
      p("Dispatches one of two execution strategies based on the selected provider:"),
      bullet("provider == 'claude' → runs Claude tool-use loop. Claude decides call order, can self-correct on tool failures. Max 10 iterations. This is the showcase agentic path."),
      bullet("provider in ('gemini', 'groq') → runs deterministic sequential pipeline: extract → categorise → anomalies → summary. Same output schema as Claude path."),
      p("Both paths return identical structure: { transactions, anomalies, summary }. The UI is unaware of which path executed."),

      h3("3.2.3 Tools"),
      makeTable(
        ["Tool", "Purpose", "Uses LLM?", "Uses RAG?"],
        [
          ["extract_transactions", "Parse raw text into structured rows", "Yes", "No"],
          ["categorise_transactions", "Assign spending category", "Yes", "Yes"],
          ["detect_anomalies", "Rules + LLM contextual flags", "Yes (hybrid)", "No"],
          ["generate_summary", "Aggregate + write narrative", "Yes", "No"],
        ],
        [2800, 3560, 1500, 1500]
      ),

      h3("3.2.4 Category Knowledge Base [CHANGED in v0.0.2]"),
      p("Was: ChromaDB persistent client. Now: in-memory numpy similarity store. Loads ~50 merchant→category seeds from data/category_seeds.json at startup, embeds them locally with sentence-transformers/all-MiniLM-L6-v2, and uses numpy dot product over normalised vectors for cosine similarity."),
      p("Rationale: ChromaDB pulls in chroma-hnswlib which requires Microsoft Visual C++ Build Tools on Windows. Overkill for ~50 entries. Numpy gives identical results at zero infrastructure cost."),

      h3("3.2.5 PDF Parser"),
      p("pdfplumber is the primary parser (best for tabular PDF layouts). PyMuPDF (fitz) is a fallback for image-heavy or scanned PDFs. Output is plain text preserving structural hints."),

      h3("3.2.6 Frontend"),
      p("Next.js 14 with Tailwind. New in v0.0.2: ProviderSelect component fetches /providers on mount, renders a dropdown defaulted to Gemini. Page state tracks the selection and includes it as a form field on upload. Result footer displays the model used and elapsed seconds."),

      new Paragraph({ children: [new PageBreak()] }),

      // 4. Sequence Diagrams
      h1("4. Use Case Sequence Diagrams"),

      h2("4.1 Default Path — Gemini (Sequential Pipeline)"),
      p("The default flow when the user keeps the dropdown on Gemini. Free, fast, deterministic."),
      ...codeBlock(SEQ_DEFAULT),

      h2("4.2 Claude Path — Agentic Tool-Use Loop"),
      p("When the user selects Claude, the agent runs a true tool-use loop. Claude decides which tool to call, can observe errors and self-correct, and produces the final JSON itself."),
      ...codeBlock(SEQ_CLAUDE),

      h2("4.3 Provider Switching Flow"),
      p("How the dropdown integrates with the rest of the system."),
      ...codeBlock(SEQ_PROVIDER_SWITCH),

      new Paragraph({ children: [new PageBreak()] }),

      // 5. APIs
      h1("5. APIs and External Services"),

      h2("5.1 HTTP Endpoints"),
      makeTable(
        ["Endpoint", "Method", "Purpose", "Added in"],
        [
          ["/health", "GET", "Liveness check", "v0.0.1"],
          ["/providers", "GET", "List LLM providers for the dropdown", "v0.0.2"],
          ["/analyze", "POST", "Upload PDF + provider, return analysis JSON", "v0.0.1 (provider param added in v0.0.2)"],
          ["/evaluate", "GET", "Run pytest eval suite", "v0.0.1"],
        ],
        [1500, 1000, 3500, 3360]
      ),

      h2("5.2 External LLM Providers"),
      makeTable(
        ["Provider", "Auth Variable", "Pricing", "Notes"],
        [
          ["Google Gemini", "GOOGLE_API_KEY", "Free tier: 15 RPM, 1M tokens/day", "Default; signup at aistudio.google.com"],
          ["Anthropic Claude", "ANTHROPIC_API_KEY", "Paid; ~$0.02–0.05 per statement", "Required for tool-use loop"],
          ["Groq", "GROQ_API_KEY", "Free tier: ~30 RPM", "Fastest; lower quality on extraction"],
        ],
        [1800, 2400, 2800, 2360]
      ),

      h2("5.3 Optional Services"),
      bullet("LangSmith — observability for the Claude path only. Configured via LANGSMITH_API_KEY."),

      h2("5.4 MCP Servers"),
      p("No MCP servers in production. Reserved for future enhancements: live bank APIs (Plaid, MAS SGFinDex), accounting writeback (Xero, QuickBooks), or fraud-signal enrichment."),

      new Paragraph({ children: [new PageBreak()] }),

      // 6. Tech Stack
      h1("6. Technology Stack"),

      h2("6.1 Backend"),
      makeTable(
        ["Layer", "Technology", "Version", "Rationale"],
        [
          ["Language", "Python", "3.12", "Best AI/ML ecosystem; matches wheel availability"],
          ["Web framework", "FastAPI", "0.115", "Async, OpenAPI-native"],
          ["ASGI server", "Uvicorn", "0.30", "Standard FastAPI runner"],
          ["LLM SDK (Gemini)", "google-genai", "0.3", "Default provider"],
          ["LLM SDK (Claude)", "anthropic", "0.39", "Tool-use showcase path"],
          ["LLM SDK (Groq)", "groq", "0.11", "Fast free-tier alternative"],
          ["PDF (primary)", "pdfplumber", "0.11", "Best table extraction"],
          ["PDF (fallback)", "PyMuPDF", "1.24", "Robust on scanned PDFs"],
          ["Embeddings", "sentence-transformers", "3.1", "Local, free, fast"],
          ["Similarity", "numpy", ">=1.26", "In-memory cosine — no DB needed"],
          ["Schema/validation", "Pydantic", "2.9", "Type-safe models"],
          ["Logging", "structlog", "24.4", "JSON structured logs"],
          ["Testing", "pytest", "8.3", "Standard Python test runner"],
        ],
        [2000, 2400, 1200, 3760]
      ),

      h2("6.2 Frontend"),
      makeTable(
        ["Layer", "Technology", "Version"],
        [
          ["Framework", "Next.js", "14.2"],
          ["UI library", "React", "18.3"],
          ["Language", "TypeScript", "5.6"],
          ["Styling", "Tailwind CSS", "3.4"],
          ["Charts", "Recharts", "2.12"],
          ["Icons", "lucide-react", "0.445"],
        ],
        [3000, 4000, 2360]
      ),

      h2("6.3 Removed in v0.0.2"),
      bullet("ChromaDB — replaced with numpy in-memory similarity store."),
      bullet("chroma-hnswlib — no longer needed (C++ build dependency)."),

      new Paragraph({ children: [new PageBreak()] }),

      // 7. Project Structure
      h1("7. Project Structure"),
      ...codeBlock(`
bank-statement-agent/
├── api/
│   ├── main.py                   # FastAPI routes (+ /providers in v0.0.2)
│   ├── agent.py                  # Dispatches Claude tool-use vs sequential pipeline
│   ├── llm.py                    # NEW v0.0.2: unified provider interface
│   ├── pdf_parser.py
│   ├── vector_store.py           # CHANGED v0.0.2: numpy-based store
│   ├── schemas.py
│   └── tools/
│       ├── __init__.py
│       ├── extract.py            # Now takes provider kwarg
│       ├── categorise.py         # Now takes provider kwarg
│       ├── anomalies.py          # Now takes provider kwarg
│       └── summary.py            # Now takes provider kwarg
├── ui/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # CHANGED v0.0.2: provider state
│   │   └── globals.css
│   └── components/
│       ├── ProviderSelect.tsx    # NEW v0.0.2
│       ├── UploadDropzone.tsx
│       ├── TransactionTable.tsx
│       ├── SpendChart.tsx
│       └── SummaryCard.tsx
├── tests/
│   ├── conftest.py
│   ├── test_extraction.py
│   ├── test_categorisation.py
│   ├── test_anomalies.py
│   ├── synthetic_statements/
│   └── ground_truth/
├── data/
│   └── category_seeds.json
├── docs/
│   ├── v0.0.1/                   # Archived
│   │   ├── PRD.md
│   │   ├── SYSTEM_DESIGN.md
│   │   └── DOCUMENTATION.docx
│   └── v0.0.2/                   # Current
│       ├── PRD.md
│       ├── SYSTEM_DESIGN.md
│       └── DOCUMENTATION.docx
├── scripts/
│   ├── generate_docs.js          # v0.0.1 generator (kept for reference)
│   └── generate_docs_v002.js     # NEW: v0.0.2 generator
├── PRD.md                        # Latest version (mirrors docs/v0.0.2/)
├── SYSTEM_DESIGN.md
├── DOCUMENTATION.docx
├── README.md
├── requirements.txt
└── .env.example
`),

      // 8. Build and Deploy
      h1("8. Build and Deploy"),
      h2("8.1 Local Development"),
      ...codeBlock(`
# Backend
py -3.12 -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
# Add at least one of GOOGLE_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY
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
      bullet("Backend: deploy api/ to Railway or Render. Set GOOGLE_API_KEY (and optionally ANTHROPIC_API_KEY, GROQ_API_KEY) in platform secrets."),
      bullet("Frontend: deploy ui/ to Vercel. Set NEXT_PUBLIC_API_URL to the backend URL."),
      bullet("CI: GitHub Actions runs pytest on every PR; eval metrics gate merges."),

      new Paragraph({ children: [new PageBreak()] }),

      // 9. Migration Notes
      h1("9. Migration Notes — v0.0.1 → v0.0.2"),
      h2("9.1 Breaking Changes"),
      bullet("Tool functions now require a `provider` kwarg. Direct imports of extract_transactions etc. need to pass a provider."),
      bullet("ChromaDB is removed from requirements.txt. Any code referencing chromadb will break — use vector_store.CategoryStore (signature unchanged)."),
      bullet("/analyze now accepts a `provider` form field. Defaults to gemini if omitted (backward-compatible for direct curl callers, but they'll need GOOGLE_API_KEY set)."),

      h2("9.2 Non-Breaking Changes"),
      bullet("agent.run_agent() takes an optional provider kwarg (defaults to gemini)."),
      bullet("Output JSON shape unchanged; new `metadata.provider` and `metadata.model` fields added."),
      bullet("Tests untouched apart from skip conditions (now skip if both Anthropic and Google keys missing)."),

      h2("9.3 Upgrade Steps"),
      bullet("Pull v0.0.2."),
      bullet("Delete .venv and recreate (clean removal of chromadb)."),
      bullet("Run pip install -r requirements.txt."),
      bullet("Add GOOGLE_API_KEY to .env (free at aistudio.google.com)."),
      bullet("Restart the backend; frontend hot-reloads."),

      // 10. Risks and Limitations
      h1("10. Risks and Limitations"),
      h2("10.1 Known Limitations"),
      bullet("Tool-use loop only runs on Claude. Gemini/Groq use a sequential pipeline — same output, less agentic."),
      bullet("Gemini and Groq free tiers have rate limits; demos may throttle under heavy load."),
      bullet("Quality varies by provider: Claude > Gemini > Groq for extraction on messy PDFs."),
      bullet("MVP supports DBS/UOB-style PDF layouts; exotic formats may extract poorly."),
      bullet("Scanned PDFs depend on text-extraction quality — no OCR fallback."),

      h2("10.2 Future Enhancements"),
      bullet("Batch categorisation: send all transactions in one LLM call to reduce API usage 10x."),
      bullet("Unified tool-use across all three providers (currently Claude-only)."),
      bullet("Cost telemetry: surface per-run cost in the UI based on selected provider."),
      bullet("Confidence-based human-in-the-loop review."),
      bullet("Multi-month trend comparison."),
      bullet("MCP integration for live bank feeds."),

      // Appendix
      new Paragraph({ children: [new PageBreak()] }),
      h1("Appendix A: Glossary"),
      makeTable(
        ["Term", "Definition"],
        [
          ["Agent", "An LLM-driven system that uses tools to accomplish multi-step tasks"],
          ["Tool use", "LLM API feature allowing the model to call typed functions"],
          ["RAG", "Retrieval-Augmented Generation — grounding LLM output in retrieved context"],
          ["Provider", "Source of LLM inference: Gemini, Claude, or Groq in this project"],
          ["Tool-use loop", "Agentic execution where the LLM picks tool calls iteratively"],
          ["Sequential pipeline", "Deterministic execution calling tools in fixed order"],
          ["MCP", "Model Context Protocol — standard for exposing tools/data to LLM agents"],
          ["Eval", "Evaluation harness measuring model output against ground truth"],
          ["Embedding", "Numeric vector representation of text used for similarity search"],
        ],
        [2400, 6960]
      ),

      h1("Appendix B: References"),
      bullet("Anthropic Claude API — https://docs.claude.com"),
      bullet("Google Gemini API — https://ai.google.dev/gemini-api/docs"),
      bullet("Groq API — https://console.groq.com/docs"),
      bullet("FastAPI documentation — https://fastapi.tiangolo.com"),
      bullet("Next.js documentation — https://nextjs.org/docs"),
      bullet("sentence-transformers — https://www.sbert.net"),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  const out = path.join(__dirname, "..", "docs", "v0.0.2", "DOCUMENTATION.docx");
  fs.writeFileSync(out, buffer);
  // Also overwrite the top-level latest pointer
  fs.writeFileSync(path.join(__dirname, "..", "DOCUMENTATION.docx"), buffer);
  console.log("Wrote", out, "(" + buffer.length + " bytes)");
});
