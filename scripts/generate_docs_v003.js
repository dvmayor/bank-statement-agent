// Generates docs/v0.0.3/DOCUMENTATION.docx — ReAct loop release.
const fs = require("fs");
const path = require("path");

const NODE_MODULES = "C:\\Users\\druvi\\AppData\\Roaming\\npm\\node_modules";
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  TableOfContents, ImageRun,
} = require(path.join(NODE_MODULES, "docx"));

const VERSION = "0.0.3";
const VERSION_DATE = "2026-05-20";

// Read PNG dimensions from IHDR chunk (offsets 16-23 in standard PNG files).
function pngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), buffer: buf };
}

// Build an ImageRun paragraph scaled to fit MAX_WIDTH px wide while preserving aspect ratio.
const MAX_IMG_WIDTH = 600;
function diagramImage(relativePath, caption) {
  const fullPath = path.join(__dirname, "..", relativePath);
  const { width, height, buffer } = pngDimensions(fullPath);
  const scale = Math.min(1, MAX_IMG_WIDTH / width);
  const renderWidth = Math.round(width * scale);
  const renderHeight = Math.round(height * scale);
  const paragraphs = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      children: [new ImageRun({
        type: "png",
        data: buffer,
        transformation: { width: renderWidth, height: renderHeight },
        altText: { title: caption, description: caption, name: caption },
      })],
    }),
  ];
  if (caption) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: caption, font: "Arial", size: 18, italics: true, color: "666666" })],
    }));
  }
  return paragraphs;
}

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
|  +-------------+    |    provider-agnostic ReAct loop       |    |
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
`;

const REACT_PSEUDOCODE = `
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
`;

const SEQ_REACT = `
User       UI        FastAPI      Agent loop    llm.py       Tools
 |          |           |              |           |            |
 |--PDF---->|           |              |           |            |
 |          |--/analyze>|              |           |            |
 |          | +prov+mode|              |           |            |
 |          |           |--parse---->|              |            |
 |          |           |<--text-----|              |            |
 |          |           |--start loop->            |            |
 |          |           |              |           |            |
 |          |           |              |--complete>|            |
 |          |           |              |<{call_tool:extract}--  |
 |          |           |              |--exec---->extract      |
 |          |           |              |<--obs------            |
 |          |           |              |           |            |
 |          |           |              |--complete>|            |
 |          |           |              |<{call_tool:categorise}-|
 |          |           |              |--exec---->categorise   |
 |          |           |              |<--obs------            |
 |          |           |              |           |            |
 |          |           |              |--complete>|            |
 |          |           |              |<{call_tool:anomalies}--|
 |          |           |              |--exec---->anomalies    |
 |          |           |              |<--obs------            |
 |          |           |              |           |            |
 |          |           |              |--complete>|            |
 |          |           |              |<{call_tool:summary}----|
 |          |           |              |--exec---->summary      |
 |          |           |              |<--obs------            |
 |          |           |              |           |            |
 |          |           |              |--complete>|            |
 |          |           |              |<{finish}--|            |
 |          |           |<--state----|              |            |
 |          |<--JSON----|              |           |            |
 |<-render--|           |              |           |            |
`;

const SEQ_NATIVE = `
FastAPI       Anthropic API           Tool handlers
  |                |                       |
  |--system+tools schemas-------------->  |
  |--user msg------------------------->   |
  |                                       |
  |<--tool_use(extract_transactions)----  |
  |--call extract()------------------>    |
  |<--rows----------------------------    |
  |--tool_result-------------------->     |
  |                                       |
  |<--tool_use(categorise_transactions)-- |
  |--call categorise()--------------->    |
  |<--enriched------------------------    |
  |--tool_result-------------------->     |
  |                                       |
  |  ...same for anomalies & summary...   |
  |                                       |
  |<--end_turn + final JSON------------   |
`;

const SEQ_MODE_SWITCH = `
User       UI                FastAPI
 |          |                    |
 |--open page->                  |
 |          |--GET /providers--->|
 |          |<--{providers,modes,defaults}
 |          |  (two dropdowns populated)
 |          |
 |--pick Claude-->               |
 |--pick "Native"-->             |
 |          |
 |--upload PDF---->              |
 |          |--POST /analyze
 |          |   file + provider="claude" + mode="native"
 |          |
 |          |  (backend dispatches Claude native tool_use path)
 |          |<--JSON + metadata{provider, model, mode}
 |<-render----- footer: "claude-sonnet-4-6 · native · 18.4s"
`;

const REACT_PROMPT_SAMPLE = `
SYSTEM:
You are a bank statement analysis agent.

Available tools (call each exactly once, in order):
  1. extract_transactions
  2. categorise_transactions
  3. detect_anomalies
  4. generate_summary

On each turn, respond with EXACTLY ONE JSON object:
  - To call a tool:  {"action": "call_tool", "tool": "<name>", "thought": "<reasoning>"}
  - To finish:       {"action": "finish", "thought": "<reasoning>"}

USER:
Bank statement raw text (preview): DBS BANK SINGAPORE Account Statement...

=== Agent loop history ===
ACTION: {"action": "call_tool", "tool": "extract_transactions", "thought": "Start by parsing"}
OBSERVATION: OK. Extracted 16 transactions.
ACTION: {"action": "call_tool", "tool": "categorise_transactions", "thought": "Now categorise them"}
OBSERVATION: OK. Categorised 16 transactions.

What is your next action? Respond with one JSON object.

ASSISTANT (next):
{"action": "call_tool", "tool": "detect_anomalies", "thought": "Check for unusual transactions"}
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
      // Title
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2400 },
        children: [new TextRun({ text: "Bank Statement Agent", font: "Arial", size: 56, bold: true, color: "1F4E79" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
        children: [new TextRun({ text: "Provider-Agnostic ReAct Agent for FinTech", font: "Arial", size: 28, italics: true, color: "555555" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200 },
        children: [new TextRun({ text: "Technical Documentation", font: "Arial", size: 24 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200 },
        children: [new TextRun({ text: `Version ${VERSION} — ${VERSION_DATE}`, font: "Arial", size: 22, color: "888888" })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // Changelog
      h1("Changelog"),
      h2(`v${VERSION} (current)`),
      bullet("Introduced a provider-agnostic ReAct agent loop. The LLM thinks, acts, observes, repeats — across Gemini, Claude, and Groq alike."),
      bullet("All three providers are now genuinely agentic (previously only Claude was)."),
      bullet("Kept Claude's native tool_use API as an optional \"native\" mode for side-by-side comparison."),
      bullet("New mode form field on /analyze; new mode dropdown in the UI."),
      bullet("/providers endpoint now also returns the available modes."),
      h2("v0.0.2"),
      bullet("Multi-provider support: Gemini (default, free), Claude (paid), Groq (free)."),
      bullet("Replaced ChromaDB with in-memory numpy similarity store."),
      h2("v0.0.1"),
      bullet("Initial Claude-only agent with ChromaDB-backed RAG and sequential pipeline."),

      new Paragraph({ children: [new PageBreak()] }),

      // TOC
      h1("Table of Contents"),
      new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
      new Paragraph({ children: [new PageBreak()] }),

      // 1. Executive Summary
      h1("1. Executive Summary"),
      p("The Bank Statement Agent is an agentic AI application that ingests PDF bank statements and produces structured transaction data, spend categorisation, anomaly detection, and a plain-English monthly summary in under 30 seconds."),
      p("Version 0.0.3 introduces a provider-agnostic ReAct agent loop. Previously only Claude ran a true tool-use loop; Gemini and Groq executed a hard-coded Python pipeline. The ReAct loop closes that gap: one orchestrator, three providers, all genuinely agentic via prompted JSON actions."),

      h2("1.1 Why this project"),
      bullet("Demonstrates a real agent pattern (ReAct) implemented from first principles, not via a framework."),
      bullet("Multi-provider abstraction: the same loop runs against Gemini, Claude, and Groq."),
      bullet("Optional native-tool-use mode for Claude gives a side-by-side comparison of approaches."),
      bullet("Direct extension of FinTech document-verification work without using real client data."),
      bullet("Ships to a public URL with a 30-second recruiter demo at zero API cost (Gemini free tier)."),

      // 2. PRD summary
      h1("2. Product Requirements"),
      h2("2.1 Problem"),
      p("Individuals and SME finance teams spend hours manually reviewing bank statements: extracting transactions, categorising spend, spotting anomalies, and writing summaries. This agent automates the workflow end-to-end."),

      h2("2.2 Target Users"),
      makeTable(
        ["Persona", "Pain Point", "Value Delivered"],
        [
          ["Individual user", "Tracking personal spend, tax records", "Instant categorisation and summary"],
          ["SME finance owner", "Monthly reconciliation, accountant reports", "Structured JSON + narrative"],
          ["Technical recruiter", "Evaluating candidate's AI engineering skill", "30-second demo at zero cost"],
        ],
        [2200, 3580, 3580]
      ),

      h2("2.3 Functional Requirements"),
      bullet("Accept PDF bank statement upload."),
      bullet("Let user pick LLM provider (Gemini default, Claude, Groq)."),
      bullet("Let user pick agent mode (ReAct loop default, Claude native opt-in)."),
      bullet("Extract, categorise, flag anomalies, summarise."),
      bullet("Return structured JSON + narrative + metadata (provider, model, mode, latency)."),
      bullet("Expose /evaluate endpoint with pytest accuracy metrics."),

      h2("2.4 Success Metrics"),
      makeTable(
        ["Metric", "Target", "Notes"],
        [
          ["Extraction accuracy", "≥ 95%", "Claude/Gemini meet; Groq lower"],
          ["Categorisation accuracy", "≥ 90%", "Provider-independent (RAG-grounded)"],
          ["Anomaly precision", "≥ 80%", "Low FP rate prioritised"],
          ["Latency p95 (10-page PDF)", "< 30 s", "ReAct adds turns; still under target"],
          ["Cost per run (default)", "$0.00", "Gemini free tier"],
        ],
        [2400, 1800, 5160]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // 3. Architecture
      h1("3. System Architecture"),
      h2("3.1 High-Level Diagram"),
      ...diagramImage("docs/v0.0.3/diagrams/01_architecture.png", "Figure 1 — High-level architecture"),

      h2("3.2 The ReAct Loop — what changed in v0.0.3"),
      p("ReAct stands for Reasoning + Acting. On each turn the LLM produces a small JSON object containing its thought and the next action (\"call_tool\" or \"finish\"). The orchestrator parses that JSON, executes the requested tool, appends the result as an OBSERVATION, then asks the LLM again. Loop until the LLM emits {\"action\": \"finish\"} or we hit the iteration cap."),

      h3("Why ReAct instead of native tool-use for every provider?"),
      bullet("Portability — one loop runs against Gemini, Claude, and Groq with no per-provider code."),
      bullet("Transparency — every step is plain text in the prompt; you can read the agent's reasoning trail in logs."),
      bullet("Honest agency — the LLM genuinely decides the next step. Errors feed back; the model can retry."),
      bullet("Side-by-side comparison — keeping Claude's native tool-use as a toggle lets reviewers see both patterns."),

      h3("Loop pseudocode"),
      ...codeBlock(REACT_PSEUDOCODE),

      h3("Tool inputs are implicit"),
      p("The ReAct loop maintains shared state (state dict). Tools don't receive transaction lists as arguments — they read from state and write back. The LLM only needs to decide which tool to call next, not how to wire data between them. This keeps prompts compact."),

      h3("Sample agent loop prompt (illustrative)"),
      ...codeBlock(REACT_PROMPT_SAMPLE),

      new Paragraph({ children: [new PageBreak()] }),

      h2("3.3 Component Breakdown"),

      h3("3.3.1 LLM Abstraction (api/llm.py)"),
      p("Unified complete() and complete_json() interface across three providers. Lazy SDK imports."),
      makeTable(
        ["Provider", "Model", "Free?", "Native tool-use?"],
        [
          ["gemini (default)", "gemini-2.5-flash", "Yes", "Not implemented (uses ReAct)"],
          ["claude", "claude-sonnet-4-6", "No", "Yes — optional 'native' mode"],
          ["groq", "llama-3.3-70b-versatile", "Yes", "Not implemented (uses ReAct)"],
        ],
        [2400, 3000, 1800, 2160]
      ),

      h3("3.3.2 Agent Orchestrator (api/agent.py)"),
      makeTable(
        ["Mode", "Function", "Providers"],
        [
          ["react (default)", "_run_react_loop()", "gemini, claude, groq"],
          ["native", "_run_claude_native_agent()", "claude only (others fall back to react)"],
        ],
        [1800, 3360, 4200]
      ),

      h3("3.3.3 Tools"),
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

      h3("3.3.4 Category Knowledge Base"),
      p("In-memory numpy cosine similarity over ~50 merchant seeds embedded with sentence-transformers/all-MiniLM-L6-v2. No external DB. Same as v0.0.2."),

      h3("3.3.5 Frontend"),
      bullet("New: ModeSelect component — dropdown for react / native. Disables 'native' unless provider is Claude."),
      bullet("Provider change handler resets mode to 'react' if user switches away from Claude while 'native' is selected."),
      bullet("Footer chip shows model · mode · elapsed_seconds."),

      new Paragraph({ children: [new PageBreak()] }),

      // 4. Sequence diagrams
      h1("4. Use Case Sequence Diagrams"),

      h2("4.1 ReAct Loop (Default — Any Provider)"),
      p("The provider-agnostic agent loop. Same flow runs against Gemini, Claude, or Groq. Each iteration: the LLM emits a JSON action; the orchestrator executes the tool and appends an observation; loop until {\"action\": \"finish\"}."),
      ...diagramImage("docs/v0.0.3/diagrams/02_react_loop.png", "Figure 2 — ReAct loop, full agent run"),

      h2("4.2 Native Claude Tool-Use (Opt-In)"),
      p("When the user selects 'native' mode with Claude provider, the orchestrator uses Anthropic's tool_use content blocks directly. The tools schema is re-sent on every API call (the API is stateless)."),
      ...diagramImage("docs/v0.0.3/diagrams/03_native_tool_use.png", "Figure 3 — Native Claude tool-use loop"),

      h2("4.3 Provider + Mode Switching"),
      p("Three scenarios shown: default (Gemini + ReAct), switch to Claude + Native, switch to Groq (mode auto-resets to ReAct because Native is Claude-only)."),
      ...diagramImage("docs/v0.0.3/diagrams/04_provider_mode_switch.png", "Figure 4 — Provider and mode switching flow"),

      h2("4.4 Native vs ReAct — Where Parsing Happens"),
      p("Side-by-side: the only material difference between the two modes is who parses the LLM's tool intent. Native: Anthropic's servers parse, validate against schema, and return a typed object. ReAct: the LLM returns plain text and your code parses the JSON."),
      ...diagramImage("docs/v0.0.3/diagrams/05_native_vs_react_parsing.png", "Figure 5 — Where the parsing happens in each mode"),

      new Paragraph({ children: [new PageBreak()] }),

      // 5. APIs
      h1("5. APIs and External Services"),

      h2("5.1 HTTP Endpoints"),
      makeTable(
        ["Endpoint", "Method", "Purpose", "Added in"],
        [
          ["/health", "GET", "Liveness check", "v0.0.1"],
          ["/providers", "GET", "List providers and modes", "v0.0.2 (modes in v0.0.3)"],
          ["/analyze", "POST", "Upload PDF + provider + mode", "v0.0.1 (mode in v0.0.3)"],
          ["/evaluate", "GET", "Run pytest eval suite", "v0.0.1"],
        ],
        [1500, 1000, 3500, 3360]
      ),

      h2("5.2 External LLM Providers"),
      makeTable(
        ["Provider", "Auth Variable", "Pricing", "Notes"],
        [
          ["Google Gemini", "GOOGLE_API_KEY", "Free tier", "Default; signup at aistudio.google.com"],
          ["Anthropic Claude", "ANTHROPIC_API_KEY", "Paid", "Only one with native tool_use mode here"],
          ["Groq", "GROQ_API_KEY", "Free tier", "Fastest; lower quality on extraction"],
        ],
        [1800, 2400, 2000, 3160]
      ),

      h2("5.3 MCP Servers"),
      p("No MCP servers in production. Reserved for future enhancements (live bank APIs, accounting writeback, fraud-signal enrichment)."),

      new Paragraph({ children: [new PageBreak()] }),

      // 6. Tech stack
      h1("6. Technology Stack"),

      h2("6.1 Backend"),
      makeTable(
        ["Layer", "Technology", "Version"],
        [
          ["Language", "Python", "3.12"],
          ["Web framework", "FastAPI", "0.115"],
          ["LLM SDK (Gemini)", "google-genai", "0.3"],
          ["LLM SDK (Claude)", "anthropic", "0.39"],
          ["LLM SDK (Groq)", "groq", "0.11"],
          ["PDF (primary)", "pdfplumber", "0.11"],
          ["PDF (fallback)", "PyMuPDF", "1.24"],
          ["Embeddings", "sentence-transformers", "3.1"],
          ["Similarity", "numpy", ">=1.26"],
          ["Validation", "Pydantic", "2.9"],
          ["Logging", "structlog", "24.4"],
        ],
        [3000, 4000, 2360]
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
        ],
        [3000, 4000, 2360]
      ),

      new Paragraph({ children: [new PageBreak()] }),

      // 7. Migration
      h1("7. Migration Notes — v0.0.2 → v0.0.3"),
      h2("7.1 Breaking Changes"),
      bullet("Default execution path changed from sequential pipeline (Gemini/Groq) to ReAct loop. Latency increases ~50%. Output unchanged."),
      bullet("run_agent() signature: new optional mode kwarg. Existing callers default to 'react' — backward-compatible."),

      h2("7.2 Non-Breaking Additions"),
      bullet("/analyze accepts a new 'mode' form field (defaults to 'react')."),
      bullet("/providers response includes a 'modes' array and 'default_mode'."),
      bullet("Output metadata gains a 'mode' field."),

      h2("7.3 Why latency increased"),
      p("ReAct calls the LLM once per agent turn (4 tools = 4 turns + finish = 5 LLM calls). The v0.0.2 sequential pipeline called the LLM only inside each tool (4 calls). Extra turns let the agent self-correct on tool errors — a worthwhile tradeoff for portfolio signal."),

      // 8. Risks
      h1("8. Risks and Limitations"),
      bullet("ReAct adds turns and tokens. Free tiers may rate-limit on heavy demos."),
      bullet("Smaller models (Groq Llama) occasionally emit invalid JSON; loop tolerates by reprompting once."),
      bullet("Native tool-use mode is Claude-specific. Gemini and Groq both have native function calling APIs that could be added in v0.0.4."),
      bullet("MVP supports DBS/UOB/NAB-style PDF layouts. Exotic formats may extract poorly."),

      h2("Future enhancements"),
      bullet("Native function-calling modes for Gemini and Groq (would be 3 native modes + 3 ReAct modes)."),
      bullet("Streaming agent loop — push observations to the UI in real time."),
      bullet("Token + cost telemetry per run."),
      bullet("Cross-provider eval: same ReAct loop, three providers, compare accuracy and cost."),

      // Appendix
      new Paragraph({ children: [new PageBreak()] }),
      h1("Appendix A: Glossary"),
      makeTable(
        ["Term", "Definition"],
        [
          ["Agent", "An LLM-driven system that uses tools to accomplish multi-step tasks"],
          ["ReAct", "Reasoning + Acting — agent loop where the LLM emits thought + action per turn"],
          ["Tool use (native)", "Provider SDK feature where the LLM emits typed function calls via API content blocks"],
          ["Tool use (prompted)", "Same idea but encoded in plain JSON via the prompt — works with any LLM"],
          ["RAG", "Retrieval-Augmented Generation — grounding LLM output in retrieved context"],
          ["Provider", "Source of LLM inference: Gemini, Claude, or Groq in this project"],
          ["Mode", "react = ReAct loop (any provider); native = provider's tool_use API"],
          ["Observation", "Brief text result of a tool execution, fed back to the LLM for next decision"],
        ],
        [2400, 6960]
      ),

      h1("Appendix B: References"),
      bullet("ReAct paper — Yao et al., \"ReAct: Synergizing Reasoning and Acting in Language Models\""),
      bullet("Anthropic Claude API — https://docs.claude.com"),
      bullet("Google Gemini API — https://ai.google.dev/gemini-api/docs"),
      bullet("Groq API — https://console.groq.com/docs"),
      bullet("FastAPI documentation — https://fastapi.tiangolo.com"),
      bullet("sentence-transformers — https://www.sbert.net"),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  const out = path.join(__dirname, "..", "docs", "v0.0.3", "DOCUMENTATION.docx");
  fs.writeFileSync(out, buffer);
  fs.writeFileSync(path.join(__dirname, "..", "DOCUMENTATION.docx"), buffer);
  console.log("Wrote", out, "(" + buffer.length + " bytes)");
});
