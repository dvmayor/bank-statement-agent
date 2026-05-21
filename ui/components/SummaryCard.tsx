"use client";

export default function SummaryCard({ summary }: { summary: any }) {
  if (!summary) return null;
  return (
    <div className="bg-navy-light border border-navy-lighter rounded p-5">
      <h4 className="text-slate-lightest font-semibold mb-1">Monthly summary</h4>
      <p className="mono-accent text-xxs mb-4">
        {summary.period_start} → {summary.period_end}
      </p>

      <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm mb-5">
        <div>
          <div className="text-slate-lightest text-xxs font-mono mb-1">Credits:</div>
          <div className="font-mono text-accent">{summary.total_credits?.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-lightest text-xxs font-mono mb-1">Debits:</div>
          <div className="font-mono text-red-300">{summary.total_debits?.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-slate-lightest text-xxs font-mono mb-1">Net:</div>
          <div className={`font-mono ${(summary.net_cashflow ?? 0) >= 0 ? "text-accent" : "text-red-300"}`}>
            {summary.net_cashflow?.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-slate-lightest text-xxs font-mono mb-1">Anomalies:</div>
          <div className="font-mono text-slate-lightest">{summary.anomaly_count}</div>
        </div>
      </div>

      {(() => {
        const LABELS = ["Cash flow", "Anomalies", "Advice"];
        const paragraphs = (summary.narrative || "")
          .split(/\n\n+/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        return (
          <div className="border-t border-navy-lighter pt-4 space-y-4">
            {paragraphs.map((para: string, i: number) => (
              <div key={i}>
                {LABELS[i] && (
                  <p className="font-mono text-xxs text-accent uppercase tracking-wider mb-1">
                    {LABELS[i]}
                  </p>
                )}
                <p className="text-sm text-slate leading-relaxed">{para}</p>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
