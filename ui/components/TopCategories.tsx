"use client";

type Category = {
  category: string;
  total: number;
  count?: number;
  percentage?: number;
};

export default function TopCategories({ categories }: { categories: Category[] }) {
  if (!categories?.length) return null;

  const maxTotal = Math.max(...categories.map((c) => c.total));

  return (
    <div className="bg-navy-light border border-navy-lighter rounded p-5">
      <h4 className="text-slate-lightest font-semibold mb-4">Top categories</h4>
      <div className="space-y-3.5">
        {categories.map((cat, i) => {
          const pct = cat.percentage ?? (maxTotal > 0 ? (cat.total / maxTotal) * 100 : 0);
          return (
            <div key={cat.category}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-lightest font-mono">
                  <span className="text-slate mr-1.5">{i + 1}.</span>
                  {cat.category}
                </span>
                <span className="text-slate font-mono">
                  ${cat.total.toFixed(2)}
                  {cat.count !== undefined && (
                    <span className="text-slate/50 ml-1.5">×{cat.count}</span>
                  )}
                </span>
              </div>
              <div className="h-1 bg-navy-lighter rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
