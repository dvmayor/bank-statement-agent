"use client";
import { useState } from "react";
import { FileScan, BarChart3 } from "lucide-react";
import UploadDropzone from "@/components/UploadDropzone";
import TransactionTable from "@/components/TransactionTable";
import SpendChart from "@/components/SpendChart";
import SummaryCard from "@/components/SummaryCard";
import ProviderSelect, { Provider } from "@/components/ProviderSelect";
import AgentProgress, { AgentEvent } from "@/components/AgentProgress";
import SectionHeader from "@/components/SectionHeader";
import TopCategories from "@/components/TopCategories";

type Result = {
  transactions: any[];
  anomalies: any[];
  summary: any;
  warnings?: string[];
  metadata?: any;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("groq");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [startTs, setStartTs] = useState<number>(0);

  async function handleUpload(file: File) {
    const t0 = Date.now();
    setLoading(true);
    setError(null);
    setResult(null);
    setEvents([]);
    setStartTs(t0);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("provider", provider);
    fd.append("mode", "react");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze/stream`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Server ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMetadata: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx;
        while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);

          const lines = block.split("\n");
          let eventType = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) dataStr += line.slice(6);
          }
          if (!eventType) continue;

          let data: any = {};
          try { data = dataStr ? JSON.parse(dataStr) : {}; } catch { /* ignore */ }

          if (eventType === "result") {
            setResult((prev) => ({ ...(prev || {}), ...data }));
          } else if (eventType === "done") {
            finalMetadata = data.metadata;
          } else {
            const ev: AgentEvent = { type: eventType, ts: Date.now(), ...data };
            setEvents((prev) => [...prev, ev]);
            if (eventType === "error") {
              setError(data.error || data.text || "Agent encountered an error.");
            }
          }
        }
      }

      if (finalMetadata) {
        setResult((prev) => prev ? { ...prev, metadata: finalMetadata } : prev);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const showResults = result?.transactions && result.transactions.length > 0;

  return (
    <main className="max-w-4xl mx-auto px-6 md:px-10 py-10 md:py-14">
      {/* Compact hero */}
      <header className="mb-10">
        <p className="mono-accent mb-2">Bank Statement Agent</p>
        <h1 className="text-slate-lightest text-3xl md:text-4xl font-bold tracking-tight mb-3">
          Read any statement. Instantly.
        </h1>
        <p className="text-slate max-w-2xl leading-relaxed text-sm md:text-base">
          Drop a PDF statement. A{" "}
          <span className="text-accent font-mono text-xs">ReAct</span>{" "}
          agent extracts transactions, categorises spending, flags anomalies,
          and writes a plain-English summary. Pick your model below — Groq,
          Gemini, Claude, OpenAI, or Cerebras.
        </p>
      </header>

      {/* Upload / Progress */}
      {!showResults && (
        <section>
          <SectionHeader icon={FileScan} label="Try it" title="Upload a statement." />

          <div className="flex flex-wrap gap-4 mb-5">
            <ProviderSelect value={provider} onChange={setProvider} disabled={loading} />
          </div>

          {!loading && events.length === 0 && (
            <>
              <UploadDropzone onFile={handleUpload} loading={false} />
              <div className="mt-3">
                <p className="text-xxs font-mono text-slate mb-2 uppercase tracking-wider">sample statements for testing</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "CommBank", file: "Comm-bank-statement-sample.pdf" },
                    { label: "ANZ",      file: "ANZ-bank-statement-sample.pdf" },
                    { label: "NAB",      file: "NAB-bank-statement-sample.pdf" },
                  ].map(({ label, file }) => (
                    <a
                      key={file}
                      href={`/samples/${file}`}
                      download={file}
                      className="text-xxs font-mono text-accent border border-accent/30 px-2 py-1 rounded hover:bg-accent/10 transition-colors"
                    >
                      ↓ {label}
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}

          {(loading || events.length > 0) && (
            <AgentProgress events={events} startTs={startTs} />
          )}

          {error && (
            <div className="mt-4 space-y-3">
              <div className="p-3 border border-red-500/40 bg-red-500/5 rounded-[10px] text-sm text-red-300">
                <span className="mono-accent text-red-400 mr-2">error</span>
                {error}
              </div>
              <p className="text-xs font-mono text-slate">
                <span className="text-yellow-400">hint</span>
                {" · "}
                {error.includes("429") || error.includes("RESOURCE_EXHAUSTED") || error.includes("quota")
                  ? "You've hit the quota for this model. Switch to a different model above and try again."
                  : "Something went wrong. Try switching to a different model above."}
              </p>
              <button
                onClick={() => { setError(null); setEvents([]); }}
                className="btn-solid"
              >
                Try another statement
              </button>
            </div>
          )}
        </section>
      )}

      {/* Results */}
      {showResults && (
        <section>
          <SectionHeader icon={BarChart3} label="Results" title="Here's what I found." />

          {result.warnings && result.warnings.length > 0 && (
            <div className="mb-5 p-3 border border-yellow-500/40 bg-yellow-500/5 rounded-[10px] text-xs font-mono text-yellow-200">
              <span className="text-yellow-400 mr-2">warnings:</span>
              {result.warnings.join(" · ")}
            </div>
          )}

          {/* Row 1: Transactions — full width */}
          <TransactionTable transactions={result.transactions} anomalies={result.anomalies} />

          {/* Row 2: Spend chart + Top categories — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <SpendChart categories={result.summary?.top_categories || []} />
            <TopCategories categories={result.summary?.top_categories || []} />
          </div>

          {/* Row 3: Monthly summary — full width */}
          <div className="mt-5">
            <SummaryCard summary={result.summary} />
          </div>

          {result.metadata && (
            <div className="mt-4 flex justify-end gap-4 text-xxs font-mono text-slate">
              <span><span className="text-accent">model</span> · {result.metadata.model}</span>
              <span><span className="text-accent">mode</span> · {result.metadata.mode}</span>
              <span><span className="text-accent">elapsed</span> · {result.metadata.elapsed_seconds}s</span>
            </div>
          )}

          {events.length > 0 && (
            <div className="mt-4">
              <AgentProgress events={events} startTs={startTs} collapsible />
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={() => { setResult(null); setEvents([]); setError(null); }}
              className="btn-solid"
            >
              Analyse another statement
            </button>
          </div>
        </section>
      )}

      <footer className="mt-10 pt-6 border-t border-navy-lighter">
        <p className="text-xxs font-mono text-slate text-center">
          Built with Next.js · Tailwind · FastAPI · Anthropic / Google / Groq
        </p>
      </footer>
    </main>
  );
}
