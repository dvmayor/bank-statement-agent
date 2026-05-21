"use client";
import { useState } from "react";
import { AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortKey = "date" | "description" | "category" | "debit" | "credit";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown size={11} className="text-slate/40 ml-1 inline-block" />;
  return sortDir === "asc"
    ? <ChevronUp size={11} className="text-accent ml-1 inline-block" />
    : <ChevronDown size={11} className="text-accent ml-1 inline-block" />;
}

export default function TransactionTable({
  transactions,
  anomalies,
}: {
  transactions: any[];
  anomalies: any[];
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const anomalyByIdx = new Map<number, any>();
  anomalies.forEach((a) => anomalyByIdx.set(a.transaction_index, a));

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  // Sort a copy; preserve original index for anomaly lookup
  const indexed = transactions.map((tx, i) => ({ tx, i }));
  if (sortKey) {
    indexed.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "debit")       { av = a.tx.debit  ?? -Infinity; bv = b.tx.debit  ?? -Infinity; }
      else if (sortKey === "credit") { av = a.tx.credit ?? -Infinity; bv = b.tx.credit ?? -Infinity; }
      else                           { av = (a.tx[sortKey] ?? "").toString().toLowerCase();
                                       bv = (b.tx[sortKey] ?? "").toString().toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }

  const thClass = "px-5 py-3 font-normal cursor-pointer select-none hover:text-slate-lightest transition-colors whitespace-nowrap";

  return (
    <div className="bg-navy-light border border-navy-lighter rounded overflow-hidden">
      <div className="px-5 py-3 border-b border-navy-lighter flex items-baseline gap-3">
        <h4 className="text-slate-lightest font-semibold">Transactions</h4>
        <span className="font-mono text-xxs text-accent">{transactions.length} rows</span>
        {anomalies.length > 0 && (
          <span className="font-mono text-xxs text-yellow-400 ml-auto">
            {anomalies.length} flagged
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xxs font-mono uppercase tracking-wider text-slate">
            <tr>
              <th className={`text-left ${thClass}`} onClick={() => handleSort("date")}>
                Date <SortIcon col="date" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-left ${thClass}`} onClick={() => handleSort("description")}>
                Description <SortIcon col="description" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-left ${thClass}`} onClick={() => handleSort("category")}>
                Category <SortIcon col="category" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${thClass}`} onClick={() => handleSort("debit")}>
                Debit <SortIcon col="debit" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={`text-right ${thClass}`} onClick={() => handleSort("credit")}>
                Credit <SortIcon col="credit" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {indexed.map(({ tx, i }) => {
              const anom = anomalyByIdx.get(i);
              return (
                <tr
                  key={i}
                  className={`
                    border-t border-navy-lighter/50 transition-colors
                    ${anom ? "bg-yellow-500/5 hover:bg-yellow-500/10" : "hover:bg-navy-lighter/30"}
                  `}
                >
                  <td className="px-5 py-3 font-mono text-xs text-slate">{tx.date}</td>
                  <td className="px-5 py-3 text-slate-lightest">
                    <div className="flex items-center gap-2">
                      {anom && (
                        <span title={anom.reasoning} className="cursor-help">
                          <AlertTriangle size={13} className="text-yellow-400" />
                        </span>
                      )}
                      {tx.description}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-slate-light">{tx.category}</td>
                  <td className="px-5 py-3 text-right font-mono text-red-300">
                    {tx.debit ? tx.debit.toFixed(2) : ""}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-accent">
                    {tx.credit ? tx.credit.toFixed(2) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
