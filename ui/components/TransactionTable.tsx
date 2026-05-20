"use client";
import { AlertTriangle } from "lucide-react";

export default function TransactionTable({
  transactions,
  anomalies,
}: {
  transactions: any[];
  anomalies: any[];
}) {
  const anomalyByIdx = new Map<number, any>();
  anomalies.forEach((a) => anomalyByIdx.set(a.transaction_index, a));

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
              <th className="text-left px-5 py-3 font-normal">Date</th>
              <th className="text-left px-5 py-3 font-normal">Description</th>
              <th className="text-left px-5 py-3 font-normal">Category</th>
              <th className="text-right px-5 py-3 font-normal">Debit</th>
              <th className="text-right px-5 py-3 font-normal">Credit</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, i) => {
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
