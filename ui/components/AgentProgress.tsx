"use client";
import { useEffect, useRef, useState } from "react";
import { Check, X, Loader2, FileText, ArrowRight, Flag, ChevronDown, ChevronUp } from "lucide-react";

export type AgentEvent = {
  type: string;
  iteration?: number;
  tool?: string;
  text?: string;
  observation?: string;
  error?: string;
  chars?: number;
  filename?: string;
  scope?: string;
  provider?: string;
  mode?: string;
  ts?: number;
  llm_calls?: number;
  tool_calls?: number;
  rag_calls?: number;
};

function fmtTime(ts?: number, startTs?: number): string {
  if (!ts || !startTs) return "00:00";
  const s = Math.floor((ts - startTs) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Icon({ type, resolved }: { type: string; resolved?: boolean }) {
  switch (type) {
    case "pdf_parsed":
      return <FileText size={13} className="text-accent" />;
    case "agent_start":
    case "iteration_start":
      return <ArrowRight size={13} className="text-slate" />;
    case "thought":
      return <span className="text-accent font-mono text-xs">→</span>;
    case "tool_call":
      return resolved
        ? <span className="text-slate font-mono text-xs">·</span>
        : <Loader2 size={13} className="text-yellow-400 animate-spin" />;
    case "tool_done":
      return <Check size={13} className="text-accent" />;
    case "tool_error":
    case "error":
      return <X size={13} className="text-red-400" />;
    case "warning":
      return <Flag size={13} className="text-yellow-400" />;
    case "stats":
      return <span className="text-slate font-mono text-xs">∑</span>;
    case "finish":
    case "done":
      return <span className="text-accent font-mono text-xs">◯</span>;
    default:
      return <span className="text-slate font-mono text-xs">·</span>;
  }
}

function renderLine(ev: AgentEvent): string {
  switch (ev.type) {
    case "pdf_parsed":
      return `Parsed PDF${ev.filename ? ` · ${ev.filename}` : ""} (${ev.chars} chars)`;
    case "agent_start":
      return `Agent started · ${ev.provider} · ${ev.mode}`;
    case "iteration_start":
      return `ReAct loop - Iteration ${ev.iteration}`;
    case "thought":
      return `think: "${ev.text}"`;
    case "tool_call":
      return `calling ${ev.tool}...`;
    case "tool_done":
      return `${ev.tool} → ${ev.observation}`;
    case "tool_error": {
      const hint = ev.error?.includes("429") || ev.error?.includes("RESOURCE_EXHAUSTED")
        ? " (rate-limited — retrying with longer wait)"
        : ev.error?.includes("503") || ev.error?.includes("UNAVAILABLE")
        ? " (provider busy — retrying)"
        : "";
      return `${ev.tool} failed: ${ev.error}${hint}`;
    }
    case "warning":
      return `warning [${ev.scope}]: ${ev.text}`;
    case "error":
      return `error [${ev.scope}]: ${ev.error}`;
    case "stats":
      return `${ev.llm_calls} LLM calls · ${ev.tool_calls} tool calls · ${ev.rag_calls} RAG lookups`;
    case "finish":
      return `Agent finished`;
    case "done":
      return `Complete`;
    default:
      return ev.type;
  }
}

/** Pull the first agent_start event out of the log so we can show the active provider. */
function activeProvider(events: AgentEvent[]): string | null {
  const ev = events.find((e) => e.type === "agent_start");
  if (!ev) return null;
  const labels: Record<string, string> = {
    gemini:   "Gemma 4 26B",
    gemini2:  "Gemma 4 31B",
    groq:     "Llama 3.3 70B",
    groq2:    "Llama 3.1 8B",
    cerebras: "Cerebras Qwen 3 235B",
    claude:   "Claude Sonnet",
  };
  return ev.provider ? (labels[ev.provider] ?? ev.provider) : null;
}

/** Animated dots: cycles · → ·· → ··· */
function ThinkingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 3), 500);
    return () => clearInterval(id);
  }, []);
  return <span className="text-accent">{"·".repeat(frame + 1)}</span>;
}

/** Live elapsed counter that ticks every second */
function ElapsedTimer({ startTs }: { startTs: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTs) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTs]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return <span className="text-slate tabular-nums">{m}:{s}</span>;
}

const DONE_TYPES = new Set(["finish", "done", "error"]);

export default function AgentProgress({
  events,
  startTs,
  collapsible = false,
}: {
  events: AgentEvent[];
  startTs: number;
  collapsible?: boolean;
}) {
  const provider = activeProvider(events);
  const lastEvent = events[events.length - 1];
  const isDone = lastEvent ? DONE_TYPES.has(lastEvent.type) : false;

  const [collapsed, setCollapsed] = useState(collapsible);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (collapsed) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, collapsed]);

  // Set of `${iteration}-${tool}` keys that have a matching tool_done or tool_error
  const resolvedTools = new Set(
    events
      .filter((e) => e.type === "tool_done" || e.type === "tool_error")
      .map((e) => `${e.iteration}-${e.tool}`)
  );

  const headerRow = (
    <div className="font-mono text-xxs text-slate uppercase tracking-wider flex items-center gap-3">
      <span>agent execution log</span>
      {provider && (
        <span className="text-accent border border-accent/30 px-1.5 py-0.5 rounded text-xxs normal-case tracking-normal">
          {provider}
        </span>
      )}
      {!isDone && <ElapsedTimer startTs={startTs} />}
      {collapsible && (
        <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal text-slate">
          {collapsed && <span>{events.length} steps</span>}
          {collapsed
            ? <ChevronDown size={12} />
            : <ChevronUp size={12} />}
        </span>
      )}
    </div>
  );

  return (
    <div className="border border-dashed border-navy-lighter rounded-[10px] p-5 bg-navy-light/30">
      {collapsible ? (
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full text-left mb-2 hover:opacity-80 transition-opacity"
        >
          {headerRow}
        </button>
      ) : (
        <div className="mb-2">{headerRow}</div>
      )}

      {!collapsed && (
      <div
        ref={scrollRef}
        className="space-y-0.5 font-mono text-xs overflow-y-auto resize-y"
        style={{ minHeight: "220px", height: "220px", maxHeight: "none" }}
      >
        {events.length === 0 && (
          <div className="text-slate flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-accent" />
            <span>connecting…</span>
          </div>
        )}

        {events.map((ev, i) => {
          const resolved =
            ev.type === "tool_call"
              ? resolvedTools.has(`${ev.iteration}-${ev.tool}`)
              : undefined;

          const fmtLocal = (ts: number) =>
            new Date(ts).toLocaleString(undefined, {
              day: "2-digit", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });

          const summaryRow = ev.type === "finish" && ev.ts && startTs ? (() => {
            const elapsedS = Math.round((ev.ts - startTs) / 1000);
            const m = Math.floor(elapsedS / 60);
            const s = elapsedS % 60;
            return (
              <div key={`summary-${i}`} className="flex items-start gap-2.5 leading-relaxed mt-1 mb-0.5 border-t border-navy-lighter/40 pt-1">
                <span className="min-w-[36px]" />
                <span className="min-w-[14px]" />
                <span className="text-slate/60 text-xxs font-mono space-y-0.5">
                  <div>started&nbsp;&nbsp; {fmtLocal(startTs)}</div>
                  <div>finished {fmtLocal(ev.ts)}</div>
                  <div>elapsed&nbsp;&nbsp; {m > 0 ? `${m}m ` : ""}{s}s</div>
                </span>
              </div>
            );
          })() : null;

          return (
          <>
            {summaryRow}
            <div key={i} className="flex items-start gap-2.5 leading-relaxed">
              <span className="text-slate min-w-[36px] text-xxs">{fmtTime(ev.ts, startTs)}</span>
              <span className="mt-0.5 min-w-[14px] flex items-center justify-center">
                <Icon type={ev.type} resolved={resolved} />
              </span>
              <span
                className={
                  ev.type === "thought"
                    ? "text-slate-light italic"
                    : ev.type === "tool_done"
                    ? "text-slate-lightest"
                    : ev.type === "tool_error" || ev.type === "error"
                    ? "text-red-300"
                    : ev.type === "warning"
                    ? "text-yellow-300"
                    : ev.type === "finish" || ev.type === "done"
                    ? "text-accent"
                    : ev.type === "stats"
                    ? "text-slate/60 italic"
                    : "text-slate"
                }
              >
                {renderLine(ev)}
              </span>
            </div>
          </>
          );
        })}

        {/* Animated "waiting for LLM" row — shown while running, hidden when done */}
        {events.length > 0 && !isDone && (
          <div className="flex items-center gap-2.5 leading-relaxed pt-0.5">
            <span className="min-w-[36px]" />
            <Loader2 size={13} className="animate-spin text-accent min-w-[14px]" />
            <span className="text-slate italic">
              waiting for model <ThinkingDots />
            </span>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
